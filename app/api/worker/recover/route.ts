import { NextRequest, NextResponse } from "next/server";
import { requireWorker } from "@/lib/workerAuth";
import { apiError } from "@/lib/apiError";
import { recoverStuckJobs } from "@/lib/workerOps";

// Startup recovery: rows left in building/recording/editing belong to a previous
// local run that died mid-job, so mark them failed and mail the owners.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = requireWorker(req);
  if (denied) return denied;
  try {
    const recovered = await recoverStuckJobs();
    return NextResponse.json({ ok: true, recovered });
  } catch (err) {
    return apiError({ status: 500, message: "recover failed", code: "INTERNAL", cause: err });
  }
}
