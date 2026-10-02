// 촬영 상태 API(GET /api/ingest/status, 2026-10-02) prod E2E — 실제 nookframe.com을 PAT로 때린다.
// (0) 배포 대기: 무인증 401=라우트 존재 (1) id 모양 틀림 400 (2) 없는/남의 id 404
// (3) 초안 = not-started (4) 실패 초안 = failed + 실패 원문 (5) 완료 초안 = done + 영상 주소
// (6) 목록에 공개 작품도 보인다(state=public, publicUrl) (7) 원격 MCP tools/list·tools/call
// 전부 끝나면 일회용 토큰·행 정리.
//
// 촬영 상태를 행에 직접 심는다(서비스롤). 대기(pending) 행은 만들지 않는다 — 워커가 집어 갈 수
// 있다. 공개 행도 만들지 않는다 — 잠깐이라도 명함에 뜬다. 공개 작품 확인은 이미 있는 작품을 읽기만 한다.
//
// 사용: 레포 루트에서 `node scripts/probe-ingest-status.mjs`. ingest-status 버킷(120/h)을 ~8회 소비.
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomUUID } from "node:crypto";

const ORIGIN = process.env.PROBE_ORIGIN || "https://nookframe.com";
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

// 공개 작품이 있는 사용자로 — (6)을 보려면 하나는 있어야 한다.
const { data: pub } = await svc.from("projects").select("user_id").eq("is_draft", false).limit(1).maybeSingle();
const { data: prof } = pub
  ? { data: { id: pub.user_id } }
  : await svc.from("profiles").select("id").eq("username", "vivestarter").maybeSingle();

const raw = `nf_live_${randomBytes(32).toString("base64url")}`;
const { data: tok, error: tokErr } = await svc.from("api_tokens").insert({
  user_id: prof.id,
  token_hash: createHash("sha256").update(raw).digest("hex"),
  token_prefix: `${raw.slice(0, 14)}…`,
  name: "__probe_e2e_delete_me__",
}).select("id").single();
if (tokErr) throw tokErr;

const get = (path, auth = true) =>
  fetch(`${ORIGIN}${path}`, { headers: auth ? { Authorization: `Bearer ${raw}` } : {} });
const rows = [];
const draft = async (over) => {
  const { data, error } = await svc.from("projects").insert({
    user_id: prof.id,
    title: `__probe_status_${randomBytes(3).toString("hex")}`,
    is_draft: true,
    ...over,
  }).select("id").single();
  if (error) throw error;
  rows.push(data.id);
  return data.id;
};

try {
  // (0) 배포 대기 — 구코드는 404, 신코드는 무인증 401.
  let live = false;
  for (let i = 0; i < 30; i++) {
    const res = await get("/api/ingest/status", false);
    if (res.status === 401) { live = true; break; }
    console.log(`  … 라우트 미존재(${res.status}) — 배포 대기 20s (${i + 1}/30)`);
    await new Promise((r) => setTimeout(r, 20_000));
  }
  ok("(0) 무인증 401 = 라우트 존재", live);
  if (!live) throw new Error("배포가 안 됐다");

  // (1)(2)
  let res = await get("/api/ingest/status?id=not-a-uuid");
  ok("(1) id 모양 틀림 400 BAD_ID", res.status === 400 && (await res.json()).code === "BAD_ID");
  res = await get(`/api/ingest/status?id=${randomUUID()}`);
  ok("(2) 없는 id 404 NOT_FOUND", res.status === 404 && (await res.json()).code === "NOT_FOUND");
  const { data: other } = await svc.from("projects").select("id").neq("user_id", prof.id).limit(1).maybeSingle();
  if (other) {
    res = await get(`/api/ingest/status?id=${other.id}`);
    ok("(2) 남의 작품 id도 같은 404", res.status === 404);
  } else {
    console.log("  (2) 남의 작품이 없어 건너뜀");
  }

  // (3) 초안 — 아직 안 찍음
  const d1 = await draft({});
  res = await get(`/api/ingest/status?id=${d1}`);
  let body = await res.json();
  ok("(3) 초안 = draft / not-started", res.status === 200 && body.work?.state === "draft" && body.work?.filming?.state === "not-started", JSON.stringify(body.work?.filming?.state));
  ok("(3) 초안엔 검토 주소", body.work?.reviewUrl?.endsWith(`/dashboard?review=${d1}`));
  ok("(3) filmingPaused는 참/거짓", typeof body.filmingPaused === "boolean", String(body.filmingPaused));
  ok("(3) 캐시 금지", res.headers.get("cache-control")?.includes("no-store"), res.headers.get("cache-control"));

  // (4) 실패
  const d2 = await draft({ demo_build_status: "failed", demo_build_error: "[blank] probe: nothing rendered at step 2" });
  body = await (await get(`/api/ingest/status?id=${d2}`)).json();
  const f2 = body.work?.filming;
  ok("(4) 실패 = failed/blank + 원문", f2?.state === "failed" && f2.failure?.code === "blank" && /step 2/.test(f2.failure?.detail ?? ""), JSON.stringify(f2?.failure));

  // (5) 완료
  const video = "https://media.nookframe.com/probe/does-not-exist.mp4";
  const d3 = await draft({ demo_build_status: "done", demo_video_url: video, demo_generated_at: new Date().toISOString() });
  body = await (await get(`/api/ingest/status?id=${d3}`)).json();
  ok("(5) 완료 = done + 영상 주소", body.work?.filming?.state === "done" && body.work?.filming?.videoUrl === video);
  ok("(5) 요약 한 줄", body.work?.summary?.includes("filming: done"), body.work?.summary);

  // (6) 목록 — 공개 작품 포함
  body = await (await get("/api/ingest/status")).json();
  const ids = (body.works ?? []).map((w) => w.id);
  ok("(6) 목록에 심은 초안 3개", [d1, d2, d3].every((id) => ids.includes(id)), `count=${body.count}`);
  const pubWork = (body.works ?? []).find((w) => w.state === "public");
  if (pub) {
    ok("(6) 공개 작품도 보인다 + publicUrl", !!pubWork && /^https:\/\/[^/]+\/[^/]+\/[0-9a-f-]{36}$/.test(pubWork.publicUrl ?? ""), pubWork?.publicUrl);
    ok("(6) 공개 작품엔 검토 주소 없음", pubWork?.reviewUrl === null);
  }
  ok("(6) 비공개 대본·로그인 칸은 안 나간다", !JSON.stringify(body).match(/demo_script|demo_access|owner_interview/));

  // (7) 원격 MCP
  const rpc = (method, params) => fetch(`${ORIGIN}/api/mcp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${raw}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }).then((r) => r.json());
  const list = await rpc("tools/list", {});
  ok("(7) tools/list에 get_nookframe_status", (list.result?.tools ?? []).some((t) => t.name === "get_nookframe_status"));
  const call = await rpc("tools/call", { name: "get_nookframe_status", arguments: { id: d2 } });
  const text = call.result?.content?.[0]?.text ?? "";
  ok("(7) tools/call 한 작품 = 실패 이유까지", !call.result?.isError && /filming: failed/.test(text) && /failure detail/.test(text), text.slice(0, 200));
  const callAll = await rpc("tools/call", { name: "get_nookframe_status", arguments: {} });
  ok("(7) tools/call 목록", /work\(s\):/.test(callAll.result?.content?.[0]?.text ?? ""));
} finally {
  if (rows.length) await svc.from("projects").delete().in("id", rows);
  await svc.from("api_tokens").delete().eq("id", tok.id);
}

if (failed) {
  console.log(`\n✗ ${failed}건 실패`);
  process.exit(1);
}
console.log("\n✓ 촬영 상태 API 전부 통과");
