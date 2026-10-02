import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { rateLimit, clientIpKey } from "@/lib/rate-limit";
import { cleanReferrer } from "@/lib/traffic-source";
import { BODY_TOO_LARGE, readJsonOr, MAX_SMALL_JSON_BYTES } from "@/lib/upload-safety";

// Usernames are alphanumeric + _ . - (see onboarding); reject anything else early
// so a junk/huge value never reaches the DB lookup.
const USERNAME_RE = /^[a-zA-Z0-9._-]{1,40}$/;
const MAX_REFERRER_LEN = 500;
const MAX_UA_LEN = 500;
// 명함 하나에 1분 동안 새로 세는 방문의 상한(IP 무관, 2026-10-02). IP마다 따로 세는 한도는 IP를
// 수백 개 돌리는 봇 무리를 못 막는다 — 명함 쪽에도 천장을 둔다. 120/분 = 하루 17만이라 진짜로
// 몰리는 날(글이 크게 퍼진 날)에도 거의 안 걸리고, 넘는 몫은 안 셀 뿐 화면은 안 깨진다.
const PROFILE_VIEWS_PER_MIN = 120;
// 사람 브라우저가 아닌 게 분명한 것 — 셀 필요가 없고, 값싼 폭주는 대개 이 모양이다.
// (UA는 꾸밀 수 있어 방어선이 아니라 거름망이다. 천장은 위 상한이 맡는다.)
const NON_BROWSER_UA = /bot|crawl|spider|slurp|curl|wget|python|httpx|axios|node-fetch|undici|go-http|java\/|okhttp|libwww|headless|phantom|puppeteer|playwright|scrapy/i;

// Keep an arbitrary string within a length and coerce non-strings to null. These
// land in portfolio_views rows, so capping length blunts row-bloat / storage abuse
// from a flood of oversized analytics POSTs.
function clampStr(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonOr(req, MAX_SMALL_JSON_BYTES, null);
    if (body === BODY_TOO_LARGE) return NextResponse.json({ ok: false }, { status: 413 });
    if (!body || typeof body !== "object") return NextResponse.json({ ok: false });

    const username = (body as { username?: unknown }).username;
    if (typeof username !== "string" || !USERNAME_RE.test(username)) {
      return NextResponse.json({ ok: false });
    }

    // Real browsing opens a handful of profiles per minute at most; a flood of
    // POSTs (view-count forging, row bloat) gets silently dropped past this.
    // Same silent {ok:false} as the validation failures above — no signal for
    // a prober, and the limiter fails open so tracking never breaks on infra.
    const ipKey = clientIpKey(req);
    const allowed = await rateLimit({
      name: "track",
      key: ipKey,
      windowSeconds: 60,
      max: 20,
      failClosed: true,
    });
    if (!allowed) return NextResponse.json({ ok: false });

    const ua = req.headers.get("user-agent") ?? "";
    if (!ua.trim() || NON_BROWSER_UA.test(ua)) return NextResponse.json({ ok: false });

    const supabase = await createClient();

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .single();

    if (!profile) return NextResponse.json({ ok: false });

    // Same IP + same profile counts once per 30 min — the server-side twin of
    // ViewTracker's localStorage window. The client window is only courtesy (a
    // script skips it), so without this one IP could forge ~28.8k views/day on a
    // single profile at the 20/min cap. NAT-shared IPs collapse too; accepted.
    const firstVisit = await rateLimit({
      name: "track-view",
      key: `${ipKey}:${profile.id}`,
      windowSeconds: 1800,
      max: 1,
      failClosed: true,
    });
    if (!firstVisit) return NextResponse.json({ ok: false });

    // 명함 쪽 천장 — 여러 IP에서 몰려도 1분에 PROFILE_VIEWS_PER_MIN개까지만 센다.
    const underCeiling = await rateLimit({
      name: "track-profile",
      key: profile.id,
      windowSeconds: 60,
      max: PROFILE_VIEWS_PER_MIN,
      failClosed: true,
    });
    if (!underCeiling) return NextResponse.json({ ok: false });

    // portfolio_views is default-deny for anon/authenticated (the open insert
    // policy was dropped — migration_prelaunch_hardening.sql); this trusted,
    // rate-limited route is the only writer, via the service role.
    await createAdminClient().from("portfolio_views").insert({
      profile_id: profile.id,
      // 유입 주소는 "https://호스트"만 — 브라우저가 적어 보내는 값이라 모양을 걸러 둔다(cleanReferrer).
      referrer: clampStr(cleanReferrer((body as { referrer?: unknown }).referrer), MAX_REFERRER_LEN),
      country: clampStr(req.headers.get("x-vercel-ip-country"), 8),
      user_agent: clampStr(ua, MAX_UA_LEN),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    // 분석 기록은 fire-and-forget(클라이언트가 응답을 무시) — 사용자 흐름은
    // 막지 않되, 실제 예외는 추적할 수 있게 로그로 남긴다. 위의 검증 실패
    // 응답들은 에러가 아니라 의도된 무음 거부라 로깅하지 않는다.
    logger.error("track: failed to record view", { error: err });
    return NextResponse.json({ ok: false });
  }
}
