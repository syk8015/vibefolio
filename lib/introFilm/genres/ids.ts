// 지금 쓸 수 있는 영상 틀 이름 — 검사기(서버)가 그림 코드 없이 읽게 따로 둔다. 틀을 들이면 여기와 index.ts에 같이 넣는다.
// 2026-10-04: 필름 실험실 24개 중 사용자가 "멋있어"를 준 셋만 들어왔다(영수증이 1등).
export const GENRE_IDS = ["receipt", "terminal", "lcd"] as const;
export type GenreId = (typeof GENRE_IDS)[number];

/** 추천 틀 — usedByOwner(같은 주인의 다른 작품 틀)를 빼고 작품 id로 고른다. 다 쓰였으면 전체에서. */
export function recommendGenre(projectId: string, usedByOwner: readonly (string | undefined)[] = []): GenreId {
  const free = GENRE_IDS.filter((g) => !usedByOwner.includes(g));
  const pool = free.length ? free : GENRE_IDS;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < projectId.length; i++) { h ^= projectId.charCodeAt(i); h = Math.imul(h, 16777619); }
  return pool[(h >>> 0) % pool.length];
}
