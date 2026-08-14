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
import type { DemoAccess } from "../lib/demoAccess";

export type JobPhase = "building" | PipelinePhase;

// Hosts that serve our own /api/preview uploads (app origin + sandbox origin).
// Used to scope the cross-tenant preview check so an external app that happens to
// expose a /api/preview/ route on its own domain is never mistakenly owner-checked.
const OUR_PREVIEW_HOSTS = new Set(
  [process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://nookframe.com", process.env.NEXT_PUBLIC_PREVIEW_ORIGIN]
    .filter((o): o is string => !!o)
    .map((o) => {
      try {
        return new URL(o).host;
      } catch {
        return "";
      }
    })
    .filter(Boolean),
);

export type JobInput = {
  projectId: string; // manual-* = dry-run (no DB writes, _test/ upload path)
  sourceType: SourceType;
  sourceValue: string;
  // Project owner uid. Binds a zip prefix / our-origin /api/preview path to its
  // owner so a tampered row can't point the recorder at another user's upload.
  // Worker sets it from the row; trusted operator/CLI paths may omit it.
  ownerId?: string;
  upload: boolean;
  // Creator-written core-feature description (projects.demo_user_hint) — steers
  // what explore demonstrates. Optional; untrusted user data end to end.
  userHint?: string;
  // Demo-mode entry info (projects.demo_access, Connect 요청2) for login-gated
  // apps: url+params decide WHERE the robot lands, note reaches the explore
  // brief. Optional; untrusted user data end to end — an absolute url passes
  // the same sink-side gate as the source URL.
  demoAccess?: DemoAccess;
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

// Sink-side gate for anything the recorder will NAVIGATE to — the live_url
// source and an absolute demo_access.url alike. The route sanitized these before
// storing, but the worker consumes DB rows — re-validate here so a tampered row
// can't make the recorder open file://, an arbitrary scheme, or
// (belt-and-suspenders to the route's full SSRF check) an obvious
// localhost/private literal on THIS machine. /api/preview paths are our own
// origin — the host check is skipped for them, but they must belong to the
// job's owner (cross-tenant preview guard, F5 defense-in-depth: only asserted
// for OUR origins so an external app that merely has a /api/preview/ route is
// never false-flagged).
function assertRecordableUrl(parsed: URL, job: JobInput) {
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`record target must be http(s), got '${parsed.protocol}'`);
  }
  if (!job.allowPrivateHost && !parsed.pathname.startsWith("/api/preview/")) {
    const h = parsed.hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
    const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
    const priv = h === "localhost" || h.endsWith(".local") || h === "::1" ||
      (!!v4 && (() => { const a = +v4[1], b = +v4[2];
        return a === 10 || a === 127 || a === 0 ||
          (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) ||
          (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127); })());
    if (priv) throw new Error(`refusing to record a private/local host: ${h}`);
  }
  if (job.ownerId && parsed.pathname.startsWith("/api/preview/") && OUR_PREVIEW_HOSTS.has(parsed.host)) {
    const seg = parsed.pathname.split("/")[3]; // /api/preview/{uid}/...
    if (seg !== job.ownerId) {
      throw new Error("preview source does not belong to the project owner");
    }
  }
}

// Demo-mode entry assembly (projects.demo_access): where the robot actually
// lands. A relative url resolves against the job URL. An absolute url is taken
// as-is for live_url jobs (after the same gate as the source); for BUILT
// sources only its path+query+hash count — the deployed origin in the URL is
// not the sandbox we just built. params are appended last so they apply to
// whichever base won.
function resolveEntry(baseUrl: string, entry: string | undefined, job: JobInput): string {
  const access = job.demoAccess;
  let target = baseUrl;
  if (entry) {
    if (/^https?:\/\//i.test(entry)) {
      const parsed = new URL(entry);
      if (job.sourceType === "live_url") {
        assertRecordableUrl(parsed, job);
        target = parsed.toString();
      } else {
        target = new URL(parsed.pathname + parsed.search + parsed.hash, baseUrl).toString();
      }
    } else if (entry.startsWith("/")) {
      target = new URL(entry, baseUrl).toString();
    }
  }
  if (access?.params) {
    const u = new URL(target);
    for (const [k, v] of Object.entries(access.params)) u.searchParams.set(k, v);
    target = u.toString();
  }
  return target;
}

function applyDemoAccess(baseUrl: string, job: JobInput): string {
  if (!job.demoAccess) return baseUrl;
  return resolveEntry(baseUrl, job.demoAccess.url, job);
}

// Second candidate for the pre-flight scout (피드백 B-4): same assembly and the
// same sink-side gate as the primary — the recorder opens it for real. Dropped
// when it collapses to the primary (nothing to compare) or when the maker
// already declared the app demo impossible (the film is knowingly a landing
// take, so paying for a look-around decides nothing).
function altEntry(baseUrl: string, primary: string, job: JobInput): string | undefined {
  const alt = job.demoAccess?.altUrl;
  if (!alt || job.demoAccess?.impossible) return undefined;
  const target = resolveEntry(baseUrl, alt, job);
  return target === primary ? undefined : target;
}

// Probe seam (probe-scout.ts): the entry assembly on its own — no browser, no
// E2B build, no recording — so the rules that decide WHERE the robot lands and
// whether a scout candidate exists at all can be asserted for cents-free.
export function runJobEntryForProbe(
  baseUrl: string,
  sourceType: SourceType,
  demoAccess: DemoAccess,
): { url: string; altUrl?: string } {
  const job: JobInput = {
    projectId: "manual-probe",
    sourceType,
    sourceValue: baseUrl,
    upload: false,
    demoAccess,
  };
  const url = applyDemoAccess(baseUrl, job);
  return { url, altUrl: altEntry(baseUrl, url, job) };
}

export async function runJob(job: JobInput): Promise<JobOutcome> {
  let built: BuiltApp | undefined;
  try {
    let url: string;
    let policy: SafetyPolicy;

    if (job.sourceType === "live_url") {
      const parsed = new URL(job.sourceValue);
      assertRecordableUrl(parsed, job);
      url = job.sourceValue;
      policy = job.policyOverride ?? "read-only";
    } else {
      await job.onPhase?.("building");
      built = await buildAndServe(job.sourceType, job.sourceValue, job.ownerId);
      policy = job.policyOverride ?? decidePolicy(job.sourceType, built.repoFiles);
      url = built.url;
    }

    const base = url;
    url = applyDemoAccess(url, job);
    const altUrl = altEntry(base, url, job);

    console.log(`[job] ${job.sourceType} → ${url}  (policy: ${policy})`);
    if (altUrl) console.log(`[job] scout candidate → ${altUrl}`);
    const result = await recordDemo({
      url,
      altUrl,
      projectId: job.projectId,
      policy,
      upload: job.upload,
      userHint: job.userHint,
      accessNote: job.demoAccess?.note,
      accessImpossible: job.demoAccess?.impossible,
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
