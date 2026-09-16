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
ok("연결: 토큰이 없다", !paste.includes("nf_live_"));

// ── ② 고쳐달라기 프롬프트
const fix = buildDraftFixPrompt({
  projectId: "p1", title: "t", description: "a\nb", builderNote: "", demoHighlights: null,
  tags: [], contentType: "web-app", targetDevice: "desktop", deployUrl: "https://example.com",
  demoScript: null, demoAccess: null, note: "고쳐줘", code: CODE, origin: ORIGIN,
}, "ko");
ok("고쳐달라기: login에 코드가 실린다", fix.includes(`login ${CODE}`));
ok("고쳐달라기: check 단계가 있다", fix.includes("check --file"));
ok("고쳐달라기: 토큰이 없다", !fix.includes("nf_live_"));
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
