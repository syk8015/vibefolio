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
import { createClient } from "@supabase/supabase-js";
import "./config"; // side-effect: load .env.local
import { runJob, type JobPhase } from "./job";
import type { SourceType } from "./safety";
import { DEMO_QUOTA } from "../lib/demoQuota";

const POLL_MS = 10_000;
// Per-session retry cap: a job whose failure-write itself failed (or a row
// re-queued while we crash-loop) must not burn an explore fee every poll.
const MAX_ATTEMPTS_PER_SESSION = 2;

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
    .select("id, user_id, demo_source_type, demo_source_value")
    .eq("demo_build_status", "pending")
    .not("demo_source_type", "is", null)
    .limit(5);
  if (error) {
    console.error(`[worker] poll failed: ${error.message}`);
    return null;
  }
  for (const row of (data ?? []) as PendingRow[]) {
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
    const outcome = await runJob({
      projectId: row.id,
      sourceType: row.demo_source_type,
      sourceValue: row.demo_source_value,
      upload: true, // uploadAndMarkDone sets status=done on success
      onPhase: (phase) => setStatus(row.id, phase),
    });
    if (outcome.status === "login-gated") {
      await markFailed(row.id, "로그인이 필요한 사이트라 자동 시연을 만들 수 없어요. 비로그인으로 볼 수 있는 URL로 다시 시도해 주세요.");
      console.log(`[worker] job ${row.id} skipped (login-gated)`);
      return;
    }
    console.log(`[worker] job ${row.id} done → ${outcome.publicUrl ?? "(no upload)"}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[worker] job ${row.id} failed: ${message}`);
    await markFailed(row.id, message);
  }
}

console.log("[worker] nookframe local demo worker (M5)");
console.log(`[worker] polling every ${POLL_MS / 1000}s — Ctrl-C to stop`);
await recoverStuckJobs();

while (!stopping) {
  const row = await claimNext();
  if (row) {
    busy = true;
    await processOne(row);
    busy = false;
    continue; // drain the queue before idling again
  }
  await new Promise((r) => setTimeout(r, POLL_MS));
}
console.log("[worker] stopped");
