// One demo take, end to end (plan §5.1): explore (read-only, NOT recorded) →
// storageState snapshot → reset into a fresh recording context → record + intro →
// one-take replay of the explored script → post-process zoom → (optional) upload.
//
// Extracted from index.ts for M2 so the CLI (index.ts) and the queue worker
// (worker.ts) run the exact same pipeline. The 3-layer safety model (behaviour
// prompt in explore.ts + network back-stop here + policy gate in job.ts) is
// active on every page.
//
// Recording needs this machine's screen exclusively (avfoundation grabs the real
// display) — callers must never run two takes concurrently.
import { mkdirSync, writeFileSync } from "node:fs";
import {
  launchChromium,
  launchRecordingContext,
  ensureExactViewport,
  installCaptureCleanliness,
  parkPhysicalCursor,
} from "./browser";
import { computeCropRect, startRecording } from "./record";
import { injectCursorOverlay, ensureCursor, cursorSetPos } from "./cursor";
import { CameraTrack } from "./camera";
import { replay } from "./replay";
import { postprocess } from "./postprocess";
import { explore, isLoginGated } from "./explore";
import { installSafety, type BlockedWrite, type SafetyPolicy } from "./safety";
import { uploadAndMarkDone, fetchUsername, type UploadResult } from "./upload";
import {
  VIEW_W,
  VIEW_H,
  OUT_DIR,
  INTRO_MS,
  TAIL_MS,
  CAPTURE_WARMUP_MS,
  MAX_VIDEO_SEC,
} from "./config";
import { sleep, run, ffprobeValue } from "./util";

// Coarse progress the worker mirrors into projects.demo_build_status (the badge
// UI already renders these). "recording" = explore + the take; "editing" = post.
export type PipelinePhase = "recording" | "editing";

export type RecordDemoOptions = {
  url: string;
  projectId: string;
  policy: SafetyPolicy;
  upload: boolean;
  // Creator-written core-feature description (projects.demo_user_hint) — passed
  // through to explore's opening brief. Optional; untrusted user data.
  userHint?: string;
  onPhase?: (phase: PipelinePhase) => void | Promise<void>;
};

export type RecordDemoResult =
  | { kind: "login-gated" }
  | {
      kind: "ok";
      rawPath: string;
      demoPath: string;
      sheetPath: string;
      actions: number;
      notes: string;
      blockedWrites: BlockedWrite[];
      durationSec: number;
      clipLen: number;
      demoW: number;
      demoH: number;
      demoDur: number;
      uploaded?: UploadResult;
    };

// Robust load for an arbitrary SPA: domcontentloaded (networkidle can hang on
// keepalive sockets), then a settle for client hydration.
async function gotoSettled(page: import("playwright-core").Page, target: string) {
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForLoadState("load").catch(() => {});
  await sleep(1800);
}

export async function recordDemo(opts: RecordDemoOptions): Promise<RecordDemoResult> {
  const { url, projectId, policy } = opts;

  mkdirSync(OUT_DIR, { recursive: true });
  const raw = `${OUT_DIR}/raw.mp4`;
  const demo = `${OUT_DIR}/demo.mp4`;
  const sheet = `${OUT_DIR}/demo-sheet.png`;

  const blockedWrites: BlockedWrite[] = [];
  const onBlocked = (w: BlockedWrite) => blockedWrites.push(w);

  await opts.onPhase?.("recording");

  const browser = await launchChromium();
  let recCtx: import("playwright-core").BrowserContext | undefined;
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
    await installCaptureCleanliness(exploreCtx, explorePage);
    await gotoSettled(explorePage, url);

    if (await isLoginGated(explorePage)) {
      console.log("[explore] login-gated (password field dominates) → skipping per policy §4.7");
      await exploreCtx.close();
      return { kind: "login-gated" };
    }

    const storage0 = await exploreCtx.storageState(); // shared footing for the take
    const script = await explore(explorePage, { userHint: opts.userHint });
    await exploreCtx.close();
    await browser.close(); // explore done — no stray window at (0,0) during capture
    console.log(`[explore] ${script.notes}`);
    console.log(`[explore] script actions (${script.actions.length}):`);
    for (const a of script.actions) {
      const tail =
        a.kind === "type"
          ? ` "${a.text}"${a.submit ? " ⏎" : ""}`
          : a.kind === "scroll"
            ? ` dy=${a.dy}`
            : a.kind === "drag"
              ? ` (${a.x},${a.y})→(${a.toX},${a.toY})`
              : a.kind === "path"
                ? ` ${a.points.length} pts${a.label ? ` "${a.label}"` : ""}`
                : "";
      const sel = "selector" in a ? a.selector || "(coord)" : "";
      console.log(`   ${a.kind.padEnd(7)} ${sel}${tail}`);
    }
    if (!script.actions.length) {
      throw new Error("explore produced no actions — nothing to record");
    }

    // ── 2) Reset (same footing) + 3) Record + intro ──────────────────────────────
    const { context: recordingCtx, page } = await launchRecordingContext(storage0);
    recCtx = recordingCtx;
    await installSafety(page, policy, onBlocked);
    await injectCursorOverlay(page);
    await gotoSettled(page, url);
    const sized = await ensureExactViewport(page);
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
    // Park the REAL cursor on our chrome strip (mid address bar, above the crop) so
    // it can't hover the Dock / menu bar and film a tooltip into the take.
    await parkPhysicalCursor(crop.x / crop.dpr + crop.logical.iw * 0.5, Math.max(8, crop.y / crop.dpr - 35));
    await sleep(450); // capture warm + cursor paint at center

    const rec = startRecording(raw, crop);
    const recStartTime = Date.now() + CAPTURE_WARMUP_MS;
    const cam = new CameraTrack(recStartTime, crop.logical.iw, crop.logical.ih);

    await sleep(INTRO_MS); // hero beat
    // Budget the take so intro + actions + tail fit inside the clip cap — replay
    // stops at an action boundary rather than letting the cap cut mid-gesture.
    const replayBudget = MAX_VIDEO_SEC * 1000 - INTRO_MS - TAIL_MS - 900; // fade slack
    await replay(page, script, cam, replayBudget); // one-take, no AI loop
    await sleep(TAIL_MS);
    await rec.stop();
    console.log("[record] stopped; camera events:", cam.events.length);

    // ── 5) Post-process ───────────────────────────────────────────────────────────
    await opts.onPhase?.("editing");
    // Owner handle for the endcap chip / end card. "preview" for dry-runs.
    const username = (await fetchUsername(projectId)) ?? "preview";
    // Persist everything post needs BEFORE running it: if only the post stage
    // dies, reprocess.ts re-runs it from raw.mp4 + this file — no new explore fee,
    // no re-record (the 2026-07-12 zoompan failure burned a take this would have
    // saved).
    writeFileSync(
      `${OUT_DIR}/take-meta.json`,
      JSON.stringify(
        {
          url, projectId, policy, username,
          rawW: crop.w, rawH: crop.h,
          logicalW: crop.logical.iw, logicalH: crop.logical.ih,
          script, events: cam.events,
        },
        null,
        2,
      ),
    );
    const { durationSec, clipLen, posterPath } = await postprocess({
      rawPath: raw,
      outPath: demo,
      events: cam.events,
      rawW: crop.w,
      rawH: crop.h,
      logicalW: crop.logical.iw,
      logicalH: crop.logical.ih,
      username,
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
    let uploaded: UploadResult | undefined;
    if (opts.upload) {
      uploaded = await uploadAndMarkDone(projectId, demo, posterPath);
      console.log(`[upload] ${uploaded.storagePath}`);
    }

    // ── Report ────────────────────────────────────────────────────────────────────
    console.log("\n=== RUN REPORT ===");
    console.log(`target      : ${url}`);
    console.log(`policy      : ${policy}`);
    console.log(`script      : ${script.actions.length} actions  (${script.notes})`);
    console.log(`blockedWrites: ${blockedWrites.length}  (mutating requests intercepted → 0 reached the server)`);
    for (const w of blockedWrites) console.log(`   ✕ ${w.method} ${w.kind}  ${w.url.slice(0, 90)}`);
    console.log(`raw         : ${raw}  (${crop.w}×${crop.h}, ${durationSec.toFixed(2)}s)`);
    console.log(`demo        : ${demo}  (${dw}×${dh}, ${ddur.toFixed(2)}s, clipLen ${clipLen.toFixed(2)})`);
    console.log(`contact     : ${sheet}`);
    if (uploaded) console.log(`uploaded    : ${uploaded.publicUrl}`);

    return {
      kind: "ok",
      rawPath: raw,
      demoPath: demo,
      sheetPath: sheet,
      actions: script.actions.length,
      notes: script.notes ?? "",
      blockedWrites,
      durationSec,
      clipLen,
      demoW: dw,
      demoH: dh,
      demoDur: ddur,
      uploaded,
    };
  } finally {
    if (recCtx) await recCtx.close();
    await browser.close().catch(() => {});
  }
}
