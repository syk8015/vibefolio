// 다른 사이트 접근 허용(CORS)·미들웨어 우회 실서버 검사 (위협 목록 F7·F8). 로그인·비밀값 불필요.
//
// F7: 남의 사이트(Origin: evil)가 우리 API를 부를 때 허용 헤더가 안 나가야 한다 — 예외는 공개
//     OAuth 발견 문서 두 개(`*`, 쿠키 없음 — Claude가 읽어야 한다). 허용이 없으면 브라우저가
//     답을 못 읽는다. 폼 전송(사전 확인 없는 요청)은 로그인 쿠키가 SameSite=Lax라 안 실린다.
// F8: 로그인 없이 /dashboard·/settings는 로그인으로, /admin은 404 — 알려진 우회 헤더
//     (x-middleware-subrequest 등, CVE-2025-29927 계열)와 경로 장난(대소문자·//·;·%2f·_next/data)에도.
//     미리보기 도메인에서 앱 경로를 부르면 앱 도메인으로 돌려보낸다(쿠키가 안 따라감).
//
// 사용: `node scripts/probe-cors-bypass.mjs`
const ORIGIN = process.env.PROBE_ORIGIN ?? "https://nookframe.com";

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${String(detail).slice(0, 200)}` : ""}`);
  if (!pass) failed++;
};
const req = (url, init = {}) => fetch(url, { redirect: "manual", ...init });

// ── F7 ──
const EVIL = { Origin: "https://evil.example" };
const PUBLIC_META = ["/api/oauth/meta/authorization-server", "/.well-known/oauth-authorization-server"];
for (const p of [
  "/api/projects/private", "/api/embed-check", "/api/ingest", "/api/tokens", "/api/mcp", "/api/report",
  "/api/track", "/api/account/locale", "/api/connect/exchange", "/api/oauth/token", ...PUBLIC_META,
]) {
  for (const method of ["GET", "OPTIONS"]) {
    const r = await req(`${ORIGIN}${p}`, {
      method,
      headers: { ...EVIL, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" },
    });
    const acao = r.headers.get("access-control-allow-origin");
    const acac = r.headers.get("access-control-allow-credentials");
    const meta = PUBLIC_META.includes(p);
    const pass = meta ? (acao === null || acao === "*") && acac !== "true" : acao === null && acac === null;
    ok(`CORS ${method} ${p}${meta ? " (공개 문서: * 허용, 쿠키 불가)" : ": 허용 없음"}`, pass, `${r.status} acao=${acao} acac=${acac}`);
  }
}

// ── F8 ──
// 데이터 요청(x-nextjs-data)엔 location 대신 x-nextjs-redirect로 돌려보낸다.
const isLogin = (r) => r.status === 307 && /\/login\?next=/.test(r.headers.get("location") ?? r.headers.get("x-nextjs-redirect") ?? "");
// 미리 받기(x-middleware-prefetch)엔 미들웨어가 화면 없이 `{}`만 준다(x-middleware-skip) — 200이어도 빈 답이면 안전.
const emptySkip = async (r) => r.status === 200 && r.headers.get("x-middleware-skip") === "1" && (await r.text()).trim() === "{}";
const BYPASS = [
  {},
  { "x-middleware-subrequest": "middleware" },
  { "x-middleware-subrequest": "middleware:middleware:middleware:middleware:middleware" },
  { "x-middleware-subrequest": "src/middleware:src/middleware:src/middleware:src/middleware:src/middleware" },
  { "x-middleware-prefetch": "1" },
  { "x-nextjs-data": "1" },
  { "x-invoke-path": "/dashboard" },
];
for (const h of BYPASS) {
  const label = Object.entries(h).map(([k, v]) => `${k}: ${v.slice(0, 20)}`).join("") || "헤더 없음";
  for (const p of ["/dashboard", "/settings"]) {
    const r = await req(`${ORIGIN}${p}`, { headers: h });
    ok(`${label} ${p} → 로그인으로`, isLogin(r) || (h["x-middleware-prefetch"] && (await emptySkip(r))), `${r.status} ${r.headers.get("location")}`);
  }
  const a = await req(`${ORIGIN}/admin`, { headers: h });
  ok(`${label} /admin → 404 (미리 받기는 빈 답)`, a.status === 404 || (h["x-middleware-prefetch"] && (await emptySkip(a))), `${a.status}`);
}
// 경로 장난 — 308(정규화 뒤 다시 게이트) · 로그인 · 404/400이면 통과, 200이면 샌 것.
for (const p of ["/Dashboard", "/dashboard/", "//dashboard", "/%64ashboard", "/dashboard%2f", "/dashboard;x", "/_next/data/x/dashboard.json", "/api/../dashboard", "/SETTINGS", "/Admin"]) {
  const r = await req(`${ORIGIN}${p}`);
  ok(`경로 ${p} → 안 열림`, r.status !== 200, `${r.status} ${r.headers.get("location") ?? ""}`);
}

// 미리보기 도메인 → 앱 경로는 앱 도메인으로
{
  const r = await req(`${ORIGIN}/api/preview/__probe__/x.html`);
  const loc = r.headers.get("location");
  if (r.status === 307 && loc) {
    const preview = new URL(loc).origin;
    for (const p of ["/dashboard", "/api/projects/private", "/"]) {
      const g = await req(`${preview}${p}`);
      ok(`미리보기 도메인 ${p} → 앱 도메인으로`, g.status === 307 && (g.headers.get("location") ?? "").startsWith(`${ORIGIN}${p}`), `${g.status} ${g.headers.get("location")}`);
    }
  } else {
    ok("미리보기 도메인 찾기(/api/preview → 307)", false, `${r.status} ${loc}`);
  }
}

console.log(failed ? `\n✗ ${failed} failed` : "\nall cors/bypass probes passed");
process.exit(failed ? 1 : 0);
