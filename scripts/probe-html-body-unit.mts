// 채팅창 AI가 글자로 넘긴 HTML의 입구 검사(2026-09-17). 네트워크·DB 없음.
//
// 지키는 것: ①잘린 HTML이 조용히 저장되지 않는다(이 길의 가장 흔한 실패 — AI 답변이
// 중간에 끊기면 반쪽짜리 작품이 올라간다) ②코드 울타리가 붙어 와도 살린다 ③만든 zip이
// **기존 번들 경로에 그대로 탄다**(진입점을 index.html로 찾아낸다).
import { htmlBodyIssue, htmlBodyToZip, stripCodeFence, HTML_BODY_MAX_BYTES } from "../lib/htmlBody";
import { expandZipBundle, pickZipAnchor } from "../lib/upload-safety";

let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail.slice(0, 160)}` : ""}`);
  if (!pass) failed++;
};

const FULL = `<!doctype html><html><head><title>t</title></head><body><h1>hi</h1></body></html>`;

// ── 통과해야 하는 것 ─────────────────────────────────────────────────────────
ok("(1a) 온전한 문서 통과", htmlBodyIssue(FULL) === null);
ok("(1b) </html> 없이 </body>만 있어도 통과", htmlBodyIssue(`<html><body>hi</body>`) === null);
ok("(1c) doctype만 소문자/대문자 섞여도 통과", htmlBodyIssue(`<!DOCTYPE HTML><HTML><BODY>x</BODY></HTML>`) === null);

// ── 되돌려보내야 하는 것 ─────────────────────────────────────────────────────
ok("(2a) 빈 문자열", htmlBodyIssue("")?.kind === "empty");
ok("(2b) 공백뿐", htmlBodyIssue("   \n\t ")?.kind === "empty");
ok("(2c) HTML이 아님(설명문)", htmlBodyIssue("여기 코드입니다")?.kind === "not-html");
ok("(2d) 조각만(문서가 아님)", htmlBodyIssue("<div>hello</div>")?.kind === "not-html");
// 잘림 = 여는 태그는 있는데 닫는 태그가 둘 다 없음.
ok("(2e) 잘린 문서", htmlBodyIssue(`<!doctype html><html><body><h1>hi`)?.kind === "truncated");
const big = `<html><body>${"x".repeat(HTML_BODY_MAX_BYTES)}</body></html>`;
const bigIssue = htmlBodyIssue(big);
ok("(2f) 상한 초과", bigIssue?.kind === "too-large");
ok("(2g) 초과 시 실제 바이트를 실어 준다", bigIssue?.kind === "too-large" && bigIssue.bytes > HTML_BODY_MAX_BYTES);

// ── 코드 울타리 ──────────────────────────────────────────────────────────────
ok("(3a) ```html 울타리 벗김", stripCodeFence("```html\n" + FULL + "\n```") === FULL);
ok("(3b) 울타리만 있고 언어 표시 없어도", stripCodeFence("```\n" + FULL + "\n```") === FULL);
ok("(3c) 닫는 울타리가 없어도 첫 줄은 뗀다", stripCodeFence("```html\n" + FULL) === FULL);
ok("(3d) 울타리 없는 원문은 그대로", stripCodeFence(FULL) === FULL);
ok("(3e) 울타리째 온 문서도 검사 통과", htmlBodyIssue("```html\n" + FULL + "\n```") === null);
// 울타리를 못 벗기면 첫 줄 백틱 때문에 "HTML이 아님"으로 거절됐을 것이다.
ok("(3f) 울타리째 온 조각은 여전히 거절", htmlBodyIssue("```html\n<div>x</div>\n```")?.kind === "not-html");

// ── 만든 zip이 기존 번들 경로에 그대로 타는가 ────────────────────────────────
const buf = await htmlBodyToZip(FULL);
const { entries, dropped } = await expandZipBundle(buf);
ok("(4a) 항목 하나", entries.length === 1, `${entries.length}개`);
ok("(4b) 이름이 index.html", entries[0]?.relativePath === "index.html", entries[0]?.relativePath);
ok("(4c) 내용 보존", new TextDecoder().decode(entries[0].data) === FULL);
ok("(4d) 버려진 비밀 파일 없음", dropped.length === 0);
const anchor = pickZipAnchor(entries);
ok("(4e) 진입점을 찾는다(=demo_url이 가리킬 곳)", anchor?.path === "index.html", JSON.stringify(anchor));
ok("(4f) 정적 사이트로 판정(runnable 아님)", anchor?.kind !== "runnable", anchor?.kind);
// 울타리째 저장되면 첫 줄에 백틱이 박힌 페이지가 올라간다 — zip 단계에서도 벗겨야 한다.
const fenced = await htmlBodyToZip("```html\n" + FULL + "\n```");
const fe = (await expandZipBundle(fenced)).entries;
ok("(4g) zip에도 울타리가 안 들어간다", new TextDecoder().decode(fe[0].data) === FULL);

console.log(failed ? `\n${failed}건 실패` : "\nALL PASS");
process.exit(failed ? 1 : 0);
