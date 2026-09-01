import { NextRequest, NextResponse } from "next/server";
import { requireWorker } from "@/lib/workerAuth";
import { apiError } from "@/lib/apiError";
import { markClipDone, markClipFailed } from "@/lib/promoWorkerOps";

// Terminal state for one promo clip.
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = requireWorker(req);
  if (denied) return denied;
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    if (body?.op === "done") {
      if (typeof body?.videoUrl !== "string" || typeof body?.videoKey !== "string") {
        return apiError({ status: 400, message: "videoUrl/videoKey required", code: "BAD_REQUEST" });
      }
      await markClipDone(id, {
        videoUrl: body.videoUrl,
        videoKey: body.videoKey,
        posterUrl: typeof body?.posterUrl === "string" ? body.posterUrl : null,
        durationSec: typeof body?.durationSec === "number" ? body.durationSec : null,
      });
      return NextResponse.json({ ok: true });
    }
    if (body?.op === "failed") {
      await markClipFailed(id, typeof body?.message === "string" ? body.message : "unknown error");
      return NextResponse.json({ ok: true });
    }
    return apiError({ status: 400, message: "unknown op", code: "BAD_REQUEST" });
  } catch (err) {
    return apiError({ status: 500, message: "promo clip update failed", code: "INTERNAL", cause: err });
  }
}
