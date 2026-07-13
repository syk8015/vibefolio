import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { trackServerEvent } from "@/lib/analytics";
import { isClientEvent } from "@/lib/analytics-events";

// Client-reported analytics sink (P0.2 unit 2). Browser-sent, so best-effort by
// definition: events outside CLIENT_EVENTS are dropped (the server-authoritative
// demo_* names can never be forged through here), props are size-clamped, and the
// response is always a silent {ok:true} — like /api/track, validation feedback
// would only give a prober something to enumerate, and analytics must never
// error a user flow.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const event = body?.event;
    if (!isClientEvent(event)) return NextResponse.json({ ok: true });

    let props: Record<string, unknown> = {};
    if (body.props && typeof body.props === "object" && !Array.isArray(body.props)) {
      const serialized = JSON.stringify(body.props);
      if (serialized.length <= 2048) props = body.props;
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
