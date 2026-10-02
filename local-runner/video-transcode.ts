// 주인이 올린 영상 줄이기(2026-10-02) — 서버 짝은 app/api/worker/video, 규칙은 lib/videoTranscode.ts.
// 배치 때 촬영 대기열이 비면(소개 영상 다음) 한 편씩: 원본을 받아 H.264로 다시 누르고, 서명 주소로 올린 뒤
// 서버가 video_url을 바꾼다. 실패한 작품은 이번 실행 동안만 건너뛴다(다음 배치에 한 번 더 해 본다).
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { apiPost, putSigned, type SignedTarget } from "./api";
import { OUT_DIR } from "./config";
import { run } from "./util";
import { pickOutput, remuxArgs, transcodeArgs } from "../lib/videoTranscode";

type Job = { id: string; src: string };
const failedThisRun = new Set<string>();

async function ffmpeg(args: string[]): Promise<void> {
  const r = await run("ffmpeg", args, { timeoutMs: 10 * 60_000 });
  if (r.code !== 0) throw new Error(`ffmpeg failed: ${r.stderr.slice(0, 300)}`);
}

/** 안 줄인 영상 하나를 집어 줄인다. 집을 게 없으면 false. */
export async function transcodeNextVideo(): Promise<boolean> {
  const { job } = await apiPost<{ job: Job | null }>("/api/worker/video", { op: "claim", skip: [...failedThisRun] });
  if (!job) return false;
  const dir = `${OUT_DIR}/video/${job.id}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const ext = new URL(job.src).pathname.split(".").pop()?.toLowerCase() ?? "mp4";
  console.log(`\n[video] ${job.id} — shrinking uploaded video`);
  try {
    const res = await fetch(job.src);
    if (!res.ok) throw new Error(`download ${res.status}`);
    const src = `${dir}/src.${ext}`;
    writeFileSync(src, Buffer.from(await res.arrayBuffer()));
    const srcBytes = statSync(src).size;
    const encoded = `${dir}/encoded.mp4`;
    await ffmpeg(transcodeArgs(src, encoded));
    let out = encoded;
    if (pickOutput(ext, srcBytes, statSync(encoded).size) === "remux") {
      out = `${dir}/remux.mp4`;
      await ffmpeg(remuxArgs(src, out));
    }
    const body = readFileSync(out);
    const { target } = await apiPost<{ target: SignedTarget }>("/api/worker/video", { op: "sign", projectId: job.id, size: body.length });
    await putSigned(target, body);
    const done = await apiPost<{ stale?: boolean }>("/api/worker/video", { op: "done", projectId: job.id, from: job.src, to: target.publicUrl });
    const mb = (n: number) => Math.round(n / 1e5) / 10;
    console.log(`[video] ${job.id} ${done.stale ? "skipped (owner changed the video)" : "done"} — ${mb(srcBytes)}MB → ${mb(body.length)}MB${out === encoded ? "" : " (box only)"}`);
  } catch (err) {
    failedThisRun.add(job.id);
    console.error(`[video] ${job.id} failed: ${err instanceof Error ? err.message : err}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return true;
}

// 손으로 한 편: `npx tsx local-runner/video-transcode.ts` — 집을 게 있으면 하나 줄인다.
if (process.argv[1]?.endsWith("video-transcode.ts")) {
  transcodeNextVideo().then((did) => { console.log(did ? "[video] done" : "[video] nothing to shrink"); process.exit(0); });
}
