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

export type JobPhase = "building" | PipelinePhase;

export type JobInput = {
  projectId: string; // manual-* = dry-run (no DB writes, _test/ upload path)
  sourceType: SourceType;
  sourceValue: string;
  upload: boolean;
  // Creator-written core-feature description (projects.demo_user_hint) — steers
  // what explore demonstrates. Optional; untrusted user data end to end.
  userHint?: string;
  // Explicit operator override (CLI only). The worker never sets this — the
  // policy gate must stay automatic on queue jobs.
  policyOverride?: SafetyPolicy;
  onPhase?: (phase: JobPhase) => void | Promise<void>;
};

export type JobOutcome =
  | { status: "done"; policy: SafetyPolicy; demoPath: string; publicUrl?: string }
  | { status: "login-gated"; policy: SafetyPolicy };

export async function runJob(job: JobInput): Promise<JobOutcome> {
  let built: BuiltApp | undefined;
  try {
    let url: string;
    let policy: SafetyPolicy;

    if (job.sourceType === "live_url") {
      // The route sanitized this before storing, but the worker consumes DB rows —
      // re-validate the protocol at the sink so a tampered row can't make the
      // recorder navigate to file:// or an arbitrary scheme.
      const parsed = new URL(job.sourceValue);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(`live_url must be http(s), got '${parsed.protocol}'`);
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
      onPhase: job.onPhase,
    });

    if (result.kind === "login-gated") return { status: "login-gated", policy };
    return {
      status: "done",
      policy,
      demoPath: result.demoPath,
      publicUrl: result.uploaded?.publicUrl,
    };
  } finally {
    // Always tear the sandbox down — it bills by lifetime and serves user code.
    await built?.close();
  }
}
