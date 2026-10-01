// 프롬프트 3종에 **살아 있는 크리덴셜이 안 실리는지** 지키는 그물(2026-09-16).
//
// AGENTS.md 불변식: "raw 토큰을 프롬프트에 박지 않는다" — 프롬프트는 AI 채팅창에
// 붙여넣는 물건이라, 토큰이 한 번 들어가면 대화 기록에 영구히 남는다. 들어가는 것은
// 1회용 페어링 코드(`nf_code_`, 30분·1회)뿐이고 `login <코드>`가 서버에서 교환한다.
//
// 네트워크를 안 탄다 — 생성 함수를 직접 부르고 결과 문자열만 본다. 누가 실수로
// 토큰을 도로 심으면 여기서 `npm test`가 먼저 막는다.
//
// 재촬영 프롬프트의 curl 폴백은 2단계(교환→제출)라, 설명용 예시 `nf_live_…`가 한 번
// 등장하는 것이 정상이다 — 진짜 토큰 모양과 구분해서 검사한다.
import { pastePrompt } from "@/lib/connectSnippets";
import { buildDraftFixPrompt } from "@/lib/draftFixPrompt";
import { rerecordPrompt } from "@/lib/rerecordPrompt";

const CODE = "nf_code_TESTTESTTEST";
const ORIGIN = "https://nookframe.com";
let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail.slice(0, 160)}` : ""}`);
  if (!pass) failed++;
};

// ── ① 연결 프롬프트
const paste = pastePrompt(ORIGIN, "ko", CODE);
ok("연결: login에 코드가 실린다", paste.includes(`login ${CODE}`));
ok("연결: 1회용이라고 말한다", paste.includes("ONE-TIME pairing code"));
ok("연결: check 단계가 있다", paste.includes("check --file"));
// npm이 막힌 셸용 curl 길(2026-10-02)도 재촬영과 같은 2단계 — `nf_live_…`는 설명용 예시로만 나온다.
const realToken = /nf_live_[A-Za-z0-9_-]{10,}/;
ok("연결: 진짜 토큰 모양이 없다", !realToken.test(paste));
ok("연결: nf_live_는 설명용 예시로만 등장", (paste.match(/nf_live_/g) ?? []).length === 1 && paste.includes('{"token": "nf_live_…"}'));
ok("연결: npm이 막히면 curl 길(교환 → 검사 → 발행)", paste.includes("npx won't run") && paste.includes("/api/connect/exchange") && paste.includes("/api/ingest?dryRun=1"));
ok("연결: curl Bearer 자리엔 코드가 아니라 '방금 찍힌 토큰'", !paste.includes(`Bearer ${CODE}`) && paste.includes("Bearer <the token it just printed>"));
// 주인 인터뷰(2026-09-29, 필수) — 프롬프트가 먼저 묻게 하고, 필드 이름을 알려 준다.
ok("연결: 프로젝트를 먼저 훑고, 쉬운 말로 인터뷰한다", paste.indexOf("First, look around the project") < paste.indexOf("Then interview me") && paste.includes("plain everyday words"));
// 09-30 실사용 피드백: 덜 만든 백엔드 작품에 "가장 뿌듯했던 순간"·촬영 기술 질문이 돌아와 당황.
ok("연결: 앱의 '부분'을 묻는다(인생의 순간이 아니라)", paste.includes("a PART of the app, not a moment in my life"));
ok("연결: 덜 만든 작품이면 먼저 말하고 지금 올릴지 묻는다", paste.includes("work in progress"));
ok("연결: 인터뷰에 촬영 기술 질문을 섞지 않는다", paste.includes("Don't put filming mechanics in it"));
ok("연결: ownerInterview 필드를 알려 준다", paste.includes("ownerInterview — REQUIRED"));

// ── ② 고쳐달라기 프롬프트
const fix = buildDraftFixPrompt({
  projectId: "p1", title: "t", description: "a\nb", builderNote: "", demoHighlights: null,
  tags: [], contentType: "web-app", targetDevice: "desktop", deployUrl: "https://example.com",
  demoScript: null, demoAccess: null, ownerInterview: null, note: "고쳐줘", code: CODE, origin: ORIGIN,
  language: null, appLanguages: null, translations: null,
}, "ko");
ok("고쳐달라기: 인터뷰가 없으면 먼저 묻게 한다", fix.includes('"ownerInterview" is missing'));
const fixWith = buildDraftFixPrompt({
  projectId: "p1", title: "t", description: "a\nb", builderNote: "", demoHighlights: null,
  tags: [], contentType: "web-app", targetDevice: "desktop", deployUrl: "https://example.com",
  demoScript: null, demoAccess: null, note: "고쳐줘", code: CODE, origin: ORIGIN,
  ownerInterview: { proudMoment: "a", howIUse: "b", mustSee: "c", hide: ["금액"] },
  language: "ko", appLanguages: ["ko"],
  translations: { en: { title: "T", description: "line one\nline two", builderNote: "" } },
}, "ko");
ok("고쳐달라기: 인터뷰가 있으면 그대로 싣는다", fixWith.includes('"proudMoment": "a"') && fixWith.includes("keep them word for word"));
// 작품 두 언어(2026-09-29, 필수) — 없던 초안은 채우게, 있던 초안은 그대로 싣고 맞춰 고치게.
ok("연결: 두 언어 칸을 알려 준다", paste.includes("language — REQUIRED") && paste.includes("appLanguages — REQUIRED") && paste.includes("translation — REQUIRED"));
ok("연결: 영어가 없으면 영어판을 물어본다", paste.includes("Should I add an English version of the app?"));
ok("고쳐달라기: 두 언어 칸이 없으면 채우게 한다", fix.includes("two-language fields are missing"));
ok("고쳐달라기: 있으면 다른 언어 판을 싣는다", fixWith.includes('"title": "T"') && fixWith.includes('"appLanguages": [') && fixWith.includes("in step with your changes"));
ok("고쳐달라기: login에 코드가 실린다", fix.includes(`login ${CODE}`));
ok("고쳐달라기: check 단계가 있다", fix.includes("check --file"));
ok("고쳐달라기: 진짜 토큰 모양이 없다", !realToken.test(fix) && (fix.match(/nf_live_/g) ?? []).length === 1);
ok("고쳐달라기: npm이 막히면 curl 길", fix.includes("npx won't run") && fix.includes(`{"code": "${CODE}"}`) && !fix.includes(`Bearer ${CODE}`));
ok("고쳐달라기: draftId가 실린다", fix.includes('"draftId": "p1"'));

// ── ③ 재촬영 프롬프트
const re = rerecordPrompt(ORIGIN, {
  projectId: "p2", title: "t", description: "d", demoUrl: "https://example.com",
  contentType: "web-app", tags: [], demoAccess: null, currentScript: null, note: "불만",
}, "ko", CODE);
ok("재촬영: login에 코드가 실린다", re.includes(`login ${CODE}`));
ok("재촬영: curl 폴백이 교환 URL을 먼저 부른다", re.includes("/api/connect/exchange"));
ok("재촬영: 교환 본문에 코드가 실린다", re.includes(`{"code": "${CODE}"}`));
ok("재촬영: Bearer 자리엔 코드가 아니라 '방금 찍힌 토큰'", re.includes("Bearer <the token it just printed>"));
ok("재촬영: Bearer 줄에 코드가 안 박힌다", !re.includes(`Bearer ${CODE}`));
// `nf_live_…`(말줄임표)는 "여기에 토큰이 찍힌다"는 설명용 예시라 정상 — 진짜 토큰 모양
// (nf_live_ 뒤에 base64url이 길게 붙은 것)만 없어야 한다.
ok("재촬영: 진짜 토큰 모양이 없다", !/nf_live_[A-Za-z0-9_-]{10,}/.test(re),
  re.match(/nf_live_\S*/)?.[0] ?? "");
ok("재촬영: nf_live_는 설명용 예시로만 등장", (re.match(/nf_live_/g) ?? []).length === 1 && re.includes('{"token": "nf_live_…"}'));

console.log(failed ? `\n${failed}건 실패` : "\nALL PASS");
process.exit(failed ? 1 : 0);
