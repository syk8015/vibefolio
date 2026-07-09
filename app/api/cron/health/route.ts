import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { trackServerEvent } from "@/lib/analytics";
import { AnalyticsEvent } from "@/lib/analytics-events";

// Stuck-job watchdog (P0.4). Hit on a schedule by an EXTERNAL free cron
// (cron-job.org etc.) which sends the shared secret. It:
//   1. reaps demo jobs stuck in an in-flight state past STUCK_INFLIGHT_MIN — so a
//      user is never left on a spinner forever when the worker machine is off;
//   2. alerts (logger.error → Sentry) when the worker heartbeat is stale, or when
//      pending jobs aren't draining despite a live, un-paused worker.
// Alerts route through the logger, so they only actually reach Sentry in
// production with a DSN set. Always returns 200 for an authorised call so the cron
// service doesn't treat findings as its own failure.
export const dynamic = "force-dynamic";

const IN_FLIGHT = ["building", "recording", "editing"] as const;
const STUCK_INFLIGHT_MIN = 15;
// Above the worker's 10-min hard job timeout: the heartbeat pauses during a long
// job (the poll loop is blocked in processOne), so a lower bar would false-alarm.
const HEARTBEAT_STALE_MIN = 12;
const STUCK_PENDING_MIN = 15;

const REAP_MESSAGE =
  "시연 생성이 예상보다 오래 걸려 중단됐어요. 다시 시도해 주세요.";

function authorize(req: NextRequest): "ok" | "unconfigured" | "denied" {
  const secret = process.env.CRON_SECRET;
  if (!secret) return "unconfigured";
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return "ok";
  if (req.nextUrl.searchParams.get("key") === secret) return "ok";
  return "denied";
}

export async function GET(req: NextRequest) {
  const gate = authorize(req);
  if (gate === "unconfigured") {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not configured" }, { status: 503 });
  }
  if (gate === "denied") {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = Date.now();
  const inflightCutoff = new Date(now - STUCK_INFLIGHT_MIN * 60_000).toISOString();
  const pendingCutoff = new Date(now - STUCK_PENDING_MIN * 60_000).toISOString();

  const alerts: string[] = [];

  // ── 1. Reap in-flight jobs stuck past the cutoff ────────────────────────────
  let reaped = 0;
  const { data: stuck, error: stuckErr } = await admin
    .from("projects")
    .select("id, user_id, demo_build_status, demo_status_changed_at")
    .in("demo_build_status", [...IN_FLIGHT])
    .lt("demo_status_changed_at", inflightCutoff);

  if (stuckErr) {
    logger.error("watchdog: stuck-job query failed", { error: stuckErr });
    alerts.push("stuck-query-failed");
  } else if (stuck && stuck.length > 0) {
    const ids = stuck.map((r) => r.id);
    const { error: updErr } = await admin
      .from("projects")
      .update({ demo_build_status: "failed", demo_build_error: REAP_MESSAGE })
      .in("id", ids);
    if (updErr) {
      logger.error("watchdog: reap update failed", { error: updErr, count: ids.length });
      alerts.push("reap-update-failed");
    } else {
      reaped = ids.length;
      logger.error("watchdog: reaped stuck demo jobs", {
        count: reaped,
        jobs: stuck.map((r) => ({ id: r.id, status: r.demo_build_status, since: r.demo_status_changed_at })),
      });
      // Keep build success rate honest — a reaped job is a failure.
      for (const r of stuck) {
        await trackServerEvent(AnalyticsEvent.DemoFailed, {
          userId: r.user_id,
          props: { projectId: r.id, reason: "stuck-reaped", stuckStatus: r.demo_build_status },
        });
      }
      alerts.push(`reaped:${reaped}`);
    }
  }

  // ── 2. Worker heartbeat + kill-switch state ─────────────────────────────────
  const { data: sys, error: sysErr } = await admin
    .from("system_status")
    .select("worker_last_seen_at, worker_status, demo_paused")
    .eq("id", "singleton")
    .single();

  const lastSeenAt = sys?.worker_last_seen_at ?? null;
  const paused = !!sys?.demo_paused;
  const seen = !!lastSeenAt;
  const staleMs = seen ? now - new Date(lastSeenAt as string).getTime() : null;
  const workerStale = staleMs !== null && staleMs > HEARTBEAT_STALE_MIN * 60_000;

  if (sysErr) {
    // Missing table / row — surfaced but not fatal (migration may be pending).
    logger.warn("watchdog: system_status read failed", { error: sysErr });
  } else if (workerStale) {
    logger.error("watchdog: worker heartbeat stale", {
      lastSeenAt,
      staleMinutes: Math.round((staleMs as number) / 60_000),
      workerStatus: sys?.worker_status,
    });
    alerts.push("worker-stale");
  }

  // ── 3. Pending jobs not draining ────────────────────────────────────────────
  const { count: pendingStuck, error: pendErr } = await admin
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("demo_build_status", "pending")
    .lt("demo_status_changed_at", pendingCutoff);

  if (pendErr) {
    logger.warn("watchdog: pending query failed", { error: pendErr });
  } else if ((pendingStuck ?? 0) > 0 && !paused) {
    if (!seen) {
      logger.error("watchdog: pending demo jobs but worker never checked in", { pendingStuck });
      alerts.push("pending-no-worker");
    } else if (!workerStale) {
      // Worker looks alive and isn't paused, yet pending rows are aging — a claim
      // problem (worker wedged short of a heartbeat gap, or a bad row).
      logger.error("watchdog: pending demo jobs not draining despite live worker", {
        pendingStuck,
        lastSeenAt,
      });
      alerts.push("pending-not-draining");
    }
    // If the worker is stale, the worker-stale alert already explains the backlog.
  }

  return NextResponse.json({
    ok: true,
    checkedAt: new Date(now).toISOString(),
    reaped,
    worker: {
      lastSeenAt,
      staleMinutes: staleMs !== null ? Math.round(staleMs / 60_000) : null,
      stale: workerStale,
      paused,
      status: sys?.worker_status ?? null,
    },
    pendingStuck: pendingStuck ?? 0,
    alerts,
    healthy: alerts.length === 0,
  });
}
