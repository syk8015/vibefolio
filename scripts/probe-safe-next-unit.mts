// 로그인 뒤 돌아갈 곳(?next=) 거르기(2026-09-22). 네트워크 없음.
// 지키는 것: 같은 사이트 경로는 살리고, 밖으로 튕기는 모양은 전부 "/"로.
import { safeNext } from "../lib/safeNext";

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

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
