// 로그인 뒤 돌아갈 곳(`?next=`)을 거르는 한 벌. 이 값은 사용자가 주소창에 마음대로
// 넣을 수 있어서, 그대로 따라가면 로그인 직후 남의 사이트로 튕기는 피싱 발판이 된다.
// 같은 사이트 안의 상대 경로만 통과시키고 나머지는 전부 "/"로 떨어뜨린다.
//
// 막는 모양: `//evil.com`(스킴 생략 절대주소) · `/\evil.com`(브라우저가 \를 /로 읽음)
// · `https://…` · `javascript:` · 제어문자·공백(탭/줄바꿈을 끼워 넣어 위 검사를 비껴가는 수법).
export function safeNext(raw: string | null | undefined): string {
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.includes("\\")) return "/";
  if (/[\u0000- \u007f]/.test(raw)) return "/";
  return raw;
}
