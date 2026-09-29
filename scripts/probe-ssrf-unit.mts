// SSRF 가드 검증(네트워크 없음) — lib/ssrf.ts.
// 사용: `npx -y tsx scripts/probe-ssrf-unit.mts`
//
// 왜 따로: 실서버 프로브(probe-embed-check.mjs)는 "내부 주소가 없는 도메인과 같은 답"만
// 볼 수 있다. Vercel 함수 안에선 127.0.0.1·메타데이터 주소가 가드 없이도 어차피 안 열려서,
// 가드가 빠져도 실서버 답은 그대로다. 가드가 실제로 막는지는 여기서 본다.
//
// 무엇을 보나: (1) 대역 표 — 사설·루프백·링크로컬·CGNAT·예약, IPv6와 v4가 박힌 v6 표기
// (2) 공개 주소는 통과 (3) assertSafePublicUrl이 숫자 표기(10진수·16진수·줄임)와 대괄호 IPv6,
// 이름(localhost)으로 온 내부 주소, http(s) 아닌 프로토콜을 거절하나.
import { isBlockedIp, assertSafePublicUrl, SsrfError } from "../lib/ssrf";

let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

// ── (1) 막아야 하는 주소 ──
for (const ip of [
  "0.0.0.0", "10.1.2.3", "100.64.0.1", "127.0.0.1", "169.254.169.254",
  "172.16.0.1", "172.31.255.255", "192.168.1.1", "198.18.0.1", "224.0.0.1", "255.255.255.255",
]) ok(`v4 막힘 ${ip}`, isBlockedIp(ip, 4));
for (const ip of [
  "::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1",
  "::ffff:127.0.0.1", "::ffff:169.254.169.254", "64:ff9b::a00:1", "::ffff:7f00:1",
]) ok(`v6 막힘 ${ip}`, isBlockedIp(ip, 6));
ok("파싱 못 하는 주소는 막힘", isBlockedIp("not-an-ip", 4) && isBlockedIp("zz::1", 6));

// ── (2) 공개 주소는 통과 ──
for (const ip of ["93.184.215.14", "8.8.8.8", "172.32.0.1", "100.128.0.1"]) ok(`v4 통과 ${ip}`, !isBlockedIp(ip, 4));
for (const ip of ["2606:4700::1111", "::ffff:8.8.8.8"]) ok(`v6 통과 ${ip}`, !isBlockedIp(ip, 6));

// ── (3) URL 사전 검증 ──
const rejects = async (url: string) => {
  try {
    await assertSafePublicUrl(url);
    return "통과함";
  } catch (e) {
    return e instanceof SsrfError ? null : `다른 오류: ${(e as Error).message}`;
  }
};
for (const url of [
  "http://127.0.0.1/",
  "http://2130706433/",          // 127.0.0.1 10진수
  "http://0x7f000001/",          // 127.0.0.1 16진수
  "http://127.1/",               // 줄임 표기
  "http://0177.0.0.1/",          // 8진수
  "http://169.254.169.254/latest/meta-data/",
  "http://[::1]/",
  "http://[::ffff:127.0.0.1]/",
  "http://[::ffff:a9fe:a9fe]/",  // 169.254.169.254를 v6에 박은 것
  "http://localhost:3000/",      // 이름 → 루프백(DNS 경로)
  "javascript:alert(1)",
  "file:///etc/passwd",
  "ftp://example.com/",
  "not a url",
]) {
  const why = await rejects(url);
  ok(`거절 ${url}`, why === null, why ?? "");
}
{
  // 공개 IP 리터럴은 DNS 없이 통과해야 한다(가드가 전부 막아버리는 것도 고장).
  const why = await rejects("https://8.8.8.8/");
  ok("공개 IP 리터럴은 통과", why === "통과함", why ?? "거절됨");
}

console.log(failed ? `\n✗ ${failed} failed` : "\nall ssrf unit probes passed");
process.exit(failed ? 1 : 0);
