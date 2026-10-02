// 실서버 검사 — 나머지 주소의 본문 상한(F55, 2026-10-02). 로그인 없이 닿는 주소에
// content-length 없이 조각으로 흘린 큰 본문(chunked)을 보내 413으로 끊기는지 본다.
// 대조군: 같은 주소에 작은 본문은 413이 아니어야 한다(상한이 정상 요청을 막지 않는지).
// 아무것도 저장하지 않는다 — 큰 본문은 읽다 끊기고, 작은 본문은 각 주소의 검증에서 걸러지는 값만 쓴다.
//
//   node scripts/probe-body-cap-prod.mjs [https://nookframe.com]
const BASE = process.argv[2] ?? "https://nookframe.com";
const SIZE = 128 * 1024; // 사용자·공개 주소 상한 64KB의 두 배

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

function chunkedBody(totalBytes, contentType) {
  const piece = new Uint8Array(16 * 1024).fill(0x61);
  let sent = 0;
  const stream = new ReadableStream({
    pull(c) {
      if (sent >= totalBytes) return c.close();
      c.enqueue(piece);
      sent += piece.length;
    },
  });
  return { body: stream, duplex: "half", headers: { "content-type": contentType } };
}

async function post(path, init) {
  const res = await fetch(`${BASE}${path}`, { method: "POST", redirect: "manual", ...init });
  const text = await res.text().catch(() => "");
  return { status: res.status, text: text.slice(0, 120) };
}

// [주소, 큰 본문 형식, 작은 대조 본문]
const CASES = [
  ["/api/track", "application/json", '{"username":"!"}'],
  ["/api/analytics", "application/json", '{"event":"nope"}'],
  ["/api/report", "application/json", '{"targetType":"nope"}'],
  ["/api/handoff/open", "application/json", '{"id":"nope"}'],
  ["/api/account/locale", "application/json", '{"locale":"xx"}'],
  ["/api/oauth/token", "application/x-www-form-urlencoded", "grant_type=nope"],
];

for (const [path, type, small] of CASES) {
  const big = await post(path, chunkedBody(SIZE, type));
  ok(`${path} 조각 전송 ${SIZE / 1024}KB → 413`, big.status === 413, `${big.status} ${big.text}`);
  const ctl = await post(path, { body: small, headers: { "content-type": type } });
  ok(`${path} 작은 본문은 막지 않음`, ctl.status !== 413, `${ctl.status}`);
}

if (failed) {
  console.log(`\n${failed}개 실패`);
  process.exit(1);
}
console.log("\n전부 통과");
