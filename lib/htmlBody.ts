// 채팅창 AI가 **파일 대신 글자로** 작품을 넘기는 길(2026-09-17 사용자 확정).
//
// 왜 필요한가: 셸 없는 AI는 우리 서버에 파일을 올릴 수 없다. 원래는 "아티팩트면
// 공개 링크를 주라"가 답이었는데, 09-17 실측에서 **Claude 아티팩트 링크는 봇 검사에
// 막혀 촬영이 아예 불가능**하다는 게 드러났다. 그래서 아티팩트로 만든 사람에게 남은
// 길이 "사람이 손으로 내려받아 /publish에 올리기" 하나뿐이 됐다 — 그 4단계를 없앤다.
//
// 설계: 새 저장 경로를 만들지 않는다. 받은 HTML을 `index.html` 하나짜리 zip으로 바꿔
// **기존 번들 경로에 그대로 태운다**. 경로 검사·prefix assert·zip 폭탄 캡·옛 파일
// 정리가 전부 재사용된다(lib/ingestStore.ts·upload-safety.ts를 건드리지 않는다).
// /publish 페이지가 브라우저에서 .html 한 장을 zip으로 감싸는 것과 같은 수법이다.

/**
 * HTML 본문 상한. Vercel 요청 본문이 ~4.5MB이고 JSON 문자열로 감싸면 이스케이프로
 * 더 불어난다. 그리고 이 길은 애초에 **파일 하나짜리 작품**용이다 — 그보다 큰 것은
 * AI 답변이 중간에 잘리는 쪽이 먼저 문제가 된다.
 */
export const HTML_BODY_MAX_BYTES = 2 * 1024 * 1024;

export type HtmlBodyIssue =
  | { kind: "empty" }
  | { kind: "too-large"; bytes: number }
  | { kind: "not-html" }
  | { kind: "truncated" };

/**
 * ```html … ``` 울타리를 벗긴다. AI가 코드 블록째 보내는 일이 흔하고, 그대로 저장하면
 * 첫 줄에 백틱이 박힌 깨진 페이지가 올라간다. 고치기는 쉬운데 사람이 원인을 못 찾는
 * 종류의 실패라 입구에서 받아준다.
 */
export function stripCodeFence(raw: string): string {
  const t = raw.trim();
  if (!t.startsWith("```")) return t;
  // 첫 줄(```html 등)과 마지막 울타리를 떼어낸다. 닫는 울타리가 없으면 첫 줄만.
  const nl = t.indexOf("\n");
  if (nl < 0) return t;
  const body = t.slice(nl + 1);
  const close = body.lastIndexOf("```");
  return (close >= 0 ? body.slice(0, close) : body).trim();
}

/** 저장해도 되는 HTML인가. 통과면 null, 아니면 되돌려보낼 이유. */
export function htmlBodyIssue(raw: string): HtmlBodyIssue | null {
  const html = stripCodeFence(raw);
  if (!html) return { kind: "empty" };

  const bytes = new TextEncoder().encode(html).length;
  if (bytes > HTML_BODY_MAX_BYTES) return { kind: "too-large", bytes };

  const lower = html.toLowerCase();
  // 진짜 HTML 문서인지. 조각(예: `<div>…</div>`)이나 설명문이 오면 페이지가 안 뜬다.
  if (!lower.includes("<!doctype html") && !lower.includes("<html") && !lower.includes("<body")) {
    return { kind: "not-html" };
  }
  // **잘림 감지 — 이 길의 가장 흔한 실패다.** 긴 코드는 AI 답변이 중간에서 끊기고,
  // 그 상태로 저장하면 반쪽짜리 작품이 조용히 올라간다("계속해"로 이어 받아야 한다).
  // 닫는 태그가 둘 다 없으면 잘린 것으로 본다(둘 중 하나만 있어도 통과 — 아주 짧은
  // 문서가 </html>을 생략하는 경우까지 거절하지 않으려고).
  if (!lower.includes("</html>") && !lower.includes("</body>")) {
    return { kind: "truncated" };
  }
  return null;
}

/**
 * HTML 글자 → `index.html` 하나짜리 zip. 호출부는 이걸 기존 번들과 똑같이 다룬다.
 * jszip은 isomorphic이고 서버에서도 upload-safety가 같은 방식으로 동적 import한다.
 */
export async function htmlBodyToZip(raw: string): Promise<ArrayBuffer> {
  const html = stripCodeFence(raw);
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  // 이름은 반드시 index.html — pickZipAnchor가 이 이름으로 진입점을 찾는다.
  zip.file("index.html", html);
  const out = (await zip.generateAsync({ type: "uint8array" })) as Uint8Array;
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}
