// 이 기기에서 지난번에 로그인한 방법 — 로그인·가입 화면의 "지난번에 사용" 표시(2026-09-24).
// 방법이 넷(구글·깃허브·메일 코드·비밀번호)이라 지난번과 다른 버튼을 누르면, 메일이 다를 때
// 계정이 하나 더 생긴다(깃허브 대표 메일 ≠ 구글 메일 — 09-24 실제로 겪음). 같은 메일이면
// Supabase가 알아서 한 계정으로 묶는다.
//
// 쿠키인 이유: OAuth 성공은 서버 콜백(/auth/callback)만 알아서 거기서 심어야 한다. 버튼을
// 누를 때 심으면 취소한 방법이 "지난번"으로 남는다. 콜백 주소에 `via=<방법>`을 실어 보내고,
// 코드 교환이 성공했을 때만 콜백이 쿠키로 옮긴다. 비밀값 아님 — 방법 이름뿐이라 httpOnly 아님.
export const LAST_LOGIN_COOKIE = "vf-last-login";
export const LAST_LOGIN_MAX_AGE = 60 * 60 * 24 * 365;
export const LOGIN_METHODS = ["google", "github", "code", "password"] as const;
export type LoginMethod = (typeof LOGIN_METHODS)[number];

export function isLoginMethod(v: unknown): v is LoginMethod {
  return typeof v === "string" && (LOGIN_METHODS as readonly string[]).includes(v);
}

/** 콜백 주소에 방법 표식을 붙인다 — 성공하면 /auth/callback이 쿠키로 옮긴다. */
export function withVia(url: string, method: LoginMethod): string {
  return `${url}${url.includes("?") ? "&" : "?"}via=${method}`;
}

/** 브라우저에서 — 비밀번호·메일 코드처럼 콜백을 안 거치고 이 화면에서 끝나는 로그인. */
export function rememberLoginMethod(method: LoginMethod) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${LAST_LOGIN_COOKIE}=${method}; Path=/; Max-Age=${LAST_LOGIN_MAX_AGE}; SameSite=Lax${secure}`;
}

export function readLastLoginMethod(): LoginMethod | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${LAST_LOGIN_COOKIE}=([^;]*)`));
  return m && isLoginMethod(m[1]) ? m[1] : null;
}
