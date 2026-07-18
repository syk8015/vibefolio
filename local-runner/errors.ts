// Credit-exhaustion classification (P0.5).
//
// When the Anthropic account runs dry the pipeline must not silently die (it did
// once, 2026-07-01) and must not burn the user's retry budget — the failure is
// ours, not theirs. explore.ts throws this marked error; worker.ts catches it and
// parks the job as `held` + flips system_status.demo_paused (drain stop) + fires a
// fatal Sentry alert. Release procedure: local-runner/README.md.

export class CreditExhaustedError extends Error {}

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
