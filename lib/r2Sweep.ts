import type { SupabaseClient } from "@supabase/supabase-js";
import { isR2Configured, listR2Objects, deleteR2Prefix } from "@/lib/r2";

// R2 남은 영상 청소(2026-09-30, 사용자 승인) — 행이 사라진 작품의 `{uid}/{projectId}/` 폴더를
// 하루 한 번 지운다. 새 찌꺼기는 이미 안 생긴다(새 촬영은 옛 판을 지우고, 작품·계정 삭제와
// 심사 거절도 R2를 지운다). 이건 그 길들이 생기기 전 판이나 중간에 실패한 삭제를 줍는 그물이다.
//
// 지우는 쪽이라 보수적으로:
//   - `UUID/UUID/` 모양 키만 본다 — promo/·_test/ 같은 다른 트리는 절대 안 건드린다.
//   - projects에 그 id가 **아예 없을 때만** 지운다. 행 조회가 하나라도 실패하면 아무것도 안
//     지운다(빈 결과를 "전부 고아"로 읽으면 버킷이 통째로 빈다).
//   - 폴더 안 가장 최근 파일이 하루 넘게 지난 것만 — 막 올라가는 판과 겹칠 일을 없앤다.
//   - 한 번에 R2_SWEEP_MAX_PREFIXES개까지.
//
// 사용자 파일(2026-10-01~, lib/userStorage.ts)의 `files/{uid}/{폴더}/`도 같이 본다. 폴더 이름은
// 행 id(Connect 업로드)이거나 브라우저가 만든 무작위 id(대시보드 업로드 — 행보다 먼저 생긴다)라,
// "그 id의 행이 있거나, 어느 작품의 demo_url이 그 폴더를 가리키면" 살아 있는 것으로 본다. 둘 다
// 아니고 하루 넘게 조용하면 지운다(업로드 도중 실패한 조각, 수정 창에서 갈아끼운 옛 폴더).
// thumbnails/·videos/ 같은 UUID 아닌 폴더는 이 모양에 안 걸린다.

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PROJECT_KEY_RE = new RegExp(`^(${UUID})/(${UUID})/`, "i");
const FILE_KEY_RE = new RegExp(`^files/(${UUID})/(${UUID})/`, "i");
export const R2_SWEEP_MIN_AGE_MS = 24 * 3_600_000;
export const R2_SWEEP_MAX_PREFIXES = 50;

// ── 순수 판정(네트워크 없음 — scripts/probe-r2-sweep-unit.mts) ─────────────────

/** 점검 크론(5분 틱) 중 하루 한 번 — 한국 시각 새벽 3시 첫 틱. */
export function isR2SweepTick(now: number): boolean {
  const d = new Date(now);
  return d.getUTCHours() === 18 && d.getUTCMinutes() < 5;
}

export type R2Folder = { prefix: string; projectId: string; newest: number };

/** 키 목록 → 작품 폴더별(가장 최근 파일 시각). 작품 트리가 아닌 키는 버린다. */
export function groupProjectFolders(objects: { key: string; lastModified: number }[]): R2Folder[] {
  const byPrefix = new Map<string, R2Folder>();
  for (const o of objects) {
    const m = PROJECT_KEY_RE.exec(o.key);
    if (!m) continue;
    const prefix = `${m[1]}/${m[2]}/`;
    const cur = byPrefix.get(prefix);
    if (!cur) byPrefix.set(prefix, { prefix, projectId: m[2].toLowerCase(), newest: o.lastModified });
    else cur.newest = Math.max(cur.newest, o.lastModified);
  }
  return [...byPrefix.values()];
}

export type R2FileFolder = { prefix: string; ownerId: string; folderId: string; newest: number };

/** 키 목록 → 사용자 파일 폴더별(`files/{uid}/{폴더}/`). */
export function groupFileFolders(objects: { key: string; lastModified: number }[]): R2FileFolder[] {
  const byPrefix = new Map<string, R2FileFolder>();
  for (const o of objects) {
    const m = FILE_KEY_RE.exec(o.key);
    if (!m) continue;
    const prefix = `files/${m[1]}/${m[2]}/`;
    const cur = byPrefix.get(prefix);
    if (!cur) byPrefix.set(prefix, { prefix, ownerId: m[1].toLowerCase(), folderId: m[2].toLowerCase(), newest: o.lastModified });
    else cur.newest = Math.max(cur.newest, o.lastModified);
  }
  return [...byPrefix.values()];
}

/** demo_url(`/api/preview/{uid}/{폴더}/…`)이 가리키는 폴더 → "uid/폴더". */
export function previewFolderOf(demoUrl: string | null | undefined): string | null {
  const m = /^\/api\/preview\/([^/]+)\/([^/]+)\//.exec(demoUrl ?? "");
  return m ? `${m[1]}/${m[2]}`.toLowerCase() : null;
}

/** 지울 사용자 파일 폴더 — 행도 아니고 어느 demo_url도 안 가리키고, 하루 넘게 조용한 것. */
export function pickFileOrphans(
  folders: R2FileFolder[],
  liveIds: Set<string>,
  referenced: Set<string>,
  now: number,
  max = R2_SWEEP_MAX_PREFIXES,
): R2FileFolder[] {
  return folders
    .filter((f) => !liveIds.has(f.folderId) && !referenced.has(`${f.ownerId}/${f.folderId}`) && now - f.newest >= R2_SWEEP_MIN_AGE_MS)
    .slice(0, max);
}

/** 지울 폴더 — 살아 있는 행에 없고, 하루 넘게 조용하고, 상한까지. */
export function pickOrphans(folders: R2Folder[], liveIds: Set<string>, now: number): R2Folder[] {
  return folders
    .filter((f) => !liveIds.has(f.projectId) && now - f.newest >= R2_SWEEP_MIN_AGE_MS)
    .slice(0, R2_SWEEP_MAX_PREFIXES);
}

// ── 실행 ─────────────────────────────────────────────────────────────────────

export type R2SweepResult = { folders: number; orphans: number; removed: number; fileFolders?: number; fileOrphans?: number };

export async function runR2Sweep(
  admin: SupabaseClient,
  { now }: { now: number },
): Promise<R2SweepResult | null> {
  if (!isR2Configured() || !isR2SweepTick(now)) return null;
  const objects = await listR2Objects();
  const folders = groupProjectFolders(objects);
  const fileFolders = groupFileFolders(objects);
  if (!folders.length && !fileFolders.length) return { folders: 0, orphans: 0, removed: 0, fileFolders: 0, fileOrphans: 0 };

  const liveIds = new Set<string>();
  const ids = [...new Set([...folders.map((f) => f.projectId), ...fileFolders.map((f) => f.folderId)])];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin.from("projects").select("id").in("id", ids.slice(i, i + 200));
    if (error) throw new Error(`r2 sweep: project lookup failed: ${error.message}`);
    for (const r of data ?? []) liveIds.add(String(r.id).toLowerCase());
  }

  const orphans = pickOrphans(folders, liveIds, now);
  let removed = 0;
  for (const f of orphans) removed += await deleteR2Prefix(f.prefix);

  // 사용자 파일 폴더 — demo_url이 가리키는 폴더 목록을 다 읽어야 판정한다(실패하면 아무것도 안 지움).
  let fileOrphans: R2FileFolder[] = [];
  if (fileFolders.length) {
    const referenced = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin.from("projects").select("demo_url")
        .like("demo_url", "/api/preview/%").order("id").range(from, from + 999);
      if (error) throw new Error(`r2 sweep: demo_url lookup failed: ${error.message}`);
      for (const r of data ?? []) {
        const f = previewFolderOf(r.demo_url as string | null);
        if (f) referenced.add(f);
      }
      if (!data || data.length < 1000) break;
    }
    fileOrphans = pickFileOrphans(fileFolders, liveIds, referenced, now, Math.max(0, R2_SWEEP_MAX_PREFIXES - orphans.length));
    for (const f of fileOrphans) removed += await deleteR2Prefix(f.prefix);
  }
  return { folders: folders.length, orphans: orphans.length, removed, fileFolders: fileFolders.length, fileOrphans: fileOrphans.length };
}
