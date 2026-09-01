import { NextRequest, NextResponse } from "next/server";
import { requireWorker } from "@/lib/workerAuth";
import { apiError } from "@/lib/apiError";
import { claimNext } from "@/lib/workerOps";

// Atomically hand the worker its next job: wallet ceiling check → poll pending →
// conditional claim (pending → building) → log the drain event. The worker gets a
// job row or null; it never sees the queue it did not win.
//
// `skipIds` are rows this worker session already burned its retry budget on
// (MAX_ATTEMPTS_PER_SESSION) — session state the server has no reason to keep.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = requireWorker(req);
  if (denied) return denied;
  try {
    const body = await req.json().catch(() => ({}));
    const skipIds: string[] = Array.isArray(body?.skipIds)
      ? body.skipIds.filter((v: unknown): v is string => typeof v === "string").slice(0, 200)
      : [];
    const result = await claimNext(skipIds);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return apiError({ status: 500, message: "claim failed", code: "INTERNAL", cause: err });
  }
}
