// 관리자 추가 인증(2026-11-02, lib/adminStepUp.ts) prod E2E. 조건: supabase/migration_admin_stepup.sql 적용 + 배포.
//   (1) 집 나라 칸이 있다 · 이 맥(집 나라)의 관리자 로그인은 /admin 200 · /admin/verify 200 · 로그인 없으면 404
//   (2) 집 나라를 잠깐 'ZZ'로 바꿔 '처음 보는 나라'를 만든다 →
//       /admin·/admin/promo는 /admin/verify?next=…로 보냄 · 관리자 API는 404 · 확인 화면은 6자리 칸(또는 못 연다는 글)
//   (3) --aal2 일 때만(인증 앱을 아직 등록 안 했을 때): 시험용 인증 앱을 달고 6자리를 계산해 넣는다 →
//       aal2 로그인은 'ZZ'에서도 /admin 200 · 관리자 API가 404가 아님 → 시험용 인증 앱은 끝에서 늘 지운다
//       ⚠️ 인증 앱 등록을 마치면 Supabase가 이 계정의 다른 로그인을 전부 끊는다(네 브라우저도 다시 로그인).
//   (4) 끝나면 집 나라 칸을 원래대로(실패해도 finally)
// ⚠️ 메일 1통(인증 앱 확인에서 멈춤 — 나라마다 하루 1통이라 다시 돌리면 안 온다).
// 사용: node scripts/probe-admin-stepup.mjs [--aal2]
import "./_secrets.mjs";
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createChunks, stringToBase64URL } from "@supabase/ssr";

const ORIGIN = "https://nookframe.com";
const ADMIN_EMAIL = "vivestarter@gmail.com";
const withAal2 = process.argv.includes("--aal2");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ref = new URL(url).hostname.split(".")[0];

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

const cookieOf = (session) =>
  createChunks(`sb-${ref}-auth-token`, "base64-" + stringToBase64URL(JSON.stringify(session)))
    .map((c) => `${c.name}=${c.value}`).join("; ");
const get = (path, cookie) => fetch(`${ORIGIN}${path}`, { redirect: "manual", headers: cookie ? { Cookie: cookie } : {} });
const stopApi = (cookie) =>
  fetch(`${ORIGIN}/api/admin/stop`, {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ action: "nope" }),
  });
const setHomes = (homes) => svc.from("system_status").update({ admin_home_countries: homes }).eq("id", "singleton");

// RFC 6238 — 인증 앱이 하는 계산 그대로(30초, 6자리, SHA-1).
function base32(s) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of s.replace(/=+$/, "").toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, "0");
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}
function totp(secret) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const h = createHmac("sha1", base32(secret)).update(buf).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

// 관리자 로그인(aal1, 비침습 magiclink)
const userClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: link, error: linkErr } = await svc.auth.admin.generateLink({ type: "magiclink", email: ADMIN_EMAIL });
if (linkErr) { console.error("generateLink:", linkErr.message); process.exit(1); }
const { data: sess, error: otpErr } = await userClient.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
if (otpErr) { console.error("verifyOtp:", otpErr.message); process.exit(1); }
const adminId = sess.user.id;
const cookie = cookieOf(sess.session);

const { data: row0, error: rowErr } = await svc.from("system_status").select("admin_home_countries").eq("id", "singleton").single();
const original = row0?.admin_home_countries;
let tempFactorId = null;

try {
  // (1)
  ok("(1a) 집 나라 칸이 있다", !rowErr && Array.isArray(original), rowErr?.message ?? JSON.stringify(original));
  if (rowErr) throw new Error("SQL 미적용 — supabase/migration_admin_stepup.sql 먼저");
  const home = await get("/admin", cookie);
  ok("(1b) 집 나라 관리자 → /admin 200", home.status === 200, `${home.status} ${home.headers.get("location") ?? ""}`);
  const v1 = await get("/admin/verify", cookie);
  ok("(1c) 집 나라 /admin/verify 200", v1.status === 200, String(v1.status));
  const anonV = await get("/admin/verify");
  ok("(1d) 로그인 없이 /admin/verify → 404", anonV.status === 404, String(anonV.status));

  const { data: factors } = await svc.auth.admin.mfa.listFactors({ userId: adminId });
  const hasReal = (factors?.factors ?? []).some((f) => f.factor_type === "totp" && f.status === "verified");
  console.log(`  (인증 앱 등록: ${hasReal ? "있음" : "없음"})`);

  // (2)
  await setHomes(["ZZ"]);
  const r1 = await get("/admin", cookie);
  const loc1 = r1.headers.get("location") ?? "";
  ok("(2a) 처음 보는 나라 → /admin이 확인 화면으로", r1.status >= 300 && r1.status < 400 && loc1.includes("/admin/verify?next=%2Fadmin"), `${r1.status} ${loc1}`);
  const r2 = await get("/admin/promo", cookie);
  const loc2 = r2.headers.get("location") ?? "";
  ok("(2b) /admin/promo도 → 돌아갈 곳 /admin/promo", loc2.includes("next=%2Fadmin%2Fpromo"), `${r2.status} ${loc2}`);
  const api = await stopApi(cookie);
  ok("(2c) 관리자 API → 404", api.status === 404, String(api.status));
  const v2 = await get("/admin/verify?next=%2Fadmin", cookie);
  const html = await v2.text();
  const want = hasReal ? "인증 앱 확인" : "여기서는 열 수 없어요";
  ok(`(2d) 확인 화면 200 · '${want}'`, v2.status === 200 && html.includes(want), String(v2.status));
  ok("(2e) 등록 화면은 안 나옴(훔친 세션이 자기 앱을 못 닮)", !html.includes("QR 코드 만들기"));

  // (3)
  if (withAal2) {
    if (hasReal) {
      console.log("  (3) 건너뜀 — 진짜 인증 앱이 있어 시험용을 달 수 없다(aal2가 있어야 더 단다)");
    } else {
      await userClient.auth.setSession({ access_token: sess.session.access_token, refresh_token: sess.session.refresh_token });
      const { data: en, error: enErr } = await userClient.auth.mfa.enroll({ factorType: "totp", friendlyName: `__probe_${Date.now()}` });
      if (enErr) throw new Error(`enroll: ${enErr.message}`);
      tempFactorId = en.id;
      const { error: vErr } = await userClient.auth.mfa.challengeAndVerify({ factorId: en.id, code: totp(en.totp.secret) });
      ok("(3a) 계산한 6자리로 확인됨", !vErr, vErr?.message ?? "");
      const { data: s2 } = await userClient.auth.getSession();
      const aalCookie = cookieOf(s2.session);
      const a1 = await get("/admin", aalCookie);
      ok("(3b) aal2 로그인 → 처음 보는 나라에서도 /admin 200", a1.status === 200, `${a1.status} ${a1.headers.get("location") ?? ""}`);
      const a2 = await stopApi(aalCookie);
      ok("(3c) aal2 → 관리자 API가 열림(잘못된 요청이라 400)", a2.status === 400, String(a2.status));
      const old = await stopApi(cookie);
      ok("(3d) 옛 aal1 로그인은 여전히 404", old.status === 404, String(old.status));
    }
  }
} catch (err) {
  ok("예외", false, err instanceof Error ? err.message : String(err));
} finally {
  // (4)
  if (Array.isArray(original)) await setHomes(original);
  if (tempFactorId) {
    const { error } = await svc.auth.admin.mfa.deleteFactor({ userId: adminId, id: tempFactorId });
    ok("시험용 인증 앱 지움", !error, error?.message ?? "");
  }
  const { data: end } = await svc.from("system_status").select("admin_home_countries").eq("id", "singleton").single();
  ok("(4) 끝 — 집 나라 칸 원래대로", JSON.stringify(end?.admin_home_countries) === JSON.stringify(original), JSON.stringify(end?.admin_home_countries));
}

console.log(failed ? `\n${failed}건 실패` : "\n모두 통과");
process.exit(failed ? 1 : 0);
