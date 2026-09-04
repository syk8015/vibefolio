// 임베드 가능 판정 순수 함수 검증(네트워크 없음) — lib/embeddable.ts.
// 사용: `npx -y tsx scripts/probe-embeddable-unit.mts`
//
// 무엇을 보나: (1) X-Frame-Options 3종(deny·sameorigin·allow-from)이 차단되나
// (2) 인식 못 하는 XFO 값은 브라우저처럼 무시하나 (3) CSP frame-ancestors가
// XFO를 이기나 (4) 정책이 여러 개면 전부 만족해야 하나 (5) 와일드카드·포트·
// 스킴 소스가 우리 오리진과 맞게 매칭되나.
import { embedVerdict } from "../lib/embeddable";

const APP = "https://nookframe.com";
let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};
const v = (h: { xFrameOptions?: string | null; csp?: string | null }, origin = APP) =>
  embedVerdict(h, origin);

// ── (1) 헤더가 없으면 임베드 가능 ──
ok("헤더 없음 = ok", v({}) === "ok");
ok("빈 XFO = ok", v({ xFrameOptions: "  " }) === "ok");

// ── (2) X-Frame-Options ──
ok("XFO DENY = blocked", v({ xFrameOptions: "DENY" }) === "blocked");
ok("XFO SAMEORIGIN = blocked", v({ xFrameOptions: "SameOrigin" }) === "blocked");
ok("XFO ALLOW-FROM = blocked", v({ xFrameOptions: "ALLOW-FROM https://nookframe.com" }) === "blocked");
// 브라우저가 무시하는 비표준 값은 우리도 무시한다(임베드는 실제로 된다).
ok("XFO ALLOWALL = ok", v({ xFrameOptions: "ALLOWALL" }) === "ok");

// ── (3) CSP frame-ancestors가 XFO를 이긴다 ──
ok("ancestors * 가 XFO DENY를 이김",
  v({ xFrameOptions: "DENY", csp: "frame-ancestors *" }) === "ok");
ok("ancestors 'none' = blocked", v({ csp: "frame-ancestors 'none'" }) === "blocked");
ok("ancestors 'self' = blocked(우리는 다른 오리진)", v({ csp: "frame-ancestors 'self'" }) === "blocked");
ok("ancestors 정확 호스트 = ok", v({ csp: "default-src 'self'; frame-ancestors https://nookframe.com" }) === "ok");
ok("ancestors 다른 호스트 = blocked", v({ csp: "frame-ancestors https://example.com" }) === "blocked");
ok("frame-ancestors 없는 CSP는 XFO로 판정",
  v({ xFrameOptions: "DENY", csp: "default-src 'self'; script-src 'self'" }) === "blocked");

// ── (4) 정책이 여러 개면 전부 만족해야 한다 ──
ok("정책 2개 중 하나가 none = blocked",
  v({ csp: "frame-ancestors *, frame-ancestors 'none'" }) === "blocked");
ok("정책 2개 모두 허용 = ok",
  v({ csp: "frame-ancestors *, frame-ancestors https://nookframe.com" }) === "ok");

// ── (5) 와일드카드·포트·스킴 ──
ok("*.nookframe.com 은 서브도메인만",
  v({ csp: "frame-ancestors *.nookframe.com" }) === "blocked" &&
  v({ csp: "frame-ancestors *.nookframe.com" }, "https://app.nookframe.com") === "ok");
ok("https: 스킴 소스 = ok", v({ csp: "frame-ancestors https:" }) === "ok");
ok("http: 스킴 소스는 https 오리진에 blocked", v({ csp: "frame-ancestors http:" }) === "blocked");
ok("포트가 다르면 blocked", v({ csp: "frame-ancestors https://nookframe.com:8443" }) === "blocked");
ok("스킴 없는 호스트도 매칭", v({ csp: "frame-ancestors nookframe.com" }) === "ok");
ok("대소문자 무시", v({ csp: "FRAME-ANCESTORS HTTPS://NOOKFRAME.COM" }) === "ok");

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
