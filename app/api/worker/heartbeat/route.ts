import { NextRequest, NextResponse } from "next/server";
import { requireWorker } from "@/lib/workerAuth";
import { apiError, bodyTooLarge } from "@/lib/apiError";
import { heartbeat } from "@/lib/workerOps";
import { BODY_TOO_LARGE, readJsonOr, MAX_MEDIUM_JSON_BYTES } from "@/lib/upload-safety";

// Worker liveness + kill switch in one round-trip (polled every ~10s).
// Returns { demoPaused } so the worker knows whether to claim.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = requireWorker(req);
  if (denied) return denied;
  try {
    const body = await readJsonOr(req, MAX_MEDIUM_JSON_BYTES, {});
    if (body === BODY_TOO_LARGE) return bodyTooLarge();
    const status = body?.status === "busy" ? "busy" : "idle";
    const { demoPaused } = await heartbeat(status);
    return NextResponse.json({ ok: true, demoPaused });
  } catch (err) {
    return apiError({ status: 500, message: "heartbeat failed", code: "INTERNAL", cause: err });
  }
}
