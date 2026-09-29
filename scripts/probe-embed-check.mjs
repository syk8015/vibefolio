// /api/embed-check prod E2E — 서버가 남이 준 URL을 대신 여는 라우트라 방어선이 실제로
// 서 있는지 실서버에서 확인한다. 판정 함수는 probe-embeddable-unit, 내부 주소 차단 자체는 probe-ssrf-unit이 본다
// (Vercel 함수 안에선 내부 주소가 가드 없이도 안 열려서, 여기선 "새는 답이 없는지"만 증명된다).
//
// 검증: (1) 로그인 없으면 401 (2) 몸통이 JSON이 아니거나 http(s)가 아니면 unreachable
// (3) 내부 주소(루프백·메타데이터·10진수/16진수·IPv6 표기)는 막힘 — 그리고 **없는 도메인과
//     응답이 글자 하나까지 같음**(내부 호스트 탐지 오라클 금지) (4) 공개 리다이렉터가 내부로
//     돌려보내도 같음(홉마다 재검증) (5) 띄우기 허락 사이트 → embeddable:true
// (6) X-Frame-Options / CSP로 막는 사이트 → reason:"blocked"
//
// 계정은 Resend 테스트 주소로 잠깐 만들었다가 지운다(메일은 안 나간다 — 관리자 API로 만들고
// 매직링크는 서버에서 바로 검증).
//
// 사용: 레포 루트에서 `node scripts/probe-embed-check.mjs`
// 주의: embed-check 버킷(사용자당 시간당 120)을 ~13회 쓴다. 계정을 매번 새로 만들어 서로 안 겹친다.
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";
import { createChunks, stringToBase64URL } from "@supabase/ssr";

const ORIGIN = process.env.PROBE_ORIGIN ?? "https://nookframe.com";
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${String(detail).slice(0, 200)}` : ""}`);
  if (!pass) failed++;
};

const check = async (body, cookie) => {
  const r = await fetch(`${ORIGIN}/api/embed-check`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await r.text();
  return { status: r.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
};

{
  const r = await check({ url: "https://example.com" });
  ok("로그인 없으면 401", r.status === 401, `${r.status} ${r.text}`);
}

let probeUserId = null;
try {
  const stamp = Date.now();
  const ACCOUNT = `delivered+nfprobe-embed-${stamp}@resend.dev`;
  const { data: created, error: cErr } = await svc.auth.admin.createUser({
    email: ACCOUNT,
    email_confirm: true,
    user_metadata: { username: `nfprobe${stamp}` },
  });
  if (cErr) throw cErr;
  probeUserId = created.user.id;
  const { data: link, error: lErr } = await svc.auth.admin.generateLink({ type: "magiclink", email: ACCOUNT });
  if (lErr) throw lErr;
  const userClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: sess, error: vErr } = await userClient.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.properties.hashed_token,
  });
  if (vErr) throw vErr;
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const cookie = createChunks(`sb-${ref}-auth-token`, "base64-" + stringToBase64URL(JSON.stringify(sess.session)))
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  const UNREACHABLE = JSON.stringify({ embeddable: false, reason: "unreachable" });

  {
    const r = await check("not json", cookie);
    ok("JSON 아닌 몸통 → unreachable", r.status === 200 && r.text === UNREACHABLE, `${r.status} ${r.text}`);
    for (const url of ["javascript:alert(1)", "file:///etc/passwd", "ftp://example.com/"]) {
      const s = await check({ url }, cookie);
      ok(`http(s) 아님 → unreachable (${url.split(":")[0]})`, s.status === 200 && s.text === UNREACHABLE, `${s.status} ${s.text}`);
    }
  }

  // 오라클 기준선: 그냥 없는 도메인. 내부 주소 응답이 이것과 한 글자라도 다르면 탐지 도구가 된다.
  const baseline = await check({ url: "https://nf-probe-does-not-exist.invalid/" }, cookie);
  ok("없는 도메인 → unreachable", baseline.status === 200 && baseline.text === UNREACHABLE, `${baseline.status} ${baseline.text}`);

  const INTERNAL = [
    "http://127.0.0.1/",
    "http://localhost:3000/",
    "http://169.254.169.254/latest/meta-data/", // 클라우드 메타데이터
    "http://2130706433/", // 127.0.0.1 10진수
    "http://0x7f000001/", // 127.0.0.1 16진수
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://10.0.0.1/",
  ];
  for (const url of INTERNAL) {
    const r = await check({ url }, cookie);
    ok(`내부 주소 막힘 + 없는 도메인과 같은 답: ${url}`, r.status === baseline.status && r.text === baseline.text, `${r.status} ${r.text}`);
  }

  {
    // 공개 리다이렉터가 내부로 돌려보내는 경우 — 리다이렉터가 실제로 302를 주는지 먼저 본다.
    const target = "http://169.254.169.254/latest/meta-data/";
    const redirector = `https://httpbin.org/redirect-to?url=${encodeURIComponent(target)}`;
    const pre = await fetch(redirector, { redirect: "manual", signal: AbortSignal.timeout(6000) }).catch(() => null);
    if (pre && pre.status >= 300 && pre.status < 400 && pre.headers.get("location") === target) {
      const r = await check({ url: redirector }, cookie);
      ok("리다이렉트로 내부 주소 → 없는 도메인과 같은 답", r.status === baseline.status && r.text === baseline.text, `${r.status} ${r.text}`);
    } else {
      console.log(`- httpbin 리다이렉터 응답 없음(${pre?.status ?? "연결 실패"}) — 리다이렉트 검사 건너뜀`);
    }
  }

  {
    const r = await check({ url: "https://example.com/" }, cookie);
    ok("띄우기 허락 사이트(example.com) → embeddable:true", r.status === 200 && r.json?.embeddable === true, `${r.status} ${r.text}`);
  }
  for (const url of ["https://www.google.com/", "https://github.com/"]) {
    const r = await check({ url }, cookie);
    ok(`막는 사이트 → blocked (${new URL(url).hostname})`, r.status === 200 && r.json?.embeddable === false && r.json?.reason === "blocked", `${r.status} ${r.text}`);
  }
} finally {
  if (probeUserId) await svc.auth.admin.deleteUser(probeUserId);
}

console.log(failed ? `\n✗ ${failed} failed` : "\nall embed-check probes passed");
process.exit(failed ? 1 : 0);
