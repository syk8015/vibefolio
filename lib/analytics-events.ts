// Canonical analytics event names — the wedge/funnel we measure (P0.2).
//
// PURE TS (no imports, no side effects) so all three runtimes share one source of
// truth: Next routes (`@/lib/analytics-events`), the tsx recorder worker
// (`../lib/analytics-events`), and the browser client helper.
//
// Two tiers:
//   * Server-authoritative — written only by trusted server code (the trigger
//     route + the worker). These are EXACT; the headline KPI depends on them:
//         build success rate = demo_succeeded / demo_requested
//   * Client-reported — best-effort, sent from the browser via /api/analytics.
//     A user could forge these, so never gate spend or trust on them.
export const AnalyticsEvent = {
  // ── server-authoritative ────────────────────────────────────────────────
  DemoRequested: "demo_requested", // a fresh recording job was admitted (job starts)
  DemoHeld: "demo_held", // over-cap -> held for admin review (no spend)
  DemoSucceeded: "demo_succeeded", // worker produced a video
  DemoFailed: "demo_failed", // worker failed (props.reason: login-gated | error)
  // ── client-reported ─────────────────────────────────────────────────────
  SignupCompleted: "signup_completed",
  ProjectCreated: "project_created",
  ShareOpened: "share_opened",
  ShareCopied: "share_copied",
  DemoDownloaded: "demo_downloaded",
  WatchView: "watch_view", // ?p= watch page load — viral attribution
  PromoLinkVisit: "promo_link_visit", // first touch via a /admin/promo tracking link (lib/promo.ts)
} as const;

export type AnalyticsEventName = (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];

// Events the browser is allowed to report through /api/analytics. The
// server-authoritative demo_* events are intentionally excluded so a client can
// never forge a "succeeded" and inflate the build success rate.
export const CLIENT_EVENTS = new Set<string>([
  AnalyticsEvent.SignupCompleted,
  AnalyticsEvent.ProjectCreated,
  AnalyticsEvent.ShareOpened,
  AnalyticsEvent.ShareCopied,
  AnalyticsEvent.DemoDownloaded,
  AnalyticsEvent.WatchView,
  AnalyticsEvent.PromoLinkVisit,
]);

export function isClientEvent(event: unknown): event is AnalyticsEventName {
  return typeof event === "string" && CLIENT_EVENTS.has(event);
}
