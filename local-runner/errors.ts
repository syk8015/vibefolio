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
export class NotAWebappError extends Error {} // nothing serveable (no html / backend-only)
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

// Stored in demo_build_error while a job is credit-held — the release sweep keys
// on the '[credit]' prefix. Not a DemoFailureCode: the row is held, not failed.
export const CREDIT_HOLD_MARKER =
  "[credit] 크레딧 소진으로 촬영이 잠시 중단됐어요. 충전 후 다시 촬영돼요.";

// Stored in demo_build_error while a take is quarantined for content review
// (moderation pipeline, 2026-07-19). MUST NOT start with '[credit]' — the credit
// release sweep (local-runner/README.md) keys on that prefix and would wrongly
// requeue a moderation hold. The dashboard badge branches on '[moderation]' to
// show review copy instead of the quota-hold copy. Not a DemoFailureCode: the
// row is held, not failed (reject converts it to failed + the 'policy' code).
export const MODERATION_HOLD_MARKER =
  "[moderation] 게시 전 확인이 필요해 잠시 보류 중이에요. 검토가 끝나면 자동으로 게시돼요.";
