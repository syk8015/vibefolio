import type { SupabaseClient } from "@supabase/supabase-js";

// Supabase Storage 폴더 통째로 나열·지우기. list()는 한 겹·한 페이지(최대 1000)만
// 돌려주므로 폴더 BFS + offset 페이지 반복이 필요하다. 예전 삭제 경로 셋(탈퇴·초안
// 삭제·작품 삭제)은 첫 페이지만 봐서, 한 폴더에 1000개가 넘는 작품(빌드 산출물
// assets/ 등, zip은 2000개까지 허용)은 1001번째부터 공개 버킷에 남았다 — 개인정보
// 처리방침의 "탈퇴 즉시 파기"가 깨지는 구멍(2026-09-22 데이터1).
export const STORAGE_LIST_PAGE = 1000;

export async function listFilesDeep(
  admin: SupabaseClient,
  bucket: string,
  root: string,
): Promise<string[]> {
  const files: string[] = [];
  const queue = [root];
  while (queue.length) {
    const dir = queue.shift()!;
    for (let offset = 0; ; offset += STORAGE_LIST_PAGE) {
      const { data, error } = await admin.storage
        .from(bucket)
        .list(dir, { limit: STORAGE_LIST_PAGE, offset });
      if (error) throw new Error(`list ${bucket}/${dir} failed: ${error.message}`);
      for (const entry of data ?? []) {
        const full = `${dir}/${entry.name}`;
        if (entry.id === null) queue.push(full); // 디렉터리 플레이스홀더 → 내려간다
        else files.push(full);
      }
      if (!data || data.length < STORAGE_LIST_PAGE) break;
    }
  }
  return files;
}

// remove()는 한 번에 너무 많이 주면 거절되므로 100개씩.
export async function removeFiles(
  admin: SupabaseClient,
  bucket: string,
  paths: string[],
): Promise<number> {
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const { error } = await admin.storage.from(bucket).remove(chunk);
    if (error) throw new Error(`remove ${bucket} failed: ${error.message}`);
    removed += chunk.length;
  }
  return removed;
}
