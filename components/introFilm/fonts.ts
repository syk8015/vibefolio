// 영상 틀 글꼴 — next/font가 우리 서버에서 내려준다(구글에 요청하지 않음). 미리보기·명함·워커 렌더가 같은 파일을 쓰므로
// 글자 폭이 같다. 틀은 논리 이름(redhatMono…)만 알고, 여기서 next/font가 붙인 실제 CSS 이름으로 바꿔 넘긴다.
// 한국어 판이면 글꼴마다 그 틀이 고른 한글 글꼴이 뒤에 붙는다(캔버스는 글자마다 다음 글꼴로 넘어간다).
//
// 틀이 17개가 되며(10-08) 글꼴도 틀마다 나눴다(faces/<틀>.ts) — 고른 틀의 글꼴 CSS만 불러온다.
// 한 파일에 다 두면 명함·작품 페이지마다 글꼴 30여 벌의 @font-face가 실린다.
import type { GenreId } from "@/lib/introFilm/genres/ids";
import { KO_GLYPHS } from "@/lib/introFilm/genres/koGlyphs";

/** 틀 하나의 글꼴 — 논리 이름 → 실제 CSS 이름(라틴), 같은 논리 이름 → 한국어 판에서 뒤에 붙는 한글 글꼴. */
export type FaceSet = { family: Record<string, string>; ko: Record<string, string> };

const FACES: Record<GenreId, () => Promise<{ faces: FaceSet }>> = {
  receipt: () => import("./faces/receipt"),
  terminal: () => import("./faces/terminal"),
  lcd: () => import("./faces/lcd"),
  ascii: () => import("./faces/ascii"),
  blueprint: () => import("./faces/blueprint"),
  chartrecorder: () => import("./faces/chartrecorder"),
  cutpaper: () => import("./faces/cutpaper"),
  gridnik: () => import("./faces/gridnik"),
  kinetic: () => import("./faces/kinetic"),
  sevenseg: () => import("./faces/sevenseg"),
  transit: () => import("./faces/transit"),
  boardingpass: () => import("./faces/boardingpass"),
  ticketstub: () => import("./faces/ticketstub"),
  cassette: () => import("./faces/cassette"),
  photobooth: () => import("./faces/photobooth"),
  vending: () => import("./faces/vending"),
  librarycard: () => import("./faces/librarycard"),
};

export async function genreFaces(id: GenreId): Promise<FaceSet> {
  return (await FACES[id]()).faces;
}

/** 논리 이름 → 캔버스 font-family 목록(한국어 판이면 그 글꼴의 한글 짝이 뒤에). pixelKo는 한글 점 글자용 그대로. */
export function genreFonts(faces: FaceSet, keys: readonly string[], locale: "en" | "ko"): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const base = faces.family[k] ?? "monospace";
    const ko = faces.ko[k];
    out[k] = locale === "ko" && ko && k !== "pixelKo" ? `${base}, ${ko}` : base;
  }
  return out;
}

/**
 * 그리기 전에 글꼴을 다 받는다(글자 폭을 재서 배치하므로). 3초가 지나면 있는 대로 그린다.
 * text = 영상에 나올 글자 전부 — 한글 글꼴은 글자 묶음(unicode-range)별로 나뉘어 있어서, 견본 몇 자만 받으면
 * 나머지 글자는 대체 글꼴로 재져 간격이 틀린다(10-02 교훈). 틀이 스스로 그리는 한글은 KO_GLYPHS(생성물)에서 더한다.
 */
export async function loadGenreFonts(genreId: string, faces: FaceSet, keys: readonly string[], locale: "en" | "ko", text = ""): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  const sample = "Aa0" + text.replace(/[\x00-\x7f]/g, "") + (locale === "ko" ? KO_GLYPHS[genreId] ?? "" : "");
  const specs: string[] = [];
  for (const k of keys) for (const w of [400, 500, 600, 700]) specs.push(`${w} 40px ${faces.family[k] ?? "monospace"}`);
  if (locale === "ko") for (const ko of new Set(keys.map((k) => faces.ko[k]).filter(Boolean))) for (const w of [400, 700]) specs.push(`${w} 40px ${ko}`);
  const all = Promise.all(specs.map((s) => document.fonts.load(s, sample).catch(() => [])));
  await Promise.race([all, new Promise((r) => setTimeout(r, 3000))]);
}
