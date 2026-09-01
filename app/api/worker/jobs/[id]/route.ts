import { NextRequest, NextResponse } from "next/server";
import { requireWorker } from "@/lib/workerAuth";
import { apiError } from "@/lib/apiError";
import { trackServerEvent } from "@/lib/analytics";
import { AnalyticsEvent } from "@/lib/analytics-events";
import {
  DEMO_FAILURE_CODES, formatDemoFailure, type DemoFailureCode,
} from "@/lib/demo-failure";
import {
  getJobBrief, ownerHandle, setPhase, markFailed, markDone, requeue,
  holdForCredit, holdForModeration, notifyDemoFailed, notifyDemoReady,
  IN_FLIGHT_STATUSES,
} from "@/lib/workerOps";

// Every state transition the recorder used to write directly with the service-role
// key. One route, an `op` discriminator, so the auth gate and the "look the row up
// server-side" rule are stated once.
//
// GET returns the endcap @handle (profiles.username via the owner) — the only
// profile read the worker needs.
export const dynamic = "force-dynamic";

const PHASES = new Set<string>([...IN_FLIGHT_STATUSES]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = requireWorker(req);
  if (denied) return denied;
  const { id } = await params;
  const handle = await ownerHandle(id);
  return NextResponse.json({ ok: true, handle });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = requireWorker(req);
  if (denied) return denied;
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const op = body?.op;
    const props = body?.props && typeof body.props === "object" ? body.props : {};

    switch (op) {
      case "phase": {
        if (!PHASES.has(body?.phase)) {
          return apiError({ status: 400, message: "unknown phase", code: "BAD_REQUEST" });
        }
        await setPhase(id, body.phase);
        return NextResponse.json({ ok: true });
      }

      case "requeue": {
        // Transient upstream outage — give the row back without burning the
        // owner's attempt. The worker bounds how often it may ask.
        await requeue(id);
        return NextResponse.json({ ok: true });
      }

      case "done": {
        const videoUrl = body?.videoUrl;
        if (typeof videoUrl !== "string" || !videoUrl) {
          return apiError({ status: 400, message: "videoUrl required", code: "BAD_REQUEST" });
        }
        const job = await getJobBrief(id);
        if (!job) return apiError({ status: 404, message: "job not found", code: "NOT_FOUND" });
        await markDone(id, videoUrl);
        await trackServerEvent(AnalyticsEvent.DemoSucceeded, {
          userId: job.user_id,
          props: { projectId: id, ...props },
        });
        await notifyDemoReady(job, videoUrl);
        return NextResponse.json({ ok: true });
      }

      case "failed": {
        const code: DemoFailureCode = (DEMO_FAILURE_CODES as readonly string[]).includes(body?.code)
          ? body.code
          : "error";
        const message = typeof body?.message === "string" ? body.message : "";
        const job = await getJobBrief(id);
        await markFailed(id, formatDemoFailure(code, message));
        await trackServerEvent(AnalyticsEvent.DemoFailed, {
          userId: job?.user_id ?? null,
          props: { projectId: id, reason: code, ...props },
        });
        if (job) await notifyDemoFailed(job, code);
        return NextResponse.json({ ok: true });
      }

      case "held-credit": {
        const job = await getJobBrief(id);
        if (!job) return apiError({ status: 404, message: "job not found", code: "NOT_FOUND" });
        await holdForCredit(job, typeof body?.message === "string" ? body.message : "");
        return NextResponse.json({ ok: true });
      }

      case "held-moderation": {
        const job = await getJobBrief(id);
        if (!job) return apiError({ status: 404, message: "job not found", code: "NOT_FOUND" });
        const categories = Array.isArray(body?.categories)
          ? body.categories.filter((c: unknown): c is string => typeof c === "string")
          : [];
        await holdForModeration(job, {
          categories,
          reason: typeof body?.reason === "string" ? body.reason : "",
          model: typeof body?.model === "string" ? body.model : "",
          quarantine: body?.quarantine ?? null,
        });
        return NextResponse.json({ ok: true });
      }

      default:
        return apiError({ status: 400, message: "unknown op", code: "BAD_REQUEST" });
    }
  } catch (err) {
    return apiError({ status: 500, message: "job update failed", code: "INTERNAL", cause: err });
  }
}
