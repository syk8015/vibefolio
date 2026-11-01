// 비상 정지 버튼(2026-11-02) prod E2E. 조건: supabase/migration_stop_buttons.sql 적용 + 배포 뒤.
//   (1) SQL 적용 확인 — 익명 키로 site_locks() 읽힘, 둘 다 꺼짐
//   (2) 쿠키 없이 /api/admin/stop → 404(관리자 전용, 존재도 안 알림)
//   (3) 끊기 함수는 익명·사용자 키로 못 부름(권한 거둠 확인 — 실서버 기본 권한이 새 함수를 열어 준다)
//   (4) 읽기 전용 켜기 → /api 쓰기 503 SITE_READONLY · 읽기·페이지는 그대로 · 사용자 키 직접 쓰기도 막힘
//   (5) 업로드 닫기 → 올리는 길만 503 UPLOADS_CLOSED · 다른 쓰기·사용자 키 수정은 됨 · 새 작품 행은 막힘
//   (6) 끝나면 늘 둘 다 끈다(실패해도 finally에서 서비스 키로 직접)
// ⚠️ [전부 끊기]는 실서버에서 누르지 않는다 — 진짜 사용자 연결이 다 끊긴다. 그 함수는 연습용 프로젝트
//    (scripts/backup/restore-drill.sh, NF_DRILL_KEEP=1)에서 시험했다.
// ⚠️ 켜고 끌 때마다 관리자에게 메일이 간다(4통). 사이트는 합쳐 30초쯤 잠긴다.
// 사용: node scripts/probe-stop-buttons.mjs
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";
import { createChunks, stringToBase64URL } from "@supabase/ssr";

const ORIGIN = "https://nookframe.com";
const ADMIN_EMAIL = "vivestarter@gmail.com";
const SPREAD_MS = 6_500; // middleware 기억 5초 + 여유

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 관리자 세션 → ssr 쿠키 헤더(비침습 magiclink)
const { data: link, error: linkErr } = await svc.auth.admin.generateLink({ type: "magiclink", email: ADMIN_EMAIL });
if (linkErr) { console.error("generateLink:", linkErr.message); process.exit(1); }
const { data: sess, error: otpErr } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
if (otpErr) { console.error("verifyOtp:", otpErr.message); process.exit(1); }
const ref = new URL(url).hostname.split(".")[0];
const cookieHeader = createChunks(`sb-${ref}-auth-token`, "base64-" + stringToBase64URL(JSON.stringify(sess.session)))
  .map((c) => `${c.name}=${c.value}`).join("; ");
const adminId = sess.user.id;
const owner = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  global: { headers: { Authorization: `Bearer ${sess.session.access_token}` } },
});

const stop = async (body, withCookie = true) => {
  const res = await fetch(`${ORIGIN}/api/admin/stop`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(withCookie ? { Cookie: cookieHeader } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const hit = async (method, path, body) => {
  const res = await fetch(`${ORIGIN}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "Accept-Language": "en" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    redirect: "manual",
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

try {
  // (1)
  const { data: locks0, error: lErr } = await anon.rpc("site_locks");
  ok("(1) site_locks() 익명으로 읽힘", !lErr && locks0 && locks0.readonly === false && locks0.uploadsClosed === false,
    lErr ? lErr.message : JSON.stringify(locks0));
  if (lErr) throw new Error("SQL 미적용 — supabase/migration_stop_buttons.sql 먼저");

  // (2)
  const noCookie = await stop({ action: "readonly", on: true }, false);
  ok("(2) 쿠키 없이 → 404", noCookie.status === 404, String(noCookie.status));

  // (3)
  const a = await anon.rpc("admin_revoke_all_access");
  ok("(3a) 익명 키로 끊기 함수 → 거절", !!a.error, a.error?.message ?? "불렸다!");
  const u = await owner.rpc("admin_revoke_all_access");
  ok("(3b) 사용자 키로 끊기 함수 → 거절", !!u.error, u.error?.message ?? "불렸다!");

  // (4) 읽기 전용
  const on = await stop({ action: "readonly", on: true });
  ok("(4) 읽기 전용 켜기 → 200", on.status === 200, `${on.status} ${JSON.stringify(on.body)}`);
  await sleep(SPREAD_MS);
  const t1 = await hit("POST", "/api/tokens", {});
  ok("(4a) POST /api/tokens → 503 SITE_READONLY", t1.status === 503 && t1.body.code === "SITE_READONLY", `${t1.status} ${t1.body.code}`);
  ok("(4a') 영어 문장(Accept-Language en)", /read-only/i.test(t1.body.error ?? ""), t1.body.error);
  const t2 = await hit("POST", "/api/ingest", {});
  ok("(4b) POST /api/ingest → 503", t2.status === 503 && t2.body.code === "SITE_READONLY", `${t2.status} ${t2.body.code}`);
  const t3 = await hit("GET", "/api/ingest/status");
  ok("(4c) GET은 안 막힘", t3.status !== 503, String(t3.status));
  const page = await fetch(`${ORIGIN}/`, { redirect: "manual" });
  ok("(4d) 첫 화면 200", page.status === 200, String(page.status));
  const t4 = await hit("POST", "/api/track", {});
  ok("(4e) 열어 둔 주소(/api/track) 안 막힘", t4.status !== 503, String(t4.status));
  const w = await owner.from("profiles").update({ updated_at: new Date().toISOString() }).eq("id", adminId);
  ok("(4f) 사용자 키 직접 쓰기 → SITE_READONLY", (w.error?.message ?? "").includes("SITE_READONLY"), w.error?.message ?? "막히지 않음");
  const st = await stop({ action: "readonly", on: false });
  ok("(4g) 읽기 전용 풀기 → 200 (잠긴 중에도 관리자 주소는 열림)", st.status === 200, String(st.status));

  // (5) 업로드 닫기
  const up = await stop({ action: "uploads", on: true });
  ok("(5) 업로드 닫기 → 200", up.status === 200, String(up.status));
  await sleep(SPREAD_MS);
  const s1 = await hit("POST", "/api/storage/sign", {});
  ok("(5a) POST /api/storage/sign → 503 UPLOADS_CLOSED", s1.status === 503 && s1.body.code === "UPLOADS_CLOSED", `${s1.status} ${s1.body.code}`);
  const s2 = await hit("POST", "/api/tokens", {});
  ok("(5b) 올리는 길 아닌 쓰기는 그대로(로그인 없음 401)", s2.status === 401, String(s2.status));
  const w2 = await owner.from("profiles").update({ updated_at: new Date().toISOString() }).eq("id", adminId);
  ok("(5c) 사용자 키 프로필 수정은 됨", !w2.error, w2.error?.message ?? "");
  const ins = await owner.from("projects").insert({ user_id: adminId, title: "__probe_stop_DONOTKEEP__", demo_url: "https://example.com/" }).select("id");
  ok("(5d) 사용자 키 새 작품 → UPLOADS_CLOSED", (ins.error?.message ?? "").includes("UPLOADS_CLOSED"), ins.error?.message ?? "막히지 않음");
  if (!ins.error && ins.data?.[0]?.id) await svc.from("projects").delete().eq("id", ins.data[0].id);
  const uo = await stop({ action: "uploads", on: false });
  ok("(5e) 업로드 다시 열기 → 200", uo.status === 200, String(uo.status));
} catch (err) {
  ok("예외", false, err instanceof Error ? err.message : String(err));
} finally {
  // (6) 무슨 일이 있어도 열어 둔다.
  await svc.from("system_status").update({ site_readonly_at: null, uploads_closed_at: null }).eq("id", "singleton");
  const { data: after } = await anon.rpc("site_locks");
  ok("(6) 끝 — 둘 다 꺼짐", after && after.readonly === false && after.uploadsClosed === false, JSON.stringify(after));
}

console.log(failed ? `\n${failed}건 실패` : "\n모두 통과");
process.exit(failed ? 1 : 0);
