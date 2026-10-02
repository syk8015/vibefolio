// 실서버 프로브용 사용자 파일 도우미 — 사용자 파일은 2026-10-01부터 R2에 있다(lib/userStorage.ts).
//
// 이 맥엔 R2 키가 없어서(Vercel에만 있음) 파일을 직접 나열·삭제할 수 없다. 그래서
//   - 있는지는 media.nookframe.com 공개 주소에 HEAD로 묻는다. 엣지 캐시가 옛 답을 주지 않게
//     부를 때마다 다른 쿼리를 붙인다(쿼리가 캐시 키에 들어간다).
//   - 정리는 초안 삭제 API(DELETE /api/ingest/drafts/{id})에 맡긴다 — R2와 옛 Supabase 버킷의
//     행 폴더를 둘 다 지운다. 초안이 아니거나 이미 지워진 행은 행만 지우고, 남은 R2 파일은
//     하루 한 번 도는 R2 청소(lib/r2Sweep.ts)가 치운다.
// 옛 Supabase 버킷(svc.storage)을 프로브에서 다시 쓰지 말 것 — 닫혀 있어서 목록은 늘 비고, 삭제는 헛돈다.

const MEDIA = "https://media.nookframe.com";
let bust = 0;

// path = "<uid>/<projectId>/…" (옛 Supabase project-files 경로 그대로; R2 키는 files/ + path)
export async function userFileExists(path) {
  const r = await fetch(`${MEDIA}/files/${path}?nfp=${Date.now()}-${bust++}`, { method: "HEAD" });
  if (r.status === 200) return true;
  if (r.status === 404) return false;
  throw new Error(`media HEAD ${r.status} — files/${path}`);
}

// 서명 PUT 주소(…/files/<uid>/<pid>/_upload/<session>/video.bin?X-Amz-…) → "<uid>/<pid>/…" 경로.
export function pathOfSignedPut(url) {
  const p = new URL(url).pathname;
  const i = p.indexOf("/files/");
  return i < 0 ? null : decodeURIComponent(p.slice(i + "/files/".length));
}

export async function wipeProbeDraft({ svc, token, id, origin = "https://nookframe.com" }) {
  if (!id) return;
  await fetch(`${origin}/api/ingest/drafts/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
  await svc.from("projects").delete().eq("id", id);
}
