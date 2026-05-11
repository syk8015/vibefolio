import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { username, referrer } = await req.json();
    if (!username) return NextResponse.json({ ok: false });

    const supabase = await createClient();

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .single();

    if (!profile) return NextResponse.json({ ok: false });

    await supabase.from("portfolio_views").insert({
      profile_id: profile.id,
      referrer: referrer || null,
      country: req.headers.get("x-vercel-ip-country") || null,
      user_agent: req.headers.get("user-agent") || null,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
