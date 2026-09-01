import { NextRequest, NextResponse } from "next/server";
import { requireWorker } from "@/lib/workerAuth";
import { apiError } from "@/lib/apiError";
import { heartbeat } from "@/lib/workerOps";

// Worker liveness + kill switch in one round-trip (polled every ~10s).
// Returns { demoPaused } so the worker knows whether to claim.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = requireWorker(req);
  if (denied) return denied;
  try {
    const body = await req.json().catch(() => ({}));
    const status = body?.status === "busy" ? "busy" : "idle";
    const { demoPaused } = await heartbeat(status);
    return NextResponse.json({ ok: true, demoPaused });
  } catch (err) {
    return apiError({ status: 500, message: "heartbeat failed", code: "INTERNAL", cause: err });
  }
}
