import { AnalyticsEvent, type AnalyticsEventName } from "@/lib/analytics-events";

// Browser-side analytics reporter (P0.2 unit 2). Fire-and-forget POST to
// /api/analytics — keepalive so events survive navigation (e.g. a copy right
// before closing the tab). Never throws: analytics must never break a flow.
//
// nf_sid is a random anonymous id (localStorage) so logged-out events (watch_view)
// can still be grouped into sessions server-side. Not a tracking cookie — it never
// leaves this site's own analytics table.

const SID_KEY = "nf_sid";

function sessionId(): string | null {
  try {
    let sid = localStorage.getItem(SID_KEY);
    if (!sid) {
      sid = crypto.randomUUID();
      localStorage.setItem(SID_KEY, sid);
    }
    return sid;
  } catch {
    return null; // storage blocked (private mode 등) — 이벤트는 익명으로만
  }
}

export function trackClientEvent(
  event: AnalyticsEventName,
  props?: Record<string, unknown>,
): void {
  try {
    void fetch("/api/analytics", {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, props, sessionId: sessionId() }),
    }).catch(() => {});
  } catch {
    // never break the caller
  }
}

export { AnalyticsEvent };
