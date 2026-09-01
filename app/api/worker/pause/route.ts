import { NextRequest, NextResponse } from "next/server";
import { requireWorker } from "@/lib/workerAuth";
import { apiError } from "@/lib/apiError";
import { setDemoPaused } from "@/lib/workerOps";

// Batch mode flips this: unpause before draining, repause on EVERY exit path.
// Steady state is demo_paused=true, which is what keeps the health cron mailing
// "queue-waiting" instead of paging an outage.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = requireWorker(req);
  if (denied) return denied;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.paused !== "boolean") {
      return apiError({ status: 400, message: "paused must be a boolean", code: "BAD_REQUEST" });
    }
    await setDemoPaused(body.paused);
    return NextResponse.json({ ok: true, paused: body.paused });
  } catch (err) {
    return apiError({ status: 500, message: "pause failed", code: "INTERNAL", cause: err });
  }
}
