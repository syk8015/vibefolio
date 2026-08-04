import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { rateLimit, clientIpKey } from "@/lib/rate-limit";

// Usernames are alphanumeric + _ . - (see onboarding); reject anything else early
// so a junk/huge value never reaches the DB lookup.
const USERNAME_RE = /^[a-zA-Z0-9._-]{1,40}$/;
const MAX_REFERRER_LEN = 500;
const MAX_UA_LEN = 500;

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
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ ok: false });

    const username = (body as { username?: unknown }).username;
    if (typeof username !== "string" || !USERNAME_RE.test(username)) {
      return NextResponse.json({ ok: false });
    }

    // Real browsing opens a handful of profiles per minute at most; a flood of
    // POSTs (view-count forging, row bloat) gets silently dropped past this.
    // Same silent {ok:false} as the validation failures above — no signal for
    // a prober, and the limiter fails open so tracking never breaks on infra.
    const allowed = await rateLimit({
      name: "track",
      key: clientIpKey(req),
      windowSeconds: 60,
      max: 20,
    });
    if (!allowed) return NextResponse.json({ ok: false });

    const supabase = await createClient();

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .single();

    if (!profile) return NextResponse.json({ ok: false });

    // portfolio_views is default-deny for anon/authenticated (the open insert
    // policy was dropped — migration_prelaunch_hardening.sql); this trusted,
    // rate-limited route is the only writer, via the service role.
    await createAdminClient().from("portfolio_views").insert({
      profile_id: profile.id,
      referrer: clampStr((body as { referrer?: unknown }).referrer, MAX_REFERRER_LEN),
      country: clampStr(req.headers.get("x-vercel-ip-country"), 8),
      user_agent: clampStr(req.headers.get("user-agent"), MAX_UA_LEN),
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
