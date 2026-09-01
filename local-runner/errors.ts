// Credit-exhaustion classification (P0.5).
//
// When the Anthropic account runs dry the pipeline must not silently die (it did
// once, 2026-07-01) and must not burn the user's retry budget — the failure is
// ours, not theirs. explore.ts throws this marked error; worker.ts catches it and
// parks the job as `held` + flips system_status.demo_paused (drain stop) + fires a
// fatal Sentry alert. Release procedure: local-runner/README.md.

export class CreditExhaustedError extends Error {}

// Classified pipeline failures (2026-07-19, input matrix). worker.ts maps each to
// a demo_build_error code so the dashboard shows a cause-specific message instead
// of the generic "error".
export class BuildFailedError extends Error {} // clone/install/dev-server broke
export class NotAWebappError extends Error {
  // 웹 타깃 없는 네이티브 앱(ios|android|unity)으로 보이면 그 플랫폼. 해결이 아니라
  // 수요 계측용 — worker.ts가 native_app_rejected로 남긴다(lib/nativeApp.ts).
  platform?: string;
  constructor(message: string, platform?: string) {
    super(message);
    this.platform = platform;
  }
} // nothing serveable (no html / backend-only)
export class BlankCaptureError extends Error {} // page rendered nothing

// Sustained-but-temporary API outage (429/529/5xx that survived all in-call
// retries, or repeated network failures). Not the user's fault and not
// permanent: worker.ts requeues the job WITHOUT burning a session attempt
// (bounded — a persisting outage still fails normally). Audit A-A1.
export class TransientApiError extends Error {}

// Anthropic signals empty credits as 400/402 with a billing message in the body
// (e.g. "Your credit balance is too low to access the Anthropic API").
export function isCreditExhaustion(status: number, bodyText: string): boolean {
  if (status === 402) return true;
  if (status !== 400 && status !== 403) return false;
  return /credit balance|billing|payment required|insufficient credit|plans & billing/i.test(
    bodyText,
  );
}

// Hold markers now live in lib/demo-failure.ts — the server performs every hold
// write (lib/workerOps.ts) and must use the identical string, so a single shared
// definition is the only safe home. Re-exported here so existing importers of
// ./errors keep working.
export { CREDIT_HOLD_MARKER, MODERATION_HOLD_MARKER } from "../lib/demo-failure";

