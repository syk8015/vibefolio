// 작품 두 언어 판정(2026-09-29, 필수 게이트) — lib/workLanguages.ts. 네트워크 없음.
// 지키는 것: 기본 언어·앱 화면 언어·다른 언어 판 글이 다 있어야 통과하고, 앱이 못 보여주는
// 언어는 장면마다 자막이 있어야 한다(뒤로가기 장면·직접 만든 영상은 면제). 대본 정규화가
// 자막을 버리지 않는지, 세 칸이 공개 칸 목록에 있는지도 본다(명함이 익명 키로 읽는다).
import {
  judgeWorkLanguages, normalizeLocale, normalizeAppLanguages, captionLocalesNeeded, filmLocales,
  captionIssue, readTranslations, CAPTION_MAX,
  buildCaptionTrack, normalizeCaptionTrack, normalizeLocaleVideos, filmPlan,
} from "../lib/workLanguages";
import { coalesceScrolls } from "../local-runner/script";
import { normalizeDemoScript } from "../lib/demoScript";
import { PUBLIC_PROJECT_COLUMNS, PRIVATE_PROJECT_COLUMNS } from "../lib/projectColumns";

let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

const en = { title: "Home Climate Monitor", description: "Every room, live\nPings my phone when something's off" };
const step = (goal: string, caption?: Record<string, string>, action = "click") =>
  ({ goal, action, selector: `#${goal}`, ...(caption ? { caption } : {}) });
const script = (steps: unknown[]) => normalizeDemoScript({ steps })!;
const judge = (over: Record<string, unknown>) =>
  judgeWorkLanguages({ language: "ko", appLanguages: ["ko"], translation: en, script: null, hasOwnVideo: false, ...over } as Parameters<typeof judgeWorkLanguages>[0]);

// 언어 이름 받기
ok("ko-KR·Korean·한국어 → ko", ["ko-KR", "Korean", "한국어", " KO "].every((v) => normalizeLocale(v) === "ko"));
ok("en-US·English → en", ["en-US", "English", "eng"].every((v) => normalizeLocale(v) === "en"));
ok("ja → null", normalizeLocale("ja") === null);
ok('앱 언어 ["en","ko","ja"] → ko,en 순서', normalizeAppLanguages(["en", "ko", "ja"])?.join(",") === "ko,en");
ok("앱 언어 [] → 빈 목록(답은 한 것)", normalizeAppLanguages([])?.length === 0);
ok("앱 언어 없음 → null", normalizeAppLanguages(undefined) === null);
ok('앱 언어 글자 "ko, en" → 목록', normalizeAppLanguages("ko, en")?.join(",") === "ko,en");
ok("자막 언어: 한국어뿐 → en", captionLocalesNeeded(["ko"]).join(",") === "en");
ok("자막 언어: 둘 다 → 없음", captionLocalesNeeded(["ko", "en"]).length === 0);
ok("자막 언어: 둘 다 아님 → 둘 다", captionLocalesNeeded([]).join(",") === "ko,en");
ok("촬영 언어: 둘 다 → 두 번", filmLocales(["en", "ko"]).join(",") === "ko,en");

// 게이트 순서·사유
ok("language 없음 → language-missing", judge({ language: undefined }).issue?.kind === "language-missing");
{
  const r = judge({ language: "ja" });
  ok("language ja → language-invalid(받은 값 포함)", r.issue?.kind === "language-invalid" && r.issue.got === "ja");
}
ok("appLanguages 없음 → app-languages-missing", judge({ appLanguages: undefined }).issue?.kind === "app-languages-missing");
{
  const r = judge({ translation: undefined });
  ok("translation 없음 → 다른 언어(en)로 missing", r.issue?.kind === "translation" && r.issue.locale === "en" && r.issue.issue.kind === "missing");
}
{
  const r = judge({ language: "en", translation: undefined });
  ok("기본 en이면 다른 언어는 ko", r.issue?.kind === "translation" && r.issue.locale === "ko");
}
{
  const r = judge({ translation: { title: "T", description: "one paragraph only" } });
  ok("translation 소개글 한 줄 → 3줄 규격 거절", r.issue?.kind === "translation" && r.issue.issue.kind === "description-shape");
}
ok("translation 제목 없음 → title-missing", (() => {
  const r = judge({ translation: { description: en.description } });
  return r.issue?.kind === "translation" && r.issue.issue.kind === "title-missing";
})());

// 자막
{
  const s = script([step("a", { en: "One" }), step("b"), step("c", { en: "Three" }), { goal: "back", action: "navigate", to: "back" }]);
  const r = judge({ script: s });
  ok("한국어뿐 앱 + 2번 장면 영어 자막 없음 → 거절(2번만 짚음, 뒤로가기 면제)",
    r.issue?.kind === "captions" && r.issue.issue.kind === "missing" && r.issue.issue.steps.join(",") === "2", JSON.stringify(r.issue));
}
{
  const s = script([step("a", { en: "One" }), step("b", { en: "Two" })]);
  ok("모든 장면에 영어 자막 → 통과", !judge({ script: s }).issue);
  ok("둘 다 되는 앱은 자막 없어도 통과", !judge({ appLanguages: ["ko", "en"], script: script([step("a"), step("b")]) }).issue);
  ok("직접 만든 영상은 자막 면제", !judge({ script: script([step("a")]), hasOwnVideo: true }).issue);
}
{
  const long = "x".repeat(CAPTION_MAX + 1);
  const r = captionIssue(script([step("a", { en: long })]), ["en"]);
  ok(`자막 ${CAPTION_MAX}자 넘음 → too-long`, r?.kind === "too-long" && r.step === 1);
}
{
  const r = captionIssue(script([step("a", { ko: "하나" })]), ["ko", "en"]);
  ok("둘 다 아닌 앱: 한국어는 있고 영어가 빠지면 영어를 짚음", r?.kind === "missing" && r.locale === "en");
}

// 대본 정규화가 자막을 지키는지
{
  const s = normalizeDemoScript({ steps: [{ goal: "a", caption: { en: "  Every   room ", fr: "x" } }] });
  ok("정규화: 자막 공백 정리·ko/en만 남김", s?.steps[0].caption?.en === "Every room" && !("fr" in (s?.steps[0].caption ?? {})), JSON.stringify(s?.steps[0]));
  const s2 = normalizeDemoScript({ steps: [{ goal: "a", caption: "어느 언어인지 모름" }] });
  ok("정규화: 글자 하나짜리 자막은 버림(언어를 추측하지 않음)", !s2?.steps[0].caption);
}

// 저장된 값 읽기
{
  const tr = readTranslations({ en: { ...en, builderNote: "I check it daily" }, ko: "broken" });
  ok("저장된 번역 읽기: 모양 맞는 언어만", !!tr.en && !tr.ko && tr.en.builderNote === "I check it daily");
}


// ── 2단계: 촬영 계획·자막 시간표 ────────────────────────────────────────────
{
  const p = (a: Parameters<typeof filmPlan>[0], b: Parameters<typeof filmPlan>[1]) => JSON.stringify(filmPlan(a, b));
  ok("계획: 옛 작품(칸 없음) → 영어 브라우저 한 번, 자막 없음", p(null, null) === JSON.stringify({ main: "en", extra: null, captions: [] }));
  ok("계획: 한국어뿐 → ko로 한 번 + en 자막", p("ko", ["ko"]) === JSON.stringify({ main: "ko", extra: null, captions: ["en"] }));
  ok("계획: 영어뿐(주인 ko) → en으로 한 번 + ko 자막", p("ko", ["en"]) === JSON.stringify({ main: "en", extra: null, captions: ["ko"] }));
  ok("계획: 둘 다(주인 ko) → ko 기본 + en 한 번 더", p("ko", ["ko", "en"]) === JSON.stringify({ main: "ko", extra: "en", captions: [] }));
  ok("계획: 둘 다(주인 en) → en 기본 + ko 한 번 더", p("en", ["ko", "en"]) === JSON.stringify({ main: "en", extra: "ko", captions: [] }));
  ok("계획: 둘 다 아님 → en 한 번 + 두 언어 자막", p("ko", []) === JSON.stringify({ main: "en", extra: null, captions: ["ko", "en"] }));
}
{
  const sc = script([
    step("a", { en: "One" }), step("b", { en: "Two" }), { goal: "back", action: "navigate", to: "back" },
    step("c"), step("d", { en: "Four" }),
  ]);
  const t = buildCaptionTrack(
    [{ step: 1, atSec: 3.02 }, { step: 2, atSec: 7.4 }, { step: 3, atSec: 10 }, { step: 4, atSec: 12.1 }, { step: 5, atSec: 16 }, { step: 1, atSec: 30 }],
    sc, ["en"], 20,
  );
  const cues = t.en ?? [];
  ok("시간표: 첫 자막은 0초부터(인트로 동안에도)", cues[0]?.start === 0 && cues[0]?.end === 7.4, JSON.stringify(cues));
  ok("시간표: 뒤로가기는 경계가 아니다(2번 자막이 4번 시작까지)", cues[1]?.text === "Two" && cues[1]?.end === 12.1);
  ok("시간표: 자막 없는 장면은 빈칸, 마지막은 필름 끝까지", cues.length === 3 && cues[2]?.start === 16 && cues[2]?.end === 20);
  ok("시간표: 같은 장면 두 번 표시는 첫 번째만", !cues.some((c) => c.start === 30));
  const short = buildCaptionTrack([{ step: 1, atSec: 3 }, { step: 2, atSec: 25 }], sc, ["en"], 20);
  ok("시간표: 필름 밖에서 시작한 장면은 자막 없음", short.en?.length === 1 && short.en[0].end === 20, JSON.stringify(short));
  ok("시간표: 자막 언어가 없으면 빈 시간표", Object.keys(buildCaptionTrack([{ step: 1, atSec: 1 }], sc, [], 20)).length === 0);
}
{
  const n = normalizeCaptionTrack({ en: [{ start: 0, end: 4, text: " Hi  there " }, { start: 3, end: 5, text: "overlap" }, { start: 5, end: 99, text: "too long film" }], fr: [{ start: 0, end: 1, text: "x" }] });
  ok("서버 검사: 공백 정리·겹침·필름 밖·모르는 언어 버림", n?.en?.length === 1 && n.en[0].text === "Hi there" && !("fr" in (n ?? {})), JSON.stringify(n));
  ok("서버 검사: 빈 값 → null", normalizeCaptionTrack({ en: [] }) === null && normalizeCaptionTrack("x") === null);
  ok("다른 언어 영상: https만", JSON.stringify(normalizeLocaleVideos({ en: "https://cdn.x/demo-en-1.mp4", ko: "http://x" })) === JSON.stringify({ en: "https://cdn.x/demo-en-1.mp4" }));
}
{
  // 스크롤 합치기가 장면 시작 표시를 삼키지 않는다(자막 시각이 앞 장면으로 새면 안 된다).
  const merged = coalesceScrolls([
    { kind: "scroll", dy: 300 }, { kind: "scroll", dy: 200, step: 2 }, { kind: "scroll", dy: 10 },
    { kind: "click", selector: "#x" }, { kind: "scroll", dy: 5, step: 3 },
  ]);
  ok("스크롤 합치기: 장면 표시가 있는 스크롤은 새 묶음", merged.length === 4 && merged[1].kind === "scroll" && merged[1].step === 2 && (merged[1] as { dy: number }).dy === 210, JSON.stringify(merged));
  ok("스크롤 합치기: 장면 표시가 있으면 짧은 스크롤도 남긴다", merged[3]?.step === 3);
}

// 칸 공개 여부 — 명함·작품 페이지가 익명 키로 읽어야 보는 사람 언어 판을 고른다.
for (const c of ["primary_locale", "app_locales", "translations", "demo_captions", "demo_locale_videos"]) {
  ok(`${c}는 공개 칸`, (PUBLIC_PROJECT_COLUMNS as readonly string[]).includes(c) && !(PRIVATE_PROJECT_COLUMNS as readonly string[]).includes(c));
}

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
