// M1 orchestration (plan §5.1): explore (read-only, NOT recorded) → storageState
// snapshot → reset into a fresh recording context → record + intro → one-take
// replay of the explored script → post-process zoom → (optional) upload. The 3-
// layer safety model (behaviour prompt in explore.ts + network back-stop here +
// policy gate) is active on every page.
//
// Run (PoC, live_url read-only):
//   npx -y tsx local-runner/index.ts <url> [--project manual-m1] [--policy read-only|full] [--upload]
//
// Verification goals (M1): 0 mutating requests reach the server (blockedWrites is
// the count we intercepted) and the read-only demo is watchable. Judge demo.mp4.
import { mkdirSync } from "node:fs";
import { launchChromium, newRecordingPage, ensureExactViewport } from "./browser";
import { computeCropRect, startRecording } from "./record";
import { injectCursorOverlay, ensureCursor, cursorSetPos } from "./cursor";
import { CameraTrack } from "./camera";
import { replay } from "./replay";
import { postprocess } from "./postprocess";
import { explore, isLoginGated } from "./explore";
import { installSafety, type BlockedWrite, type SafetyPolicy } from "./safety";
import { uploadAndMarkDone } from "./upload";
import {
  VIEW_W,
  VIEW_H,
  OUT_DIR,
  INTRO_MS,
  TAIL_MS,
  CAPTURE_WARMUP_MS,
  FPS,
} from "./config";
import { sleep, run, ffprobeValue } from "./util";

// ── CLI ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const url = argv.find((a) => !a.startsWith("--"));
if (!url) {
  console.error("usage: tsx local-runner/index.ts <url> [--project <id>] [--policy read-only|full] [--upload]");
  process.exit(1);
}
const flag = (name: string, dflt?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : dflt;
};
const projectId = flag("project", "manual-m1")!;
const policy: SafetyPolicy = flag("policy", "read-only") === "full" ? "full" : "read-only";
const doUpload = argv.includes("--upload");

mkdirSync(OUT_DIR, { recursive: true });
const raw = `${OUT_DIR}/raw.mp4`;
const demo = `${OUT_DIR}/demo.mp4`;
const sheet = `${OUT_DIR}/demo-sheet.png`;

const blockedWrites: BlockedWrite[] = [];
const onBlocked = (w: BlockedWrite) => blockedWrites.push(w);

// Robust load for an arbitrary SPA: domcontentloaded (networkidle can hang on
// keepalive sockets), then a settle for client hydration.
async function gotoSettled(page: import("playwright-core").Page, target: string) {
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForLoadState("load").catch(() => {});
  await sleep(1800);
}

const browser = await launchChromium();
try {
  // ── 1) Explore (NOT recorded) ──────────────────────────────────────────────
  // Fixed 1280×720 DSF=1 context so screenshots are 1:1 with the computer-use
  // display and the model's coordinates are logical CSS px (= replay's space).
  console.log(`[explore] ${url}  (policy: ${policy})`);
  const exploreCtx = await browser.newContext({
    viewport: { width: VIEW_W, height: VIEW_H },
    deviceScaleFactor: 1,
    locale: "en-US", // no Translate offer (matches the page language)
  });
  const explorePage = await exploreCtx.newPage();
  await installSafety(explorePage, policy, onBlocked);
  await gotoSettled(explorePage, url);

  if (await isLoginGated(explorePage)) {
    console.log("[explore] login-gated (password field dominates) → skipping per policy §4.7");
    await exploreCtx.close();
    process.exit(0);
  }

  const storage0 = await exploreCtx.storageState(); // shared footing for the take
  const script = await explore(explorePage);
  await exploreCtx.close();
  console.log(`[explore] ${script.notes}`);
  console.log(`[explore] script actions (${script.actions.length}):`);
  for (const a of script.actions) {
    const tail =
      a.kind === "type"
        ? ` "${a.text}"${a.submit ? " ⏎" : ""}`
        : a.kind === "scroll"
          ? ` dy=${a.dy}`
          : "";
    const sel = "selector" in a ? a.selector || "(coord)" : "";
    console.log(`   ${a.kind.padEnd(7)} ${sel}${tail}`);
  }
  if (!script.actions.length) {
    console.error("[explore] produced no actions — nothing to record. Aborting.");
    process.exit(1);
  }

  // ── 2) Reset (same footing) + 3) Record + intro ──────────────────────────────
  const { page } = await newRecordingPage(browser, storage0);
  await installSafety(page, policy, onBlocked);
  await injectCursorOverlay(page);
  await gotoSettled(page, url);
  const sized = await ensureExactViewport(browser, page);
  await page.bringToFront();
  await ensureCursor(page);
  console.log("[record] viewport:", sized);

  const crop = await computeCropRect(page);
  console.log(
    "[record] crop:", crop.x, crop.y, crop.w, crop.h,
    `(dpr ${crop.dpr}, logical ${crop.logical.iw}×${crop.logical.ih})`,
  );

  const cx = crop.logical.iw / 2;
  const cy = crop.logical.ih / 2;
  await cursorSetPos(page, cx, cy);
  await sleep(450); // capture warm + cursor paint at center

  const rec = startRecording(raw, crop);
  const recStartTime = Date.now() + CAPTURE_WARMUP_MS;
  const cam = new CameraTrack(recStartTime, crop.logical.iw, crop.logical.ih);

  await sleep(INTRO_MS); // hero beat
  await replay(page, script, cam); // one-take, no AI loop
  await sleep(TAIL_MS);
  await rec.stop();
  console.log("[record] stopped; camera events:", cam.events.length);

  // ── 5) Post-process ───────────────────────────────────────────────────────────
  const { durationSec, clipLen } = await postprocess({
    rawPath: raw,
    outPath: demo,
    events: cam.events,
    rawW: crop.w,
    rawH: crop.h,
    logicalW: crop.logical.iw,
    logicalH: crop.logical.ih,
  });

  // ── Measure + contact sheet ───────────────────────────────────────────────────
  const dw = await ffprobeValue(demo, "stream=width");
  const dh = await ffprobeValue(demo, "stream=height");
  const ddur = await ffprobeValue(demo, "format=duration");
  await run("ffmpeg", [
    "-hide_banner", "-i", demo,
    "-vf", "fps=1,scale=320:-1,tile=5x5", "-frames:v", "1", "-y", sheet,
  ]);

  // ── 6) Upload (optional) ────────────────────────────────────────────────────
  let uploaded: string | undefined;
  if (doUpload) {
    const r = await uploadAndMarkDone(projectId, demo);
    uploaded = r.publicUrl;
    console.log(`[upload] ${r.storagePath}`);
  }

  // ── Report ────────────────────────────────────────────────────────────────────
  console.log("\n=== M1 REPORT ===");
  console.log(`target      : ${url}`);
  console.log(`policy      : ${policy}`);
  console.log(`script      : ${script.actions.length} actions  (${script.notes})`);
  console.log(`blockedWrites: ${blockedWrites.length}  (mutating requests intercepted → 0 reached the server)`);
  for (const w of blockedWrites) console.log(`   ✕ ${w.method} ${w.kind}  ${w.url.slice(0, 90)}`);
  console.log(`raw         : ${raw}  (${crop.w}×${crop.h}, ${durationSec.toFixed(2)}s)`);
  console.log(`demo        : ${demo}  (${dw}×${dh}, ${ddur.toFixed(2)}s, clipLen ${clipLen.toFixed(2)})`);
  console.log(`contact     : ${sheet}`);
  if (uploaded) console.log(`uploaded    : ${uploaded}`);
} finally {
  await browser.close();
}
