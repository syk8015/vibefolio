// 영상 틀 목록 + 고르기 + 대본 → 틀 입력 바꾸기. 화면(재생기·검토 창)만 쓴다 — 서버 검사는 ids.ts를 읽는다.
//
// 고르기(2026-10-04, film-style/STANDARD.md §9·10): AI는 틀 이름을 보내지 않는다(AI 기본값이 몇 개에 몰린다).
// 주인이 검토 창에서 고르고, 안 고르면 작품 id로 정해진 추천 틀 — 같은 주인의 다른 작품이 쓴 틀은 피한다.
import type { IntroFilm, IntroScene, Loc } from "../schema";
import { GENRE_IDS, recommendGenre, type GenreId } from "./ids";
import type { FlatScene, Genre, GenreWork } from "./types";
import { receipt } from "./receipt";
import { terminal } from "./terminal";
import { lcd } from "./lcd";

export const GENRES: Record<GenreId, Genre> = { receipt, terminal, lcd };
export { GENRE_IDS, recommendGenre, type GenreId };

/** 이 영상이 쓸 틀 — 주인이 고른 것, 없으면 추천. */
export function filmGenre(film: Pick<IntroFilm, "genre">, projectId: string): Genre {
  return GENRES[film.genre ?? recommendGenre(projectId)];
}

const pick = (v: Loc | string | undefined, locale: "en" | "ko") => (v == null ? "" : typeof v === "string" ? v : v[locale] ?? v.en);

/** 대본(두 언어) → 틀이 받는 한 언어 장면. */
export function flattenScenes(film: IntroFilm, locale: "en" | "ko"): FlatScene[] {
  return film.scenes.map((sc: IntroScene): FlatScene => {
    const base = { data: sc.data, source: sc.source };
    switch (sc.kind) {
      case "hook": return { ...base, kind: "hook", label: pick(sc.label, locale), value: sc.value, line: pick(sc.line, locale), alarm: sc.alarm };
      case "story": return { ...base, kind: "story", line: pick(sc.line, locale), line2: pick(sc.line2, locale) };
      case "items": return { ...base, kind: "items", line: pick(sc.line, locale), items: sc.items.map((i) => ({ value: i.value, label: pick(i.label, locale), alarm: i.alarm })) };
      case "flow": return { ...base, kind: "flow", line: pick(sc.line, locale), nodes: sc.nodes.map((n) => pick(n, locale)) };
      case "terminal": return { ...base, kind: "terminal", command: sc.command, output: sc.output, line: pick(sc.line, locale) };
      case "alert": return { ...base, kind: "alert", title: pick(sc.title, locale), body: pick(sc.body, locale), line: pick(sc.line, locale), line2: pick(sc.line2, locale) };
      case "stats": return { ...base, kind: "stats", line: pick(sc.line, locale), stats: sc.stats.map((s) => ({ value: s.value, unit: pick(s.unit, locale), label: pick(s.label, locale) })) };
      case "ending": return { ...base, kind: "ending", line: pick(sc.line, locale), line2: pick(sc.line2, locale), name: pick(sc.name, locale) };
    }
  });
}

export function genreWork(film: IntroFilm, locale: "en" | "ko", meta: { id: string; title: string; handle: string; accent?: string | null; alarm?: string | null }): GenreWork {
  return { id: meta.id, title: meta.title, handle: meta.handle, locale, accent: meta.accent ?? null, alarm: meta.alarm ?? null, scenes: flattenScenes(film, locale) };
}
