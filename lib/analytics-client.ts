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

// First-touch attribution (T7): where did this visitor originally come from?
// Captured ONCE per browser on the first page they ever land on (components/
// FirstTouch.tsx in the root layout) and attached to signup_completed, so the
// admin tower can answer "어디서 가입됐나". Referrer + UTM only — no third-party
// anything, and it never leaves our own analytics table.
const FT_KEY = "nf_first_touch";

export interface FirstTouchData {
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  landing: string | null;
  at: string | null;
}

// 처음 캡처된 경우에만 그 값을 반환한다(이미 있었으면 null) — components/
// FirstTouch.tsx가 이 반환값으로 "진짜 첫 방문"인지 판단해 홍보 클립 유입
// 이벤트(promo_link_visit)를 딱 한 번만 쏜다.
export function captureFirstTouch(): FirstTouchData | null {
  try {
    if (localStorage.getItem(FT_KEY)) return null;
    const params = new URLSearchParams(location.search);
    const ft: FirstTouchData = {
      referrer: document.referrer || null,
      utm_source: params.get("utm_source"),
      utm_medium: params.get("utm_medium"),
      utm_campaign: params.get("utm_campaign"),
      landing: location.pathname,
      at: new Date().toISOString(),
    };
    localStorage.setItem(FT_KEY, JSON.stringify(ft));
    return ft;
  } catch {
    return null; // storage blocked — attribution simply degrades to "(알 수 없음)"
  }
}

export function firstTouch(): FirstTouchData | null {
  try {
    return JSON.parse(localStorage.getItem(FT_KEY) ?? "null");
  } catch {
    return null;
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
