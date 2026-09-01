// 유입 귀속 e2e — 추적 링크 → 방문 집계 → 가입 귀속 → /admin/promo 숫자 (2026-08-26).
//
// 홍보 클립 팩토리를 만들어 놓고 **한 번도 안 해본** 검증이다: 링크를 타고 온
// 사람이 가입하면 그게 그 클립의 성적으로 붙는가? 붙지 않으면 클립을 아무리
// 찍어도 뭐가 먹혔는지 알 수 없다.
//
// 사슬 4칸 (전부 실서버 · 실브라우저):
//   1. FirstTouch가 utm을 localStorage에 담고 promo_link_visit을 쏜다
//   2. 같은 세션 새로고침은 안 센다(sessionStorage 디덥) / **새 세션은 다시 센다**
//      ← 2026-08-19에 고친 재방문 누수의 회귀 가드
//   3. 온보딩에서 username을 확정하면 signup_completed에 그때의 utm이 실린다
//   4. /admin/promo가 그 두 이벤트를 캠페인으로 묶어 "유입 N · 가입 M"으로 그린다
//
// 가입은 Turnstile 때문에 폼으로 못 하지만, 퍼널의 정의는 **온보딩 username 확정**
// 이라 거기까지 세션을 만들어 들어가면 귀속 경로는 실물 그대로 지난다.
//
// 사용: node scripts/probe-attribution.mjs
// (일회성 .verify-*.mjs로 만들었다가 남겼다 — 홍보 트랙이 계속 바뀌는데 이 사슬을
//  지키는 가드가 이거 하나뿐이다. 실 auth 유저·클립·포스트를 만들고 끝나면 지운다.)
// 서비스롤 키는 macOS 키체인에서 온다(파일 폴백) — scripts/_secrets.mjs 참조.
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";
import { createChunks, stringToBase64URL } from "@supabase/ssr";
import { chromium } from "playwright-core";
import { randomUUID } from "node:crypto";

const ORIGIN = "https://nookframe.com";
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const REF = new URL(SUPA_URL).hostname.split(".")[0];
const MARK = "DONOTKEEP";

const svc = createClient(SUPA_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(SUPA_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

// 세션 → 서버가 읽는 쿠키(레시피: @supabase/ssr createChunks).
function sessionCookies(session) {
  const value = `base64-${stringToBase64URL(JSON.stringify(session))}`;
  return createChunks(`sb-${REF}-auth-token`, value).map((c) => ({
    name: c.name,
    value: c.value,
    domain: "nookframe.com",
    path: "/",
    httpOnly: false,
    secure: true,
    sameSite: "Lax",
  }));
}

async function sessionFor(email) {
  const { data, error } = await svc.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(`generateLink 실패: ${error.message}`);
  const { data: v, error: vErr } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: data.properties.hashed_token,
  });
  if (vErr) throw new Error(`verifyOtp 실패: ${vErr.message}`);
  return v.session;
}

// /api/analytics로 나가는 이벤트를 그대로 엿본다 — "쐈다고 주장"이 아니라 실제 본문.
function watchAnalytics(page, sink) {
  page.on("request", (req) => {
    if (req.method() !== "POST" || !req.url().includes("/api/analytics")) return;
    try {
      sink.push(JSON.parse(req.postData() ?? "{}"));
    } catch {
      sink.push({ parseError: req.postData() });
    }
  });
}
const settle = (ms = 2500) => new Promise((r) => setTimeout(r, ms));

// ── 준비: throwaway 클립 + 포스트 ───────────────────────────────────────
const TAGLINE = `${MARK} 유입 귀속 검증 문구`;
const CHANNEL = `${MARK}-채널`;
const { data: clip, error: clipErr } = await svc
  .from("promo_clips")
  .insert({ status: "done", tagline_locale: "ko", tagline_text: TAGLINE, requested_by: `${MARK}@probe` })
  .select("id")
  .single();
if (clipErr) throw new Error(`promo_clips 생성 실패: ${clipErr.message}`);
const { data: post, error: postErr } = await svc
  .from("promo_posts")
  .insert({ clip_id: clip.id, channel: CHANNEL, status: "posted", posted_at: new Date().toISOString() })
  .select("id")
  .single();
if (postErr) throw new Error(`promo_posts 생성 실패: ${postErr.message}`);

const campaign = `promo-${post.id}`;
const trackingUrl = `${ORIGIN}/?utm_source=${encodeURIComponent(CHANNEL)}&utm_medium=promo_clip&utm_campaign=${campaign}`;
console.log(`[준비] 추적 링크 ${trackingUrl}\n`);

const email = `probe-${MARK.toLowerCase()}-${randomUUID().slice(0, 8)}@nookframe-probe.invalid`;
let newUserId = null;
const browser = await chromium.launch({ channel: "chrome", headless: true });

try {
  // ── 1칸: 첫 방문 ───────────────────────────────────────────────────────
  const ctx1 = await browser.newContext();
  const p1 = await ctx1.newPage();
  const seen1 = [];
  watchAnalytics(p1, seen1);
  await p1.goto(trackingUrl, { waitUntil: "networkidle" });
  await settle();
  const visits1 = seen1.filter((e) => e.event === "promo_link_visit");
  ok("(1) 첫 방문에 promo_link_visit 발사", visits1.length === 1, `${visits1.length}건`);
  ok("(1) 캠페인·소스가 실려 있음", visits1[0]?.props?.utm_campaign === campaign && visits1[0]?.props?.utm_source === CHANNEL, JSON.stringify(visits1[0]?.props));

  const ft = await p1.evaluate(() => localStorage.getItem("nf_first_touch"));
  const ftObj = ft ? JSON.parse(ft) : null;
  ok("(1) first-touch가 localStorage에 저장", !!ftObj, ft ?? "null");
  ok("(1) first-touch에 utm 3종", ftObj?.utm_campaign === campaign && ftObj?.utm_medium === "promo_clip" && ftObj?.utm_source === CHANNEL, JSON.stringify(ftObj));

  // ── 2칸: 같은 세션 새로고침은 안 센다 ──────────────────────────────────
  seen1.length = 0;
  await p1.reload({ waitUntil: "networkidle" });
  await settle();
  ok("(2) 같은 세션 새로고침은 중복 집계 안 함", seen1.filter((e) => e.event === "promo_link_visit").length === 0, JSON.stringify(seen1.map((e) => e.event)));
  await ctx1.close();

  // ── 2칸b: 새 세션(재방문)은 다시 센다 — 08-19 누수 회귀 가드 ───────────
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  const seen2 = [];
  watchAnalytics(p2, seen2);
  await p2.goto(trackingUrl, { waitUntil: "networkidle" });
  await settle();
  ok("(2b) 새 세션 재방문도 집계", seen2.filter((e) => e.event === "promo_link_visit").length === 1, `${seen2.filter((e) => e.event === "promo_link_visit").length}건`);
  await ctx2.close();

  // ── 3칸: 링크로 들어와서 가입까지 ──────────────────────────────────────
  const { data: created, error: cErr } = await svc.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { locale: "ko" },
  });
  if (cErr) throw new Error(`유저 생성 실패: ${cErr.message}`);
  newUserId = created.user.id;

  const ctx3 = await browser.newContext();
  const p3 = await ctx3.newPage();
  const seen3 = [];
  watchAnalytics(p3, seen3);
  // 실제 사람의 순서 그대로: 먼저 추적 링크로 들어오고(=first-touch 저장), 그 다음 가입.
  await p3.goto(trackingUrl, { waitUntil: "networkidle" });
  await settle();
  await ctx3.addCookies(sessionCookies(await sessionFor(email)));

  const username = `p${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  await p3.goto(`${ORIGIN}/onboarding`, { waitUntil: "networkidle" });
  const input = p3.locator('input[type="text"]').first();
  await input.waitFor({ timeout: 20_000 });
  await input.fill(username);
  seen3.length = 0;
  await p3.locator('button[type="submit"]').first().click();
  await p3.waitForURL(/\/dashboard/, { timeout: 30_000 }).catch(() => {});
  await settle(3000);

  const signups = seen3.filter((e) => e.event === "signup_completed");
  ok("(3) 온보딩 완료에 signup_completed 발사", signups.length === 1, `${signups.length}건 · ${JSON.stringify(seen3.map((e) => e.event))}`);
  ok("(3) 가입 이벤트에 캠페인이 붙음", signups[0]?.props?.utm_campaign === campaign, JSON.stringify(signups[0]?.props));
  ok("(3) medium·source도 함께", signups[0]?.props?.utm_medium === "promo_clip" && signups[0]?.props?.utm_source === CHANNEL, JSON.stringify(signups[0]?.props));
  await ctx3.close();

  // ── DB: 실제로 쌓였는가 ────────────────────────────────────────────────
  const { data: rows } = await svc
    .from("analytics_events")
    .select("event, props, user_id")
    .in("event", ["promo_link_visit", "signup_completed"]);
  const mine = (rows ?? []).filter((r) => r.props?.utm_campaign === campaign);
  const dbVisits = mine.filter((r) => r.event === "promo_link_visit").length;
  const dbSignups = mine.filter((r) => r.event === "signup_completed").length;
  ok("(DB) 방문 3건 적재", dbVisits === 3, `${dbVisits}건`);
  ok("(DB) 가입 1건 적재", dbSignups === 1, `${dbSignups}건`);

  // ── 4칸: 관제탑이 그 숫자를 그리는가 ───────────────────────────────────
  const ctxA = await browser.newContext();
  await ctxA.addCookies(sessionCookies(await sessionFor("vivestarter@gmail.com")));
  const pa = await ctxA.newPage();
  const res = await pa.goto(`${ORIGIN}/admin/promo`, { waitUntil: "networkidle" });
  ok("(4) /admin/promo 열림(관리자)", res?.status() === 200, String(res?.status()));
  const body = await pa.locator("body").innerText();
  ok("(4) 문구별 성적에 우리 문구", body.includes(TAGLINE), body.slice(0, 120).replace(/\n/g, " "));
  ok("(4) 채널별 성적에 우리 채널", body.includes(CHANNEL), "");
  ok("(4) '유입 3 · 가입 1'로 집계", /유입 3 · 가입 1/.test(body), (body.match(/유입 \d+ · 가입 \d+[^\n]*/g) ?? []).join(" | "));
  await ctxA.close();
} finally {
  await browser.close().catch(() => {});
  // 정리 — 프로브가 만든 것만.
  await svc.from("analytics_events").delete().contains("props", { utm_campaign: campaign });
  await svc.from("promo_posts").delete().eq("clip_id", clip.id);
  await svc.from("promo_clips").delete().eq("id", clip.id);
  if (newUserId) {
    await svc.from("profiles").delete().eq("id", newUserId);
    await svc.auth.admin.deleteUser(newUserId);
  }
  const { data: left } = await svc.from("promo_clips").select("id").ilike("tagline_text", `%${MARK}%`);
  console.log(`[cleanup] 남은 throwaway 클립 ${left?.length ?? 0}개 · 유저 삭제 ${newUserId ? "완료" : "없음"}`);
}

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
