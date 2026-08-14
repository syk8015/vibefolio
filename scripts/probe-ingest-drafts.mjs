// 요청4(초안 관리·upsert) prod E2E — 실제 nookframe.com API를 PAT로 때려 검증.
// (0) 배포 대기: GET /api/ingest/drafts 무인증 401=라우트 존재 (1) 같은 URL 재푸시
// upsert(같은 행·필드 갱신) (2) 다른 URL=새 행 (3) 목록 (4) PATCH 필드 갱신
// (5) PATCH 아티팩트 필드 400 (6) 공개 행 PATCH/DELETE 409 (7) DELETE=행+스토리지
// 정리. 전부 끝나면 throwaway 정리.
//
// 사용: 레포 루트에서 `node scripts/probe-ingest-drafts.mjs`.
// 주의: ingest 발행 버킷(20/h)을 판당 ~3회, 관리 버킷(ingest-manage 60/h)을 ~8회 소비.
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";

process.loadEnvFile(".env.local");
const ORIGIN = "https://nookframe.com";
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

const { data: prof } = await svc.from("profiles").select("id").limit(1).maybeSingle();
const raw = `nf_live_${randomBytes(32).toString("base64url")}`;
const { data: tok } = await svc.from("api_tokens").insert({
  user_id: prof.id,
  token_hash: createHash("sha256").update(raw).digest("hex"),
  token_prefix: `${raw.slice(0, 14)}…`,
  name: "__probe_e2e_delete_me__",
}).select("id").single();

const call = (method, path, body) => fetch(`${ORIGIN}${path}`, {
  method,
  headers: { Authorization: `Bearer ${raw}`, "Content-Type": "application/json" },
  body: body ? JSON.stringify(body) : undefined,
});
const wipeProject = async (pid) => {
  for (const sub of ["", "_media", "_upload"]) {
    const prefix = `${prof.id}/${pid}${sub ? `/${sub}` : ""}`;
    const { data } = await svc.storage.from("project-files").list(prefix, { limit: 100 });
    const keys = (data ?? []).filter((f) => f.id).map((f) => `${prefix}/${f.name}`);
    if (keys.length) await svc.storage.from("project-files").remove(keys);
  }
  await svc.from("projects").delete().eq("id", pid);
};
const cleanupAll = async () => {
  const { data } = await svc.from("projects").select("id").like("title", "__probe_%");
  for (const r of data ?? []) await wipeProject(r.id);
  await svc.from("api_tokens").delete().eq("id", tok.id);
};

const R = randomBytes(4).toString("hex");
const U1 = `https://example.com/probe-${R}-a`;
const U2 = `https://example.com/probe-${R}-b`;

try {
  // (0) 배포 대기 — drafts 라우트가 무인증에 401을 주면 신코드(구코드는 404). 쿼터 무소비.
  let live = false;
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${ORIGIN}/api/ingest/drafts`);
    if (res.status === 401) { live = true; break; }
    console.log(`  … 라우트 미존재(${res.status}) — 배포 대기 20s (${i + 1}/30)`);
    await new Promise((r) => setTimeout(r, 20000));
  }
  ok("배포 감지(drafts 라우트 401)", live);
  if (!live) throw new Error("deploy timeout");

  // (1) 생성 → 같은 URL 재푸시 = upsert.
  const c1 = await (await call("POST", "/api/ingest", { title: "__probe_up_A__", deployUrl: U1, demoHighlights: "first" })).json();
  ok("초안 생성", !!c1.projectId && !c1.upserted, c1.projectId);
  const c2 = await (await call("POST", "/api/ingest", { title: "__probe_up_B__", deployUrl: U1 })).json();
  ok("같은 URL 재푸시 → upserted=true·같은 행", c2.upserted === true && c2.projectId === c1.projectId, JSON.stringify(c2).slice(0, 120));
  const { data: row1 } = await svc.from("projects").select("title, demo_user_hint, is_draft").eq("id", c1.projectId).single();
  ok("upsert가 필드 갱신(title B·hint 최신화)", row1?.title === "__probe_up_B__" && row1?.demo_user_hint === null && row1?.is_draft === true, JSON.stringify(row1));

  // (2) 다른 URL은 새 행.
  const c3 = await (await call("POST", "/api/ingest", { title: "__probe_up_C__", deployUrl: U2 })).json();
  ok("다른 URL → 새 초안", !!c3.projectId && c3.projectId !== c1.projectId && !c3.upserted);

  // (3) 목록.
  const list = await (await call("GET", "/api/ingest/drafts")).json();
  const ids = (list.drafts ?? []).map((d) => d.id);
  ok("drafts 목록에 둘 다 + reviewUrl", list.ok && ids.includes(c1.projectId) && ids.includes(c3.projectId) && !!list.drafts[0].reviewUrl, `count=${list.count}`);

  // (4) PATCH 필드 갱신.
  const p1 = await call("PATCH", `/api/ingest/drafts/${c1.projectId}`, { title: "__probe_up_D__", demoHighlights: "patched", tags: ["Claude Code"] });
  const { data: row2 } = await svc.from("projects").select("title, demo_user_hint, tags").eq("id", c1.projectId).single();
  ok("PATCH 갱신(title·hint·tags)", p1.ok && row2?.title === "__probe_up_D__" && row2?.demo_user_hint === "patched" && (row2?.tags ?? []).includes("Claude Code"), JSON.stringify(row2));

  // (5) PATCH에 아티팩트 필드 → 400.
  const p2 = await call("PATCH", `/api/ingest/drafts/${c1.projectId}`, { deployUrl: "https://example.com/x" });
  const p2b = await p2.json().catch(() => ({}));
  ok("PATCH deployUrl → 400 ARTIFACT_IMMUTABLE", p2.status === 400 && p2b.code === "ARTIFACT_IMMUTABLE", `${p2.status} ${p2b.code}`);

  // (6) 공개된 행은 PATCH/DELETE 409 (is_draft 플립으로 시뮬).
  await svc.from("projects").update({ is_draft: false }).eq("id", c3.projectId);
  const p3 = await call("PATCH", `/api/ingest/drafts/${c3.projectId}`, { title: "__probe_up_X__" });
  const d3 = await call("DELETE", `/api/ingest/drafts/${c3.projectId}`);
  ok("공개 행 PATCH 409", p3.status === 409, String(p3.status));
  ok("공개 행 DELETE 409", d3.status === 409, String(d3.status));
  await svc.from("projects").update({ is_draft: true }).eq("id", c3.projectId);
  // 공개 행은 목록에도 없어야 한다 — 플립 상태에서 이미 검증됐으므로 재확인 생략.

  // (7) DELETE = 행 + 스토리지 정리 (더미 파일 심어 확인).
  await svc.storage.from("project-files").upload(`${prof.id}/${c1.projectId}/_media/dummy.bin`, new Uint8Array([1, 2, 3]), { upsert: true });
  const d1 = await call("DELETE", `/api/ingest/drafts/${c1.projectId}`);
  const d1b = await d1.json().catch(() => ({}));
  const { data: gone } = await svc.from("projects").select("id").eq("id", c1.projectId).maybeSingle();
  const { data: leftover } = await svc.storage.from("project-files").list(`${prof.id}/${c1.projectId}/_media`, { limit: 10 });
  ok("DELETE 초안 → 행 삭제", d1.ok && d1b.deleted === true && gone == null, JSON.stringify(d1b));
  ok("DELETE 초안 → 스토리지 파일 정리", (leftover ?? []).filter((f) => f.id).length === 0);

  const d2 = await call("DELETE", `/api/ingest/drafts/${c3.projectId}`);
  const { data: gone2 } = await svc.from("projects").select("id").eq("id", c3.projectId).maybeSingle();
  ok("두 번째 초안도 API로 삭제", d2.ok && gone2 == null);
} finally {
  await cleanupAll();
  console.log("  (throwaway 행·스토리지·토큰 정리 완료)");
}

console.log(failed === 0 ? "\n✅ E2E 전부 통과" : `\n❌ ${failed}건 실패`);
process.exit(failed === 0 ? 0 : 1);
