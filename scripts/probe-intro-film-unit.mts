// 소개 영상(화면 없는 작품) — 대본 검사·영상 틀 고르기·틀의 결정성 규칙. 네트워크·DB 없음.
//
// 지키는 것: ①예시 대본 두 개가 통과하고, 흔한 실수(한 언어만·너무 김·숫자 출처 없음)는 칸 경로와 함께
// 거절된다 ②영상 틀: 모르는 틀은 거절, 추천은 작품마다 늘 같고 주인이 이미 쓴 틀을 피한다, 두 언어로 펼쳐진다
// ③틀 코드(lib/introFilm/**)에 시계·타이머·난수가 없다(미리보기·명함·영상 파일이 같은 프레임을 그리려면 render(t)가 t만 봐야 한다).
import { readdirSync, readFileSync } from "node:fs";
import { introFilmIssue, filmSeconds, honestyLabel, type IntroFilm } from "../lib/introFilm/schema";
import { GENRE_IDS, recommendGenre } from "../lib/introFilm/genres/ids";
import { flattenScenes, GENRES } from "../lib/introFilm/genres";
import { SAMPLE_HOME_CLIMATE, SAMPLE_CLI } from "../lib/introFilm/samples";
import { introFilmHash } from "../lib/introFilm/hash";

let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail.slice(0, 160)}` : ""}`);
  if (!pass) failed++;
};
const clone = (f: IntroFilm) => structuredClone(f) as unknown as { style: Record<string, string>; scenes: Record<string, unknown>[] };

// ── 1. 대본 검사 ───────────────────────────────────────────────────────────────
ok("(1a) 온습도계 예시 통과", introFilmIssue(SAMPLE_HOME_CLIMATE) === null, JSON.stringify(introFilmIssue(SAMPLE_HOME_CLIMATE)));
ok("(1b) CLI 예시 통과", introFilmIssue(SAMPLE_CLI) === null, JSON.stringify(introFilmIssue(SAMPLE_CLI)));
ok("(1c) 길이 20–40초", filmSeconds(SAMPLE_HOME_CLIMATE) >= 20 && filmSeconds(SAMPLE_HOME_CLIMATE) <= 40, String(filmSeconds(SAMPLE_HOME_CLIMATE)));

ok("(2a) 객체가 아님", introFilmIssue("film")?.path === "introFilm");
{ const f = clone(SAMPLE_HOME_CLIMATE); f.style.mood = "neon"; ok("(2b) 모르는 분위기", introFilmIssue(f)?.path === "introFilm.style.mood"); }
{ const f = clone(SAMPLE_HOME_CLIMATE); f.scenes = f.scenes.slice(0, 2); ok("(2c) 장면 2개", introFilmIssue(f)?.path === "introFilm.scenes"); }
{ const f = clone(SAMPLE_HOME_CLIMATE); f.scenes[0].line = "Always too damp."; ok("(2d) 한 언어만(문자열)", introFilmIssue(f)?.path === "introFilm.scenes[0].line"); }
{ const f = clone(SAMPLE_HOME_CLIMATE); f.scenes[0].line = { en: "x", ko: "" }; ok("(2e) 한국어 빈칸", introFilmIssue(f)?.path === "introFilm.scenes[0].line.ko"); }
{ const f = clone(SAMPLE_HOME_CLIMATE); f.scenes[0].line = { en: "x".repeat(61), ko: "y" }; const e = introFilmIssue(f); ok("(2f) 너무 김 → 몇 자인지 알려줌", e?.path === "introFilm.scenes[0].line.en" && /61 > 60/.test(e.message), e?.message); }
{ const f = clone(SAMPLE_HOME_CLIMATE); delete f.scenes[0].data; ok("(2g) 숫자 장면에 예시/실측 표시 없음", introFilmIssue(f)?.path === "introFilm.scenes[0].data"); }
{ const f = clone(SAMPLE_HOME_CLIMATE); delete f.scenes[4].source; ok("(2h) 실측인데 출처 없음", introFilmIssue(f)?.path === "introFilm.scenes[4].source"); }
{ const f = clone(SAMPLE_HOME_CLIMATE); f.scenes[0].kind = "video"; ok("(2i) 모르는 장면 종류", introFilmIssue(f)?.path === "introFilm.scenes[0].kind"); }
{ const f = clone(SAMPLE_HOME_CLIMATE); (f.scenes[1].items as unknown[]).length = 1; ok("(2j) 항목 1개", introFilmIssue(f)?.path === "introFilm.scenes[1].items"); }
{ const f = clone(SAMPLE_CLI); (f.scenes[1].output as string[]).push(...Array(8).fill("x")); ok("(2k) 명령 창 출력 9줄 이상", introFilmIssue(f)?.path === "introFilm.scenes[1].output"); }
{ const f = clone(SAMPLE_HOME_CLIMATE); f.scenes[2] = { kind: "flow", nodes: [{ en: "A", ko: "가" }], line: { en: "x", ko: "y" } }; ok("(2l) 흐름 칸 1개", introFilmIssue(f)?.path === "introFilm.scenes[2].nodes"); }

// ── 3. 정직 표시 ───────────────────────────────────────────────────────────────
ok("(3a) 예시 → Sample data", honestyLabel(SAMPLE_HOME_CLIMATE.scenes[0], "en") === "Sample data · Illustration");
ok("(3b) 실측 → 출처", honestyLabel(SAMPLE_HOME_CLIMATE.scenes[4], "ko") === "실측 · web/lib/alerts.ts");
ok("(3c) 숫자 없는 장면은 표시 없음", honestyLabel(SAMPLE_HOME_CLIMATE.scenes[5], "en") === "");

// ── 4. 영상 틀(장르) ─────────────────────────────────────────────────────────────
{ const f = clone(SAMPLE_HOME_CLIMATE) as unknown as Record<string, unknown>; f.genre = "neon"; ok("(4a) 모르는 틀 → 칸 경로", introFilmIssue(f)?.path === "introFilm.genre"); }
for (const g of GENRE_IDS) ok(`(4b) 틀 ${g} 통과`, introFilmIssue({ ...SAMPLE_HOME_CLIMATE, genre: g }) === null);
ok("(4c) 목록과 그림 코드가 같은 틀", GENRE_IDS.every((g) => GENRES[g]?.id === g) && Object.keys(GENRES).length === GENRE_IDS.length);
ok("(4d) 추천은 작품마다 늘 같다", recommendGenre("abc-123") === recommendGenre("abc-123"));
{ const used = GENRE_IDS.slice(0, GENRE_IDS.length - 1); ok("(4e) 추천은 주인이 쓴 틀을 피한다", recommendGenre("abc-123", used) === GENRE_IDS[GENRE_IDS.length - 1]); }
{ const ko = flattenScenes(SAMPLE_HOME_CLIMATE, "ko"), en = flattenScenes(SAMPLE_HOME_CLIMATE, "en");
  const h0 = ko[0] as { line: string }, e0 = en[0] as { line: string };
  ok("(4f) 대본을 한 언어로 펼친다", h0.line === "늘 너무 습해요." && e0.line === "Always too damp." && ko.length === SAMPLE_HOME_CLIMATE.scenes.length); }

// ── 4.5 대본 지문(워커가 다시 만들지 가르는 값) ─────────────────────────────────────
{
  const a = introFilmHash(SAMPLE_HOME_CLIMATE);
  const reordered = JSON.parse(JSON.stringify({ scenes: SAMPLE_HOME_CLIMATE.scenes, style: { mood: "cinematic", text: "bignum" } }));
  ok("(4i) 키 순서가 달라도 같은 지문", introFilmHash(reordered) === a);
  ok("(4j) 스타일을 바꾸면 지문이 바뀜", introFilmHash({ ...SAMPLE_HOME_CLIMATE, style: { text: "hand", mood: "cinematic" } }) !== a);
  const edited = clone(SAMPLE_HOME_CLIMATE); edited.scenes[0].line = { en: "Too damp.", ko: "너무 습해요." };
  ok("(4k) 글자를 고치면 지문이 바뀜", introFilmHash(edited) !== a);
  ok("(4l) 틀을 바꾸면 지문이 바뀜", introFilmHash({ ...SAMPLE_HOME_CLIMATE, genre: "receipt" }) !== introFilmHash({ ...SAMPLE_HOME_CLIMATE, genre: "lcd" }));
}

// ── 5. 틀의 결정성: 시계·타이머·난수 금지 ─────────────────────────────────────────
const BANNED: [RegExp, string][] = [
  [/\bDate\b/, "Date"], [/performance\.now/, "performance.now"], [/requestAnimationFrame/, "requestAnimationFrame"],
  [/setTimeout|setInterval/, "타이머"], [/Math\.random/, "Math.random"], [/@keyframes|animation\s*:/, "CSS 애니메이션"],
];
for (const dir of ["", "genres/"]) {
  for (const file of readdirSync(new URL(`../lib/introFilm/${dir}`, import.meta.url))) {
    if (!file.endsWith(".ts")) continue;
    const code = readFileSync(new URL(`../lib/introFilm/${dir}${file}`, import.meta.url), "utf8")
      .split("\n").filter((ln) => !ln.trim().startsWith("//")).join("\n");
    const hit = BANNED.find(([re]) => re.test(code));
    ok(`(5) ${dir}${file}에 시계·타이머·난수 없음`, !hit, hit?.[1]);
  }
}

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
