import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { trackServerEvent } from "@/lib/analytics";
import { AnalyticsEvent, isClientEvent } from "@/lib/analytics-events";
import { rateLimit, clientIpKey } from "@/lib/rate-limit";
import { classifyTrafficSource, cleanReferrer } from "@/lib/traffic-source";
import { BODY_TOO_LARGE, readJsonOr, MAX_SMALL_JSON_BYTES } from "@/lib/upload-safety";

// Client-reported analytics sink (P0.2 unit 2). Browser-sent, so best-effort by
// definition: events outside CLIENT_EVENTS are dropped (the server-authoritative
// demo_* names can never be forged through here), props are size-clamped, and the
// response is always a silent {ok:true} — like /api/track, validation feedback
// would only give a prober something to enumerate, and analytics must never
// error a user flow.
export async function POST(req: NextRequest) {
  try {
    const body = await readJsonOr(req, MAX_SMALL_JSON_BYTES, null);
    if (body === BODY_TOO_LARGE) return NextResponse.json({ ok: false }, { status: 413 });
    const event = body?.event;
    if (!isClientEvent(event)) return NextResponse.json({ ok: true });

    // Generous cap — a real session fires a few events per page, not per second.
    // Blocked requests still answer {ok:true} per the silent contract.
    const allowed = await rateLimit({
      name: "analytics",
      key: clientIpKey(req),
      windowSeconds: 60,
      max: 60,
    });
    if (!allowed) return NextResponse.json({ ok: true });

    let props: Record<string, unknown> = {};
    if (body.props && typeof body.props === "object" && !Array.isArray(body.props)) {
      const serialized = JSON.stringify(body.props);
      if (serialized.length <= 2048) props = body.props;
    }
    // 유입 주소는 "https://호스트"만 남긴다 — 가짜 유입처·경로에 실린 남의 정보 차단(cleanReferrer).
    if ("referrer" in props) props = { ...props, referrer: cleanReferrer(props.referrer) };

    // watch_view: stamp the traffic channel server-side. In-app browsers strip
    // the Referer, but their User-Agent (this request's own header — the ping
    // comes from the same WebView) identifies them; the client can't forge a
    // prettier channel than its own UA allows.
    if (event === AnalyticsEvent.WatchView || event === AnalyticsEvent.LandingView) {
      props = {
        ...props,
        channel: classifyTrafficSource({
          referrer: props.referrer,
          userAgent: req.headers.get("user-agent"),
          via: props.via,
        }),
      };
    }
    const sessionId =
      typeof body.sessionId === "string" && body.sessionId.length > 0
        ? body.sessionId.slice(0, 64)
        : null;

    // Attach the user when a session cookie is present (funnel joins) — but the
    // event is accepted logged-out too (watch_view is mostly anonymous).
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await trackServerEvent(event, { userId: user?.id ?? null, sessionId, props });
  } catch {
    // analytics never surfaces errors
  }
  return NextResponse.json({ ok: true });
}
