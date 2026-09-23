// 폰 → 컴퓨터 넘기기(docs/desktop-handoff.md) prod E2E. 실제 메일은 보내지 않는다.
//
// 검증: (0) 표 존재 (1) 익명 키로 표 못 읽음(이메일이 든 표) (2) 이메일 모양 틀리면 400
// (3) 모르는 id로 open → ok:false (4) 심은 행 open → 이메일·first-touch 돌려줌 + opened_at
// (5) 두 번째 open은 opened_at 그대로 (6) 30일 지난 행은 안 채움 (7) 크론 비밀값 없으면 401
// (8) 크론이 30일 지난 행을 지운다(CRON_SECRET이 있을 때만)
// (9) 가짜 보안 확인 토큰 → 400 CAPTCHA. 500 CAPTCHA_MISCONFIGURED면 Vercel의
//     TURNSTILE_SECRET_KEY가 틀림(Site Key를 넣었을 가능성), 200이면 비밀값이 없음(확인 꺼짐).
//     혹시 확인이 꺼져 있어도 메일이 나가지 않게, Resend 테스트 주소 행을 먼저 심어
//     "같은 주소 하루 1통"에 걸리게 한다.
//
// 사용: 레포 루트에서 `node scripts/probe-handoff.mjs`
// 주의: handoff-open 버킷(IP당 분당 20) 3~4회, handoff 버킷(IP당 시간당 5) 1회 소비.
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";

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
const EMAIL = `probe-handoff-${Date.now()}@example.invalid`;
try {
  const { data: row } = await svc
    .from("desktop_handoffs")
    .insert({ email: EMAIL, locale: "en", remind: true, first_touch: { utm_source: "probe", utm_campaign: "promo-probe" } })
    .select("id")
    .single();
  planted.push(row.id);

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
} finally {
  if (planted.length) await svc.from("desktop_handoffs").delete().in("id", planted);
}

console.log(failed ? `\n✗ ${failed} failed` : "\nall handoff probes passed");
process.exit(failed ? 1 : 0);
