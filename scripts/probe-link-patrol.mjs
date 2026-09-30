// 공개 작품 링크 순찰 실서버 E2E (lib/linkPatrol.ts, supabase/migration_link_patrol.sql).
//
// 공개 probe 작품 3개를 심고, 순찰 기록을 관리자 권한으로 "하루 전에 이미 봤다"로 맞춘 뒤
// 점검 크론을 한 번 부른다:
//   A — 처음엔 example.com에 도착했는데 지금은 example.org로 넘어가는 주소 → moved + 명함에서 체험 주소 숨김
//   B — 3일 넘게 안 열린 주소(없는 도메인) → dead
//   C — 멀쩡한 주소 → 표시 없음, 순찰 기록이 새로 찍힘
// 그리고 (4) 사용자 키로 link_state를 못 쓴다 (5) 주인이 주소를 고치면 다음 틱에 먼저 다시 본다.
// WEB_RISK_API_KEY가 실서버에 있으면 크론 응답의 links.webRisk=true — 그때만 (6) 구글 시험 주소가 unsafe.
//
// ⚠️ 크론을 직접 부르니 그 틱의 다른 점검(경보 메일 포함, 창마다 한 번)도 같이 돈다. 검사 동안(1분 안팎)
//    probe 작품이 공개 상태라 첫 화면에 probe 계정이 잠깐 뜬다. 끝나면 계정째 지운다.
// 사용: `node scripts/probe-link-patrol.mjs` (CRON_SECRET 필요)
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";
import { createChunks, stringToBase64URL } from "@supabase/ssr";

const ORIGIN = process.env.PROBE_ORIGIN ?? "https://nookframe.com";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${String(detail).slice(0, 220)}` : ""}`);
  if (!pass) failed++;
};
if (!process.env.CRON_SECRET) {
  console.error("CRON_SECRET이 없어 크론을 부를 수 없어요.");
  process.exit(1);
}
const tick = async () => {
  const r = await fetch(`${ORIGIN}/api/cron/health`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  return r.json().catch(() => ({}));
};
const state = async (id) =>
  (await svc.from("projects").select("link_state, link_state_detail, link_checked_at, link_baseline_host").eq("id", id).single()).data;

// A: httpbin이 example.org로 넘긴다 — 리다이렉터가 살아 있는지 먼저 본다.
const MOVER = `https://httpbin.org/redirect-to?url=${encodeURIComponent("https://example.org/")}`;
const DEAD = "https://nf-probe-dead-link.invalid/";
const GOOD = "https://example.com/";
const UNSAFE = "http://testsafebrowsing.appspot.com/s/phishing.html"; // 구글 공식 시험 주소

let userId = null;
try {
  const pre = await fetch(MOVER, { redirect: "manual", signal: AbortSignal.timeout(6000) }).catch(() => null);
  const moverUp = !!pre && pre.status >= 300 && pre.status < 400;
  if (!moverUp) console.log(`- httpbin 리다이렉터 응답 없음(${pre?.status ?? "연결 실패"}) — A는 건너뜀`);

  const stamp = Date.now();
  const username = `nfprobelp${stamp}`.slice(0, 30);
  const email = `delivered+nfprobe-lp-${stamp}@resend.dev`;
  const { data: created, error: cErr } = await svc.auth.admin.createUser({ email, email_confirm: true, user_metadata: { username } });
  if (cErr) throw cErr;
  userId = created.user.id;
  await svc.from("profiles").upsert({ id: userId, username, name: "NF probe" });

  const dayAgo = new Date(Date.now() - 25 * 3_600_000).toISOString();
  const fourDays = new Date(Date.now() - 4 * 24 * 3_600_000).toISOString();
  const mk = async (title, demo_url, patrol) => {
    const { data, error } = await svc.from("projects").insert({ user_id: userId, title, demo_url, is_draft: false, primary_locale: "ko" }).select("id").single();
    if (error) throw error;
    if (patrol) await svc.from("projects").update(patrol).eq("id", data.id);
    return data.id;
  };
  const A = moverUp ? await mk("NF probe mover", MOVER, { link_checked_url: MOVER, link_checked_at: dayAgo, link_baseline_host: "example.com" }) : null;
  const B = await mk("NF probe dead", DEAD, { link_checked_url: DEAD, link_checked_at: dayAgo, link_fail_since: fourDays });
  const C = await mk("NF probe good", GOOD, null);
  const D = await mk("NF probe unsafe", UNSAFE, null);

  const r = await tick();
  ok("크론이 순찰을 돌림", typeof r.links?.checked === "number" && r.links.checked >= 3, JSON.stringify(r.links));

  if (A) {
    const s = await state(A);
    ok("A 딴 사이트로 넘김 → moved(example.org)", s?.link_state === "moved" && s?.link_state_detail === "example.org", JSON.stringify(s));
    // 명함 원문에 체험 주소가 없는지(캐시는 주인 쿠키로 비운다)
    const { data: link } = await svc.auth.admin.generateLink({ type: "magiclink", email });
    const user = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data: sess } = await user.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
    const ref = new URL(URL_).hostname.split(".")[0];
    const cookie = createChunks(`sb-${ref}-auth-token`, "base64-" + stringToBase64URL(JSON.stringify(sess.session)))
      .map((c) => `${c.name}=${c.value}`).join("; ");
    await fetch(`${ORIGIN}/api/revalidate`, { method: "POST", headers: { cookie } });
    const work = await (await fetch(`${ORIGIN}/${username}/${A}?nfp=${stamp}`)).text();
    ok("A 작품 화면에 체험 주소 없음(작품은 보임)", work.includes("NF probe mover") && !work.includes("httpbin.org/redirect-to"), "");
    // (4) 사용자 키로 못 씀
    const w = await user.from("projects").update({ link_state: null }).eq("id", A);
    ok("사용자 키로 link_state 못 씀", !!w.error, w.error?.code ?? "써짐");
    // (5) 주인이 주소를 고치면 다음 틱에 먼저 다시 본다
    await user.from("projects").update({ demo_url: GOOD }).eq("id", A);
    await tick();
    const s2 = await state(A);
    ok("주소를 고치면 다음 틱에 다시 보고 표시가 풀림", s2?.link_state === null, JSON.stringify(s2));
  }
  {
    const s = await state(B);
    ok("B 3일 넘게 안 열림 → dead", s?.link_state === "dead", JSON.stringify(s));
  }
  {
    const s = await state(C);
    ok("C 멀쩡한 주소 → 표시 없음 + 기준 호스트 기록", s?.link_state === null && s?.link_baseline_host === "example.com" && !!s?.link_checked_at, JSON.stringify(s));
  }
  {
    const s = await state(D);
    if (r.links?.webRisk) ok("D 구글 시험 피싱 주소 → unsafe", s?.link_state === "unsafe", JSON.stringify(s));
    else console.log(`- WEB_RISK_API_KEY 없음 — 위험 목록 검사 건너뜀 (D: ${JSON.stringify(s?.link_state)})`);
  }
} finally {
  if (userId) {
    await svc.from("projects").delete().eq("user_id", userId);
    await svc.from("profiles").delete().eq("id", userId);
    await svc.auth.admin.deleteUser(userId);
  }
}

console.log(failed ? `\n✗ ${failed} failed` : "\nall link-patrol probes passed");
process.exit(failed ? 1 : 0);
