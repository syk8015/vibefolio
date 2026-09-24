// 홍보 예약 대기열 1단계 prod E2E (docs/promo-publish.md §2.3·§2.4, 2026-09-25).
//
// 검증: (0) 새 칸 존재(migration_promo_queue.sql) (1) 로그인 없이 [예약] → 404(관리자 라우트는 숨긴다)
// (2) 캡션이 비면 400 CAPTION_REQUIRED (3) 예약 → 한국어 클립은 스레드 한 채널, 한국 21시 칸,
//     지금+30분 뒤, 다른 예약과 같은 날 아님 (4) 다시 눌러도 같은 행·같은 칸
// (5) 예약 중 캡션 비우기 → 409 (6) 서버가 올리는 중(publishing)이면 [올렸음]·지우기 거절
// (7) 예약 취소 → draft·시각 비움 (8) 표 제약: queued인데 시각 없음·모르는 상태·같은 클립+채널 중복 거절
//
// 사용: 레포 루트에서 `node scripts/probe-promo-queue.mjs`
// 관리자 계정 세션을 잠깐 만들어 쓴다(probe-attribution.mjs와 같은 방식). 버리는 클립 하나를
// 만들고 끝나면 지운다(포스트는 cascade). 실제 게시는 없다 — 1단계엔 올리는 코드가 없다.
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";
import { createChunks, stringToBase64URL } from "@supabase/ssr";

const ORIGIN = process.env.PROBE_ORIGIN ?? "https://nookframe.com";
const ADMIN_EMAIL = "vivestarter@gmail.com";
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const REF = new URL(SUPA_URL).hostname.split(".")[0];
const svc = createClient(SUPA_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(SUPA_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${String(detail).slice(0, 200)}` : ""}`);
  if (!pass) failed++;
};

async function adminCookie() {
  const { data, error } = await svc.auth.admin.generateLink({ type: "magiclink", email: ADMIN_EMAIL });
  if (error) throw new Error(`generateLink 실패: ${error.message}`);
  const { data: v, error: vErr } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: data.properties.hashed_token });
  if (vErr) throw new Error(`verifyOtp 실패: ${vErr.message}`);
  const value = `base64-${stringToBase64URL(JSON.stringify(v.session))}`;
  return createChunks(`sb-${REF}-auth-token`, value).map((c) => `${c.name}=${c.value}`).join("; ");
}

{
  const { error } = await svc.from("promo_posts").select("scheduled_at, external_id, fail_reason, attempts").limit(1);
  ok("(0) promo_posts 새 칸 존재", !error, error ? `${error.code} ${error.message}` : "");
  if (error) {
    console.error("supabase/migration_promo_queue.sql을 먼저 적용하세요.");
    process.exit(1);
  }
}

const cookie = await adminCookie();
const call = (method, path, body, withAuth = true) =>
  fetch(`${ORIGIN}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(withAuth ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const KST = 9 * 3600e3;

const { data: clip, error: clipErr } = await svc
  .from("promo_clips")
  .insert({ status: "done", tagline_locale: "ko", tagline_text: `DONOTKEEP 예약 검증 ${Date.now()}` })
  .select("id")
  .single();
if (clipErr) throw new Error(`클립 심기 실패: ${clipErr.message}`);
const sched = `/api/admin/promo/clips/${clip.id}/schedule`;

try {
  {
    const r = await call("POST", sched, undefined, false);
    // requireAdmin은 관리자 아닌 요청에 404를 준다 — 관리자 주소가 있다는 것도 숨긴다.
    ok("(1) 로그인 없이 [예약] → 404", r.status === 404, r.status);
  }
  {
    const r = await call("POST", sched);
    const j = await r.json().catch(() => ({}));
    ok("(2) 캡션 없으면 400 CAPTION_REQUIRED", r.status === 400 && j.code === "CAPTION_REQUIRED", `${r.status} ${j.code}`);
  }

  await call("PATCH", `/api/admin/promo/clips/${clip.id}`, { caption: "검증용 캡션" });
  let postId;
  let slot;
  {
    const { data: others } = await svc
      .from("promo_posts")
      .select("scheduled_at")
      .eq("channel", "스레드")
      .eq("status", "queued")
      .neq("clip_id", clip.id);
    const r = await call("POST", sched);
    const j = await r.json().catch(() => ({}));
    const p = j.posts?.[0];
    postId = p?.postId;
    slot = p?.scheduledAt;
    const at = Date.parse(slot);
    const k = new Date(at + KST);
    const day = (ms) => new Date(ms + KST).toISOString().slice(0, 10);
    ok("(3) 예약 → 스레드 한 채널 queued", r.status === 200 && j.posts?.length === 1 && p.channel === "스레드" && p.status === "queued", JSON.stringify(j));
    ok("(3) 한국 21:00 칸", k.getUTCHours() === 21 && k.getUTCMinutes() === 0, slot);
    ok("(3) 지금+30분 뒤", at >= Date.now() + 29 * 60e3, slot);
    ok("(3) 다른 예약과 같은 날 아님", !(others ?? []).some((o) => day(Date.parse(o.scheduled_at)) === day(at)));
  }
  {
    const r = await call("POST", sched);
    const j = await r.json().catch(() => ({}));
    ok("(4) 다시 눌러도 같은 행·같은 칸", j.posts?.[0]?.postId === postId && Date.parse(j.posts?.[0]?.scheduledAt) === Date.parse(slot), JSON.stringify(j));
  }
  {
    const r = await call("PATCH", `/api/admin/promo/clips/${clip.id}`, { caption: "" });
    const j = await r.json().catch(() => ({}));
    ok("(5) 예약 중 캡션 비우기 → 409", r.status === 409 && j.code === "CAPTION_REQUIRED_WHILE_QUEUED", `${r.status} ${j.code}`);
  }
  {
    await svc.from("promo_posts").update({ status: "publishing" }).eq("id", postId);
    const r1 = await call("PATCH", `/api/admin/promo/posts/${postId}`, { status: "posted" });
    const r2 = await call("DELETE", `/api/admin/promo/posts/${postId}`);
    const { data: row } = await svc.from("promo_posts").select("status").eq("id", postId).single();
    ok("(6) publishing이면 [올렸음] 거절", r1.status === 404, r1.status);
    ok("(6) publishing이면 지우기 거절", r2.status === 409, r2.status);
    ok("(6) 행은 그대로 publishing", row?.status === "publishing", row?.status);
    const r3 = await call("DELETE", sched);
    const j3 = await r3.json().catch(() => ({}));
    ok("(6) 예약 취소도 publishing은 안 건드림", (j3.canceled ?? []).length === 0, JSON.stringify(j3));
    await svc.from("promo_posts").update({ status: "queued" }).eq("id", postId);
  }
  {
    const r = await call("DELETE", sched);
    const j = await r.json().catch(() => ({}));
    const { data: row } = await svc.from("promo_posts").select("status, scheduled_at").eq("id", postId).single();
    ok("(7) 예약 취소 → draft·시각 비움", r.status === 200 && j.canceled?.[0] === "스레드" && row?.status === "draft" && row?.scheduled_at === null, JSON.stringify(row));
  }
  {
    const e1 = (await svc.from("promo_posts").update({ status: "queued", scheduled_at: null }).eq("id", postId)).error;
    ok("(8) queued인데 시각 없음 → 거절", e1?.code === "23514", e1?.code);
    const e2 = (await svc.from("promo_posts").update({ status: "bogus" }).eq("id", postId)).error;
    ok("(8) 모르는 상태 → 거절", e2?.code === "23514", e2?.code);
    const e3 = (await svc.from("promo_posts").insert({ clip_id: clip.id, channel: "스레드" })).error;
    ok("(8) 같은 클립+채널 중복 → 거절", e3?.code === "23505", e3?.code);
  }
} finally {
  const { error } = await svc.from("promo_clips").delete().eq("id", clip.id);
  ok("정리: 버리는 클립 삭제", !error, error?.message);
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
