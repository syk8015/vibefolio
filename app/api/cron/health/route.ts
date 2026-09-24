import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { authorizeCron } from "@/lib/cronAuth";
import { runHandoffReminders } from "@/lib/handoffReminders";
import { logger, hasErrorReporter } from "@/lib/logger";
import { trackServerEvent } from "@/lib/analytics";
import { AnalyticsEvent } from "@/lib/analytics-events";
import { formatDemoFailure, demoFailureCopy } from "@/lib/demo-failure";
import { recipientLocale } from "@/lib/i18n/user-locale";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { sendEmail, isEmailConfigured, alertRecipients } from "@/lib/email";
import { demoFailedEmail, adminAlertEmail, SITE_URL } from "@/lib/email-templates";
import { setDemoPaused } from "@/lib/workerOps";
import { APPROVAL_MAIL_KEY, APPROVAL_MAIL_WINDOW_MS } from "@/lib/approvalMail";

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

export async function GET(req: NextRequest) {
  const gate = authorizeCron(req);
  if (gate === "unconfigured") {
    return apiError({ status: 503, message: "CRON_SECRET not configured", code: "CRON_UNCONFIGURED" });
  }
  if (gate === "denied") {
    return apiError({ status: 401, message: "unauthorized", code: "UNAUTHORIZED", log: false });
  }

  const admin = createAdminClient();
  const now = Date.now();
  const inflightCutoff = new Date(now - STUCK_INFLIGHT_MIN * 60_000).toISOString();
  const pendingCutoff = new Date(now - STUCK_PENDING_MIN * 60_000).toISOString();

  const alerts: string[] = [];
  // 지난 틱까지의 경보 기록(메일 dedup과 같은 표) — 아래 0번에서 채운다.
  let prevAlerts: Record<string, string> = {};

  // 같은 상태 경보는 Sentry에 창(메일 dedup과 같은 6시간)마다 한 번만 error로 올린다
  // (2026-09-22 운영5). 5분 크론이라 상태가 이어지면 하루 288건씩 쌓여 무료 쿼터를
  // 먹고 진짜 예외가 버려질 수 있었다. 반복분은 warn — Vercel 로그엔 그대로 남는다.
  const alertLog = (key: string, message: string, ctx: Record<string, unknown>) => {
    const last = prevAlerts[key] ? Date.parse(prevAlerts[key]) : NaN;
    if (Number.isFinite(last) && now - last < ALERT_SUPPRESS_MS) {
      logger.warn(message, { ...ctx, repeatOf: prevAlerts[key] });
    } else {
      logger.error(message, ctx);
    }
  };

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
    prevAlerts = (st?.alerts_state ?? {}) as Record<string, string>;
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
            const locale = await recipientLocale(admin, r.user_id);
            await sendEmail({
              to,
              ...demoFailedEmail({
                projectTitle: (r.title as string | null) || getDictionary(locale).email.untitledProject,
                copy: demoFailureCopy("stuck", locale),
                locale,
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
  let paused = !!sys?.demo_paused;
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
      alertLog("worker-stale", "watchdog: worker heartbeat stale", {
        lastSeenAt,
        staleMinutes: Math.round((staleMs as number) / 60_000),
        workerStatus: sys?.worker_status,
      });
      alerts.push("worker-stale");
      // 평소 상태는 일시정지(배치 모드, 08-11)라 "풀린 채 워커가 없다" = 배치 도중 맥이
      // 잠들었거나 꺼진 것(덮개·전원·강제 종료는 워커의 재잠금 경로를 못 탄다). 풀린 채
      // 두면 대시보드가 "보통 1–3분" 스피너를 보여주고 이 경보가 계속 뜬다 — 다시 잠근다
      // (2026-09-22 트래픽4). 맥이 깨어나면 워커는 잠김을 보고 배치를 스스로 끝낸다.
      await setDemoPaused(true);
      paused = true;
      alerts.push("batch-relocked");
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
      alertLog("pending-no-worker", "watchdog: pending demo jobs but worker never checked in", { pendingStuck });
      alerts.push("pending-no-worker");
    } else if (!workerStale) {
      // Worker looks alive and isn't paused, yet pending rows are aging. 배치 중엔
      // 편당 ~3분이라 12편 넘게 쌓이면 뒤쪽이 자연스럽게 30분을 넘긴다 — 그건 막힘이
      // 아니다(2026-09-22 트래픽5). 지난 30분 안에 상태가 바뀐(집히거나 끝난) 행이 있으면
      // 대기열이 움직이는 중이라 경보하지 않는다. 진짜 막힘(워커가 하트비트는 치는데
      // 못 집음·나쁜 행)일 때만 남는다.
      const { count: moved, error: movedErr } = await admin
        .from("projects")
        .select("id", { count: "exact", head: true })
        .not("demo_build_status", "is", null)
        .neq("demo_build_status", "pending")
        .gte("demo_status_changed_at", pendingCutoff);
      if (!movedErr && (moved ?? 0) > 0) {
        logger.info("watchdog: pending backlog aging but queue is moving (batch in progress)", {
          pendingStuck,
          movedInWindow: moved,
        });
      } else {
        alertLog("pending-not-draining", "watchdog: pending demo jobs not draining despite live worker", {
          pendingStuck,
          lastSeenAt,
        });
        alerts.push("pending-not-draining");
      }
    }
    // If the worker is stale, the worker-stale alert already explains the backlog.
  }

  // ── 3.2 Batch ops: requests waiting while intentionally paused ──────────────
  // Steady state since 2026-08-11 is demo_paused=true with NO always-on worker;
  // the owner drains with `npm run demo:batch` when free. Pending rows here are
  // not an outage — they're the signal to schedule a batch, so mail info-tone,
  // deduped like any alert (once per window, not every tick). No age cutoff:
  // the next tick after a request lands should already notify.
  let pendingWaiting = 0;
  if (paused) {
    const { count, error: waitErr } = await admin
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("demo_build_status", "pending");
    if (waitErr) {
      logger.warn("watchdog: pending-waiting query failed", { error: waitErr });
    } else if ((count ?? 0) > 0) {
      pendingWaiting = count ?? 0;
      logger.info("watchdog: demo requests waiting while paused (batch ops)", { pendingWaiting });
      alerts.push(`queue-waiting:${pendingWaiting}`);
    }
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
      alertLog("moderation-open", "watchdog: moderation-held takes awaiting review", { open: moderationOpen });
      alerts.push(`moderation-open:${moderationOpen}`);
    }
  }

  // ── 3.6 Approval queue digest ───────────────────────────────────────────────
  // 승인 요청 메일은 하루 한 통으로 묶인다(lib/approvalMail.ts). 그 뒤 들어온 요청을
  // 놓치지 않게, 큐가 남아 있으면 같은 키로 하루 한 번 "승인 대기 N건"을 보낸다.
  let approvalsWaiting = 0;
  {
    const { count, error: apprErr } = await admin
      .from("demo_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (apprErr) {
      logger.warn("watchdog: demo_requests query failed", { error: apprErr });
    } else if ((count ?? 0) > 0) {
      approvalsWaiting = count ?? 0;
      logger.info("watchdog: approval requests waiting", { approvalsWaiting });
      alerts.push(`${APPROVAL_MAIL_KEY}:${approvalsWaiting}`);
    }
  }

  // ── 3.7 Demand — 사람이 오고 있나 ─────────────────────────────────────────────
  // 위 경보는 전부 공급(촬영) 쪽이라, 방문이 0이어도 이 크론은 "healthy"였다
  // (2026-09-21 밤 조사). 방문 = 랜딩·작품 페이지 핑 + 명함 조회. 할 일 알림이지
  // 장애가 아니므로 Sentry(error)가 아니라 info, 메일은 키별로 길게 묶는다(DEMAND_SUPPRESS_MS).
  // 가입은 profiles에 생성 시각이 없어 signup_completed(브라우저 보고)로 센다 — 경보용이라 충분.
  let visits3d = 0;
  let visits14d = 0;
  let signups14d = 0;
  {
    const since3d = new Date(now - 3 * 24 * 3_600_000).toISOString();
    const since14d = new Date(now - 14 * 24 * 3_600_000).toISOString();
    const pageEvents = [AnalyticsEvent.LandingView, AnalyticsEvent.WatchView];
    const [ev3, pv3, ev14, pv14, su14] = await Promise.all([
      admin.from("analytics_events").select("id", { count: "exact", head: true })
        .in("event", pageEvents).gte("created_at", since3d),
      admin.from("portfolio_views").select("*", { count: "exact", head: true }).gte("viewed_at", since3d),
      admin.from("analytics_events").select("id", { count: "exact", head: true })
        .in("event", pageEvents).gte("created_at", since14d),
      admin.from("portfolio_views").select("*", { count: "exact", head: true }).gte("viewed_at", since14d),
      admin.from("analytics_events").select("id", { count: "exact", head: true })
        .eq("event", AnalyticsEvent.SignupCompleted).gte("created_at", since14d),
    ]);
    const demandErr = ev3.error ?? pv3.error ?? ev14.error ?? pv14.error ?? su14.error;
    if (demandErr) {
      logger.warn("watchdog: demand query failed", { error: demandErr });
    } else {
      visits3d = (ev3.count ?? 0) + (pv3.count ?? 0);
      visits14d = (ev14.count ?? 0) + (pv14.count ?? 0);
      signups14d = su14.count ?? 0;
      if (visits3d === 0) {
        logger.info("watchdog: no visitors in 3 days", { visits14d });
        alerts.push("demand-zero");
      } else if (signups14d === 0) {
        logger.info("watchdog: visitors but no signups in 14 days", { visits14d });
        alerts.push("signups-zero");
      }
    }
  }

  // ── 4. Sweep expired rate-limit windows (T6) — keeps rate_limits at ~distinct
  // active keys. Best-effort: a missing table (migration pending) just logs. ───
  const { error: rlErr } = await admin
    .from("rate_limits")
    .delete()
    .lt("window_start", new Date(now - 24 * 3_600_000).toISOString());
  if (rlErr) logger.warn("watchdog: rate_limits sweep failed", { error: rlErr });

  // ── 4b. 폰 → 컴퓨터 넘기기 알림·30일 정리(docs/desktop-handoff.md). 이 크론이 이미
  // 5분마다 돌아서 따로 크론을 등록하지 않는다. 틱당 5통까지 — 5분마다 도니 시간당 60통이면 충분하고,
  // 메일 서버가 느려도(한 통 최대 10초) 점검 본업이 함수 시간 안에 끝나게. 실패해도 점검은 계속한다. ─────────────
  let handoff: { sent: number; failed: number; deleted: number } | null = null;
  try {
    handoff = await runHandoffReminders(admin, { now, maxSend: 5 });
  } catch (err) {
    logger.error("watchdog: handoff reminders failed", { error: err });
  }

  // ── 5. Alert email (T4) — deduped so a persistent condition mails once per
  // window, not every cron tick ────────────────────────────────────────────────
  const emailed =
    alerts.length > 0
      ? await emailWatchdogAlert(admin, alerts, {
          reaped,
          lastSeenAt: lastSeenAt as string | null,
          staleMinutes: staleMs !== null ? Math.round(staleMs / 60_000) : null,
          pendingStuck: pendingStuck ?? 0,
          pendingWaiting,
          approvalsWaiting,
          paused,
          moderationOpen,
          visits3d,
          visits14d,
          signups14d,
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
    demand: { visits3d, visits14d, signups14d },
    alerts,
    emailed,
    handoff,
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
// 수요 알림은 하루에 몇 번 받아도 할 수 있는 게 같다 — 3일에 한 번.
const DEMAND_SUPPRESS_MS = 3 * 24 * 3_600_000;
const DEMAND_KEYS = new Set(["demand-zero", "signups-zero"]);
// Drop dedup entries that haven't fired in a week so alerts_state can't grow.
const ALERT_STATE_TTL_MS = 7 * 24 * 3_600_000;

// `reaped:3` and `reaped:1` are the same condition for dedup purposes
// (likewise `moderation-open:N`).
function alertKey(alert: string): string {
  if (alert.startsWith("reaped:")) return "reaped";
  if (alert.startsWith("moderation-open:")) return "moderation-open";
  if (alert.startsWith("queue-waiting:")) return "queue-waiting";
  if (alert.startsWith(`${APPROVAL_MAIL_KEY}:`)) return APPROVAL_MAIL_KEY;
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
    pendingWaiting: number;
    approvalsWaiting: number;
    paused: boolean;
    moderationOpen: number;
    visits3d: number;
    visits14d: number;
    signups14d: number;
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
    const suppress = DEMAND_KEYS.has(k)
      ? DEMAND_SUPPRESS_MS
      : k === APPROVAL_MAIL_KEY
        ? APPROVAL_MAIL_WINDOW_MS
        : ALERT_SUPPRESS_MS;
    return !(Number.isFinite(last) && now - last < suppress);
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
  if (keys.includes("batch-relocked"))
    lines.push(
      "배치 도중 맥이 끊긴 것 같아(일시정지가 풀린 채 하트비트 없음) 촬영을 다시 잠갔어요. 하던 촬영은 30분 뒤 실패로 정리돼요 — 맥이 깨어나면 npm run demo:batch 를 다시 돌려 주세요.",
    );
  if (keys.includes("pending-no-worker"))
    lines.push(`대기 중인 시연 ${detail.pendingStuck}건이 있는데 워커가 한 번도 체크인하지 않았어요.`);
  if (keys.includes("pending-not-draining"))
    lines.push(`워커는 살아있는데 대기열 ${detail.pendingStuck}건이 빠지지 않고 있어요.`);
  if (keys.includes("moderation-open"))
    lines.push(`모더레이션 검토 대기 ${detail.moderationOpen}건이 30분 넘게 방치돼 있어요 — 관제탑에서 승인/거절해 주세요.`);
  if (keys.includes("queue-waiting"))
    lines.push(
      `촬영 요청 ${detail.pendingWaiting}건이 대기 중이에요 — 여유될 때 맥에서 npm run demo:batch 한 번이면 소화하고 다시 잠들어요.`,
    );
  if (keys.includes(APPROVAL_MAIL_KEY))
    lines.push(`관리자 승인을 기다리는 촬영·재촬영 요청이 ${detail.approvalsWaiting}건 있어요 — 관제탑 승인 큐에서 처리해 주세요.`);
  if (keys.includes("demand-zero"))
    lines.push(
      `지난 3일 동안 랜딩·명함·작품 페이지 방문이 0건이에요 (14일 ${detail.visits14d}건) — 홍보 링크가 실제로 나가고 있는지 봐 주세요.`,
    );
  if (keys.includes("signups-zero"))
    lines.push(`지난 14일 방문 ${detail.visits14d}건, 가입 0건이에요 — 첫 화면이 가입까지 이어지는지 봐 주세요.`);
  if (keys.includes("stuck-query-failed") || keys.includes("reap-update-failed"))
    lines.push("워치독 DB 쿼리/업데이트가 실패했어요 — Sentry를 확인해 주세요.");
  if (detail.paused) lines.push("demo_paused=true — 드레인이 멈춰 있는 상태예요.");
  lines.push(`경보 키: ${alerts.join(", ")}`);

  // A pure queue-waiting mail is a to-do nudge, not an incident — don't title
  // it like one.
  const onlyQueue = keys.every((k) => k === "queue-waiting");
  const onlyNudges = keys.every(
    (k) => k === "queue-waiting" || k === APPROVAL_MAIL_KEY || DEMAND_KEYS.has(k),
  );
  return sendEmail({
    to: alertRecipients(),
    ...adminAlertEmail({
      title: onlyQueue ? "촬영 요청 대기" : onlyNudges ? "운영 알림" : "워치독 경보",
      lines,
      ctaLabel: "관리자 콘솔 열기",
      ctaUrl: `${SITE_URL}/admin`,
    }),
  });
}
