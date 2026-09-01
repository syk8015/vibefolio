// 쿼터 완화(2026-09-01) prod 실증 — request_demo()가 새 한도로 판정하는지 실호출로 본다.
//
// 왜 필요한가: 진짜 한도는 `lib/demoQuota.ts`가 아니라 Postgres 함수
// `request_demo()` 안에 하드코딩돼 있다(TS는 미러·문서일 뿐). 그래서 "TS 고쳤으니
// 됐다"가 성립하지 않는다 — 실제로 함수가 바뀌었는지 로그인 세션으로 때려서 본다.
//
// ⚠️ 같이 지키는 것(핵심): `request_demo`는 migration_demo_source_guard.sql에서
// 레드팀 F2 수리(zip prefix 소유자 인가)를 받은 버전이 최신이다. 쿼터만 바꾸려다
// 옛 정의를 베껴 올리면 그 수리가 조용히 사라진다 — (8)이 그 회귀를 잡는 가드다.
//
// 검증 11단언: (1) 9편 시점 입장 (2) 10편에서 held/user (3) held 사유행 (4) 전역
// 99에서 입장 (5) 100에서 held/global (6) 전역 사유 문구 (7) TS 미러 일치
// (8) zip 남의 prefix → BAD_SOURCE (9) 남의 프로젝트 → FORBIDDEN
// (10) 프로젝트당 시도 2회 유지 → ATTEMPT_LIMIT (11) 미로그인 → UNAUTHORIZED
//
// 비용 $0: 입장(pending)은 워커가 배치 모드라 아무것도 안 찍고, 끝나면 프로젝트를
// 지워 큐에서 사라진다. 씨앗 이벤트도 넣은 id만 정확히 되지운다.
//
// 사용: 레포 루트에서 `node scripts/probe-quota.mjs`
// 서비스롤 키는 macOS 키체인에서 온다(파일 폴백) — scripts/_secrets.mjs 참조.
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SVC) {
  console.error("✗ NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}

const PER_USER = 10;   // 기대 한도 — migration_quota_loosening.sql
const GLOBAL = 100;
const DRAIN = 100;

const svc = createClient(URL_, SVC, { auth: { persistSession: false } });
const anon = createClient(URL_, ANON, { auth: { persistSession: false } });

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

// 정리 대상 — 무슨 일이 나도 finally에서 되돌린다.
const seeded = [];        // demo_events id
let userId = null, otherId = null, projectId = null, otherProjectId = null;

// 24h 창 안에 이미 있는 건수를 재서, 목표치까지 "모자란 만큼만" 심는다.
const cutoff = () => new Date(Date.now() - 24 * 3600_000).toISOString();
async function countGlobal() {
  const { count } = await svc.from("demo_events").select("id", { count: "exact", head: true })
    .in("kind", ["auto", "approved"]).gt("created_at", cutoff());
  return count ?? 0;
}
async function countUser(uid) {
  const { count } = await svc.from("demo_events").select("id", { count: "exact", head: true })
    .eq("user_id", uid).eq("kind", "auto").gt("created_at", cutoff());
  return count ?? 0;
}
async function seed(n, uid) {
  if (n <= 0) return;
  const rows = Array.from({ length: n }, () => ({ user_id: uid, project_id: null, kind: "auto" }));
  const { data, error } = await svc.from("demo_events").insert(rows).select("id");
  if (error) throw new Error(`씨앗 실패: ${error.message}`);
  seeded.push(...data.map((r) => r.id));
}
// 입장으로 더럽혀진 프로젝트 행을 원상복구(서비스롤은 가드 트리거 면제).
async function resetProject() {
  await svc.from("projects").update({
    demo_build_status: null, demo_attempt_count: 0, demo_source_type: null,
    demo_source_value: null, demo_build_error: null,
  }).eq("id", projectId);
  const { data } = await svc.from("demo_events").select("id")
    .eq("user_id", userId).eq("project_id", projectId);
  for (const r of data ?? []) await svc.from("demo_events").delete().eq("id", r.id);
  await svc.from("demo_requests").delete().eq("project_id", projectId);
}

async function sessionFor(email) {
  const { data, error } = await svc.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(`generateLink 실패: ${error.message}`);
  // ⚠️ verifyOtp는 **호출한 클라이언트에 세션을 심는다**(persistSession:false여도 메모리엔
  // 남는다). 그래서 교환은 일회용 클라이언트로 한다 — 안 그러면 아래 (11) "미로그인"
  // 검사가 로그인 상태로 돌아 UNAUTHORIZED 대신 엉뚱한 코드가 나온다(첫 실행 때 겪음).
  const throwaway = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: v, error: vErr } = await throwaway.auth.verifyOtp({
    type: "magiclink", token_hash: data.properties.hashed_token,
  });
  if (vErr) throw new Error(`verifyOtp 실패: ${vErr.message}`);
  return v.session;
}

try {
  // ── 준비: throwaway 유저 2명 + 프로젝트 2개 ─────────────────────────────
  const tag = randomUUID().replace(/-/g, "").slice(0, 10);
  const email = `zzprobe-quota-${tag}@example.com`;
  const emailB = `zzprobe-quota-b-${tag}@example.com`;

  const { data: u, error: uErr } = await svc.auth.admin.createUser({ email, email_confirm: true });
  if (uErr) throw new Error(`유저 생성 실패: ${uErr.message}`);
  userId = u.user.id;
  const { data: u2 } = await svc.auth.admin.createUser({ email: emailB, email_confirm: true });
  otherId = u2.user.id;

  await svc.from("profiles").insert([
    { id: userId, username: `zzq${tag}` },
    { id: otherId, username: `zzqb${tag}` },
  ]);
  const { data: projs, error: pErr } = await svc.from("projects").insert([
    { user_id: userId, title: "ZZPROBE quota", type: "image" },
    { user_id: otherId, title: "ZZPROBE quota B", type: "image" },
  ]).select("id");
  if (pErr) throw new Error(`프로젝트 생성 실패: ${pErr.message}`);
  [projectId, otherProjectId] = projs.map((r) => r.id);

  const session = await sessionFor(email);
  const user = createClient(URL_, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  });
  const call = async (args) => {
    const { data, error } = await user.rpc("request_demo", args);
    if (error) throw new Error(`rpc 실패: ${error.message}`);
    return data;
  };
  const live = { p_project_id: projectId, p_source_type: "live_url", p_source_value: "https://example.com" };

  // ── (1) 1인 한도 직전(9편)에는 들어간다 ─────────────────────────────────
  await seed(PER_USER - 1 - (await countUser(userId)), userId);
  let r = await call(live);
  ok(`(1) 1인 ${PER_USER - 1}편 시점 입장`, r.ok === true && r.status === "pending", JSON.stringify(r));

  // ── (2) 10편째에서 막힌다 = 한도가 정확히 10 ────────────────────────────
  await resetProject();
  await seed(PER_USER - (await countUser(userId)), userId);
  r = await call(live);
  ok(`(2) 1인 ${PER_USER}편에서 held/user`, r.ok === true && r.status === "held" && r.reason === "user", JSON.stringify(r));

  // ── (3) 막힐 때 승인 대기행이 생긴다 ────────────────────────────────────
  const { data: req } = await svc.from("demo_requests").select("kind, status, reason").eq("project_id", projectId);
  ok("(3) over_cap 승인대기 1건", req?.length === 1 && req[0].kind === "over_cap" && req[0].status === "pending"
    && req[0].reason === "Daily per-user upload limit reached", JSON.stringify(req));

  // ── (4)(5)(6) 전역 상한 ─────────────────────────────────────────────────
  await resetProject();
  for (const id of seeded.splice(0)) await svc.from("demo_events").delete().eq("id", id);
  await seed(GLOBAL - 1 - (await countGlobal()), null);   // user_id null = 1인 카운트엔 안 잡힘
  r = await call(live);
  ok(`(4) 전역 ${GLOBAL - 1}편 시점 입장`, r.ok === true && r.status === "pending", JSON.stringify(r));

  await resetProject();
  await seed(GLOBAL - (await countGlobal()), null);
  r = await call(live);
  ok(`(5) 전역 ${GLOBAL}편에서 held/global`, r.ok === true && r.status === "held" && r.reason === "global", JSON.stringify(r));

  const { data: req2 } = await svc.from("demo_requests").select("reason").eq("project_id", projectId);
  ok("(6) 전역 사유 문구", req2?.[0]?.reason === "Daily global capacity reached", JSON.stringify(req2));

  // ── (7) TS 미러가 SQL과 안 어긋나는가 ───────────────────────────────────
  const ts = readFileSync(new URL("../lib/demoQuota.ts", import.meta.url), "utf8");
  const num = (k) => Number(ts.match(new RegExp(`${k}:\\s*(\\d+)`))?.[1]);
  ok("(7) TS 미러 일치", num("PER_USER_DAILY") === PER_USER && num("GLOBAL_DAILY") === GLOBAL
    && num("GLOBAL_DRAIN_DAILY") === DRAIN,
    `per_user=${num("PER_USER_DAILY")} global=${num("GLOBAL_DAILY")} drain=${num("GLOBAL_DRAIN_DAILY")}`);

  // ── (8) 보안 회귀 가드: F2 zip prefix 인가가 살아 있는가 ────────────────
  await resetProject();
  for (const id of seeded.splice(0)) await svc.from("demo_events").delete().eq("id", id);
  r = await call({ p_project_id: projectId, p_source_type: "zip", p_source_value: `${otherId}/whatever` });
  ok("(8) 남의 zip prefix → BAD_SOURCE (F2 수리 생존)", r.ok === false && r.code === "BAD_SOURCE", JSON.stringify(r));

  // ── (9) 소유권 ──────────────────────────────────────────────────────────
  r = await call({ p_project_id: otherProjectId, p_source_type: "live_url", p_source_value: "https://example.com" });
  ok("(9) 남의 프로젝트 → FORBIDDEN", r.ok === false && r.code === "FORBIDDEN", JSON.stringify(r));

  // ── (10) 프로젝트당 시도 2회는 그대로 ───────────────────────────────────
  await svc.from("projects").update({ demo_build_status: "failed", demo_attempt_count: 2 }).eq("id", projectId);
  r = await call(live);
  ok("(10) 프로젝트당 2회 유지 → ATTEMPT_LIMIT", r.ok === false && r.code === "ATTEMPT_LIMIT", JSON.stringify(r));

  // ── (11) 미로그인 ───────────────────────────────────────────────────────
  const { data: anonRes } = await anon.rpc("request_demo", live);   // anon = 세션 없는 클라이언트
  ok("(11) 미로그인 → UNAUTHORIZED", anonRes?.ok === false && anonRes?.code === "UNAUTHORIZED", JSON.stringify(anonRes));
} catch (e) {
  ok("프로브 실행", false, e.message);
} finally {
  for (const id of seeded) await svc.from("demo_events").delete().eq("id", id);
  if (userId) await svc.from("demo_events").delete().eq("user_id", userId);
  if (projectId) await svc.from("projects").delete().eq("id", projectId);
  if (otherProjectId) await svc.from("projects").delete().eq("id", otherProjectId);
  if (userId) { await svc.from("profiles").delete().eq("id", userId); await svc.auth.admin.deleteUser(userId); }
  if (otherId) { await svc.from("profiles").delete().eq("id", otherId); await svc.auth.admin.deleteUser(otherId); }
  console.log(failed === 0 ? "\n전부 통과 ✅ (throwaway 정리 완료)" : `\n${failed}건 실패 ❌ (throwaway 정리 완료)`);
  process.exit(failed === 0 ? 0 : 1);
}
