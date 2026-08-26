// 한글 세리프 서브셋 빌더 (2026-08-26).
//
// 왜: 구글은 한글 Hahmlet을 92개 unicode-range 조각으로 배달한다. 랜딩이 세리프로
// 그리는 한글은 **58자**뿐인데, 그 58자가 조각 7개에 흩어져 있어 45KB짜리 조각을
// 7개(≈320KB) 통째로 받았다. 우리가 쓰는 글자만 담은 파일 하나로 대신 준다.
//
// 어떻게: 정적 카피에 등장하는 한글을 전부 긁어 pyftsubset으로 Hahmlet 가변폰트를
// 잘라낸다. 만들어진 face는 **한글 범위만** 선언하고 스택 맨 앞에 둔다(globals.css) —
// 여기 없는 글자(유저가 올린 작품 제목 등)는 그대로 구글 Hahmlet 조각으로 넘어간다.
// 즉 커버리지가 빠져도 글꼴이 깨지지 않고 조각 하나를 더 받을 뿐이다.
//
// 사용:
//   node scripts/build-font-subset.mjs           # 생성
//   node scripts/build-font-subset.mjs --check   # 재생성 없이 누락 글자만 검사
//
// ⚠️ 한국어 카피를 새로 쓰면 다시 돌릴 것. --check가 CI/프로브에서 누락을 잡는다.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public/fonts/hahmlet-ko-subset.woff2");
const CACHE = join(ROOT, "node_modules/.cache/nookframe-fonts");
const SRC_TTF = join(CACHE, "Hahmlet[wght].ttf");
// 축을 잘라낸 중간 산출물. Hahmlet의 wght는 100~900인데 화면에서 실제로 쓰는 건
// 400~900뿐이다 — 100~300 구간 델타를 버리는 것만으로 192KB → 132KB (실측).
const TRIMMED_TTF = join(CACHE, "Hahmlet-wght400-900.ttf");
const VENV = join(CACHE, "venv");
const PYFTSUBSET = join(VENV, "bin/pyftsubset");
const FONT_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/hahmlet/Hahmlet%5Bwght%5D.ttf";

// 정적 카피가 사는 곳. 유저 콘텐츠는 대상이 아니다(런타임에 구글 조각으로 처리).
const GLOBS = [
  "lib/i18n/dictionaries/ko.ts",
  "lib/loggedInTaglines.ts",
  "lib/connectSnippets.ts",
  "lib/rerecordPrompt.ts",
  "lib/demo-failure.ts",
  "lib/email-templates.ts",
  "app/**/*.tsx",
  "components/**/*.tsx",
];

// 현대 한글 음절 + 자모 + 호환 자모. 서브셋 face의 unicode-range와 같아야 한다.
const HANGUL_RANGES = [
  [0x1100, 0x11ff],
  [0x3130, 0x318f],
  [0xa960, 0xa97f],
  [0xac00, 0xd7a3],
  [0xd7b0, 0xd7ff],
];
const isHangul = (cp) => HANGUL_RANGES.some(([a, b]) => cp >= a && cp <= b);

function collectGlyphs() {
  const files = execFileSync("bash", ["-lc", `cd ${JSON.stringify(ROOT)} && ls ${GLOBS.map((g) => g).join(" ")} 2>/dev/null`], {
    encoding: "utf8",
    shell: false,
  })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const set = new Set();
  for (const f of files) {
    let text;
    try {
      text = readFileSync(join(ROOT, f), "utf8");
    } catch {
      continue;
    }
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (isHangul(cp)) set.add(ch);
    }
  }
  return { files: files.length, glyphs: [...set].sort() };
}

function ensureTools() {
  mkdirSync(CACHE, { recursive: true });
  if (!existsSync(PYFTSUBSET)) {
    console.log("[font] fonttools 준비 중 (한 번만)…");
    execFileSync("python3", ["-m", "venv", VENV], { stdio: "inherit" });
    execFileSync(join(VENV, "bin/pip"), ["-q", "install", "fonttools", "brotli"], { stdio: "inherit" });
  }
  if (!existsSync(SRC_TTF)) {
    console.log("[font] Hahmlet 원본 내려받는 중…");
    execFileSync("curl", ["-fsSL", FONT_URL, "-o", SRC_TTF], { stdio: "inherit" });
  }
}

const { files, glyphs } = collectGlyphs();
console.log(`[font] 정적 카피 ${files}개 파일에서 한글 ${glyphs.length}자 수집`);

if (process.argv.includes("--check")) {
  if (!existsSync(OUT)) {
    console.error(`✗ ${OUT} 가 없어요 — \`node scripts/build-font-subset.mjs\` 로 먼저 만드세요.`);
    process.exit(1);
  }
  ensureTools();
  // 만들어진 woff2가 실제로 담고 있는 코드포인트를 읽어 대조한다.
  const py = `
import sys
from fontTools.ttLib import TTFont
f = TTFont(${JSON.stringify(OUT)})
have = set()
for t in f['cmap'].tables:
    have |= set(t.cmap.keys())
print(",".join(str(c) for c in sorted(have)))
`;
  const have = new Set(
    execFileSync(join(VENV, "bin/python"), ["-c", py], { encoding: "utf8" })
      .trim()
      .split(",")
      .filter(Boolean)
      .map(Number),
  );
  const missing = glyphs.filter((g) => !have.has(g.codePointAt(0)));
  if (missing.length) {
    console.error(`✗ 서브셋에 없는 글자 ${missing.length}자: ${missing.slice(0, 40).join("")}`);
    console.error("  → node scripts/build-font-subset.mjs 로 다시 만드세요.");
    process.exit(1);
  }
  console.log(`✓ 정적 카피의 한글 ${glyphs.length}자가 모두 서브셋에 있어요 (${(statSync(OUT).size / 1024).toFixed(0)}KB).`);
  process.exit(0);
}

ensureTools();
mkdirSync(dirname(OUT), { recursive: true });
const unicodes = glyphs.map((g) => `U+${g.codePointAt(0).toString(16).toUpperCase()}`).join(",");
const listFile = join(CACHE, "glyphs.txt");
writeFileSync(listFile, unicodes);

// 화면에서 쓰는 굵기는 400·500·600·700·900(실측) — 가변 축은 살리되 범위만 좁힌다.
// 굵기별 static 파일 5개보다 축 하나가 훨씬 작다.
if (!existsSync(TRIMMED_TTF)) {
  execFileSync(join(VENV, "bin/python"), [
    "-m", "fontTools.varLib.instancer", SRC_TTF, "wght=400:900", "-o", TRIMMED_TTF,
  ], { stdio: "inherit" });
}

execFileSync(
  PYFTSUBSET,
  [
    TRIMMED_TTF,
    `--unicodes-file=${listFile}`,
    "--flavor=woff2",
    `--output-file=${OUT}`,
    // 힌팅은 웹 배달본에 불필요(구글이 서빙하는 조각도 힌팅이 없다).
    "--no-hinting",
    // 한글에 필요한 것만: 자모 합성·커닝·합자. `*`는 안 쓰는 CJK 기능표까지 싣는다.
    "--layout-features=ccmp,kern,liga,calt",
    "--name-IDs=1,2,3,4,6",
    "--notdef-outline",
  ],
  { stdio: "inherit" },
);

const kb = (statSync(OUT).size / 1024).toFixed(0);
console.log(`[font] ✓ ${OUT.replace(ROOT + "/", "")} · ${kb}KB · ${glyphs.length}자`);
console.log("[font] globals.css의 @font-face(HahmletKR)가 이 파일을 가리킵니다.");
