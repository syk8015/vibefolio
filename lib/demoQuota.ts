// Cost guards for the auto-demo pipeline. Every drained job spends a real
// Anthropic (explore/computer-use) fee ($0.035 wired-selector script .. $0.17
// worst case vision walk) plus E2B compute, so the whole point of these numbers
// is: a burst of demo requests can NEVER drain the API budget in one moment.
// Loosened 2026-09-01 for the user-acquisition push (see pending-quota-loosening).
// See project-viral-strategy / project-api-cost.
//
// This module is PURE TS (no next/* imports, no top-level side effects) so it can
// be imported from both runtimes: Next routes and the tsx local worker. Keep it
// that way.

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
   * stops auto-running for them. Uploading your 11th project in a day → that
   * project is HELD (shows the fallback image) until an admin approves it.
   */
  PER_USER_DAILY: 10,

  /**
   * Hard ceiling on admitted demos across ALL users per rolling window. Caps
   * daily spend at $3.50 (all wired-script takes) .. $17 (all worst case), i.e.
   * $105 .. $510 a month. Over this, new requests are held for admin review
   * instead of running. Kept in step with PER_USER_DAILY: at 40 the global cap
   * would slam shut after 4 users a day and the per-user allowance would be moot.
   */
  GLOBAL_DAILY: 100,

  /**
   * Independent wallet backstop enforced by the recording worker itself: it
   * refuses to DRAIN more than this many jobs per window no matter how the rows
   * were enqueued (defence-in-depth against any path that bypasses admission).
   */
  GLOBAL_DRAIN_DAILY: 100,

  /** Rolling window (hours) every per-user / global count is measured over. */
  WINDOW_HOURS: 24,
} as const;

// demo_events.kind values (append-only counting log):
//   'auto'     — a self-serve auto demo was admitted (counts per-user + global).
//   'approved' — an admin approved a held/re-record request (counts global only).
//   'drain'    — the worker claimed a job to record (worker wallet backstop).
export type DemoEventKind = "auto" | "approved" | "drain";

