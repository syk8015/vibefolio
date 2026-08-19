// Queue worker — the DB wiring of M2 (plan §8: "큐/DB 결선").
//
// The queue IS the projects table: the trigger-demo route always writes
// demo_build_status='pending' + demo_source_type/value, and when Vercel runs with
// DEMO_RUNNER=local it does NOT fire the Trigger.dev cloud task — the pending row
// just waits here. Re-record bursts collapse into the single row (natural
// debounce, same effect as the cloud path's trailing debounce).
//
// ⚠️ Run this ONLY when the deployment has DEMO_RUNNER=local. In cloud mode the
// same pending rows are consumed by the Trigger.dev task, and a second consumer
// would double-record (and double-bill explore).
//
// Claiming is a conditional update (pending → building, checked row count), so
// even a stray second worker can't grab the same job. Jobs run strictly one at a
// time — recording owns this machine's actual screen.
//
// Crash recovery: building/recording/editing rows are written ONLY by this worker
// (the cloud task goes straight from pending to done/failed), so anything found
// in those states at startup is a previous local run that died mid-job → mark
// failed with a friendly message. Caught errors mark failed immediately; only a
// hard process death leaves a row for startup recovery.
import * as Sentry from "@sentry/node";
import { createClient } from "@supabase/supabase-js";
import "./config"; // side-effect: load .env.local
import { runJob, type JobPhase, type JobOutcome } from "./job";
import type { SourceType } from "./safety";
import { DEMO_QUOTA } from "../lib/demoQuota";
import { normalizeDemoAccess } from "../lib/demoAccess";
import { normalizeDemoScript } from "../lib/demoScript";
import { AnalyticsEvent } from "../lib/analytics-events";
import { formatDemoFailure, demoFailureCopy, type DemoFailureCode } from "../lib/demo-failure";
import { recipientLocale } from "../lib/i18n/user-locale";
import { getDictionary } from "../lib/i18n/dictionaries";
import { sendEmail, isEmailConfigured, alertRecipients } from "../lib/email";
import { demoReadyEmail, demoFailedEmail, adminAlertEmail, posterFromDemoUrl, SITE_URL } from "../lib/email-templates";
import { fetchUsername } from "./upload";
import {
  CreditExhaustedError, TransientApiError, CREDIT_HOLD_MARKER, MODERATION_HOLD_MARKER,
  BuildFailedError, NotAWebappError, BlankCaptureError,
} from "./errors";

// This worker is the single-machine SPOF for the whole demo pipeline, so it wires
// Sentry directly (it does not use lib/logger). Gated on DSN only — NOT on
// NODE_ENV — because the worker runs on a real machine even though its process
// env is not "production". Errors only (tracesSampleRate 0) to stay on the free
// tier. Silent no-op when SENTRY_DSN is unset.
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0 });
}

// A hard process death (out-of-memory, ffmpeg cascade, unref'd rejection) is the
// exact failure this SPOF fears — capture and flush before the process goes down.
process.on("uncaughtException", (err) => {
  console.error("[worker] uncaught exception:", err);
  Sentry.captureException(err);
  void Sentry.flush(2000).finally(() => process.exit(1));
});
process.on("unhandledRejection", (reason) => {
  console.error("[worker] unhandled rejection:", reason);
  Sentry.captureException(reason);
});

const POLL_MS = 10_000;
// --batch: one-shot drain for lid-friendly ops — unpause, eat the queue, repause,
// exit. Repausing on EVERY exit path (empty queue, Ctrl-C, credit kill switch) is
// what lets the owner keep the always-on worker uninstalled without cron noise:
// steady state is demo_paused=true, and the health cron mails "queue-waiting"
// instead of treating the silence as an outage.
const BATCH_MODE = process.argv.includes("--batch");
// Per-session retry cap: a job whose failure-write itself failed (or a row
// re-queued while we crash-loop) must not burn an explore fee every poll.
const MAX_ATTEMPTS_PER_SESSION = 2;
// Hard self-heal cap. runJob has no cancellation, so a truly hung job (frozen
// browser / stalled ffmpeg) would block this single-threaded worker forever. Past
// this we mark it failed and process.exit(1) — launchd restarts a clean worker and
// the dying process takes its hung children with it. Set well above a normal job
// so it only ever catches real hangs — 10 → 12min with the longer explore budget
// (EXPLORE_MAX_MS 5.5min + take + post still leaves several minutes of slack).
const JOB_HARD_TIMEOUT_MS = 12 * 60_000;
// github/zip jobs legitimately spend longer than the live_url ceiling: the E2B
// build alone budgets clone 2min + install 10min + readiness 1.5min BEFORE the
// ~8min explore+take+post (audit C-F3 — the old flat 10min killed slow installs
// mid-npm). Still a hang-catcher, just sized to the real budget.
const BUILD_JOB_HARD_TIMEOUT_MS = 25 * 60_000;

class JobTimeoutError extends Error {}

async function withHardTimeout<T>(work: Promise<T>, timeoutMs: number = JOB_HARD_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new JobTimeoutError(`job exceeded ${timeoutMs / 60_000}min hard timeout`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const IN_FLIGHT_STATUSES = ["building", "recording", "editing"] as const;

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (.env.local)");
  }
  return createClient(url, key);
}

const supabase = db();
const attempts = new Map<string, number>();
// Transient-API requeues per job this session (audit A-A1): bounded so a
// persisting outage still fails normally instead of looping forever.
const transientRequeues = new Map<string, number>();
let stopping = false;
let busy = false;
let hintColumnMissing = false; // set on first 42703 → poll drops the column
let accessColumnMissing = false; // same degrade for projects.demo_access
let scriptColumnMissing = false; // same degrade for projects.demo_script

process.on("SIGINT", () => {
  if (!busy) {
    if (BATCH_MODE) {
      // Repause before dying — an aborted batch must not leave the queue
      // unpaused with no worker (the cron would page "pending-no-worker").
      void setDemoPaused(true).finally(() => process.exit(0));
      return;
    }
    console.log("\n[worker] idle — bye");
    process.exit(0);
  }
  // Mid-job: a second Ctrl-C (or the kill signal cascading to ffmpeg) aborts the
  // take; the row is then repaired by startup recovery on the next launch.
  console.log("\n[worker] finishing current job, will stop after it (Ctrl-C again to abort)");
  stopping = true;
});

async function markFailed(projectId: string, message: string) {
  const truncated = message.length > 1000 ? message.slice(0, 1000) + "…" : message;
  const { error } = await supabase
    .from("projects")
    .update({ demo_build_status: "failed", demo_build_error: truncated })
    .eq("id", projectId);
  if (error) console.error(`[worker] failed-status write failed for ${projectId}: ${error.message}`);
}

// Product analytics — SEPARATE from demo_events (which counts quota). Written via
// this worker's own service-role client so it stays out of the Next `server-only`
// analytics module. Fire-and-forget: a failed insert must never fail the job.
// NOTE: this is the LOCAL (DEMO_RUNNER=local) recorder — the live path. The cloud
// Trigger.dev task (src/trigger/build-and-record.ts) does not yet emit these, so
// build success rate is only accurate while jobs run locally.
async function trackAnalytics(
  event: string,
  userId: string | null,
  props: Record<string, unknown>,
) {
  const { error } = await supabase.from("analytics_events").insert({ event, user_id: userId, props });
  if (error) console.error(`[worker] analytics(${event}) write failed: ${error.message}`);
}

// Heartbeat + kill-switch in ONE round-trip: stamp system_status.worker_last_seen_at
// (so a watchdog / launchd can tell this worker is alive) and read demo_paused back
// (P0.5 drain-stop) at the same time. Returns whether draining is paused. Degrades
// gracefully if the table isn't there yet (warns once, keeps working, never pauses).
let heartbeatWarned = false;
async function heartbeat(status: "idle" | "busy"): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("system_status")
    .update({ worker_last_seen_at: now, worker_status: status, updated_at: now })
    .eq("id", "singleton")
    .select("demo_paused")
    .single();
  if (error) {
    if (!heartbeatWarned) {
      console.error(`[worker] heartbeat failed (system_status missing? apply migration): ${error.message}`);
      heartbeatWarned = true;
    }
    return false;
  }
  heartbeatWarned = false;
  return !!data?.demo_paused;
}

async function setDemoPaused(paused: boolean) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("system_status")
    .update({ demo_paused: paused, updated_at: now })
    .eq("id", "singleton");
  if (error) console.error(`[worker] demo_paused=${paused} write failed: ${error.message}`);
  else console.log(`[worker] demo_paused=${paused}`);
}

// ── Notification emails (T4) ─────────────────────────────────────────────────
// Strictly best-effort: the DB row is the source of truth and these run AFTER
// the status write. Every path is caught — a mail outage must never fail a job.
// Silent no-ops until RESEND_API_KEY is set (lib/email gate).

async function ownerEmail(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error) {
      console.error(`[worker] owner-email lookup failed for ${userId}: ${error.message}`);
      return null;
    }
    return data.user?.email ?? null;
  } catch (err) {
    console.error(`[worker] owner-email lookup threw: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// 완성 통보 — 이탈했던 유저를 watch 페이지(공유 대상 링크)로 복귀시키는 메일.
async function notifyDemoReady(row: { id: string; user_id: string; title: string | null }, videoUrl?: string) {
  if (!isEmailConfigured()) return;
  try {
    const to = await ownerEmail(row.user_id);
    if (!to) return;
    const username = await fetchUsername(row.id);
    const watchUrl = username
      ? `${SITE_URL}/${encodeURIComponent(username)}/${row.id}`
      : `${SITE_URL}/dashboard`;
    // 포스터 추출은 best-effort — 파생 키가 실제로 존재할 때만 싣는다 (완성 메일
    // 상단에 깨진 이미지가 뜨는 것보다 이미지 없는 메일이 낫다).
    let posterUrl = posterFromDemoUrl(videoUrl);
    if (posterUrl) {
      const ok = await fetch(posterUrl, { method: "HEAD" }).then((r) => r.ok).catch(() => false);
      if (!ok) posterUrl = undefined;
    }
    const locale = await recipientLocale(supabase, row.user_id);
    const mail = demoReadyEmail({
      projectTitle: row.title || getDictionary(locale).email.untitledProject,
      watchUrl,
      posterUrl,
      locale,
    });
    const sent = await sendEmail({ to, ...mail });
    if (sent) console.log(`[worker] demo-ready email → ${to}`);
  } catch (err) {
    console.error(`[worker] demo-ready email failed: ${err instanceof Error ? err.message : err}`);
  }
}

// 실패 통보 — 대시보드 배지와 같은 코드별 카피(demoFailureCopy, 수신자 locale). raw 에러 미포함.
async function notifyDemoFailed(
  row: { id: string; user_id: string; title: string | null },
  code: DemoFailureCode,
) {
  if (!isEmailConfigured()) return;
  try {
    const to = await ownerEmail(row.user_id);
    if (!to) return;
    const locale = await recipientLocale(supabase, row.user_id);
    const mail = demoFailedEmail({
      projectTitle: row.title || getDictionary(locale).email.untitledProject,
      copy: demoFailureCopy(code, locale),
      locale,
    });
    const sent = await sendEmail({ to, ...mail });
    if (sent) console.log(`[worker] demo-failed(${code}) email → ${to}`);
  } catch (err) {
    console.error(`[worker] demo-failed email failed: ${err instanceof Error ? err.message : err}`);
  }
}

// 운영 경보(관리자) — Sentry와 별개로 사람 눈에 바로 닿는 채널.
async function notifyAdmin(title: string, lines: string[]) {
  if (!isEmailConfigured()) return;
  try {
    const mail = adminAlertEmail({ title, lines, ctaLabel: "관리자 콘솔 열기", ctaUrl: `${SITE_URL}/admin` });
    await sendEmail({ to: alertRecipients(), ...mail });
  } catch (err) {
    console.error(`[worker] admin alert email failed: ${err instanceof Error ? err.message : err}`);
  }
}

// Content scan flagged the take (input-matrix gap #4): artifacts are already
// quarantined in storage (unlinked — no public surface reads them). Park the row
// as held with the moderation marker, file the review item, page the admin.
// The session attempt is NOT refunded: the content is the user's, and a refund
// would let a borderline take re-record in a loop.
async function holdForModeration(
  row: PendingRow,
  outcome: Extract<JobOutcome, { status: "moderation-held" }>,
) {
  console.log(
    `[worker] job ${row.id} moderation-flagged [${outcome.categories.join(", ")}] — holding for review`,
  );

  // Review item first (the admin console reads this): refresh an existing open
  // row if one survives from a previous flagged take, else insert. Two-step is
  // race-free here — this worker is the only writer and runs one job at a time.
  if (outcome.quarantine) {
    const fields = {
      video_url: outcome.quarantine.videoUrl,
      poster_url: outcome.quarantine.posterUrl,
      video_key: outcome.quarantine.videoKey,
      poster_key: outcome.quarantine.posterKey,
      storage: outcome.quarantine.storage,
      categories: outcome.categories,
      reason: outcome.reason,
      model: outcome.model,
    };
    const { data: existing, error: updErr } = await supabase
      .from("demo_moderation")
      .update({ ...fields, created_at: new Date().toISOString() })
      .eq("project_id", row.id)
      .eq("status", "open")
      .select("id");
    if (updErr) {
      console.error(`[worker] moderation-row update failed for ${row.id}: ${updErr.message}`);
    } else if (!existing || existing.length === 0) {
      const { error: insErr } = await supabase
        .from("demo_moderation")
        .insert({ project_id: row.id, ...fields });
      if (insErr) {
        // Loud but non-fatal: the held row + admin email still carry the signal;
        // approve is impossible without the queue row, so Sentry gets an error.
        console.error(`[worker] moderation-row insert failed for ${row.id}: ${insErr.message}`);
        Sentry.captureMessage("moderation queue insert failed (apply migration_demo_moderation.sql?)", {
          level: "error",
          extra: { projectId: row.id, message: insErr.message },
        });
      }
    }
  }

  const { error: holdErr } = await supabase
    .from("projects")
    .update({ demo_build_status: "held", demo_build_error: MODERATION_HOLD_MARKER })
    .eq("id", row.id);
  if (holdErr) console.error(`[worker] moderation-hold write failed for ${row.id}: ${holdErr.message}`);

  await trackAnalytics(AnalyticsEvent.DemoHeld, row.user_id, {
    projectId: row.id,
    reason: "moderation",
    categories: outcome.categories,
  });
  Sentry.captureMessage("moderation hold — take quarantined for review", {
    level: "warning",
    tags: { alert: "moderation_hold" },
    extra: { projectId: row.id, categories: outcome.categories },
  });
  await notifyAdmin("모더레이션 홀드 — 검토가 필요해요", [
    `"${row.title ?? "(제목 없음)"}" 시연이 게시 전 검토로 격리됐어요.`,
    `분류: ${outcome.categories.join(", ") || "(없음)"} · 모델: ${outcome.model}`,
    `사유: ${outcome.reason}`,
    "관제탑 모더레이션 인박스에서 영상 확인 후 승인(게시) 또는 거절(삭제)해 주세요.",
  ]);
}

// Startup recovery: repair rows a dead local worker left in-flight.
async function recoverStuckJobs() {
  const { data, error } = await supabase
    .from("projects")
    .select("id, user_id, title")
    .in("demo_build_status", [...IN_FLIGHT_STATUSES]);
  if (error) {
    console.error(`[worker] recovery scan failed: ${error.message}`);
    return;
  }
  for (const row of data ?? []) {
    console.log(`[worker] recovering stuck job ${row.id} → failed`);
    await markFailed(
      row.id,
      formatDemoFailure("interrupted", "녹화 장비가 재시작되어 작업이 중단됐어요. 다시 시도해 주세요."),
    );
    await notifyDemoFailed(row, "interrupted");
  }
}

type PendingRow = {
  id: string;
  user_id: string;
  title: string | null;
  demo_source_type: SourceType | null;
  demo_source_value: string | null;
  demo_user_hint?: string | null;
  // Creator-supplied demo-mode entry info ({ url?, params?, note? }, Connect
  // 요청2). Raw jsonb off the row — normalizeDemoAccess() re-shapes it at the
  // sink before it reaches the job.
  demo_access?: unknown;
  // 만든 AI의 촬영 대본 jsonb — normalizeDemoScript()가 싱크에서 재정형.
  demo_script?: unknown;
};

// Wallet backstop, independent of the route's admission caps: the worker refuses
// to record more than GLOBAL_DRAIN_DAILY jobs per rolling window. Even a row that
// reached 'pending' some other way can never push daily spend past this ceiling.
async function drainedInWindow(): Promise<number> {
  const cutoff = new Date(Date.now() - DEMO_QUOTA.WINDOW_HOURS * 3_600_000).toISOString();
  const { count, error } = await supabase
    .from("demo_events")
    .select("*", { count: "exact", head: true })
    .eq("kind", "drain")
    .gt("created_at", cutoff);
  if (error) {
    // Fail open: admission already bounds spend, and halting the core product on a
    // transient count error is worse than briefly trusting it. Loud log, proceed.
    console.error(`[worker] drain-count failed: ${error.message}`);
    return 0;
  }
  return count ?? 0;
}

async function claimNext(): Promise<PendingRow | null> {
  if ((await drainedInWindow()) >= DEMO_QUOTA.GLOBAL_DRAIN_DAILY) {
    console.warn(
      `[worker] daily drain ceiling (${DEMO_QUOTA.GLOBAL_DRAIN_DAILY}) reached — pausing new jobs`,
    );
    return null;
  }
  const selectCols = [
    "id, user_id, title, demo_source_type, demo_source_value",
    !hintColumnMissing && "demo_user_hint",
    !accessColumnMissing && "demo_access",
    !scriptColumnMissing && "demo_script",
  ].filter(Boolean).join(", ");
  const { data, error } = await supabase
    .from("projects")
    .select(selectCols)
    .eq("demo_build_status", "pending")
    .not("demo_source_type", "is", null)
    .limit(5);
  if (error) {
    // Graceful degrade while migration_demo_user_hint.sql isn't applied yet: a
    // missing column is 42703 — drop it from the select instead of failing every
    // poll (same policy as the heartbeat's missing-table degrade).
    if (!hintColumnMissing && error.code === "42703" && error.message.includes("demo_user_hint")) {
      hintColumnMissing = true;
      console.error(
        "[worker] projects.demo_user_hint missing — polling without hints (apply migration_demo_user_hint.sql)",
      );
      return null;
    }
    if (!accessColumnMissing && error.code === "42703" && error.message.includes("demo_access")) {
      accessColumnMissing = true;
      console.error(
        "[worker] projects.demo_access missing — polling without demo access (apply migration_demo_access.sql)",
      );
      return null;
    }
    if (!scriptColumnMissing && error.code === "42703" && error.message.includes("demo_script")) {
      scriptColumnMissing = true;
      console.error(
        "[worker] projects.demo_script missing — polling without demo scripts (apply migration_demo_script.sql)",
      );
      return null;
    }
    console.error(`[worker] poll failed: ${error.message}`);
    return null;
  }
  // Double cast: the DYNAMIC select string (hint-column degrade above) defeats
  // supabase-js's literal column parser, so `data` types as a ParserError union.
  for (const row of (data ?? []) as unknown as PendingRow[]) {
    if ((attempts.get(row.id) ?? 0) >= MAX_ATTEMPTS_PER_SESSION) continue;
    // Conditional claim: only wins if the row is still pending.
    const { data: claimed, error: claimErr } = await supabase
      .from("projects")
      .update({ demo_build_status: "building", demo_build_error: null })
      .eq("id", row.id)
      .eq("demo_build_status", "pending")
      .select("id");
    if (claimErr) {
      console.error(`[worker] claim failed for ${row.id}: ${claimErr.message}`);
      continue;
    }
    if (claimed && claimed.length === 1) {
      // Log the spend the instant we own the job — before the explore fee starts.
      const { error: evErr } = await supabase
        .from("demo_events")
        .insert({ user_id: row.user_id, project_id: row.id, kind: "drain" });
      if (evErr) console.error(`[worker] drain-event write failed for ${row.id}: ${evErr.message}`);
      return row;
    }
  }
  return null;
}

async function setStatus(projectId: string, phase: JobPhase) {
  const { error } = await supabase
    .from("projects")
    .update({ demo_build_status: phase })
    .eq("id", projectId);
  if (error) console.error(`[worker] status(${phase}) write failed: ${error.message}`);
}

async function processOne(row: PendingRow) {
  attempts.set(row.id, (attempts.get(row.id) ?? 0) + 1);
  console.log(`\n[worker] job ${row.id}  (${row.demo_source_type}: ${row.demo_source_value?.slice(0, 80)})`);
  try {
    if (!row.demo_source_type || !row.demo_source_value) {
      throw new Error("job row is missing demo_source_type/value");
    }
    const outcome = await withHardTimeout(
      runJob({
        projectId: row.id,
        sourceType: row.demo_source_type,
        sourceValue: row.demo_source_value,
        ownerId: row.user_id, // binds zip prefix / preview path to the owner (F2/F5)
        upload: true, // uploadAndMarkDone sets status=done on success
        userHint: row.demo_user_hint ?? undefined,
        demoScript: normalizeDemoScript(row.demo_script) ?? undefined,
        demoAccess: normalizeDemoAccess(row.demo_access).access ?? undefined,
        title: row.title ?? undefined,
        onPhase: (phase) => setStatus(row.id, phase),
      }),
      // Built sources get the E2B-sized ceiling; live_url keeps the tight one.
      row.demo_source_type === "live_url" ? JOB_HARD_TIMEOUT_MS : BUILD_JOB_HARD_TIMEOUT_MS,
    );
    if (outcome.status === "moderation-held") {
      await holdForModeration(row, outcome);
      return;
    }
    if (outcome.status === "login-gated") {
      await markFailed(
        row.id,
        formatDemoFailure("login-gated", "로그인이 필요한 사이트라 자동 시연을 만들 수 없어요. 비로그인으로 볼 수 있는 URL로 다시 시도해 주세요."),
      );
      await trackAnalytics(AnalyticsEvent.DemoFailed, row.user_id, {
        projectId: row.id,
        sourceType: row.demo_source_type,
        reason: "login-gated",
      });
      await notifyDemoFailed(row, "login-gated");
      console.log(`[worker] job ${row.id} skipped (login-gated)`);
      return;
    }
    await trackAnalytics(AnalyticsEvent.DemoSucceeded, row.user_id, {
      projectId: row.id,
      sourceType: row.demo_source_type,
    });
    if (outcome.moderationFailedOpen) {
      // The take shipped UNSCANNED (scan outage) — not a job failure, but a
      // human should spot-check it. Warning-level so it never pages like credit.
      Sentry.captureMessage("moderation scan failed open — take published unscanned", {
        level: "warning",
        tags: { alert: "moderation_failed_open" },
        extra: { projectId: row.id },
      });
    }
    await notifyDemoReady(row, outcome.publicUrl);
    console.log(`[worker] job ${row.id} done → ${outcome.publicUrl ?? "(no upload)"}`);
  } catch (err) {
    // 크레딧 소진(P0.5): 유저 잘못이 아니다 — failed 대신 held(폴백 이미지 유지),
    // 세션 attempt 반환, 드레인 정지(demo_paused), fatal 경보. 해제=README 절차.
    if (err instanceof CreditExhaustedError) {
      console.error(`[worker] CREDIT EXHAUSTED — holding job ${row.id} and pausing drain: ${err.message}`);
      attempts.set(row.id, Math.max(0, (attempts.get(row.id) ?? 1) - 1));
      const { error: holdErr } = await supabase
        .from("projects")
        .update({ demo_build_status: "held", demo_build_error: CREDIT_HOLD_MARKER })
        .eq("id", row.id);
      if (holdErr) console.error(`[worker] credit-hold write failed for ${row.id}: ${holdErr.message}`);
      const { error: pauseErr } = await supabase
        .from("system_status")
        .update({ demo_paused: true, updated_at: new Date().toISOString() })
        .eq("id", "singleton");
      if (pauseErr) console.error(`[worker] demo_paused flip failed: ${pauseErr.message}`);
      await trackAnalytics(AnalyticsEvent.DemoHeld, row.user_id, {
        projectId: row.id,
        reason: "credit_exhausted",
      });
      Sentry.captureException(err, {
        level: "fatal",
        tags: { alert: "credit_exhausted" },
        extra: { projectId: row.id },
      });
      await notifyAdmin("크레딧 소진 — 시연 드레인 정지", [
        "Anthropic 크레딧이 소진돼 녹화를 멈췄어요.",
        `잡 ${row.id}는 held로 보관됐고 재시도 횟수는 소모되지 않았어요.`,
        "system_status.demo_paused=true — 충전 후 해제 절차는 local-runner/README.md에 있어요.",
      ]);
      await Sentry.flush(2000);
      return;
    }
    // Sustained API outage (audit A-A1): not the user's fault, usually short —
    // requeue without burning their attempt, up to twice per session.
    if (err instanceof TransientApiError) {
      const n = (transientRequeues.get(row.id) ?? 0) + 1;
      transientRequeues.set(row.id, n);
      if (n <= 2) {
        console.error(`[worker] transient API outage — requeueing job ${row.id} (${n}/2): ${err.message}`);
        attempts.set(row.id, Math.max(0, (attempts.get(row.id) ?? 1) - 1));
        const { error: reqErr } = await supabase
          .from("projects")
          .update({ demo_build_status: "pending", demo_build_error: null })
          .eq("id", row.id);
        if (reqErr) console.error(`[worker] requeue write failed for ${row.id}: ${reqErr.message}`);
        Sentry.captureMessage(`transient API outage — job requeued (${n}/2)`, {
          level: "warning",
          extra: { projectId: row.id, message: err.message },
        });
        await new Promise((r) => setTimeout(r, 60_000)); // cool-off before next poll
        return;
      }
      console.error(`[worker] transient outage persisted for ${row.id} — treating as failure`);
    }
    const message = err instanceof Error ? err.message : String(err);
    const timedOut = err instanceof JobTimeoutError;
    // Classify by error type so the dashboard shows a cause-specific message
    // instead of the generic "error" (2026-07-19 input matrix).
    const code = timedOut
      ? "timeout"
      : err instanceof BuildFailedError
        ? "build-failed"
        : err instanceof NotAWebappError
          ? "not-a-webapp"
          : err instanceof BlankCaptureError
            ? "blank"
            : "error";
    console.error(`[worker] job ${row.id} failed (${code}): ${message}`);
    Sentry.captureException(err, {
      extra: { projectId: row.id, sourceType: row.demo_source_type },
    });
    await trackAnalytics(AnalyticsEvent.DemoFailed, row.user_id, {
      projectId: row.id,
      sourceType: row.demo_source_type,
      reason: code,
      message,
    });
    await markFailed(row.id, formatDemoFailure(code, message));
    await notifyDemoFailed(row, code);
    if (timedOut) {
      // The job is marked failed; now exit so launchd restarts a clean worker and
      // the hung child processes (browser/ffmpeg) die with us.
      console.error("[worker] hard timeout — exiting for a clean launchd restart");
      await Sentry.flush(2000);
      process.exit(1);
    }
  }
}

console.log("[worker] nookframe local demo worker (M5)");
console.log(`[worker] polling every ${POLL_MS / 1000}s — Ctrl-C to stop`);
await recoverStuckJobs();

if (BATCH_MODE) {
  console.log("[worker] batch mode — unpausing, draining until empty, then repausing");
  await setDemoPaused(false);
}

while (!stopping) {
  const paused = await heartbeat(busy ? "busy" : "idle");
  if (paused) {
    // Kill switch flipped back on mid-batch (credit exhaustion) — leave it on
    // and stop instead of fighting it.
    if (BATCH_MODE) break;
    // Kill switch on (e.g. credits exhausted): stay alive + keep heartbeating,
    // but don't claim/record — no explore spend while paused.
    await new Promise((r) => setTimeout(r, POLL_MS));
    continue;
  }
  const row = await claimNext();
  if (row) {
    busy = true;
    await heartbeat("busy");
    await processOne(row);
    busy = false;
    continue; // drain the queue before idling again
  }
  if (BATCH_MODE) break; // queue empty — batch done
  await new Promise((r) => setTimeout(r, POLL_MS));
}
if (BATCH_MODE) await setDemoPaused(true);
console.log("[worker] stopped");
