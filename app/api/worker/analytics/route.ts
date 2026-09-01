import { NextRequest, NextResponse } from "next/server";
import { requireWorker } from "@/lib/workerAuth";
import { apiError } from "@/lib/apiError";
import { trackServerEvent } from "@/lib/analytics";
import { AnalyticsEvent, type AnalyticsEventName } from "@/lib/analytics-events";

// Product analytics from the recorder. Fire-and-forget by contract, but the event
// NAME is validated against the known list so a compromised worker secret cannot
// stuff arbitrary rows into analytics_events.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = requireWorker(req);
  if (denied) return denied;
  try {
    const body = await req.json().catch(() => ({}));
    const event = body?.event;
    const known = Object.values(AnalyticsEvent) as string[];
    if (typeof event !== "string" || !known.includes(event)) {
      return apiError({ status: 400, message: "unknown event", code: "BAD_REQUEST" });
    }
    await trackServerEvent(event as AnalyticsEventName, {
      userId: typeof body?.userId === "string" ? body.userId : null,
      props: body?.props && typeof body.props === "object" ? body.props : {},
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError({ status: 500, message: "analytics failed", code: "INTERNAL", cause: err });
  }
}
