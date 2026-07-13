// Demo failure code protocol.
//
// Producers (local worker, health-cron reaper) store a classified failure as
// `[code] human message` in projects.demo_build_error; the dashboard parses it
// back to show per-cause copy with the raw message behind a toggle. Rows written
// before this protocol (or by ad-hoc client writes) have no prefix — parse falls
// back to code null and the raw text is preserved.
//
// Client-safe: no server-only imports (used by ProjectsTab, the tsx worker and
// API routes alike).
export const DEMO_FAILURE_CODES = [
  "login-gated", // site needs auth — recorder only shoots public screens
  "timeout", // job hit the worker's hard timeout
  "interrupted", // worker restarted mid-job (startup recovery)
  "stuck", // health-cron reaped a row stuck in-flight
  "error", // anything else (raw pipeline message follows)
] as const;

export type DemoFailureCode = (typeof DEMO_FAILURE_CODES)[number];

export function formatDemoFailure(code: DemoFailureCode, message: string): string {
  return `[${code}] ${message}`;
}

export function parseDemoFailure(stored: string | null): {
  code: DemoFailureCode | null;
  message: string;
} {
  if (!stored) return { code: null, message: "" };
  const m = stored.match(/^\[([a-z-]+)\]\s*/);
  if (m && (DEMO_FAILURE_CODES as readonly string[]).includes(m[1])) {
    return { code: m[1] as DemoFailureCode, message: stored.slice(m[0].length) };
  }
  return { code: null, message: stored };
}
