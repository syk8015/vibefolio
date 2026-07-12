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
import { runJob, type JobPhase } from "./job";
import type { SourceType } from "./safety";
import { DEMO_QUOTA } from "../lib/demoQuota";
import { AnalyticsEvent } from "../lib/analytics-events";

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
// Per-session retry cap: a job whose failure-write itself failed (or a row
// re-queued while we crash-loop) must not burn an explore fee every poll.
const MAX_ATTEMPTS_PER_SESSION = 2;
// Hard self-heal cap. runJob has no cancellation, so a truly hung job (frozen
// browser / stalled ffmpeg) would block this single-threaded worker forever. Past
// this we mark it failed and process.exit(1) — launchd restarts a clean worker and
// the dying process takes its hung children with it. Set well above a normal job
// (dashboard says "보통 1–3분") so it only ever catches real hangs.
const JOB_HARD_TIMEOUT_MS = 10 * 60_000;

class JobTimeoutError extends Error {}

async function withHardTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new JobTimeoutError(`job exceeded ${JOB_HARD_TIMEOUT_MS / 60_000}min hard timeout`)),
      JOB_HARD_TIMEOUT_MS,
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
let stopping = false;
let busy = false;
let hintColumnMissing = false; // set on first 42703 → poll drops the column

process.on("SIGINT", () => {
  if (!busy) {
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

// Startup recovery: repair rows a dead local worker left in-flight.
async function recoverStuckJobs() {
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .in("demo_build_status", [...IN_FLIGHT_STATUSES]);
  if (error) {
    console.error(`[worker] recovery scan failed: ${error.message}`);
    return;
  }
  for (const row of data ?? []) {
    console.log(`[worker] recovering stuck job ${row.id} → failed`);
    await markFailed(row.id, "로컬 녹화 워커가 재시작되어 작업이 중단됐어요. 다시 시도해 주세요.");
  }
}

type PendingRow = {
  id: string;
  user_id: string;
  demo_source_type: SourceType | null;
  demo_source_value: string | null;
  demo_user_hint?: string | null;
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
  const { data, error } = await supabase
    .from("projects")
    .select(
      hintColumnMissing
        ? "id, user_id, demo_source_type, demo_source_value"
        : "id, user_id, demo_source_type, demo_source_value, demo_user_hint",
    )
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
        upload: true, // uploadAndMarkDone sets status=done on success
        userHint: row.demo_user_hint ?? undefined,
        onPhase: (phase) => setStatus(row.id, phase),
      }),
    );
    if (outcome.status === "login-gated") {
      await markFailed(row.id, "로그인이 필요한 사이트라 자동 시연을 만들 수 없어요. 비로그인으로 볼 수 있는 URL로 다시 시도해 주세요.");
      await trackAnalytics(AnalyticsEvent.DemoFailed, row.user_id, {
        projectId: row.id,
        sourceType: row.demo_source_type,
        reason: "login-gated",
      });
      console.log(`[worker] job ${row.id} skipped (login-gated)`);
      return;
    }
    await trackAnalytics(AnalyticsEvent.DemoSucceeded, row.user_id, {
      projectId: row.id,
      sourceType: row.demo_source_type,
    });
    console.log(`[worker] job ${row.id} done → ${outcome.publicUrl ?? "(no upload)"}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const timedOut = err instanceof JobTimeoutError;
    console.error(`[worker] job ${row.id} failed: ${message}`);
    Sentry.captureException(err, {
      extra: { projectId: row.id, sourceType: row.demo_source_type },
    });
    await trackAnalytics(AnalyticsEvent.DemoFailed, row.user_id, {
      projectId: row.id,
      sourceType: row.demo_source_type,
      reason: timedOut ? "timeout" : "error",
      message,
    });
    await markFailed(row.id, message);
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

while (!stopping) {
  const paused = await heartbeat(busy ? "busy" : "idle");
  if (paused) {
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
  await new Promise((r) => setTimeout(r, POLL_MS));
}
console.log("[worker] stopped");
