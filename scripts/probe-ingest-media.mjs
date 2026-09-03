// 서명 URL 2단계 prod E2E — CLI 코드(runPublish) 자체를 import해 실선으로 검증.
// (1) 배포 확인 (2) 10MB 영상+스크린샷 2단계 (3) 6MB zip 2단계 (4) 불량 파일
// finalize 거부+행 삭제 (5) finalize 멱등 재호출. 전부 끝나면 throwaway 정리.
//
// 사용: 레포 루트에서 `node scripts/probe-ingest-media.mjs` (픽스처는 ffmpeg로
// 자동 생성, 워커 호스트엔 항상 있음). 주의: ingest 레이트리밋(유저 20/h)을
// 판당 ~6회 소비 — 연속 실행 시 429가 나면 한 시간 뒤에.
// 서비스롤 키는 macOS 키체인에서 온다(파일 폴백) — scripts/_secrets.mjs 참조.
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPublish } from "../cli/src/publish.js";

// 픽스처 생성 — tiny.png(스크린샷)·big.mp4(tiny.mp4+제로패딩 10MB)·zipproj/(6MB).
const S = mkdtempSync(join(tmpdir(), "nf-probe-media-"));
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=duration=1:size=64x64:rate=1", "-frames:v", "1", `${S}/tiny.png`]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=duration=2:size=320x240:rate=10", "-pix_fmt", "yuv420p", `${S}/big.mp4`]);
appendFileSync(`${S}/big.mp4`, new Uint8Array(10 * 1024 * 1024)); // 스니핑은 헤더만 봄
execFileSync("mkdir", ["-p", `${S}/zipproj`]);
writeFileSync(`${S}/zipproj/index.html`, "<!doctype html><title>probe</title><h1>probe</h1>");
writeFileSync(`${S}/zipproj/asset.bin`, randomBytes(6 * 1024 * 1024));
if (!existsSync(`${S}/big.mp4`)) throw new Error("fixture 생성 실패");
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

const jsonPost = (path, body) => fetch(`${ORIGIN}${path}`, {
  method: "POST",
  headers: { Authorization: `Bearer ${raw}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
// 행 폴더 전체 정리(루트 + _media + _upload 1레벨).
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

try {
  // (1) 배포 대기 — uploads 선언 응답에 서명 URL이 실리면 신코드.
  let live = false, probe;
  for (let i = 0; i < 30; i++) {
    const res = await jsonPost("/api/ingest", { title: "__probe_deploy2__", description: "프로브가 만든 임시 행\n곧 지워집니다", uploads: ["video"], deployUrl: "https://example.com" });
    probe = await res.json().catch(() => ({}));
    if (probe.projectId) {
      if (probe.uploads?.video) { live = true; break; }
      await wipeProject(probe.projectId);
    }
    console.log(`  … 구코드 응답 — 배포 대기 20s (${i + 1}/30)`);
    await new Promise((r) => setTimeout(r, 20000));
  }
  ok("배포 감지(서명 URL 응답)", live);
  if (!live) throw new Error("deploy timeout");
  await wipeProject(probe.projectId); // 감지용 행 정리

  // (2) 10MB 영상 + 스크린샷 — CLI 2단계 경로 그대로.
  const r2 = await runPublish({
    payload: { title: "__probe_2step_media__", description: "프로브가 만든 임시 행\n곧 지워집니다", deployUrl: "https://example.com" },
    screenshotPath: `${S}/tiny.png`,
    videoPath: `${S}/big.mp4`,
    token: raw,
    origin: ORIGIN,
  });
  ok("10MB 영상 2단계 발행 성공", !!r2.projectId, JSON.stringify(r2).slice(0, 120));
  if (r2.projectId) {
    const { data: row } = await svc.from("projects").select("thumbnail, video_url, type, demo_url").eq("id", r2.projectId).single();
    ok("video_url=_media/video.mp4 · type=video", !!row?.video_url?.includes("/_media/video.mp4") && row?.type === "video", row?.video_url);
    ok("thumbnail=_media/screenshot.png", !!row?.thumbnail?.includes("/_media/screenshot.png"));
    ok("demo_url=deployUrl 유지", row?.demo_url === "https://example.com");
    const v = await fetch(row.video_url);
    const len = Number(v.headers.get("content-length") ?? 0);
    ok("영상 공개 서빙 · 10MB · video/mp4", v.ok && len > 10_000_000 && v.headers.get("content-type")?.includes("video/mp4"), `${v.status} ${len}B`);
    const { data: up } = await svc.storage.from("project-files").list(`${prof.id}/${r2.projectId}/_upload`, { limit: 10 });
    ok("_upload 임시 오브젝트 삭제됨", (up ?? []).filter((f) => f.id).length === 0);
    // (5) finalize 멱등 재호출 — 200 성공 + 행 상태 불변이면 합격 (deduped 플래그는
    // CDN 캐시에 따라 빠질 수 있는 best-effort, docs 참고).
    const again = await jsonPost("/api/ingest/finalize", { projectId: r2.projectId });
    const againBody = await again.json().catch(() => ({}));
    const { data: rowAfter } = await svc.from("projects").select("video_url, thumbnail, type").eq("id", r2.projectId).single();
    ok("finalize 재호출 멱등(200·행 상태 불변)",
      again.ok && againBody.ok === true && rowAfter?.video_url === row?.video_url && rowAfter?.thumbnail === row?.thumbnail && rowAfter?.type === "video",
      JSON.stringify(againBody).slice(0, 100));
  }

  // (3) 6MB zip 2단계 — 인라인로는 불가능했던 크기.
  const r3 = await runPublish({
    payload: { title: "__probe_2step_zip__", description: "프로브가 만든 임시 행\n곧 지워집니다" },
    dir: `${S}/zipproj`,
    token: raw,
    origin: ORIGIN,
  });
  ok("6MB zip 2단계 발행 성공", !!r3.projectId, JSON.stringify(r3).slice(0, 120));
  if (r3.projectId) {
    const { data: row } = await svc.from("projects").select("demo_url").eq("id", r3.projectId).single();
    ok("demo_url=/api/preview/…/index.html", !!row?.demo_url?.startsWith(`/api/preview/${prof.id}/${r3.projectId}/`) && row.demo_url.endsWith("index.html"), row?.demo_url);
    const page = await fetch(`${ORIGIN}${row.demo_url}`);
    ok("preview 서빙 200", page.ok, String(page.status));
  }

  // (4) 불량 영상(가짜 바이트) → finalize 400 BAD_MEDIA + 행 삭제.
  const d = await (await jsonPost("/api/ingest", { title: "__probe_badfinal__", description: "프로브가 만든 임시 행\n곧 지워집니다", deployUrl: "https://example.com", uploads: ["video"] })).json();
  await fetch(d.uploads.video, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: new TextEncoder().encode("definitely not a video") });
  const fin = await jsonPost("/api/ingest/finalize", { projectId: d.projectId });
  const finBody = await fin.json().catch(() => ({}));
  ok("불량 영상 finalize 400 BAD_MEDIA", fin.status === 400 && finBody.code === "BAD_MEDIA", `${fin.status} ${finBody.code}`);
  const { data: gone } = await svc.from("projects").select("id").eq("id", d.projectId).maybeSingle();
  ok("불량 finalize 후 행 삭제됨", gone == null);
} finally {
  await cleanupAll();
  console.log("  (throwaway 행·스토리지·토큰 정리 완료)");
}

console.log(failed === 0 ? "\n✅ E2E 전부 통과" : `\n❌ ${failed}건 실패`);
process.exit(failed === 0 ? 0 : 1);
