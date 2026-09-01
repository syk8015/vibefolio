import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

// Server half of the promo-clip batch recorder (npm run promo:batch).
//
// Same relay reason as lib/workerOps.ts: the Mac no longer holds the service-role
// key. Deliberately thinner than the demo worker — no quota, heartbeat, kill
// switch or email, because promo clips are internal, own no user data and cost no
// API credit (the original promo-worker.ts made the same call).
export type PendingClip = {
  id: string;
  tagline_text: string;
  tagline_reply: string | null;
  tagline_locale: "ko" | "en";
  format: string;
  opening: string;
};

const CLIP_COLS = "id, tagline_text, tagline_reply, tagline_locale, format, opening";

// 'recording' rows at startup = a previous run that died mid-clip (only the
// recorder ever writes that state).
export async function recoverStuckClips(): Promise<string[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("promo_clips").select("id").eq("status", "recording");
  if (error) {
    logger.error("promo-worker: recovery scan failed", { error });
    return [];
  }
  const ids = (data ?? []).map((r) => (r as { id: string }).id);
  for (const id of ids) {
    await admin
      .from("promo_clips")
      .update({
        status: "failed",
        error: "이전 실행이 중단됐어요(워커 재시작). 촬영 큐에 다시 추가해 주세요.",
      })
      .eq("id", id);
  }
  return ids;
}

// Conditional UPDATE (only while the row is still pending) so a second worker
// can never double-shoot the same clip.
export async function claimNextClip(): Promise<PendingClip | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("promo_clips")
    .select(CLIP_COLS)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(5);
  if (error) {
    logger.error("promo-worker: poll failed", { error });
    return null;
  }
  for (const row of (data ?? []) as unknown as PendingClip[]) {
    const { data: claimed, error: claimErr } = await admin
      .from("promo_clips")
      .update({ status: "recording" })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id");
    if (claimErr) {
      logger.error(`promo-worker: claim failed for ${row.id}`, { error: claimErr });
      continue;
    }
    if (claimed && claimed.length === 1) return row;
  }
  return null;
}

export async function markClipDone(
  clipId: string,
  result: { videoUrl: string; videoKey: string; posterUrl?: string | null; durationSec?: number | null },
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("promo_clips")
    .update({
      status: "done",
      video_url: result.videoUrl,
      video_key: result.videoKey,
      poster_url: result.posterUrl ?? null,
      duration_sec: result.durationSec ?? null,
      recorded_at: new Date().toISOString(),
    })
    .eq("id", clipId);
  if (error) logger.error(`promo-worker: done-status write failed for ${clipId}`, { error });
}

export async function markClipFailed(clipId: string, message: string): Promise<void> {
  const admin = createAdminClient();
  const truncated = message.length > 1000 ? message.slice(0, 1000) + "…" : message;
  const { error } = await admin
    .from("promo_clips")
    .update({ status: "failed", error: truncated })
    .eq("id", clipId);
  if (error) logger.error(`promo-worker: failed-status write failed for ${clipId}`, { error });
}
