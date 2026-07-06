// Cost guards for the auto-demo pipeline. Every drained job spends a real
// Anthropic (explore/computer-use) fee (~$0.13) plus E2B compute, so the whole
// point of these numbers is: a burst of demo requests can NEVER drain the API
// budget in one moment. See project-viral-strategy / project-api-cost.
//
// This module is PURE TS (no next/* imports, no top-level side effects) so it can
// be imported from all three runtimes: Next routes, the tsx local worker, and the
// Trigger.dev task. Keep it that way.

export const DEMO_QUOTA = {
  /**
   * Max ADMITTED attempts per project via the self-serve path. The product rule
   * is "one video per project" — but a first take can genuinely fail (build
   * error, transient E2B), so we allow the take + one retry to actually land the
   * single video. Once a project HAS a video (status=done / demo_video_url set)
   * it locks immediately regardless of this count: re-recording a good video
   * requires an admin-approved request. Anything past this needs approval too.
   */
  PER_PROJECT_MAX_ATTEMPTS: 2,

  /**
   * Auto demos a single user may kick off per rolling window before the pipeline
   * stops auto-running for them. Uploading your 3rd project in a day → that
   * project is HELD (shows the fallback image) until an admin approves it.
   */
  PER_USER_DAILY: 2,

  /**
   * Hard ceiling on admitted demos across ALL users per rolling window. At
   * ~$0.13/demo this caps daily spend near $5. Over this, new requests are held
   * for admin review instead of running.
   */
  GLOBAL_DAILY: 40,

  /**
   * Independent wallet backstop enforced by the recording worker itself: it
   * refuses to DRAIN more than this many jobs per window no matter how the rows
   * were enqueued (defence-in-depth against any path that bypasses admission).
   */
  GLOBAL_DRAIN_DAILY: 40,

  /** Rolling window (hours) every per-user / global count is measured over. */
  WINDOW_HOURS: 24,
} as const;

// demo_events.kind values (append-only counting log):
//   'auto'     — a self-serve auto demo was admitted (counts per-user + global).
//   'approved' — an admin approved a held/re-record request (counts global only).
//   'drain'    — the worker claimed a job to record (worker wallet backstop).
export type DemoEventKind = "auto" | "approved" | "drain";

// Who can reach /admin and act on the approval queue. Defaults to the founder's
// account; override with a comma-separated ADMIN_EMAILS env var.
const ADMIN_EMAILS: string[] = (process.env.ADMIN_EMAILS ?? "vivestarter@gmail.com")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
