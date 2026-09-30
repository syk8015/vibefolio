import type { SupabaseClient } from "@supabase/supabase-js";
import { removeRowFolder } from "@/lib/ingestStore";
import { logger } from "@/lib/logger";

// 끝맺음(finalize)이 안 온 2단계 업로드 청소(2026-09-30) — 점검 크론이 틱마다 조금씩.
//
// 큰 파일은 두 번에 나눠 온다: ① /api/ingest가 초안 행을 만들고 서명 URL을 준다 ② AI가 파일을
// `_upload/<session>/`에 올리고 /api/ingest/finalize를 부른다. AI가 ①과 ② 사이에서 멈추면
//   빈 초안 — 파일이 하나도 안 붙은 새 행(demo_url ""·video_url 없음). 초안 20칸 중 하나를 차지하고,
//     같은 zip을 다시 올리면 새 초안이 생겨 빈 칸이 쌓인다. → 하루가 지나면 행과 폴더를 지운다.
//     finalize가 실패했을 때 "이번 요청이 만든 행은 지운다"(dropNewRow)와 같은 정책이다. 파일이
//     붙은 초안은 건드리지 않는다(버려진 초안 자동 삭제는 09-01에 안 하기로 했다).
//   임시 파일 — 이미 있던 작품에 올리다 멈추면 행은 멀쩡하고 `_upload/` 아래 파일·교체 표식만
//     남는다(공개 버킷, 최대 25MB). → 하루 지난 세션·표식만 지운다.
// 하루 = 서명 URL(2시간)이 끝나고도 한참 뒤라, 살아 있는 업로드를 건드릴 일이 없다.

export const UPLOAD_ABANDON_MS = 24 * 3_600_000;
export const EMPTY_DRAFT_SWEEP_MAX = 5;
export const TEMP_SWEEP_ROWS = 20;
const TICK_MS = 5 * 60_000;
const SESSION_RE = /^([0-9a-z]{8})-[0-9a-f]{12}$/;
const SESSION_FILES = ["bundle.zip", "screenshot.bin", "video.bin"];

// ── 순수 판정(네트워크 없음 — scripts/probe-upload-sweep-unit.mts) ─────────────

export type DraftRow = {
  id: string;
  user_id: string;
  is_draft: boolean | null;
  demo_url: string | null;
  video_url: string | null;
  created_at: string | null;
};

/** 파일이 하나도 안 붙은 채 하루가 지난 초안인가. */
export function isAbandonedEmptyDraft(row: DraftRow, now: number): boolean {
  if (row.is_draft !== true) return false;
  if ((row.demo_url ?? "").trim() || row.video_url) return false;
  const created = Date.parse(row.created_at ?? "");
  return Number.isFinite(created) && now - created >= UPLOAD_ABANDON_MS;
}

export type UploadEntry = {
  name: string;
  id: string | null; // null = 폴더
  updated_at?: string | null;
  created_at?: string | null;
};

/** 세션 이름 앞 8자 = 만든 시각(base36 ms, lib/ingestStore.ts newUploadSession). */
export function sessionStartedAt(name: string): number | null {
  const m = SESSION_RE.exec(name);
  if (!m) return null;
  const t = parseInt(m[1], 36);
  return Number.isFinite(t) ? t : null;
}

/** `{prefix}/_upload` 목록에서 지울 키. 모르는 폴더는 건드리지 않는다. */
export function staleUploadKeys(prefix: string, entries: UploadEntry[], now: number): string[] {
  const keys: string[] = [];
  for (const e of entries) {
    if (e.id === null) {
      const started = sessionStartedAt(e.name);
      if (started !== null && now - started >= UPLOAD_ABANDON_MS) {
        for (const f of SESSION_FILES) keys.push(`${prefix}/_upload/${e.name}/${f}`);
      }
      continue;
    }
    // 파일(교체 표식·09-15 이전 고정 키) — 새로 올릴 때마다 덮어써서 updated_at이 새로워진다.
    const at = Date.parse(e.updated_at ?? e.created_at ?? "");
    if (!Number.isFinite(at) || now - at >= UPLOAD_ABANDON_MS) keys.push(`${prefix}/_upload/${e.name}`);
  }
  return keys;
}

/** 이번 틱에 임시 파일을 볼 행 구간 — 5분마다 다음 구간, 끝나면 처음으로. */
export function sweepWindow(total: number, now: number, size = TEMP_SWEEP_ROWS): { from: number; to: number } | null {
  if (total <= 0) return null;
  if (total <= size) return { from: 0, to: total - 1 };
  const pages = Math.ceil(total / size);
  const page = Math.floor(now / TICK_MS) % pages;
  return { from: page * size, to: Math.min(total, (page + 1) * size) - 1 };
}

// ── 실행 ─────────────────────────────────────────────────────────────────────

export type UploadSweepResult = { emptyDrafts: number; tempRows: number; tempKeys: number };

export async function runUploadSweep(
  admin: SupabaseClient,
  opts: { now: number },
): Promise<UploadSweepResult> {
  const { now } = opts;
  const cutoff = new Date(now - UPLOAD_ABANDON_MS).toISOString();
  const result: UploadSweepResult = { emptyDrafts: 0, tempRows: 0, tempKeys: 0 };

  // 1. 빈 초안 — 행을 지우고(조건을 다시 걸어 그 사이 파일이 붙었으면 안 지움) 폴더를 비운다.
  const { data: drafts, error: dErr } = await admin
    .from("projects")
    .select("id, user_id, is_draft, demo_url, video_url, created_at")
    .eq("is_draft", true)
    .is("video_url", null)
    .lt("created_at", cutoff)
    .or("demo_url.is.null,demo_url.eq.")
    .limit(EMPTY_DRAFT_SWEEP_MAX);
  if (dErr) throw dErr;
  for (const row of (drafts ?? []) as DraftRow[]) {
    if (!isAbandonedEmptyDraft(row, now)) continue;
    const { data: gone, error } = await admin
      .from("projects")
      .delete()
      .eq("id", row.id)
      .eq("is_draft", true)
      .is("video_url", null)
      .or("demo_url.is.null,demo_url.eq.")
      .select("id");
    if (error || !gone?.length) continue;
    result.emptyDrafts++;
    await removeRowFolder(admin, row.user_id, row.id).catch((err) =>
      logger.warn("upload sweep: empty draft folder cleanup failed", { error: err, projectId: row.id }));
  }

  // 2. 임시 파일 — 행 구간을 돌며 `_upload/` 목록만 본다(행마다 목록 1번).
  const { count } = await admin.from("projects").select("id", { count: "exact", head: true });
  const win = sweepWindow(count ?? 0, now);
  if (!win) return result;
  const { data: rows, error: rErr } = await admin
    .from("projects")
    .select("id, user_id")
    .order("id", { ascending: true })
    .range(win.from, win.to);
  if (rErr) throw rErr;
  const bucket = admin.storage.from("project-files");
  await Promise.all(((rows ?? []) as { id: string; user_id: string }[]).map(async (row) => {
    const prefix = `${row.user_id}/${row.id}`;
    const { data: entries, error } = await bucket.list(`${prefix}/_upload`, { limit: 1000 });
    if (error || !entries?.length) return;
    const keys = staleUploadKeys(prefix, entries as UploadEntry[], now);
    if (!keys.length) return;
    const { error: rmErr } = await bucket.remove(keys);
    if (rmErr) {
      logger.warn("upload sweep: temp cleanup failed", { error: rmErr, projectId: row.id });
      return;
    }
    result.tempRows++;
    result.tempKeys += keys.length;
  }));
  return result;
}
