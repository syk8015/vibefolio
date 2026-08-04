// One job, end to end (plan §8 M2): input-type branching + policy decision +
// (for github/zip) an E2B build whose public URL is all that reaches this machine,
// then the shared recording pipeline. Used by both the CLI (index.ts) and the
// queue worker (worker.ts).
//
//   live_url     → record the URL directly. Policy = read-only, ALWAYS (real
//                  production server) unless the operator explicitly overrides
//                  via the CLI flag.
//   github / zip → buildAndServe() in E2B → decidePolicy() over the repo's
//                  env/schema files (remote DB → read-only; verified-local only
//                  → full; ambiguous → read-only) → record the sandbox URL.
import { buildAndServe, type BuiltApp } from "./build";
import { decidePolicy, type SafetyPolicy, type SourceType } from "./safety";
import { recordDemo, type PipelinePhase } from "./pipeline";
import type { QuarantineUpload } from "./upload";

export type JobPhase = "building" | PipelinePhase;

export type JobInput = {
  projectId: string; // manual-* = dry-run (no DB writes, _test/ upload path)
  sourceType: SourceType;
  sourceValue: string;
  upload: boolean;
  // Creator-written core-feature description (projects.demo_user_hint) — steers
  // what explore demonstrates. Optional; untrusted user data end to end.
  userHint?: string;
  // Project title — moderation-classifier context only. Untrusted user data.
  title?: string;
  // Explicit operator override (CLI only). The worker never sets this — the
  // policy gate must stay automatic on queue jobs.
  policyOverride?: SafetyPolicy;
  // CLI only: the operator is deliberately recording something on this machine
  // (localhost fixtures, a dev server). The worker never sets this, so queue
  // rows keep the private/local-host SSRF backstop.
  allowPrivateHost?: boolean;
  onPhase?: (phase: JobPhase) => void | Promise<void>;
};

export type JobOutcome =
  | {
      status: "done";
      policy: SafetyPolicy;
      demoPath: string;
      publicUrl?: string;
      moderationFailedOpen?: boolean;
    }
  | { status: "login-gated"; policy: SafetyPolicy }
  | {
      // Content scan flagged the take — artifacts quarantined, caller parks the
      // row as held + files the admin review item.
      status: "moderation-held";
      policy: SafetyPolicy;
      categories: string[];
      reason: string;
      model: string;
      quarantine?: QuarantineUpload;
    };

export async function runJob(job: JobInput): Promise<JobOutcome> {
  let built: BuiltApp | undefined;
  try {
    let url: string;
    let policy: SafetyPolicy;

    if (job.sourceType === "live_url") {
      // The route sanitized this before storing, but the worker consumes DB rows —
      // re-validate at the sink so a tampered row can't make the recorder navigate
      // to file://, an arbitrary scheme, or (belt-and-suspenders to the route's
      // full SSRF check) an obvious localhost/private literal on THIS machine.
      // /api/preview uploads are our own origin — skip the host check for them.
      const parsed = new URL(job.sourceValue);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(`live_url must be http(s), got '${parsed.protocol}'`);
      }
      if (!job.allowPrivateHost && !job.sourceValue.includes("/api/preview/")) {
        const h = parsed.hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
        const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
        const priv = h === "localhost" || h.endsWith(".local") || h === "::1" ||
          (!!v4 && (() => { const a = +v4[1], b = +v4[2];
            return a === 10 || a === 127 || a === 0 ||
              (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) ||
              (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127); })());
        if (priv) throw new Error(`refusing to record a private/local host: ${h}`);
      }
      url = job.sourceValue;
      policy = job.policyOverride ?? "read-only";
    } else {
      await job.onPhase?.("building");
      built = await buildAndServe(job.sourceType, job.sourceValue);
      policy = job.policyOverride ?? decidePolicy(job.sourceType, built.repoFiles);
      url = built.url;
    }

    console.log(`[job] ${job.sourceType} → ${url}  (policy: ${policy})`);
    const result = await recordDemo({
      url,
      projectId: job.projectId,
      policy,
      upload: job.upload,
      userHint: job.userHint,
      projectTitle: job.title,
      allowPrivateHost: job.allowPrivateHost,
      onPhase: job.onPhase,
    });

    if (result.kind === "login-gated") return { status: "login-gated", policy };
    if (result.kind === "moderation-held") {
      return {
        status: "moderation-held",
        policy,
        categories: result.categories,
        reason: result.reason,
        model: result.model,
        quarantine: result.quarantine,
      };
    }
    return {
      status: "done",
      policy,
      demoPath: result.demoPath,
      publicUrl: result.uploaded?.publicUrl,
      moderationFailedOpen: result.moderationFailedOpen,
    };
  } finally {
    // Always tear the sandbox down — it bills by lifetime and serves user code.
    await built?.close();
  }
}
