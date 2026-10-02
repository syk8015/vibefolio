import { NextRequest, NextResponse } from "next/server";
import { requireWorker } from "@/lib/workerAuth";
import { apiError, bodyTooLarge } from "@/lib/apiError";
import { recoverStuckClips, claimNextClip } from "@/lib/promoWorkerOps";
import { BODY_TOO_LARGE, readJsonOr, MAX_MEDIUM_JSON_BYTES } from "@/lib/upload-safety";

// Promo-clip queue: startup recovery + claim-next.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = requireWorker(req);
  if (denied) return denied;
  try {
    const body = await readJsonOr(req, MAX_MEDIUM_JSON_BYTES, {});
    if (body === BODY_TOO_LARGE) return bodyTooLarge();
    if (body?.op === "recover") {
      const recovered = await recoverStuckClips();
      return NextResponse.json({ ok: true, recovered });
    }
    if (body?.op === "claim") {
      const clip = await claimNextClip();
      return NextResponse.json({ ok: true, clip });
    }
    return apiError({ status: 400, message: "unknown op", code: "BAD_REQUEST" });
  } catch (err) {
    return apiError({ status: 500, message: "promo queue op failed", code: "INTERNAL", cause: err });
  }
}
