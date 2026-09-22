// 공개 작품의 비공개 칸이 사용자 키로 안 읽히는지 prod E2E(2026-09-23, 09-22 감사 ①).
//   (1) 익명 키: 비공개 칸 7개 각각 → 거부(permission denied), 공개 칸 → 200
//   (2) 로그인 키(authenticated): 자기 작품이라도 비공개 칸은 거부 — 칸 권한은 행과 무관
//   (3) /api/projects/private: 쿠키 없음 401 · 세션 200 + 자기 행만 · 남의 id를 넣으면 빈 배열
// 값은 절대 찍지 않는다(칸 이름·개수·상태코드만). 칸 목록은 lib/projectColumns.ts에서 읽는다
// (사본을 두면 갈라진다). SQL(supabase/migration_private_columns.sql) 적용 전에 돌리면
// (1)(2)가 실패하는 게 정상이다 — 적용 여부 확인용으로도 쓴다.
// 사용: node scripts/probe-private-columns.mjs
import "./_secrets.mjs";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createChunks, stringToBase64URL } from "@supabase/ssr";

const ORIGIN = "https://nookframe.com";
const EMAIL = "vivestarter@gmail.com";

const colsSrc = readFileSync(new URL("../lib/projectColumns.ts", import.meta.url), "utf8");
const listOf = (name) =>
  [...colsSrc.split(`${name} = [`)[1].split("]")[0].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
const PUBLIC = listOf("PUBLIC_PROJECT_COLUMNS");
const PRIVATE = listOf("PRIVATE_PROJECT_COLUMNS");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};
const denied = (error) => !!error && (error.code === "42501" || /permission denied/i.test(error.message ?? ""));

ok(`칸 목록 읽음(공개 ${PUBLIC.length} · 비공개 ${PRIVATE.length})`, PUBLIC.length > 20 && PRIVATE.length >= 7);

// (1) 익명 키
for (const c of PRIVATE) {
  const { error } = await anon.from("projects").select(`id, ${c}`).eq("is_draft", false).limit(1);
  ok(`익명: ${c} 거부`, denied(error), error ? error.code ?? "" : "읽혔음(SQL 미적용?)");
}
{
  const { error } = await anon.from("projects").select("*").eq("is_draft", false).limit(1);
  ok('익명: select("*") 거부', denied(error), error ? error.code ?? "" : "읽혔음");
  // 칸을 고르지 않고 필터로만 써도(값이 있나 없나 캐기) 거부돼야 한다 — WHERE에 쓴 칸도 SELECT 권한을 본다.
  const oracle = await anon.from("projects").select("id").not("demo_access", "is", null).limit(1);
  ok("익명: 비공개 칸을 필터로만 써도 거부", denied(oracle.error), oracle.error ? oracle.error.code ?? "" : "통과했음");
  const r = await anon.from("projects").select(PUBLIC.join(", ")).eq("is_draft", false).limit(3);
  ok("익명: 공개 칸 25개는 읽힘", !r.error, r.error?.message ?? `${r.data?.length ?? 0}행`);
}

// 세션(비침습 magiclink — 비번 안 건드림)
const { data: link, error: linkErr } = await svc.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
if (linkErr) { console.error("generateLink:", linkErr.message); process.exit(1); }
const user = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: sess, error: otpErr } = await user.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
if (otpErr) { console.error("verifyOtp:", otpErr.message); process.exit(1); }
const me = sess.user.id;

// (2) 로그인 키 — 자기 행이라도 비공개 칸 거부
{
  const { error } = await user.from("projects").select("id, demo_access").eq("user_id", me).limit(1);
  ok("로그인 키: 자기 작품 demo_access도 거부", denied(error), error ? error.code ?? "" : "읽혔음(SQL 미적용?)");
  const r = await user.from("projects").select(PUBLIC.join(", ")).eq("user_id", me).limit(3);
  ok("로그인 키: 공개 칸은 읽힘", !r.error, r.error?.message ?? `${r.data?.length ?? 0}행`);
}

// (3) 주인 전용 라우트
const ref = new URL(url).hostname.split(".")[0];
const cookie = createChunks(`sb-${ref}-auth-token`, "base64-" + stringToBase64URL(JSON.stringify(sess.session)))
  .map((c) => `${c.name}=${c.value}`).join("; ");
{
  const r0 = await fetch(`${ORIGIN}/api/projects/private`);
  ok("라우트: 쿠키 없음 → 401", r0.status === 401, `got ${r0.status}`);

  const r1 = await fetch(`${ORIGIN}/api/projects/private`, { headers: { cookie } });
  const j1 = await r1.json().catch(() => ({}));
  const { data: mine } = await svc.from("projects").select("id").eq("user_id", me);
  const mineIds = new Set((mine ?? []).map((p) => p.id));
  const rows = Array.isArray(j1.rows) ? j1.rows : [];
  ok("라우트: 세션 → 200", r1.status === 200, `got ${r1.status}`);
  ok("라우트: 자기 행만, 전부", rows.length === mineIds.size && rows.every((x) => mineIds.has(x.id)), `${rows.length}/${mineIds.size}`);
  ok("라우트: 비공개 칸 7개가 키로 있음", rows.length === 0 || PRIVATE.every((c) => c in rows[0]));
  ok("라우트: no-store", (r1.headers.get("cache-control") ?? "").includes("no-store"));

  const { data: other } = await svc.from("projects").select("id").neq("user_id", me).limit(1);
  if (other?.[0]) {
    const r2 = await fetch(`${ORIGIN}/api/projects/private?ids=${other[0].id}`, { headers: { cookie } });
    const j2 = await r2.json().catch(() => ({}));
    ok("라우트: 남의 id → 빈 배열", r2.status === 200 && Array.isArray(j2.rows) && j2.rows.length === 0, `got ${r2.status} ${j2.rows?.length}`);
  } else {
    console.log("· 남의 작품이 없어 (3) 남의 id 검사 건너뜀");
  }
}

// scope local — 기본값(global)은 이 계정의 실제 브라우저 세션까지 전부 끊는다.
await user.auth.signOut({ scope: "local" }).catch(() => {});
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
