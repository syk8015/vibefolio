// 무API 프로브: 영상 워터마크(2026-09-01, 도난 방지). 실행:
//   npx -y tsx local-runner/probe-watermark.ts
// 실 Chrome + 실 ffmpeg만 쓴다(API 0원). postprocess의 body 패스와 같은
// filter_complex를 그대로 태워, 표식이 정말 픽셀로 찍히는지 본다.
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderWatermark } from "./watermark";
import { run } from "./util";

const W = 1280, H = 720, FPS = 30;
let pass = 0, fail = 0;
const check = (ok: boolean, msg: string, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "✓" : "✗"} ${msg}${detail ? ` — ${detail}` : ""}`);
};

const dir = await mkdtemp(join(tmpdir(), "nf-wm-"));
try {
  // ── 1) PNG 굽기 ─────────────────────────────────────────────────────────────
  const png = await renderWatermark({ handle: "@probeuser", width: W, height: H, outDir: dir });
  const bytes = await readFile(png);
  check(bytes.length > 0, "워터마크 PNG 생성", `${bytes.length}B`);

  const probeSize = await run("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height", "-of", "csv=p=0", png,
  ], { timeoutMs: 30_000 });
  check(probeSize.stdout.trim().startsWith(`${W},${H}`), "PNG가 프레임과 같은 크기(overlay=0:0 전제)", probeSize.stdout.trim());

  // 투명 배경이어야 한다 — 불투명하면 영상을 통째로 덮는다.
  const alpha = await run("ffmpeg", [
    "-hide_banner", "-i", png,
    "-vf", "alphaextract,signalstats,metadata=print:file=-", "-f", "null", "-",
  ], { timeoutMs: 30_000 });
  const yavg = Number(alpha.stdout.match(/lavfi\.signalstats\.YAVG=([\d.]+)/)?.[1] ?? "999");
  check(yavg < 40, "PNG 대부분이 투명(작은 표식만 불투명)", `알파 평균 ${yavg}`);

  // ── 2) 실제 합성 ────────────────────────────────────────────────────────────
  const src = `${dir}/src.mp4`;
  let r = await run("ffmpeg", [
    "-y", "-f", "lavfi", "-i", `color=c=white:s=${W}x${H}:r=${FPS}:d=2`,
    "-pix_fmt", "yuv420p", src,
  ], { timeoutMs: 60_000 });
  check(r.code === 0, "테스트 소스 영상 생성", r.stderr.slice(-120));

  // postprocess의 body 패스와 같은 그래프.
  const out = `${dir}/out.mp4`;
  r = await run("ffmpeg", [
    "-y", "-i", src, "-i", png,
    "-filter_complex",
    `[0:v]scale=${W}:${H}:flags=lanczos,format=yuv420p[bd];[bd][1:v]overlay=0:0:format=auto,format=yuv420p[v]`,
    "-map", "[v]", "-t", "2", "-r", String(FPS), "-pix_fmt", "yuv420p", out,
  ], { timeoutMs: 120_000 });
  check(r.code === 0, "body 패스와 같은 filter_complex로 합성", r.stderr.slice(-200));

  // ── 3) 픽셀 증거 ────────────────────────────────────────────────────────────
  // 우하단(표식 자리)만 잘라 밝기를 잰다. 흰 소스에 어두운 알약이 얹혔으니
  // 평균이 확 떨어져야 한다. 좌상단은 그대로 흰색이어야 한다(=영상을 안 덮었다).
  const cropLuma = async (file: string, crop: string): Promise<number> => {
    const g = await run("ffmpeg", [
      "-hide_banner", "-i", file, "-vf", `${crop},signalstats,metadata=print:file=-`,
      "-f", "null", "-",
    ], { timeoutMs: 60_000 });
    const vals = [...g.stdout.matchAll(/lavfi\.signalstats\.YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
    return vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
  };
  // 표식 자리만 좁게 — 상자를 넓게 잡으면 흰 여백이 평균을 희석해 증거가 묽어진다.
  // (우하단 여백 MARGIN_FRAC=0.028 · 알약 높이 ≈ 글자 0.022H + 패딩)
  const markBox = `crop=${Math.round(W * 0.14)}:${Math.round(H * 0.06)}:${W - Math.round(W * 0.145)}:${H - Math.round(H * 0.068)}`;
  const cornerOut = await cropLuma(out, markBox);
  const cornerSrc = await cropLuma(src, markBox);
  const topLeft = await cropLuma(out, `crop=${Math.round(W * 0.28)}:${Math.round(H * 0.12)}:0:0`);
  check(topLeft > 230, "좌상단은 손대지 않음(영상 본체 무손상)", `밝기 ${topLeft.toFixed(1)}`);
  check(
    cornerOut < cornerSrc - 15,
    "표식 자리가 원본보다 뚜렷하게 어두워짐(=실제로 찍혔다)",
    `합성 ${cornerOut.toFixed(1)} vs 원본 ${cornerSrc.toFixed(1)}`,
  );

  // ── 4) 핸들이 바뀌면 표식도 바뀐다(다른 유저가 같은 그림을 받지 않는다) ────
  const png2 = await renderWatermark({ handle: "@someoneelse", width: W, height: H, outDir: `${dir}` });
  const b2 = await readFile(png2);
  check(!bytes.equals(b2), "핸들이 다르면 PNG도 다르다");
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log(fail ? `\n${fail} FAILED` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
