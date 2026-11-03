// 워커 비밀의 손이 닿는 범위(2026-11-03, 보안 5단계 S1-F2·S6-F1·S6-F2·S6-F3) prod E2E.
// 워커 비밀은 '지금 찍고 있는 그 작품'만 다룬다:
//   (1) 진행 중이 아닌 공개 작품 → jobs done·held-moderation, assets sign-upload·prune·source-list 409,
//       failed는 200이지만 행을 안 바꿈, 소개 영상 sign 409(claim 안 됨), 영상 줄이기 sign 409(대상 아님)
//   (2) 진행 중인 행이어도 → done에 바깥 주소 400, 격리 키가 남의 폴더면 400
// 일회용 계정 하나로만(행은 서비스 키로 만들고 끝에 계정째 지운다). 메일 나가는 길(failed가 실제로 적히는 경우)은 안 부른다.
// 사용: node scripts/probe-worker-scope.mjs   (WORKER_SECRET은 .env.local, 서비스 키는 키체인)
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";

const ORIGIN = "https://nookframe.com";
const MEDIA = "https://media.nookframe.com";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
if (!process.env.WORKER_SECRET) throw new Error("WORKER_SECRET not set (.env.local)");

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};
const post = async (path, body) => {
  const r = await fetch(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.WORKER_SECRET}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const b = await r.json().catch(() => ({}));
  return { status: r.status, code: b.code ?? "" };
};
const expect = async (name, path, body, status, code) => {
  const r = await post(path, body);
  ok(name, r.status === status && (!code || r.code === code), `${r.status} ${r.code}`);
};

const tag = Date.now().toString(36);
let uid = null;
try {
  const { data: tu, error: tuErr } = await svc.auth.admin.createUser({
    email: `vivestarter+probe-ws-${tag}@gmail.com`, email_confirm: true,
  });
  if (tuErr) throw new Error(`createUser: ${tuErr.message}`);
  uid = tu.user.id;
  const { error: pErr } = await svc.from("profiles").insert({ id: uid, username: `probews${tag}`, name: "probe" });
  if (pErr) throw new Error(`profile insert: ${pErr.message}`);
  const { data: row, error: rErr } = await svc.from("projects").insert({
    user_id: uid, title: "__probe_worker_scope_DONOTKEEP__", description: "", demo_url: "https://example.com/",
    is_draft: false, demo_build_status: "done", demo_generated_at: "2026-01-01T00:00:00Z",
    video_url: `${MEDIA}/files/${uid}/videos/probe-nf.mp4`, // 이미 줄인 영상 = 줄이기 대상 아님
  }).select("id").single();
  if (rErr) throw new Error(`project insert: ${rErr.message}`);
  const id = row.id;
  const own = `${MEDIA}/${uid}/${id}/demo-1000000000000.mp4`;
  const jobs = `/api/worker/jobs/${id}`;

  // (1) 진행 중 아님(오래전에 끝난 행)
  await expect("(1a) done → 409", jobs, { op: "done", videoUrl: own }, 409, "NOT_IN_FLIGHT");
  await expect("(1b) phase → 409", jobs, { op: "phase", phase: "recording" }, 409, "NOT_IN_FLIGHT");
  await expect("(1c) requeue → 409", jobs, { op: "requeue" }, 409, "NOT_IN_FLIGHT");
  await expect("(1d) held-moderation → 409", jobs, { op: "held-moderation", categories: [] }, 409, "NOT_IN_FLIGHT");
  await expect("(1e) locale-video(오래전 done) → 409", jobs, { op: "locale-video", locale: "en", videoUrl: own }, 409, "NOT_IN_FLIGHT");
  await post(jobs, { op: "failed", code: "error", message: "probe" });
  const { data: after } = await svc.from("projects").select("demo_build_status").eq("id", id).single();
  ok("(1f) failed → 행 그대로(done)", after?.demo_build_status === "done", after?.demo_build_status);
  await expect("(1g) assets sign-upload → 409", "/api/worker/assets", { op: "sign-upload", projectId: id }, 409, "NOT_IN_FLIGHT");
  await expect("(1h) assets prune → 409", "/api/worker/assets", { op: "prune", projectId: id, keepTs: "1000000000" }, 409, "NOT_IN_FLIGHT");
  await expect("(1i) assets source-list → 409", "/api/worker/assets", { op: "source-list", projectId: id }, 409, "NOT_IN_FLIGHT");
  await expect("(1j) 소개 영상 sign(claim 안 됨) → 409", "/api/worker/intro", { op: "sign", projectId: id }, 409, "NOT_CLAIMED");
  await expect("(1k) 영상 줄이기 sign(이미 줄인 영상) → 409", "/api/worker/video", { op: "sign", projectId: id, size: 10 }, 409, "NOT_CLAIMABLE");

  // (2) 진행 중인 행이어도 주소·키는 이 작품 폴더만
  await svc.from("projects").update({ demo_build_status: "recording" }).eq("id", id);
  await expect("(2a) done — 바깥 주소 → 400", jobs, { op: "done", videoUrl: "https://evil.example/x.mp4" }, 400, "BAD_URL");
  await expect("(2b) done — 남의 폴더 → 400", jobs, { op: "done", videoUrl: `${MEDIA}/${uid}/00000000-0000-4000-8000-000000000000/demo-1.mp4` }, 400, "BAD_URL");
  await expect("(2c) held-moderation — 격리 키가 사용자 파일 → 400", jobs, {
    op: "held-moderation", categories: ["probe"],
    quarantine: { videoUrl: `${MEDIA}/files/${uid}/x/index.html`, posterUrl: null, videoKey: `files/${uid}/x/index.html`, posterKey: null, storage: "r2" },
  }, 400, "BAD_QUARANTINE");
  await expect("(2d) held-moderation — 키와 주소가 다름 → 400", jobs, {
    op: "held-moderation", categories: ["probe"],
    quarantine: { videoUrl: "https://evil.example/x.mp4", posterUrl: null, videoKey: `${uid}/${id}/demo-1.mp4`, posterKey: null, storage: "r2" },
  }, 400, "BAD_QUARANTINE");
  const { count: modRows } = await svc.from("demo_moderation").select("id", { count: "exact", head: true }).eq("project_id", id);
  ok("(2e) 격리 줄이 안 생김", !modRows, String(modRows));
  const { data: still } = await svc.from("projects").select("demo_build_status, demo_video_url").eq("id", id).single();
  ok("(2f) 행은 그대로(recording · 영상 없음)", still?.demo_build_status === "recording" && !still?.demo_video_url,
    `${still?.demo_build_status} ${still?.demo_video_url ?? ""}`);
  await svc.from("projects").update({ demo_build_status: "done" }).eq("id", id);
} catch (err) {
  ok("예외", false, err instanceof Error ? err.message : String(err));
} finally {
  if (uid) {
    const { error } = await svc.auth.admin.deleteUser(uid);
    ok("끝 — 일회용 계정 지움", !error, error?.message ?? "");
  }
}

console.log(failed ? `\n${failed}건 실패` : "\n모두 통과");
process.exit(failed ? 1 : 0);
