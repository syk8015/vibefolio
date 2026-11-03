import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { trackServerEvent } from "@/lib/analytics";
import { AnalyticsEvent, isClientEvent } from "@/lib/analytics-events";
import { rateLimit, clientIpKey } from "@/lib/rate-limit";
import { classifyTrafficSource, cleanReferrer } from "@/lib/traffic-source";
import { describeVisitor, geoOf, primaryLanguage } from "@/lib/visitor";
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
    // 사이트 전체 천장 + 랜딩 이벤트는 세션(없으면 IP)마다 30분에 1번(2026-11-03, 보안 5단계 S10-F2) — IP를
    // 바꿔 가며 보내도 무료 데이터 저장소(500MB)를 채우지 못하게. 지금 실제 방문은 분당 몇 건이다.
    if (!(await rateLimit({ name: "analytics-all", key: "all", windowSeconds: 60, max: 300 }))) {
      return NextResponse.json({ ok: true });
    }
    if (event === AnalyticsEvent.LandingView || event === AnalyticsEvent.LandingEngaged) {
      const who = typeof body.sessionId === "string" && body.sessionId ? body.sessionId.slice(0, 64) : clientIpKey(req);
      if (!(await rateLimit({ name: "analytics-once", key: `${event}:${who}`, windowSeconds: 1800, max: 1 }))) {
        return NextResponse.json({ ok: true });
      }
    }

    // props는 납작한 값만(글자·숫자·참거짓) · 16칸 · 글자 300자 — 보내는 쪽이 실제로 쓰는 모양 그대로다.
    let props: Record<string, unknown> = {};
    if (body.props && typeof body.props === "object" && !Array.isArray(body.props)) {
      for (const [k, v] of Object.entries(body.props as Record<string, unknown>).slice(0, 16)) {
        if (k.length > 40) continue;
        if (typeof v === "string") props[k] = v.slice(0, 300);
        else if (typeof v === "number" || typeof v === "boolean" || v === null) props[k] = v;
      }
    }
    // 유입 주소는 "https://호스트"만 남긴다 — 가짜 유입처·경로에 실린 남의 정보 차단(cleanReferrer).
    if ("referrer" in props) props = { ...props, referrer: cleanReferrer(props.referrer) };

    // watch_view: stamp the traffic channel server-side. In-app browsers strip
    // the Referer, but their User-Agent (this request's own header — the ping
    // comes from the same WebView) identifies them; the client can't forge a
    // prettier channel than its own UA allows.
    if (event === AnalyticsEvent.WatchView || event === AnalyticsEvent.LandingView) {
      const ua = req.headers.get("user-agent");
      props = {
        ...props,
        channel: classifyTrafficSource({
          referrer: props.referrer,
          userAgent: ua,
          via: props.via,
        }),
        // 어디서·무엇으로·누가(lib/visitor.ts) — 서버가 찍으므로 브라우저가 보낸 같은 이름은 덮인다.
        // webdriver만 브라우저 말을 믿는다(자동화 도구가 스스로 켜는 표시라 서버는 못 본다).
        ...geoOf(req.headers),
        lang: primaryLanguage(req.headers.get("accept-language")),
        ...describeVisitor(ua, props.webdriver === true),
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
