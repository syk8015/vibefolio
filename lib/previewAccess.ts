import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

// 미리보기 폴더가 지금 누구에게나 열려도 되나(2026-11-02, 초안 비공개 — lib/previewToken.ts).
//
// 열려도 되는 폴더 = 그 uid의 행 중 하나라도 **공개(is_draft=false)** 행이 이 폴더를 쓰고, **내린(taken_down_at)**
// 행은 하나도 이 폴더를 쓰지 않는 것. 행이 폴더를 쓰는 길은 셋이다: 폴더 이름 = 행 id(인제스트), demo_url이
// 이 폴더를 가리킴(대시보드 직접 업로드는 폴더가 무작위 UUID), demo_source_value = "uid/폴더"(소스 zip).
// 명함 정지는 모든 작품을 초안으로 돌리므로 따로 볼 필요가 없다(migration_takedown_lock.sql).
//
// 기억: '열림'만 30초 기억한다. '닫힘'은 기억하지 않는다 — 공개하자마자 열려야 하고(촬영 로봇·첫 방문자),
// 닫힘 답은 어차피 404라 붙잡아 둘 값이 없다. 내린 작품은 길어야 30초(+ CDN 60초) 안에 닫힌다.
// 데이터 저장소를 못 읽으면 닫는다(fail-closed) — 공개 작품이 잠깐 안 보이는 쪽이 초안이 새는 쪽보다 낫다.

const OPEN_TTL_MS = 30_000;
const open = new Map<string, number>();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FOLDER_RE = /^[A-Za-z0-9-]{1,64}$/; // _ 는 LIKE 와일드카드라 뺀다(실제 폴더는 전부 UUID)

/** uid·폴더 모양 검사 — 데이터 저장소 질의에 넣기 전에(이 모양 밖은 늘 닫힘). */
export function validPreviewFolder(uid: string, folder: string): boolean {
  return UUID_RE.test(uid) && FOLDER_RE.test(folder);
}

export async function folderIsPublic(uid: string, folder: string): Promise<boolean> {
  if (!validPreviewFolder(uid, folder)) return false;
  const key = `${uid}/${folder}`;
  const until = open.get(key);
  if (until && until > Date.now()) return true;
  try {
    // 모양 검사를 지난 값만 넣는다([A-Za-z0-9-]) — or() 문법을 깨거나 LIKE 와일드카드를 넣을 수 없다.
    const ors = [`demo_url.like./api/preview/${uid}/${folder}/*`, `demo_source_value.eq.${uid}/${folder}`];
    if (UUID_RE.test(folder)) ors.unshift(`id.eq.${folder}`);
    // 이 폴더를 쓰는 행을 상태와 상관없이 다 읽는다 — 내린 행이 하나라도 쓰면 닫는다. 같은 주인의 다른
    // 공개 작품이 demo_url·demo_source_value로 내린 폴더를 가리켜 신고된 주소를 되살리던 길(2026-11-03, S8-F1).
    const { data, error } = await createAdminClient()
      .from("projects")
      .select("is_draft, taken_down_at")
      .eq("user_id", uid)
      .or(ors.join(","))
      .limit(50);
    if (error) throw error;
    const rows = (data ?? []) as { is_draft: boolean; taken_down_at: string | null }[];
    const isOpen = !rows.some((r) => r.taken_down_at) && rows.some((r) => !r.is_draft);
    if (isOpen) {
      if (open.size > 5000) open.clear();
      open.set(key, Date.now() + OPEN_TTL_MS);
    } else {
      open.delete(key);
    }
    return isOpen;
  } catch (err) {
    logger.error("preview: folder access lookup failed — serving closed", { error: err, key });
    return false;
  }
}
