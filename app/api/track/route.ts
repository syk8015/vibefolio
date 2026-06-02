import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Usernames are alphanumeric + _ . - (see onboarding); reject anything else early
// so a junk/huge value never reaches the DB lookup.
const USERNAME_RE = /^[a-zA-Z0-9._-]{1,40}$/;
const MAX_REFERRER_LEN = 500;
const MAX_UA_LEN = 500;

// Keep an arbitrary string within a length and coerce non-strings to null. These
// land in portfolio_views rows, so capping length blunts row-bloat / storage abuse
// from a flood of oversized analytics POSTs (rate limiting proper still needs infra).
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

    const supabase = await createClient();

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .single();

    if (!profile) return NextResponse.json({ ok: false });

    await supabase.from("portfolio_views").insert({
      profile_id: profile.id,
      referrer: clampStr((body as { referrer?: unknown }).referrer, MAX_REFERRER_LEN),
      country: clampStr(req.headers.get("x-vercel-ip-country"), 8),
      user_agent: clampStr(req.headers.get("user-agent"), MAX_UA_LEN),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
