// 폰 → 컴퓨터 넘기기(docs/desktop-handoff.md) prod E2E. 사람에게 가는 메일은 보내지 않는다.
//
// 검증: (0) 표 존재 (0b) 메일 링크 가입 화면 — 서버가 이메일을 채움·소셜 버튼 접힘·열림 안 찍음
// (1) 익명 키로 표 못 읽음(이메일이 든 표) (2) 이메일 모양 틀리면 400
// (3) 모르는 id로 open → ok:false (4) 심은 행 open → 이메일·first-touch 돌려줌 + opened_at
// (5) 두 번째 open은 opened_at 그대로 (6) 30일 지난 행은 안 채움 (7) 크론 비밀값 없으면 401
// (8) 크론이 30일 지난 행을 지운다 + 점검 크론(health)이 알림을 같이 돌린다(CRON_SECRET이 있을 때만)
// (9) 가짜 보안 확인 토큰 → 400 CAPTCHA. 500 CAPTCHA_MISCONFIGURED면 Vercel의
//     TURNSTILE_SECRET_KEY가 틀림(Site Key를 넣었을 가능성), 200이면 비밀값이 없음(확인 꺼짐).
//     혹시 확인이 꺼져 있어도 메일이 나가지 않게, Resend 테스트 주소 행을 먼저 심어
//     "같은 주소 하루 1통"에 걸리게 한다.
// (10) 폰에서 막 가입한 사람(로그인 상태, `self: true`) — 로그인 없이 부르면 401, 계정 화면
//      /send가 계정 이메일을 서버에서 채워 보냄, 몸통에 남의 주소를 넣어도 계정 주소로만 감,
//      같은 계정 두 번째 요청은 조용한 성공(새 행 없음). 계정은 Resend 테스트 주소
//      (`delivered+…@resend.dev`, 사람에게 안 감)로 잠깐 만들었다가 지운다 — 메일 1통이 거기로 간다.
//
// 사용: 레포 루트에서 `node scripts/probe-handoff.mjs`
// 주의: handoff-open 버킷(IP당 분당 20) 3~4회, handoff 버킷(IP당 시간당 5) 3회 소비 —
//       한 시간에 두 번 넘게 돌리면 429에 걸린다.
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";
import { createChunks, stringToBase64URL } from "@supabase/ssr";

const ORIGIN = process.env.PROBE_ORIGIN ?? "https://nookframe.com";
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${String(detail).slice(0, 200)}` : ""}`);
  if (!pass) failed++;
};
const post = (path, body) =>
  fetch(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

{
  const { error } = await svc.from("desktop_handoffs").select("id").limit(1);
  ok("desktop_handoffs 표 존재", !error, error ? `${error.code} ${error.message}` : "");
  if (error) {
    console.error("supabase/migration_desktop_handoffs.sql을 먼저 적용하세요.");
    process.exit(1);
  }
}

const planted = [];
let probeUserId = null;
const EMAIL = `probe-handoff-${Date.now()}@example.invalid`;
try {
  const { data: row } = await svc
    .from("desktop_handoffs")
    .insert({ email: EMAIL, locale: "en", remind: true, first_touch: { utm_source: "probe", utm_campaign: "promo-probe" } })
    .select("id")
    .single();
  planted.push(row.id);

  {
    // 메일 링크 가입 화면(/signup?h=)은 서버가 이메일을 채워 보낸다 — 첫 HTML에 이미 들어
    // 있어야 "평소 화면이 한 번 보였다가 바뀌는" 일이 없다(09-24). 소셜 버튼은 접혀 있고,
    // 서버 렌더는 "열림"을 찍지 않는다(메일 검사기가 링크를 미리 열어도 안 세게).
    const html = await (await fetch(`${ORIGIN}/signup?h=${row.id}`)).text();
    ok("메일 링크 가입 화면: 첫 HTML에 이메일이 채워져 있음", html.includes(`value="${EMAIL}"`));
    ok("메일 링크 가입 화면: 소셜 버튼 접힘", !html.includes("Continue with GitHub") && !html.includes("GitHub로 계속하기"));
    const plain = await (await fetch(`${ORIGIN}/signup`)).text();
    ok("평소 가입 화면: 소셜 버튼 그대로", plain.includes("Continue with GitHub") || plain.includes("GitHub로 계속하기"));
    const { data: st } = await svc.from("desktop_handoffs").select("opened_at").eq("id", row.id).single();
    ok("서버 렌더는 '열림'을 안 찍음", st?.opened_at === null, String(st?.opened_at));
  }

  {
    const { data, error } = await anon.from("desktop_handoffs").select("email").limit(5);
    ok("익명 키로 표를 못 읽음", !!error || (data ?? []).length === 0, error?.code ?? `rows=${data?.length}`);
  }
  {
    const r = await post("/api/handoff", { email: "not-an-email" });
    const j = await r.json().catch(() => ({}));
    ok("이메일 모양 틀리면 400 BAD_EMAIL", r.status === 400 && j.code === "BAD_EMAIL", `${r.status} ${j.code}`);
  }
  {
    const r = await post("/api/handoff/open", { id: "00000000-0000-4000-8000-000000000000" });
    const j = await r.json().catch(() => ({}));
    ok("모르는 id → ok:false", j.ok === false, JSON.stringify(j));
  }
  {
    const r = await post("/api/handoff/open", { id: row.id });
    const j = await r.json().catch(() => ({}));
    ok("심은 행 open → 이메일·first-touch", j.ok === true && j.email === EMAIL && j.firstTouch?.utm_source === "probe", JSON.stringify(j));
    const { data: after } = await svc.from("desktop_handoffs").select("opened_at").eq("id", row.id).single();
    ok("opened_at 찍힘", !!after?.opened_at);
    const first = after?.opened_at;
    await post("/api/handoff/open", { id: row.id });
    const { data: again } = await svc.from("desktop_handoffs").select("opened_at").eq("id", row.id).single();
    ok("두 번째 open은 opened_at 그대로", again?.opened_at === first);
  }
  {
    const old = new Date(Date.now() - 31 * 24 * 3600e3).toISOString();
    const { data: stale } = await svc
      .from("desktop_handoffs")
      .insert({ email: `stale-${EMAIL}`, created_at: old })
      .select("id")
      .single();
    planted.push(stale.id);
    const r = await post("/api/handoff/open", { id: stale.id });
    const j = await r.json().catch(() => ({}));
    ok("30일 지난 행은 안 채움", j.ok === false, JSON.stringify(j));

    const noKey = await fetch(`${ORIGIN}/api/cron/handoff-reminders`);
    ok("크론: 비밀값 없으면 401", noKey.status === 401, `${noKey.status}`);

    if (process.env.CRON_SECRET) {
      const c = await fetch(`${ORIGIN}/api/cron/handoff-reminders`, {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      });
      const cj = await c.json().catch(() => ({}));
      const { data: gone } = await svc.from("desktop_handoffs").select("id").eq("id", stale.id).maybeSingle();
      ok("크론이 30일 지난 행을 지움", c.status === 200 && !gone, JSON.stringify(cj));
      // 알림은 따로 등록한 크론이 아니라 5분마다 도는 점검 크론이 같이 돌린다(09-24).
      const hc = await fetch(`${ORIGIN}/api/cron/health`, {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      });
      const hj = await hc.json().catch(() => ({}));
      ok("점검 크론이 넘기기 알림도 같이 돌림", hc.status === 200 && typeof hj.handoff?.sent === "number", JSON.stringify(hj.handoff));
    } else {
      console.log("- CRON_SECRET 없음 — 크론 삭제 검사 건너뜀");
    }
  }
  {
    const TEST_EMAIL = "delivered@resend.dev"; // Resend 공식 테스트 주소 — 사람에게 안 간다
    const { data: guard } = await svc
      .from("desktop_handoffs")
      .insert({ email: TEST_EMAIL })
      .select("id")
      .single();
    planted.push(guard.id);
    const r = await post("/api/handoff", { email: TEST_EMAIL, captchaToken: "probe-invalid-token" });
    const j = await r.json().catch(() => ({}));
    const hint =
      j.code === "CAPTCHA_MISCONFIGURED" ? "Vercel TURNSTILE_SECRET_KEY가 틀림(Site Key를 넣었나?)"
      : r.status === 200 ? "TURNSTILE_SECRET_KEY 없음 — 서버 보안 확인이 꺼져 있다"
      : "";
    ok("가짜 보안 확인 토큰 → 400 CAPTCHA", r.status === 400 && j.code === "CAPTCHA", `${r.status} ${j.code ?? ""} ${hint}`);
  }

  {
    const r = await post("/api/handoff", { self: true });
    ok("계정 모드: 로그인 없으면 401", r.status === 401, `${r.status}`);
  }

  {
    // 폰에서 막 가입해 아이디까지 정한 사람을 흉내 낸다(미들웨어는 metadata.username만 본다).
    const stamp = Date.now();
    const ACCOUNT = `delivered+nfprobe-${stamp}@resend.dev`;
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

    const page = await fetch(`${ORIGIN}/send`, { headers: { cookie }, redirect: "manual" });
    const html = await page.text();
    ok(
      "계정 화면 /send: 계정 이메일을 서버가 채움(입력 칸 없음)",
      page.status === 200 && html.includes(ACCOUNT) && !html.includes('placeholder="hello@example.com"'),
      `${page.status}`,
    );

    const send = (extra = {}) =>
      fetch(`${ORIGIN}/api/handoff`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ self: true, ...extra }),
      });
    const r1 = await send({ email: "someone-else@example.invalid" });
    const j1 = await r1.json().catch(() => ({}));
    const { data: rows1 } = await svc.from("desktop_handoffs").select("id, email").in("email", [ACCOUNT, "someone-else@example.invalid"]);
    ok(
      "계정 모드: 몸통에 남의 주소를 넣어도 계정 주소로만 감",
      r1.status === 200 && j1.ok === true && rows1?.length === 1 && rows1[0].email === ACCOUNT,
      `${r1.status} ${JSON.stringify(rows1?.map((x) => x.email))}`,
    );
    for (const row of rows1 ?? []) planted.push(row.id);
    const r2 = await send();
    const { data: rows2 } = await svc.from("desktop_handoffs").select("id").eq("email", ACCOUNT);
    ok("계정 모드: 두 번째 요청은 조용한 성공(새 행 없음)", r2.status === 200 && rows2?.length === 1, `${r2.status} rows=${rows2?.length}`);
  }
} finally {
  if (planted.length) await svc.from("desktop_handoffs").delete().in("id", planted);
  if (probeUserId) await svc.auth.admin.deleteUser(probeUserId);
}

console.log(failed ? `\n✗ ${failed} failed` : "\nall handoff probes passed");
process.exit(failed ? 1 : 0);
