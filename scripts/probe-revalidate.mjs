// /api/revalidate(공개 화면 캐시 비우기) prod E2E.
//   (1) 쿠키 없이 → 401 (남이 공용 캐시를 마구 비우지 못하게)
//   (2) 로그인 세션 → 204
//   (3) GET → 405 (POST 전용)
// 세션은 비침습 magiclink(generateLink→verifyOtp)로 만든다 — 비번 안 건드림.
// 사용: node scripts/probe-revalidate.mjs
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";
import { createChunks, stringToBase64URL } from "@supabase/ssr";

const ORIGIN = "https://nookframe.com";
const EMAIL = "vivestarter@gmail.com";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

const { data: link, error: linkErr } = await svc.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
if (linkErr) { console.error("generateLink:", linkErr.message); process.exit(1); }
const { data: sess, error: otpErr } = await anon.auth.verifyOtp({
  type: "magiclink", token_hash: link.properties.hashed_token,
});
if (otpErr) { console.error("verifyOtp:", otpErr.message); process.exit(1); }
const ref = new URL(url).hostname.split(".")[0];
const cookieHeader = createChunks(`sb-${ref}-auth-token`, "base64-" + stringToBase64URL(JSON.stringify(sess.session)))
  .map((c) => `${c.name}=${c.value}`).join("; ");

const r1 = await fetch(`${ORIGIN}/api/revalidate`, { method: "POST" });
ok("no cookie → 401", r1.status === 401, `got ${r1.status}`);

const r2 = await fetch(`${ORIGIN}/api/revalidate`, { method: "POST", headers: { cookie: cookieHeader } });
ok("session → 204", r2.status === 204, `got ${r2.status}`);

const r3 = await fetch(`${ORIGIN}/api/revalidate`, { headers: { cookie: cookieHeader } });
ok("GET → 405", r3.status === 405, `got ${r3.status}`);

await anon.auth.signOut().catch(() => {});
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
