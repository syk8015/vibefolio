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
import "./config"; // side-effect: load .env.local
import { runJob, type JobPhase, type JobOutcome } from "./job";
import type { SourceType } from "./safety";
import { normalizeDemoAccess } from "../lib/demoAccess";
import { normalizeDemoScript } from "../lib/demoScript";
import { AnalyticsEvent } from "../lib/analytics-events";
import type { DemoFailureCode } from "../lib/demo-failure";
import { apiPost, apiPostQuiet } from "./api";
import {
  CreditExhaustedError, TransientApiError,
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

// No database client lives here any more. Every read and write goes through
// /api/worker/* with WORKER_SECRET (local-runner/api.ts) so this machine cannot
// address prod data on its own — see lib/workerAuth.ts for why.
const attempts = new Map<string, number>();
// Transient-API requeues per job this session (audit A-A1): bounded so a
// persisting outage still fails normally instead of looping forever.
const transientRequeues = new Map<string, number>();
let stopping = false;
let busy = false;

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

// Mark the job failed AND mail the owner. These were two steps here; the server
// keeps them adjacent because both need the same failure code, and the code — not
// a pre-formatted string — is what travels now (lib/demo-failure formats it).
async function markFailed(projectId: string, code: DemoFailureCode, message: string) {
  await apiPostQuiet(`/api/worker/jobs/${encodeURIComponent(projectId)}`, {
    op: "failed", code, message,
  });
}

// Product analytics — SEPARATE from demo_events (which counts quota).
// Fire-and-forget: a failed write must never fail the job. The server validates
// the event name against the known list before it reaches analytics_events.
// NOTE: this is the LOCAL (DEMO_RUNNER=local) recorder — the live path. The cloud
// Trigger.dev task (src/trigger/build-and-record.ts) does not yet emit these, so
// build success rate is only accurate while jobs run locally.
async function trackAnalytics(
  event: string,
  userId: string | null,
  props: Record<string, unknown>,
) {
  await apiPostQuiet("/api/worker/analytics", { event, userId, props });
}

// Heartbeat + kill-switch in ONE round-trip: stamp worker liveness (so the health
// cron / launchd can tell this worker is alive) and read demo_paused back (P0.5
// drain-stop) at the same time. Returns whether draining is paused. Never pauses
// on an error — a network blip must not look like the kill switch.
async function heartbeat(status: "idle" | "busy"): Promise<boolean> {
  const res = await apiPostQuiet<{ demoPaused: boolean }>("/api/worker/heartbeat", { status });
  return !!res?.demoPaused;
}

// Batch mode flips this. Repausing on EVERY exit path is what keeps the steady
// state at demo_paused=true, so this is NOT best-effort: a silent failure here
// would leave the queue unpaused with no worker and page the cron.
async function setDemoPaused(paused: boolean) {
  try {
    await apiPost("/api/worker/pause", { paused });
    console.log(`[worker] demo_paused=${paused}`);
  } catch (err) {
    console.error(`[worker] demo_paused=${paused} write failed: ${err instanceof Error ? err.message : err}`);
  }
}

// Owner emails (완성 / 실패) and admin alerts are sent by the server now: they
// need the auth admin API to resolve an owner's address and the Resend key to
// send, and neither belongs on this machine. They ride along with the status
// write that triggers them (jobs/[id] ops "failed" and "notify-ready").

// Content scan flagged the take (input-matrix gap #4): artifacts are already
// quarantined in storage (unlinked — no public surface reads them). The server
// parks the row as held with the moderation marker, files the review item, tracks
// the hold and pages the admin — one call, because a partial hold (row parked but
// no review item) would make approval impossible.
// The session attempt is NOT refunded: the content is the user's, and a refund
// would let a borderline take re-record in a loop.
async function holdForModeration(
  row: PendingRow,
  outcome: Extract<JobOutcome, { status: "moderation-held" }>,
) {
  console.log(
    `[worker] job ${row.id} moderation-flagged [${outcome.categories.join(", ")}] — holding for review`,
  );
  await apiPostQuiet(`/api/worker/jobs/${encodeURIComponent(row.id)}`, {
    op: "held-moderation",
    categories: outcome.categories,
    reason: outcome.reason,
    model: outcome.model,
    quarantine: outcome.quarantine ?? null,
  });
}

// Startup recovery: repair rows a dead local worker left in-flight. Server-side,
// because it also mails each owner. building/recording/editing are written ONLY by
// this worker (the cloud task goes straight pending → done/failed), so anything
// found in those states is a previous local run that died mid-job.
async function recoverStuckJobs() {
  const res = await apiPostQuiet<{ recovered: { id: string }[] }>("/api/worker/recover");
  for (const row of res?.recovered ?? []) {
    console.log(`[worker] recovered stuck job ${row.id} → failed`);
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

// Ask the server for the next job. It owns the whole admission decision: the
// rolling wallet backstop (GLOBAL_DRAIN_DAILY — even a row that reached 'pending'
// some other way can never push daily spend past that ceiling), the conditional
// claim (pending → building, checked row count, so a stray second worker cannot
// grab the same job), and the drain event that logs the spend the instant the job
// is owned — before the explore fee starts.
//
// `skipIds` is this session's retry bookkeeping (MAX_ATTEMPTS_PER_SESSION), which
// stays here: it is worker-process state, not queue state.
async function claimNext(): Promise<PendingRow | null> {
  const skipIds = [...attempts.entries()]
    .filter(([, n]) => n >= MAX_ATTEMPTS_PER_SESSION)
    .map(([id]) => id);
  const res = await apiPostQuiet<{ job: PendingRow | null; reason: string }>(
    "/api/worker/claim",
    { skipIds },
  );
  if (!res) return null;
  if (res.reason === "ceiling") {
    console.warn("[worker] daily drain ceiling reached — pausing new jobs");
    return null;
  }
  return res.job;
}

async function setStatus(projectId: string, phase: JobPhase) {
  await apiPostQuiet(`/api/worker/jobs/${encodeURIComponent(projectId)}`, { op: "phase", phase });
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
      await trackAnalytics(AnalyticsEvent.DemoFailed, row.user_id, {
        projectId: row.id,
        sourceType: row.demo_source_type,
        reason: "login-gated",
      });
      await markFailed(
        row.id,
        "login-gated",
        "로그인이 필요한 사이트라 자동 시연을 만들 수 없어요. 비로그인으로 볼 수 있는 URL로 다시 시도해 주세요.",
      );
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
    await apiPostQuiet(`/api/worker/jobs/${encodeURIComponent(row.id)}`, {
      op: "notify-ready", videoUrl: outcome.publicUrl,
    });
    console.log(`[worker] job ${row.id} done → ${outcome.publicUrl ?? "(no upload)"}`);
  } catch (err) {
    // 크레딧 소진(P0.5): 유저 잘못이 아니다 — failed 대신 held(폴백 이미지 유지),
    // 세션 attempt 반환, 드레인 정지(demo_paused), fatal 경보. 해제=README 절차.
    if (err instanceof CreditExhaustedError) {
      console.error(`[worker] CREDIT EXHAUSTED — holding job ${row.id} and pausing drain: ${err.message}`);
      attempts.set(row.id, Math.max(0, (attempts.get(row.id) ?? 1) - 1));
      // Hold + drain stop + held analytics + admin page, in one call: a partial
      // credit hold (row parked but drain still running) would keep burning money.
      await apiPostQuiet(`/api/worker/jobs/${encodeURIComponent(row.id)}`, {
        op: "held-credit", message: err.message,
      });
      Sentry.captureException(err, {
        level: "fatal",
        tags: { alert: "credit_exhausted" },
        extra: { projectId: row.id },
      });
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
        await apiPostQuiet(`/api/worker/jobs/${encodeURIComponent(row.id)}`, { op: "requeue" });
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
    // 웹 타깃 없는 네이티브 앱이면 수요를 따로 센다 — 인제스트 zip 거절과 같은
    // 이벤트로 모아 /admin에서 플랫폼별로 본다(lib/nativeApp.ts).
    if (err instanceof NotAWebappError && err.platform) {
      await trackAnalytics(AnalyticsEvent.NativeAppRejected, row.user_id, {
        platform: err.platform,
        source: row.demo_source_type ?? "github",
        projectId: row.id,
      });
    }
    await markFailed(row.id, code, message);
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
