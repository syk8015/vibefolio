// 로그인 뒤 돌아갈 곳(?next=) 거르기(2026-09-22). 네트워크 없음.
// 지키는 것: 같은 사이트 경로는 살리고, 밖으로 튕기는 모양은 전부 "/"로.
// 같은 가입·로그인 흐름의 순수 함수도 여기서 본다: 아이디 소문자 접기(lib/username)
// · 앱 안 브라우저 판별(lib/traffic-source — 구글 로그인 차단 안내의 근거).
import { safeNext } from "../lib/safeNext";
import { normalizeUsername, isValidUsername, usernameIlikePattern, USERNAME_MAX } from "../lib/username";
import { isInAppBrowser } from "../lib/traffic-source";

let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};
const is = (raw: string | null | undefined, want: string) => {
  const got = safeNext(raw);
  ok(`${JSON.stringify(raw)} → ${want}`, got === want, got);
};

// 살려야 하는 것
is("/publish", "/publish");
is("/reset-password", "/reset-password");
is("/dashboard?tab=projects", "/dashboard?tab=projects");
is("/@me/abc#x", "/@me/abc#x");

// "/"로 떨어져야 하는 것
is(null, "/");
is(undefined, "/");
is("", "/");
is("//evil.com", "/");
is("//evil.com/publish", "/");
is("/\\evil.com", "/");
is("/\\/evil.com", "/");
is("https://evil.com", "/");
is("javascript:alert(1)", "/");
is("evil.com", "/");
is("/\t/evil.com", "/");
is("/\n/evil.com", "/");
is(" /publish", "/");

// fallback — 로그인 직후 기본 목적지는 대시보드, 걸러진 값도 대시보드로
ok("fallback: null → /dashboard", safeNext(null, "/dashboard") === "/dashboard");
ok("fallback: //evil.com → /dashboard", safeNext("//evil.com", "/dashboard") === "/dashboard");
ok("fallback: /publish 그대로", safeNext("/publish", "/dashboard") === "/publish");

// 아이디 — 폰 키보드의 첫 글자 대문자를 접는다(A7)
const eqU = (raw: string, want: string) => {
  const got = normalizeUsername(raw);
  ok(`username ${JSON.stringify(raw)} → ${want}`, got === want, got);
};
eqU("Alexvibe", "alexvibe");
eqU("ALEX_Vibe-1", "alex_vibe-1");
eqU("alex.vibe", "alexvibe");
eqU("한글abc", "abc");
eqU("a".repeat(40), "a".repeat(USERNAME_MAX));
ok("valid: ab", isValidUsername("ab"));
ok("invalid: a", !isValidUsername("a"));
ok("invalid: Ab(대문자)", !isValidUsername("Ab"));
ok("ilike: a_b의 _는 글자 그대로", usernameIlikePattern("a_b") === "a\\_b", usernameIlikePattern("a_b"));
ok("ilike: 50%", usernameIlikePattern("50%") === "50\\%");

// 앱 안 브라우저 — 인스타(iOS)·스레드·페이스북은 true, 사파리·크롬은 false
const IG = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 334.0.4.32.98";
const THREADS = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36 Barcelona 339.0.0.0";
const FB = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0]";
const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
ok("in-app: Instagram", isInAppBrowser(IG));
ok("in-app: Threads", isInAppBrowser(THREADS));
ok("in-app: Facebook", isInAppBrowser(FB));
ok("not in-app: Safari", !isInAppBrowser(SAFARI));
ok("not in-app: Chrome", !isInAppBrowser(CHROME));

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
