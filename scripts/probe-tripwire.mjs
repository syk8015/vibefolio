// 알아채기·미끼(2026-11-02, lib/tripwire.ts) prod E2E. 조건: 배포 + Vercel 설정값 DECOY_TOKEN_SHA256.
//   (1) 미끼 토큰을 Bearer로 → 겉으로는 그냥 401 · 사이트가 읽기 전용으로 잠김 · 경보 기록
//   (2) 잠금 풀기(끝에서 늘)
//   (3) 일회용 토큰을 10분 한도(300) 넘게 → 그 토큰만 끊김(401) · 경보 기록 · 토큰 행 지움
//   (4) --admin-burst 일 때만: 관리자 API 61번 → 404로 막힘 + 관리자 로그인 전부 끊김
//       ⚠️ 네 브라우저의 관리자 로그인도 끊긴다. 평소엔 안 돌린다.
// 미끼 원문은 레포·인자에 두지 않는다 — 미끼 초안의 비공개 칸에서 서비스 키로 읽어 온다.
// ⚠️ 메일 2통(미끼·과사용). 사이트는 몇 초 잠긴다.
// 사용: node scripts/probe-tripwire.mjs <미끼 초안 id> [--admin-burst]
import "./_secrets.mjs";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createChunks, stringToBase64URL } from "@supabase/ssr";

const ORIGIN = "https://nookframe.com";
const ADMIN_EMAIL = "vivestarter@gmail.com";
const [decoyProjectId, flag] = process.argv.slice(2);
if (!decoyProjectId) { console.error("사용: node scripts/probe-tripwire.mjs <미끼 초안 id>"); process.exit(2); }

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 원격 MCP ping — 토큰만 확인하고 사용자별 쿼터를 안 쓴다(인제스트 상태는 시간당 120번 버킷이
// 있어, 그걸로 300번을 치면 주인의 AI가 한 시간 동안 상태를 못 묻는다).
const status = (token) =>
  fetch(`${ORIGIN}/api/mcp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const alerts = async () =>
  ((await svc.from("system_status").select("alerts_state").eq("id", "singleton").single()).data?.alerts_state ?? {});

let throwawayId = null;
try {
  const { data: locks0 } = await anon.rpc("site_locks");
  if (locks0?.readonly) throw new Error("이미 읽기 전용이라 시험을 못 해요 — 먼저 풀 것");
  const t0 = Date.now();

  // (1) 미끼
  const { data: row, error } = await svc.from("projects").select("demo_user_hint").eq("id", decoyProjectId).single();
  const decoy = /nf_live_[A-Za-z0-9_-]+/.exec(row?.demo_user_hint ?? "")?.[0];
  if (error || !decoy) throw new Error(`미끼 초안에서 토큰을 못 읽음: ${error?.message ?? "없음"}`);
  const d = await status(decoy);
  ok("(1a) 미끼 토큰 → 겉으로는 그냥 401", d.status === 401, String(d.status));
  const { data: locks1 } = await anon.rpc("site_locks");
  ok("(1b) 사이트가 읽기 전용으로 잠김", locks1?.readonly === true, JSON.stringify(locks1));
  const a1 = await alerts();
  ok("(1c) 경보 기록(decoy)", a1.decoy && Date.parse(a1.decoy) >= t0 - 5_000, a1.decoy ?? "없음");

  // (2)
  await svc.from("system_status").update({ site_readonly_at: null }).eq("id", "singleton");
  const { data: locks2 } = await anon.rpc("site_locks");
  ok("(2) 잠금 풀림", locks2?.readonly === false, JSON.stringify(locks2));
  await sleep(6_500); // middleware 기억 5초

  // (3) 과사용 — 관리자 계정에 일회용 토큰
  const { data: admins } = await svc.from("profiles").select("id").eq("username", "vivestarter").single();
  const raw = `nf_live_${randomBytes(32).toString("base64url")}`;
  const { data: tok, error: te } = await svc.from("api_tokens").insert({
    user_id: admins.id, token_hash: createHash("sha256").update(raw).digest("hex"),
    token_prefix: `${raw.slice(0, 14)}…`, name: "__probe_tripwire_DONOTKEEP__",
  }).select("id").single();
  if (te) throw new Error(`token insert: ${te.message}`);
  throwawayId = tok.id;
  const first = await status(raw);
  ok("(3a) 일회용 토큰 처음엔 통과", first.status === 200, String(first.status));
  let n = 1, cut = null;
  while (n < 320 && cut === null) {
    const batch = await Promise.all(Array.from({ length: 10 }, () => status(raw)));
    n += batch.length;
    if (batch.some((b) => b.status === 401)) cut = n;
  }
  ok("(3b) 한도(300) 근처에서 끊김", cut !== null && cut >= 295 && cut <= 320, `끊긴 때 ≈ ${cut ?? "안 끊김"}번째`);
  const { data: after } = await svc.from("api_tokens").select("revoked_at").eq("id", throwawayId).single();
  ok("(3c) 토큰 행에 끊긴 시각", !!after?.revoked_at, after?.revoked_at ?? "없음");
  const a3 = await alerts();
  ok("(3d) 경보 기록(token-burst)", a3["token-burst"] && Date.parse(a3["token-burst"]) >= t0, a3["token-burst"] ?? "없음");

  // (4) 관리자 몰림 — 플래그 있을 때만
  if (flag === "--admin-burst") {
    const { data: link } = await svc.auth.admin.generateLink({ type: "magiclink", email: ADMIN_EMAIL });
    const { data: sess } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
    const ref = new URL(url).hostname.split(".")[0];
    const cookie = createChunks(`sb-${ref}-auth-token`, "base64-" + stringToBase64URL(JSON.stringify(sess.session)))
      .map((c) => `${c.name}=${c.value}`).join("; ");
    let blockedAt = null;
    for (let i = 1; i <= 70 && blockedAt === null; i++) {
      const r = await fetch(`${ORIGIN}/api/admin/stop`, {
        method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ action: "nope" }),
      });
      if (r.status === 404) blockedAt = i;
    }
    ok("(4) 61번째쯤 막힘", blockedAt !== null && blockedAt >= 55 && blockedAt <= 65, `막힌 때 ${blockedAt ?? "안 막힘"}번째`);
  }
} catch (err) {
  ok("예외", false, err instanceof Error ? err.message : String(err));
} finally {
  await svc.from("system_status").update({ site_readonly_at: null }).eq("id", "singleton");
  if (throwawayId) await svc.from("api_tokens").delete().eq("id", throwawayId);
  const { data: end } = await anon.rpc("site_locks");
  ok("끝 — 잠금 풀림·일회용 토큰 지움", end?.readonly === false, JSON.stringify(end));
}

console.log(failed ? `\n${failed}건 실패` : "\n모두 통과");
process.exit(failed ? 1 : 0);
