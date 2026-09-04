import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { trackServerEvent } from "@/lib/analytics";
import { AnalyticsEvent } from "@/lib/analytics-events";
import { DEMO_QUOTA } from "@/lib/demoQuota";
import {
  formatDemoFailure, demoFailureCopy, CREDIT_HOLD_MARKER, MODERATION_HOLD_MARKER,
  type DemoFailureCode,
} from "@/lib/demo-failure";
import { recipientLocale } from "@/lib/i18n/user-locale";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { sendEmail, isEmailConfigured, alertRecipients } from "@/lib/email";
import {
  demoReadyEmail, demoFailedEmail, adminAlertEmail, posterFromDemoUrl, SITE_URL,
} from "@/lib/email-templates";

// Server half of the recording worker. Every DB write the worker used to make with
// the service-role key now happens HERE, behind /api/worker/* — the Mac only sends
// intent ("job 123 reached the recording phase") over HTTPS with WORKER_SECRET.
//
// Ported verbatim from local-runner/worker.ts; the comments explaining WHY each
// rule exists moved with the code. Behaviour must stay identical — the worker's
// crash-recovery and quota invariants depend on these exact semantics.
export const IN_FLIGHT_STATUSES = ["building", "recording", "editing"] as const;

type JobRow = {
  id: string;
  user_id: string;
  title: string | null;
  demo_source_type: string | null;
  demo_source_value: string | null;
  demo_user_hint?: string | null;
  demo_access?: unknown;
  demo_script?: unknown;
};

const BASE_COLS = "id, user_id, title, demo_source_type, demo_source_value";
const FULL_COLS = `${BASE_COLS}, demo_user_hint, demo_access, demo_script`;

// ── heartbeat / kill switch ─────────────────────────────────────────────────
// Stamp liveness and read demo_paused back in ONE round-trip (the worker polls
// this every 10s). Degrades to "not paused" if system_status is missing so a
// half-migrated DB never wedges the queue.
export async function heartbeat(status: "idle" | "busy"): Promise<{ demoPaused: boolean }> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("system_status")
    .update({ worker_last_seen_at: now, worker_status: status, updated_at: now })
    .eq("id", "singleton")
    .select("demo_paused")
    .single();
  if (error) {
    logger.error("worker: heartbeat failed (system_status missing?)", { error });
    return { demoPaused: false };
  }
  return { demoPaused: !!data?.demo_paused };
}

export async function setDemoPaused(paused: boolean): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("system_status")
    .update({ demo_paused: paused, updated_at: new Date().toISOString() })
    .eq("id", "singleton");
  if (error) logger.error(`worker: demo_paused=${paused} write failed`, { error });
}

// ── claim ───────────────────────────────────────────────────────────────────
// Wallet backstop, independent of the route's admission caps: never record more
// than GLOBAL_DRAIN_DAILY jobs per rolling window. Even a row that reached
// 'pending' some other way can never push daily spend past this ceiling.
async function drainedInWindow(): Promise<number> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - DEMO_QUOTA.WINDOW_HOURS * 3_600_000).toISOString();
  const { count, error } = await admin
    .from("demo_events")
    .select("*", { count: "exact", head: true })
    .eq("kind", "drain")
    .gt("created_at", cutoff);
  if (error) {
    // Fail open: admission already bounds spend, and halting the core product on a
    // transient count error is worse than briefly trusting it. Loud log, proceed.
    logger.error("worker: drain-count failed", { error });
    return 0;
  }
  return count ?? 0;
}

type ClaimResult =
  | { job: JobRow; reason: "claimed" }
  | { job: null; reason: "empty" | "ceiling" };

// Conditional claim (pending → building, checked row count), so even a stray
// second worker can't grab the same job. `skipIds` are rows this worker session
// has already burned its retry budget on.
export async function claimNext(skipIds: string[] = []): Promise<ClaimResult> {
  const admin = createAdminClient();
  if ((await drainedInWindow()) >= DEMO_QUOTA.GLOBAL_DRAIN_DAILY) {
    logger.error(`worker: daily drain ceiling (${DEMO_QUOTA.GLOBAL_DRAIN_DAILY}) reached`, {});
    return { job: null, reason: "ceiling" };
  }
  let rows: JobRow[] = [];
  for (const cols of [FULL_COLS, BASE_COLS]) {
    const { data, error } = await admin
      .from("projects")
      .select(cols)
      .eq("demo_build_status", "pending")
      .not("demo_source_type", "is", null)
      .limit(5);
    if (!error) {
      rows = (data ?? []) as unknown as JobRow[];
      break;
    }
    // 42703 = missing column: a migration isn't applied yet. Retry on the base
    // columns instead of failing every poll (same degrade the worker had).
    if (error.code === "42703" && cols === FULL_COLS) {
      logger.error("worker: optional job columns missing — polling without them", { error });
      continue;
    }
    logger.error("worker: poll failed", { error });
    return { job: null, reason: "empty" };
  }

  const skip = new Set(skipIds);
  for (const row of rows) {
    if (skip.has(row.id)) continue;
    const { data: claimed, error: claimErr } = await admin
      .from("projects")
      .update({ demo_build_status: "building", demo_build_error: null })
      .eq("id", row.id)
      .eq("demo_build_status", "pending")
      .select("id");
    if (claimErr) {
      logger.error(`worker: claim failed for ${row.id}`, { error: claimErr });
      continue;
    }
    if (claimed && claimed.length === 1) {
      // Log the spend the instant we own the job — before the explore fee starts.
      const { error: evErr } = await admin
        .from("demo_events")
        .insert({ user_id: row.user_id, project_id: row.id, kind: "drain" });
      if (evErr) logger.error(`worker: drain-event write failed for ${row.id}`, { error: evErr });
      return { job: row, reason: "claimed" };
    }
  }
  return { job: null, reason: "empty" };
}

// ── status writes ───────────────────────────────────────────────────────────
export async function setPhase(projectId: string, phase: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("projects")
    .update({ demo_build_status: phase })
    .eq("id", projectId);
  if (error) logger.error(`worker: status(${phase}) write failed for ${projectId}`, { error });
}

export async function requeue(projectId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("projects")
    .update({ demo_build_status: "pending", demo_build_error: null })
    .eq("id", projectId);
  if (error) logger.error(`worker: requeue write failed for ${projectId}`, { error });
}

export async function markFailed(projectId: string, message: string): Promise<void> {
  const admin = createAdminClient();
  const truncated = message.length > 1000 ? message.slice(0, 1000) + "…" : message;
  const { error } = await admin
    .from("projects")
    .update({ demo_build_status: "failed", demo_build_error: truncated })
    .eq("id", projectId);
  if (error) logger.error(`worker: failed-status write failed for ${projectId}`, { error });
}

// The video is already uploaded by the time this runs — a transient DB blip must
// not strand a finished film as "failed" (audit C-D1). Retry briefly.
export async function markDone(projectId: string, videoUrl: string): Promise<void> {
  const admin = createAdminClient();
  let lastErr: { message: string } | null = null;
  for (let i = 0; i < 3; i++) {
    const { error } = await admin
      .from("projects")
      .update({
        demo_video_url: videoUrl,
        demo_build_status: "done",
        demo_generated_at: new Date().toISOString(),
      })
      .eq("id", projectId);
    if (!error) return;
    lastErr = error;
    logger.error(`worker: projects update failed (try ${i + 1}/3) for ${projectId}`, { error });
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw new Error(`projects update failed after retries: ${lastErr?.message} (video at ${videoUrl})`);
}

// ── holds ───────────────────────────────────────────────────────────────────
type QuarantineInput = {
  videoUrl: string;
  posterUrl: string | null;
  videoKey: string;
  posterKey: string | null;
  storage: "r2" | "supabase";
};

// Content scan flagged the take: artifacts are already quarantined in storage
// (unlinked — no public surface reads them). Park the row as held with the
// moderation marker, file the review item, page the admin. The session attempt is
// NOT refunded: the content is the user's, and a refund would let a borderline
// take re-record in a loop.
export async function holdForModeration(
  job: { id: string; user_id: string; title: string | null },
  outcome: { categories: string[]; reason: string; model: string; quarantine?: QuarantineInput | null },
): Promise<void> {
  const admin = createAdminClient();
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
    // Refresh an existing open row if one survives from a previous flagged take,
    // else insert. Two-step is race-free: one worker, one job at a time.
    const { data: existing, error: updErr } = await admin
      .from("demo_moderation")
      .update({ ...fields, created_at: new Date().toISOString() })
      .eq("project_id", job.id)
      .eq("status", "open")
      .select("id");
    if (updErr) {
      logger.error(`worker: moderation-row update failed for ${job.id}`, { error: updErr });
    } else if (!existing || existing.length === 0) {
      const { error: insErr } = await admin
        .from("demo_moderation")
        .insert({ project_id: job.id, ...fields });
      // Loud but non-fatal: the held row + admin email still carry the signal;
      // approve is impossible without the queue row, so this must reach Sentry.
      if (insErr) {
        logger.error("worker: moderation queue insert failed (apply migration_demo_moderation.sql?)", {
          error: insErr, projectId: job.id,
        });
      }
    }
  }

  const { error: holdErr } = await admin
    .from("projects")
    .update({ demo_build_status: "held", demo_build_error: MODERATION_HOLD_MARKER })
    .eq("id", job.id);
  if (holdErr) logger.error(`worker: moderation-hold write failed for ${job.id}`, { error: holdErr });

  await trackServerEvent(AnalyticsEvent.DemoHeld, {
    userId: job.user_id,
    props: { projectId: job.id, reason: "moderation", categories: outcome.categories },
  });
  logger.error("moderation hold — take quarantined for review", {
    alert: "moderation_hold", projectId: job.id, categories: outcome.categories,
  });
  await notifyAdmin("모더레이션 홀드 — 검토가 필요해요", [
    `"${job.title ?? "(제목 없음)"}" 시연이 게시 전 검토로 격리됐어요.`,
    `분류: ${outcome.categories.join(", ") || "(없음)"} · 모델: ${outcome.model}`,
    `사유: ${outcome.reason}`,
    "관제탑 모더레이션 인박스에서 영상 확인 후 승인(게시) 또는 거절(삭제)해 주세요.",
  ]);
}

// 크레딧 소진(P0.5): 유저 잘못이 아니다 — failed 대신 held(폴백 이미지 유지),
// 드레인 정지(demo_paused), fatal 경보. 해제 절차는 local-runner/README.md.
export async function holdForCredit(
  job: { id: string; user_id: string },
  message: string,
): Promise<void> {
  const admin = createAdminClient();
  const { error: holdErr } = await admin
    .from("projects")
    .update({ demo_build_status: "held", demo_build_error: CREDIT_HOLD_MARKER })
    .eq("id", job.id);
  if (holdErr) logger.error(`worker: credit-hold write failed for ${job.id}`, { error: holdErr });
  await setDemoPaused(true);
  await trackServerEvent(AnalyticsEvent.DemoHeld, {
    userId: job.user_id,
    props: { projectId: job.id, reason: "credit_exhausted" },
  });
  logger.error("credit exhausted — demo drain paused", {
    alert: "credit_exhausted", projectId: job.id, message,
  });
  await notifyAdmin("크레딧 소진 — 시연 드레인 정지", [
    "Anthropic 크레딧이 소진돼 녹화를 멈췄어요.",
    `잡 ${job.id}는 held로 보관됐고 재시도 횟수는 소모되지 않았어요.`,
    "system_status.demo_paused=true — 충전 후 해제 절차는 local-runner/README.md에 있어요.",
  ]);
}

// ── startup recovery ────────────────────────────────────────────────────────
// building/recording/editing rows are written ONLY by the local worker, so
// anything found in those states at startup is a previous run that died mid-job.
export async function recoverStuckJobs(): Promise<{ id: string }[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("projects")
    .select("id, user_id, title")
    .in("demo_build_status", [...IN_FLIGHT_STATUSES]);
  if (error) {
    logger.error("worker: recovery scan failed", { error });
    return [];
  }
  const rows = (data ?? []) as { id: string; user_id: string; title: string | null }[];
  for (const row of rows) {
    await markFailed(
      row.id,
      formatDemoFailure("interrupted", "녹화 장비가 재시작되어 작업이 중단됐어요. 다시 시도해 주세요."),
    );
    await notifyDemoFailed(row, "interrupted");
  }
  return rows.map((r) => ({ id: r.id }));
}

// ── owner lookups ───────────────────────────────────────────────────────────
// auth.admin is service-role-only and returns EVERY user's email — the single
// most sensitive thing the Mac used to be able to do. It now lives here.
async function ownerEmail(userId: string): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error) {
      logger.error(`worker: owner-email lookup failed for ${userId}`, { error });
      return null;
    }
    return data.user?.email ?? null;
  } catch (err) {
    logger.error(`worker: owner-email lookup threw for ${userId}`, { error: err });
    return null;
  }
}

// The @handle burned into the endcap: profiles.username via the project's owner.
export async function ownerHandle(projectId: string): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data: proj } = await admin
      .from("projects").select("user_id").eq("id", projectId).single();
    if (!proj?.user_id) return null;
    const { data: prof } = await admin
      .from("profiles").select("username").eq("id", proj.user_id).single();
    return prof?.username ?? null;
  } catch {
    return null;
  }
}

// ── notifications ───────────────────────────────────────────────────────────
// Strictly best-effort: the DB row is the source of truth and these run AFTER the
// status write. A mail outage must never fail a job.
export async function notifyDemoReady(
  job: { id: string; user_id: string; title: string | null },
  videoUrl?: string,
): Promise<void> {
  if (!isEmailConfigured()) return;
  try {
    const to = await ownerEmail(job.user_id);
    if (!to) return;
    const username = await ownerHandle(job.id);
    const watchUrl = username
      ? `${SITE_URL}/${encodeURIComponent(username)}/${job.id}`
      : `${SITE_URL}/dashboard`;
    // Poster is best-effort — only attach a derived key that actually exists (an
    // email with no image beats one with a broken image at the top).
    let posterUrl = posterFromDemoUrl(videoUrl);
    if (posterUrl) {
      const ok = await fetch(posterUrl, { method: "HEAD" }).then((r) => r.ok).catch(() => false);
      if (!ok) posterUrl = undefined;
    }
    const locale = await recipientLocale(createAdminClient(), job.user_id);
    const mail = demoReadyEmail({
      projectTitle: job.title || getDictionary(locale).email.untitledProject,
      watchUrl,
      posterUrl,
      locale,
    });
    await sendEmail({ to, ...mail });
  } catch (err) {
    logger.error("worker: demo-ready email failed", { error: err, projectId: job.id });
  }
}

export async function notifyDemoFailed(
  job: { id: string; user_id: string; title: string | null },
  code: DemoFailureCode,
): Promise<void> {
  if (!isEmailConfigured()) return;
  try {
    const to = await ownerEmail(job.user_id);
    if (!to) return;
    const locale = await recipientLocale(createAdminClient(), job.user_id);
    const mail = demoFailedEmail({
      projectTitle: job.title || getDictionary(locale).email.untitledProject,
      copy: demoFailureCopy(code, locale),
      locale,
    });
    await sendEmail({ to, ...mail });
  } catch (err) {
    logger.error("worker: demo-failed email failed", { error: err, projectId: job.id });
  }
}

// 운영 경보(관리자) — Sentry와 별개로 사람 눈에 바로 닿는 채널.
async function notifyAdmin(title: string, lines: string[]): Promise<void> {
  if (!isEmailConfigured()) return;
  try {
    const mail = adminAlertEmail({ title, lines, ctaLabel: "관리자 콘솔 열기", ctaUrl: `${SITE_URL}/admin` });
    await sendEmail({ to: alertRecipients(), ...mail });
  } catch (err) {
    logger.error("worker: admin alert email failed", { error: err });
  }
}

// Fetch a job row the worker already owns (used by asset signing to resolve the
// owner prefix without trusting a user_id sent from the Mac).
export async function jobOwner(projectId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("projects").select("user_id").eq("id", projectId).single();
  if (error || !data?.user_id) return null;
  return data.user_id as string;
}

// Job identity for emails/analytics. Always read server-side: the Mac sends only
// the project id, never the owner or title it wants used.
export async function getJobBrief(
  projectId: string,
): Promise<{ id: string; user_id: string; title: string | null } | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("projects")
    .select("id, user_id, title")
    .eq("id", projectId)
    .single();
  if (error || !data) return null;
  return data as { id: string; user_id: string; title: string | null };
}
