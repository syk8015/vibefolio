import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger, hasErrorReporter } from "@/lib/logger";
import { trackServerEvent } from "@/lib/analytics";
import { AnalyticsEvent } from "@/lib/analytics-events";
import { formatDemoFailure, DEMO_FAILURE_COPY } from "@/lib/demo-failure";
import { sendEmail, isEmailConfigured, alertRecipients } from "@/lib/email";
import { demoFailedEmail, adminAlertEmail, SITE_URL } from "@/lib/email-templates";

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
// All three bars MUST sit above the worker's LARGEST hard job timeout
// (BUILD_JOB_HARD_TIMEOUT_MS = 25 min in worker.ts). The poll loop blocks inside
// processOne for the whole job, so a github/zip build legitimately runs ~25 min
// with no heartbeat and its row stays in-flight that long. The old 15/12 bars
// reaped LIVE build jobs (false failure email + wrong metrics) and fired a
// worker-stale alert every long build — which then muted real alerts for 6h.
// 30 > 25 means we only act after the worker's own timeout would already have
// fired, so anything we catch is genuinely dead.
const STUCK_INFLIGHT_MIN = 30;
const HEARTBEAT_STALE_MIN = 30;
// Pending waits for the current build to finish before the single-threaded worker
// can claim it — up to the same ~25 min — so it needs the same headroom.
const STUCK_PENDING_MIN = 30;

const REAP_MESSAGE = formatDemoFailure(
  "stuck",
  "시연 생성이 예상보다 오래 걸려 중단됐어요. 다시 시도해 주세요.",
);

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

  // ── 0. Stamp cron liveness ──────────────────────────────────────────────────
  // The external cron leaves no DB trace on a healthy tick, so /admin/ops would
  // have nothing to show for "is the cron alive?". Reserve a "_cron_last_tick"
  // key inside alerts_state (values are ISO dates like real alert entries, so the
  // TTL sweep in emailWatchdogAlert keeps it). Best-effort: a missing column
  // (migration pending) must not break the health checks below.
  {
    const { data: st } = await admin
      .from("system_status")
      .select("alerts_state")
      .eq("id", "singleton")
      .single();
    if (st) {
      await admin
        .from("system_status")
        .update({
          alerts_state: {
            ...((st.alerts_state ?? {}) as Record<string, string>),
            _cron_last_tick: new Date(now).toISOString(),
          },
        })
        .eq("id", "singleton");
    }
  }

  // ── 1. Reap in-flight jobs stuck past the cutoff ────────────────────────────
  let reaped = 0;
  const { data: stuck, error: stuckErr } = await admin
    .from("projects")
    .select("id, user_id, title, demo_build_status, demo_status_changed_at")
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
      // 이탈 후 통보 (T4): 리핑 = 유저가 스피너를 떠난 지 오래인 케이스라 이메일이
      // 사실상 유일한 통보 채널. 행이 방금 failed로 확정됐으니 재발송 걱정 없음.
      if (isEmailConfigured()) {
        for (const r of stuck) {
          try {
            const { data: u } = await admin.auth.admin.getUserById(r.user_id);
            const to = u?.user?.email;
            if (!to) continue;
            await sendEmail({
              to,
              ...demoFailedEmail({
                projectTitle: (r.title as string | null) || "내 프로젝트",
                copy: DEMO_FAILURE_COPY.stuck,
              }),
            });
          } catch (err) {
            logger.warn("watchdog: reap email failed", { error: err, projectId: r.id });
          }
        }
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
    if (paused) {
      // demo_paused = the worker is off ON PURPOSE (operator stop, or the
      // credit-exhaustion hold which already alerted loudly once when it
      // engaged). A stale heartbeat is the EXPECTED state here — paging every
      // 6h/erroring Sentry every tick is pure noise. Queue stays safely
      // pending; the admin tower ledger shows 일시정지. Info-level so the
      // Vercel log still records the condition.
      logger.info("watchdog: worker stale while intentionally paused — alert suppressed", {
        lastSeenAt,
        staleMinutes: Math.round((staleMs as number) / 60_000),
      });
    } else {
      logger.error("watchdog: worker heartbeat stale", {
        lastSeenAt,
        staleMinutes: Math.round((staleMs as number) / 60_000),
        workerStatus: sys?.worker_status,
      });
      alerts.push("worker-stale");
    }
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

  // ── 3.5 Moderation-held takes lingering unreviewed ──────────────────────────
  // The worker emails the admin the moment a take is quarantined; this check is
  // the reminder when an open item sits past the grace window (missed email,
  // 잊음). Best-effort: a missing table (migration pending) just logs.
  const MODERATION_GRACE_MIN = 30;
  let moderationOpen = 0;
  {
    const { count, error: modErr } = await admin
      .from("demo_moderation")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .lt("created_at", new Date(now - MODERATION_GRACE_MIN * 60_000).toISOString());
    if (modErr) {
      logger.warn("watchdog: demo_moderation query failed (apply migration_demo_moderation.sql?)", {
        error: modErr,
      });
    } else if ((count ?? 0) > 0) {
      moderationOpen = count ?? 0;
      logger.error("watchdog: moderation-held takes awaiting review", { open: moderationOpen });
      alerts.push(`moderation-open:${moderationOpen}`);
    }
  }

  // ── 4. Sweep expired rate-limit windows (T6) — keeps rate_limits at ~distinct
  // active keys. Best-effort: a missing table (migration pending) just logs. ───
  const { error: rlErr } = await admin
    .from("rate_limits")
    .delete()
    .lt("window_start", new Date(now - 24 * 3_600_000).toISOString());
  if (rlErr) logger.warn("watchdog: rate_limits sweep failed", { error: rlErr });

  // ── 5. Alert email (T4) — deduped so a persistent condition mails once per
  // window, not every cron tick ────────────────────────────────────────────────
  const emailed =
    alerts.length > 0
      ? await emailWatchdogAlert(admin, alerts, {
          reaped,
          lastSeenAt: lastSeenAt as string | null,
          staleMinutes: staleMs !== null ? Math.round(staleMs / 60_000) : null,
          pendingStuck: pendingStuck ?? 0,
          paused,
          moderationOpen,
        })
      : false;

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
    emailed,
    healthy: alerts.length === 0,
    // Sentry wiring diagnostics — this route is the natural probe point since the
    // external cron exercises it anyway and it's secret-gated.
    sentry: {
      reporterWired: hasErrorReporter(),
      dsnPresent: Boolean(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN),
      nodeEnv: process.env.NODE_ENV ?? null,
      nextRuntime: process.env.NEXT_RUNTIME ?? null,
    },
  });
}

// Per-alert-key suppression window. Sentry gets every occurrence; the email
// channel is for "a human should look now", so repeats inside the window stay
// silent instead of paging every 5 minutes while the worker machine is off.
const ALERT_SUPPRESS_MS = 6 * 3_600_000;
// Drop dedup entries that haven't fired in a week so alerts_state can't grow.
const ALERT_STATE_TTL_MS = 7 * 24 * 3_600_000;

// `reaped:3` and `reaped:1` are the same condition for dedup purposes
// (likewise `moderation-open:N`).
function alertKey(alert: string): string {
  if (alert.startsWith("reaped:")) return "reaped";
  if (alert.startsWith("moderation-open:")) return "moderation-open";
  return alert;
}

async function emailWatchdogAlert(
  admin: ReturnType<typeof createAdminClient>,
  alerts: string[],
  detail: {
    reaped: number;
    lastSeenAt: string | null;
    staleMinutes: number | null;
    pendingStuck: number;
    paused: boolean;
    moderationOpen: number;
  },
): Promise<boolean> {
  if (!isEmailConfigured()) return false;

  // Dedup state is jsonb {key: lastSentIso} on the system_status singleton.
  // Read separately from the main health select so a missing column (migration
  // not applied yet) degrades to "no email, Sentry only" without breaking checks.
  const { data, error } = await admin
    .from("system_status")
    .select("alerts_state")
    .eq("id", "singleton")
    .single();
  if (error) {
    logger.warn(
      "watchdog: alerts_state unavailable — alert email skipped (apply migration_stuck_watchdog.sql)",
      { error },
    );
    return false;
  }

  const state = (data?.alerts_state ?? {}) as Record<string, string>;
  const now = Date.now();
  const keys = [...new Set(alerts.map(alertKey))];
  const fresh = keys.filter((k) => {
    const last = state[k] ? Date.parse(state[k]) : NaN;
    return !(Number.isFinite(last) && now - last < ALERT_SUPPRESS_MS);
  });
  if (fresh.length === 0) return false;

  // Write-first (at-most-once): if this stamp fails we send nothing — otherwise
  // a failing write would re-email every cron tick. Sentry stays the backstop.
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(state)) {
    const t = Date.parse(v);
    if (Number.isFinite(t) && now - t < ALERT_STATE_TTL_MS) next[k] = v;
  }
  for (const k of keys) next[k] = new Date(now).toISOString();
  const { error: writeErr } = await admin
    .from("system_status")
    .update({ alerts_state: next, updated_at: new Date(now).toISOString() })
    .eq("id", "singleton");
  if (writeErr) {
    logger.error("watchdog: alerts_state write failed — alert email skipped", { error: writeErr });
    return false;
  }

  const lines: string[] = [];
  if (detail.reaped > 0)
    lines.push(`스턱 잡 ${detail.reaped}건을 failed로 정리했어요 (유저에게는 실패 메일을 보냈어요).`);
  if (keys.includes("worker-stale"))
    lines.push(
      `워커 하트비트가 ${detail.staleMinutes ?? "?"}분째 없어요 (마지막: ${detail.lastSeenAt ?? "기록 없음"}).`,
    );
  if (keys.includes("pending-no-worker"))
    lines.push(`대기 중인 시연 ${detail.pendingStuck}건이 있는데 워커가 한 번도 체크인하지 않았어요.`);
  if (keys.includes("pending-not-draining"))
    lines.push(`워커는 살아있는데 대기열 ${detail.pendingStuck}건이 빠지지 않고 있어요.`);
  if (keys.includes("moderation-open"))
    lines.push(`모더레이션 검토 대기 ${detail.moderationOpen}건이 30분 넘게 방치돼 있어요 — 관제탑에서 승인/거절해 주세요.`);
  if (keys.includes("stuck-query-failed") || keys.includes("reap-update-failed"))
    lines.push("워치독 DB 쿼리/업데이트가 실패했어요 — Sentry를 확인해 주세요.");
  if (detail.paused) lines.push("demo_paused=true — 드레인이 멈춰 있는 상태예요.");
  lines.push(`경보 키: ${alerts.join(", ")}`);

  return sendEmail({
    to: alertRecipients(),
    ...adminAlertEmail({
      title: "워치독 경보",
      lines,
      ctaLabel: "관리자 콘솔 열기",
      ctaUrl: `${SITE_URL}/admin`,
    }),
  });
}
