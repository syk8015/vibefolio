// demoAccess 비밀 이름 차단(2026-09-22 보안1). 네트워크 없음.
// 지키는 것: 공개 작품의 demo_access는 anon REST로 읽힐 수 있으니 토큰·비번처럼
// 보이는 이름은 params·진입 URL 쿼리 어디로 와도 400(issue "secret-param")으로
// 돌려보내고, 무해한 이름("keyword"·"monkey"·"guest")은 그대로 받는다.
import { normalizeDemoAccess, secretLikeName } from "../lib/demoAccess";

let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

for (const n of [
  "password", "pass", "pwd", "token", "access_token", "guestToken", "secret", "clientSecret",
  "key", "apiKey", "api_key", "API-KEY", "accessKey", "jwt", "otp", "pin", "session_id", "auth",
]) {
  ok(`비밀 이름: ${n}`, secretLikeName(n));
}
for (const n of ["guest", "demo", "mode", "keyword", "monkey", "lang", "theme", "passage"]) {
  ok(`무해한 이름: ${n}`, !secretLikeName(n));
}

const p = normalizeDemoAccess({ url: "/demo", params: { guest: "1", token: "abc" } });
ok("params에 token → secret-param", p.issue === "secret-param" && p.secretName === "token" && p.access === null);

const u = normalizeDemoAccess({ url: "/demo?password=hunter2" });
ok("url 쿼리에 password → secret-param", u.issue === "secret-param" && u.secretName === "password");

const a = normalizeDemoAccess({ url: "/demo", altUrl: "https://example.com/app?apiKey=x#y" });
ok("altUrl 쿼리에 apiKey → secret-param", a.issue === "secret-param" && a.secretName === "apiKey");

const fine = normalizeDemoAccess({ url: "/demo?guest=1", params: { mode: "demo" }, note: "guest mode" });
ok("무해한 입력은 그대로", !fine.issue && fine.access?.url === "/demo?guest=1" && fine.access?.params?.mode === "demo");

const bad = normalizeDemoAccess({ url: "ftp://x" });
ok("형식 위반은 여전히 bad-url", bad.issue === "bad-url");

// "/"로 시작해도 풀면 다른 호스트가 되는 모양(2026-09-22 감사 N-1) — 호출부가 "/" 경로를
// 같은 사이트 안으로 믿고 공개 URL 게이트를 건너뛰므로 여기서 bad-url이어야 한다.
for (const [label, v] of [
  ["//host", "//evil.example/x"],
  ["/\\host", "/\\evil.example/x"],
  ["/<탭>/host", "/\t/evil.example/x"],
  ["/<줄바꿈>/host", "/\n/evil.example"],
  ["///host", "///evil.example"],
] as const) {
  ok(`url ${label} → bad-url`, normalizeDemoAccess({ url: v }).issue === "bad-url");
  ok(`altUrl ${label} → bad-url`, normalizeDemoAccess({ url: "/demo", altUrl: v }).issue === "bad-url");
}
const inner = normalizeDemoAccess({ url: "/demo//nested?x=1#y" });
ok("경로 안쪽의 // 는 그대로 통과", !inner.issue && inner.access?.url === "/demo//nested?x=1#y");

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
