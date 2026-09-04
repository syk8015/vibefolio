// M0 — mechanism check (plan §8). Drives the full local pipeline against TodoMVC:
//   launch headed GPU Chrome → inject synthetic cursor → record (avfoundation,
//   real-time 60fps) → intro → one-take replay (ease cursor + cursor-centered
//   hold-zoom) → post-process zoompan(+pad) → demo.mp4 + contact sheet + report.
//
// Run: npx -y tsx local-runner/m0-todomvc.ts
//
// Verifies the NEW mechanisms (real-time capture, cursor feel, new zoom timing,
// one-take) with zero safety/explore complexity. Output is judged by eye.
import { mkdirSync } from "node:fs";
import { launchRecordingContext, ensureExactViewport } from "./browser";
import { computeCropRect, startRecording } from "./record";
import {
  injectCursorOverlay,
  ensureCursor,
  cursorSetPos,
} from "./cursor";
import { CameraTrack } from "./camera";
import { replay } from "./replay";
import { postprocess } from "./postprocess";
import { TODOMVC_URL, TODOMVC_SCRIPT } from "./script";
import {
  OUT_DIR,
  INTRO_MS,
  TAIL_MS,
  CAPTURE_WARMUP_MS,
  FPS,
} from "./config";
import { sleep, run, ffprobeValue } from "./util";

mkdirSync(OUT_DIR, { recursive: true });
const raw = `${OUT_DIR}/raw.mp4`;
const demo = `${OUT_DIR}/demo.mp4`;
const sheet = `${OUT_DIR}/demo-sheet.png`;

const { context, page } = await launchRecordingContext();
try {
  await injectCursorOverlay(page); // registers + installs on current doc
  // domcontentloaded (not networkidle): todomvc.com can hold a keepalive
  // connection that never reaches idle; we wait on the actual app element instead.
  await page.goto(TODOMVC_URL, { waitUntil: "domcontentloaded" });
  await page.locator(".new-todo").waitFor({ state: "visible", timeout: 15000 });
  const sized = await ensureExactViewport(page);
  await page.bringToFront();
  await ensureCursor(page);
  console.log("viewport:", sized);

  const crop = await computeCropRect(page);
  console.log(
    "crop:", crop.x, crop.y, crop.w, crop.h, `(dpr ${crop.dpr}, logical ${crop.logical.iw}×${crop.logical.ih})`,
  );

  // Park the synthetic cursor dead-center; the camera starts from the same point.
  const cx = crop.logical.iw / 2;
  const cy = crop.logical.ih / 2;
  await cursorSetPos(page, cx, cy);
  await sleep(450); // let capture warm + cursor paint at center

  // ── Record ──────────────────────────────────────────────────────────────────
  const rec = startRecording(raw, crop);
  const recStartTime = Date.now() + CAPTURE_WARMUP_MS; // ≈ wall-clock of frame 0
  const cam = new CameraTrack(recStartTime, crop.logical.iw, crop.logical.ih);

  await sleep(INTRO_MS); // hero beat on the main page
  await replay(page, TODOMVC_SCRIPT, cam); // one-take, no AI loop
  await sleep(TAIL_MS);
  await rec.stop();
  console.log("capture stopped; camera events:", cam.events.length);

  // ── Post-process ──────────────────────────────────────────────────────────────
  const { durationSec, clipLen } = await postprocess({
    rawPath: raw,
    outPath: demo,
    events: cam.events,
    rawW: crop.w,
    rawH: crop.h,
    logicalW: crop.logical.iw,
    logicalH: crop.logical.ih,
    username: "preview",
  });

  // ── Measure + contact sheet ───────────────────────────────────────────────────
  const dw = await ffprobeValue(demo, "stream=width");
  const dh = await ffprobeValue(demo, "stream=height");
  const ddur = await ffprobeValue(demo, "format=duration");
  // raw smoothness (mpdecimate unique-frame count / duration)
  const { stderr: mp } = await run("ffmpeg", [
    "-hide_banner", "-i", raw, "-vf", "mpdecimate", "-an", "-f", "null", "-",
  ]);
  const mpMatches = [...mp.matchAll(/frame=\s*(\d+)/g)];
  const uniqueFrames = mpMatches.length
    ? parseInt(mpMatches[mpMatches.length - 1][1], 10)
    : 0;
  const uniqueFps = durationSec ? uniqueFrames / durationSec : 0;

  await run("ffmpeg", [
    "-hide_banner", "-i", demo,
    "-vf", "fps=1,scale=320:-1,tile=5x4", "-frames:v", "1", "-y", sheet,
  ]);

  console.log("\n=== M0 REPORT (TodoMVC) ===");
  console.log(`raw         : ${raw}  (${crop.w}×${crop.h}, ${durationSec.toFixed(2)}s)`);
  console.log(`raw uniqueFps: ${uniqueFps.toFixed(1)}  (target ≥55; real-time smoothness)`);
  console.log(`demo        : ${demo}  (${dw}×${dh}, ${ddur.toFixed(2)}s, clipLen ${clipLen.toFixed(2)})`);
  console.log(`contact     : ${sheet}`);
  console.log(`\ncamera events (frame @ ${FPS}fps → action):`);
  for (const e of cam.events) {
    const t = (e.startFrame / FPS).toFixed(2);
    const kind = e.toZoom > e.fromZoom ? "IN " : "OUT";
    console.log(
      `  f${String(e.startFrame).padStart(4)} (${t}s)  ${kind} ${e.fromZoom}→${e.toZoom}  focal(${Math.round(e.toFocalX)},${Math.round(e.toFocalY)})  ${e.durMs}ms`,
    );
  }
} finally {
  await context.close();
}
