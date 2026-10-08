// 영상 틀이 스스로 그리는 한글 모으기 — `lib/introFilm/genres/koGlyphs.ts`를 만든다(2026-10-08).
//
// 왜: 한글 글꼴은 글자 묶음(unicode-range)별 파일로 나뉘어 있어서, 그리기 전에 "쓸 글자"를 알려 줘야 받는다.
// 대본 글자는 재생기가 넘기지만, 틀이 직접 그리는 표시(예시·출처·탑승구·반납 예정일…)는 틀 코드 안에만 있다.
// 손으로 적어 두면 틀을 고칠 때마다 빠진다 → 틀 코드의 따옴표 안 한글을 틀마다 모아 생성한다.
//
// 사용: `npm run intro:glyphs` — `npm test`(probe-intro-film-unit)가 생성물이 틀 코드와 어긋났는지 검사한다.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dirname, "../lib/introFilm/genres");
export const OUT = join(DIR, "koGlyphs.ts");
const NOT_GENRES = new Set(["ids.ts", "index.ts", "kit.ts", "types.ts", "koGlyphs.ts"]);

/** 틀 하나의 코드에서 따옴표·백틱 안 한글을 모은다(주석은 뺀다). */
function glyphsOf(code: string): string {
  const src = code.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((ln) => ln.replace(/(^|[^:"'`\\])\/\/.*$/, "$1")).join("\n");
  const set = new Set<string>();
  for (const m of src.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1/g)) for (const ch of m[2]) if (/[ᄀ-ᇿ㄰-㆏가-힣]/.test(ch)) set.add(ch);
  return [...set].sort().join("");
}

export function build(): string {
  const rows = readdirSync(DIR).filter((f) => f.endsWith(".ts") && !NOT_GENRES.has(f)).sort()
    .map((f) => `  ${f.replace(/\.ts$/, "")}: ${JSON.stringify(glyphsOf(readFileSync(join(DIR, f), "utf8")))},`);
  return [
    "// 생성물 — 손으로 고치지 말 것. `npm run intro:glyphs`(scripts/build-intro-glyphs.mts)가 틀 코드에서 만든다.",
    "// 틀이 스스로 그리는 한글(예시·출처 같은 표시) — 한국어 판을 그리기 전에 한글 글꼴의 그 글자 묶음을 받아 둔다.",
    "export const KO_GLYPHS: Record<string, string> = {",
    ...rows,
    "};",
    "",
  ].join("\n");
}

if (process.argv[1]?.endsWith("build-intro-glyphs.mts")) {
  writeFileSync(OUT, build());
  console.log("wrote", OUT);
}
