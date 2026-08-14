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
import { existsSync, mkdirSync, renameSync, statfsSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import {
  launchChromium,
  launchRecordingContext,
  ensureExactViewport,
  installCaptureCleanliness,
  parkPhysicalCursor,
} from "./browser";
import { computeCropRect, startRecording, resolveScreenDevice, assertRawHasContent } from "./record";
import { injectCursorOverlay, ensureCursor, cursorSetPos } from "./cursor";
import { CameraTrack } from "./camera";
import { replay } from "./replay";
import { postprocess } from "./postprocess";
import { explore, isLoginGated } from "./explore";
import { installSafety, type BlockedWrite, type SafetyPolicy } from "./safety";
import { assertFinalUrlPublic, watchLanBreach } from "./netguard";
import { assertFocusShortcuts, enableFocus } from "./focus";
import { extractModerationFrames, moderateDemo, type DemoCoverage } from "./moderate";
import {
  uploadAndMarkDone,
  uploadQuarantined,
  fetchUsername,
  type UploadResult,
  type QuarantineUpload,
} from "./upload";
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
  // Creator's demo-mode note (projects.demo_access.note) — how to see the app's
  // demo mode from the entry URL the job assembled. Same untrusted-data framing
  // as userHint in the brief.
  accessNote?: string;
  // Creator declared the real app fundamentally can't be shown without
  // login/pairing (demo_access.impossible, 피드백 B-3): this take is knowingly a
  // landing-page film. Steers the explore brief + stamps coverage in the report.
  accessImpossible?: boolean;
  // Project title, shown to the moderation classifier as extra (untrusted)
  // context — a phishing page often names its target brand in the title.
  projectTitle?: string;
  // CLI-only (see job.ts): operator recording their own fixtures/dev servers.
  // Disables netguard (private-address blocking) — queue jobs never set this.
  allowPrivateHost?: boolean;
  onPhase?: (phase: PipelinePhase) => void | Promise<void>;
};

export type RecordDemoResult =
  | { kind: "login-gated" }
  | {
      // Content scan flagged the take: artifacts are quarantined (uploaded but
      // unlinked) and the caller parks the row as held for admin review.
      kind: "moderation-held";
      categories: string[];
      reason: string;
      model: string;
      quarantine?: QuarantineUpload;
    }
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
      // Scan couldn't run and the take shipped unscanned — worker Sentry-flags it.
      moderationFailedOpen?: boolean;
      // Vision read of what the film shows (피드백 A-1) — "unclear" when the scan
      // didn't run (dry-runs) or failed open. For future completion-email copy.
      coverage?: DemoCoverage;
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

  // Disk pre-check (audit B-F4/C-H2): a take writes a ~200MB raw + supersampled
  // intermediates — a full /tmp otherwise surfaces as a cryptic ffmpeg death
  // AFTER the explore fee is spent.
  const disk = statfsSync(OUT_DIR);
  const freeGiB = (disk.bsize * disk.bavail) / 1024 ** 3;
  if (freeGiB < 2) {
    throw new Error(`low disk: ${freeGiB.toFixed(1)}GiB free under ${OUT_DIR} (need ≥2GiB)`);
  }

  // Archive the previous take's raw + meta (audit C-E2): the fixed filenames
  // meant the NEXT take destroyed the only inputs a delayed reprocess needs.
  // One-deep archive — reprocess.ts reads the live paths; prev-take/ is the
  // manual salvage copy.
  if (existsSync(raw)) {
    const prevDir = `${OUT_DIR}/prev-take`;
    mkdirSync(prevDir, { recursive: true });
    for (const f of ["raw.mp4", "take-meta.json", "body.mp4"]) {
      if (existsSync(`${OUT_DIR}/${f}`)) renameSync(`${OUT_DIR}/${f}`, `${prevDir}/${f}`);
    }
    console.log("[pipeline] previous take archived → prev-take/");
  }

  const blockedWrites: BlockedWrite[] = [];
  const onBlocked = (w: BlockedWrite) => blockedWrites.push(w);

  await opts.onPhase?.("recording");

  // Keep the display awake for the whole take (audit B-F5): avfoundation films
  // darkness if the screen sleeps mid-capture. -d display, -i idle, -s system.
  const caffeinate = spawn("caffeinate", ["-dis"], { stdio: "ignore" });
  caffeinate.on("error", () => console.error("[pipeline] caffeinate unavailable — display sleep unguarded"));

  // -d only PREVENTS display sleep — it does not WAKE a display that already
  // slept (2026-07-20: 25 idle minutes between takes → screen device gone,
  // 0-duration raw). Assert user activity to wake it, then preflight the screen
  // device BEFORE explore spends its API fee; retry once for wake latency.
  await new Promise<void>((res) => {
    const wake = spawn("caffeinate", ["-u", "-t", "1"], { stdio: "ignore" });
    wake.on("close", () => res());
    wake.on("error", () => res());
  });
  try {
    await resolveScreenDevice();
  } catch {
    await sleep(1500);
    await resolveScreenDevice(); // still no screen device → throw before explore
  }
  // A slept display usually LOCKED the session too — the wake above then lands
  // on the LOCK SCREEN, where the screen device exists and avfoundation films
  // the wallpaper through every downstream guard (2026-07-20 take: 19s of lock
  // screen; the blank-guard passes because a photo wallpaper has full luminance
  // spread). Unlocking needs the user's password — refuse early instead.
  const lock = await run("ioreg", ["-n", "Root", "-d1"]);
  if (/"IOConsoleLocked" = Yes/.test(lock.stdout)) {
    throw new Error(
      "macOS session is LOCKED — the recorder would film the lock screen. Unlock the Mac and retry " +
        "(worker ops: start the worker while unlocked; its caffeinate then keeps the display awake)",
    );
  }
  // Notification banners land inside the crop rect and ship into the public
  // film (host-security audit item 3) — force Do Not Disturb for the whole run,
  // restored in the finally below. Fails loud here, before the explore fee.
  await assertFocusShortcuts();
  const restoreFocus = await enableFocus();

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
    await installSafety(explorePage, policy, onBlocked, { allowPrivateHost: opts.allowPrivateHost });
    await installCaptureCleanliness(exploreCtx, explorePage);
    await gotoSettled(explorePage, url);
    // Server redirect hops bypass page.route — refuse if the document (or any
    // iframe) LANDED on a private/LAN address even though the initial host was
    // public (netguard.ts header).
    if (!opts.allowPrivateHost) await assertFinalUrlPublic(explorePage);

    if (await isLoginGated(explorePage)) {
      console.log("[explore] login-gated (password field dominates) → skipping per policy §4.7");
      await exploreCtx.close();
      return { kind: "login-gated" };
    }

    const storage0 = await exploreCtx.storageState(); // shared footing for the take
    const script = await explore(explorePage, {
      userHint: opts.userHint,
      accessNote: opts.accessNote,
      accessImpossible: opts.accessImpossible,
    });
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
    await installSafety(page, policy, onBlocked, { allowPrivateHost: opts.allowPrivateHost });
    await injectCursorOverlay(page);
    await gotoSettled(page, url);
    if (!opts.allowPrivateHost) await assertFinalUrlPublic(page); // pre-recording, same reason as explore
    // Continuous guard for the whole take: catches a mid-recording redirect into
    // the LAN that the point-in-time check above can't (netguard.ts). Checked
    // before post-process/upload below.
    const lanBreached = opts.allowPrivateHost ? () => null : watchLanBreach(page);

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

    const screenDev = await resolveScreenDevice(); // display setup may have changed since config
    const rec = startRecording(raw, crop, screenDev);
    const recStartTime = Date.now() + CAPTURE_WARMUP_MS;
    const cam = new CameraTrack(recStartTime, crop.logical.iw, crop.logical.ih);

    // Keep the recorded window frontmost for the WHOLE take (audit B-A1): a
    // window stealing focus mid-capture films itself into the crop and can
    // throttle the compositor. bringToFront is a no-op when already front.
    const frontGuard = setInterval(() => void page.bringToFront().catch(() => {}), 2000);
    try {
      await sleep(INTRO_MS); // hero beat
      // Budget the take so intro + actions + tail fit inside the clip cap — replay
      // stops at an action boundary rather than letting the cap cut mid-gesture.
      const replayBudget = MAX_VIDEO_SEC * 1000 - INTRO_MS - TAIL_MS - 900; // fade slack
      await replay(page, script, cam, replayBudget); // one-take, no AI loop
      await sleep(TAIL_MS);
    } finally {
      clearInterval(frontGuard);
      // ALWAYS stop the screen recorder, even if replay threw. rec.stop() used to
      // sit after this block, so a mid-take error left the avfoundation ffmpeg child
      // filming the whole desktop indefinitely (host-security leak + disk growth).
      await rec.stop().catch((e) => console.error("[record] rec.stop failed in finally:", e));
    }
    console.log("[record] stopped; camera events:", cam.events.length);
    // Fail loud on a black/blank capture (TCC revoked, wrong surface) instead of
    // shipping darkness through every "successful" later stage (audit B-F2/F3).
    await assertRawHasContent(raw);

    // Refuse to upload a take that navigated into the LAN mid-recording (H3): the
    // latched breach catches transient redirects, the re-assert catches the final
    // resting frames. Either → discard, don't publish a film of an internal host.
    if (!opts.allowPrivateHost) {
      await assertFinalUrlPublic(page);
      const breach = lanBreached();
      if (breach) {
        throw new Error(
          `netguard: page navigated to a private/LAN address mid-take (${breach}) — refusing to record`,
        );
      }
    }

    // ── 5) Post-process ───────────────────────────────────────────────────────────
    await opts.onPhase?.("editing");
    // Owner handle burned into the endcap. "preview" is ONLY for dry-runs: a real
    // project whose username can't be resolved must fail (and retry) rather than
    // permanently brand the film "@preview" (audit C-D4).
    const fetched = await fetchUsername(projectId);
    if (!fetched && !projectId.startsWith("manual-")) {
      throw new Error(`could not resolve profiles.username for project ${projectId} — refusing to brand the endcap "@preview"`);
    }
    const username = fetched ?? "preview";
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
    // Sheet from body.mp4 (pre-endcap film), same principle as moderation frames:
    // the endcap is a separate outro APPENDED to the film, not part of it
    // (2026-08-14 user decision) — its typing frames were crowding review sheets.
    const sheetSource = existsSync(`${OUT_DIR}/body.mp4`) ? `${OUT_DIR}/body.mp4` : demo;
    await run("ffmpeg", [
      "-hide_banner", "-i", sheetSource,
      "-vf", "fps=1,scale=320:-1,tile=5x5", "-frames:v", "1", "-y", sheet,
    ]);

    // ── 5.5) Content scan (real published takes only) ────────────────────────────
    // Dry-runs (manual-*) and no-upload runs skip the scan: nothing gets published,
    // so scanning fixtures/판정 촬영 would only burn API fee. Frames come from
    // body.mp4 (pre-endcap film) so the brand outro never dilutes the sample.
    const shouldModerate = opts.upload && !projectId.startsWith("manual-");
    let moderationFailedOpen = false;
    let coverage: DemoCoverage = "unclear";
    if (shouldModerate) {
      const bodyPath = existsSync(`${OUT_DIR}/body.mp4`) ? `${OUT_DIR}/body.mp4` : demo;
      const frames = await extractModerationFrames(bodyPath, `${OUT_DIR}/mod-frames`);
      const verdict = await moderateDemo({
        framePaths: frames,
        projectTitle: opts.projectTitle,
      });
      console.log(
        `[moderate] ${verdict.verdict}` +
          (verdict.categories.length ? ` [${verdict.categories.join(", ")}]` : "") +
          (verdict.failedOpen ? " (failed open — unscanned)" : "") +
          ` coverage=${verdict.coverage}` +
          ` — ${verdict.reason}`,
      );
      moderationFailedOpen = verdict.failedOpen;
      coverage = verdict.coverage;
      if (verdict.verdict === "flag") {
        // Quarantine: upload for admin review, but leave demo_video_url alone —
        // the caller (worker) parks the row as held + files the review item.
        const quarantine = await uploadQuarantined(projectId, demo, posterPath);
        console.log(`[moderate] quarantined → ${quarantine.videoKey} (${quarantine.storage})`);
        return {
          kind: "moderation-held",
          categories: verdict.categories,
          reason: verdict.reason,
          model: verdict.model,
          quarantine,
        };
      }
    }

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
    // Coverage honesty (피드백 A-1/B-3): a declared-impossible app is knowingly a
    // landing film; otherwise the moderation frames' vision read says whether any
    // app UI actually made it into the film — the failure mode where a green
    // pipeline ships a "product demo" that is really a landing scroll.
    if (opts.accessImpossible) {
      console.log(`coverage    : landing-only (maker declared the app demo impossible — recommend a creator-made --video)`);
    } else if (coverage === "landing-only") {
      console.log(`coverage    : landing-only (vision scan saw no app UI in sampled frames — recommend a creator-made --video, or an appUrl/demoAccess entry the robot can reach)`);
    } else if (coverage === "app-ui") {
      console.log(`coverage    : app-ui (vision scan saw the app's interface in the film)`);
    }
    console.log(`script      : ${script.actions.length} actions  (${script.notes})`);
    console.log(`blockedWrites: ${blockedWrites.length}  (mutating requests intercepted → 0 reached the server)`);
    for (const w of blockedWrites) console.log(`   ✕ ${w.method} ${w.kind}  ${w.url.slice(0, 90)}`);
    console.log(`raw         : ${raw}  (${crop.w}×${crop.h}, ${durationSec.toFixed(2)}s)`);
    // Film vs endcap split so nobody reads the outro as demo runtime again.
    console.log(`demo        : ${demo}  (${dw}×${dh}, ${ddur.toFixed(2)}s = film ${clipLen.toFixed(2)}s + endcap ${Math.max(0, ddur - clipLen).toFixed(2)}s)`);
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
      moderationFailedOpen,
      coverage,
    };
  } finally {
    await restoreFocus();
    caffeinate.kill();
    if (recCtx) await recCtx.close();
    await browser.close().catch(() => {});
  }
}
