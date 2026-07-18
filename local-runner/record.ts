// Real-time screen capture via ffmpeg avfoundation, cropped to the Chrome
// content viewport. avfoundation grabs the actual GPU display output, so
// <video>/WebGL/animations play at TRUE speed and we get a real 60fps — the two
// things E2B virtual time could never do.
import { spawn, type ChildProcess } from "node:child_process";
import type { Page } from "playwright-core";
import { SCREEN_DEVICE_INDEX, FPS } from "./config";
import { run } from "./util";

export type CropRect = { x: number; y: number; w: number; h: number };
export type CropInfo = CropRect & {
  dpr: number;
  // logical (CSS px) values we derived the crop from, for debugging
  logical: { sx: number; sy: number; ow: number; oh: number; iw: number; ih: number };
};

// Convert the live window geometry into a capture-pixel crop rect.
// On macOS Chrome the side/bottom borders are 0, so the content area is:
//   left   = screenX                 (logical)
//   top    = screenY + (outerH-innerH)  (logical; below the tab strip+toolbar)
// then ×devicePixelRatio to reach avfoundation's backing-store pixels.
export async function computeCropRect(page: Page): Promise<CropInfo> {
  const m = (await page.evaluate(() => ({
    dpr: window.devicePixelRatio,
    sx: window.screenX,
    sy: window.screenY,
    ow: window.outerWidth,
    oh: window.outerHeight,
    iw: window.innerWidth,
    ih: window.innerHeight,
  }))) as CropInfo["logical"] & { dpr: number };

  const topChrome = m.oh - m.ih; // tab strip + toolbar height (logical)
  const leftLogical = m.sx;
  const topLogical = m.sy + topChrome;
  return {
    x: Math.round(leftLogical * m.dpr),
    y: Math.round(topLogical * m.dpr),
    w: Math.round(m.iw * m.dpr),
    h: Math.round(m.ih * m.dpr),
    dpr: m.dpr,
    logical: m,
  };
}

// One full-screen frame (for crop calibration / debugging). avfoundation always
// exits non-zero on -frames:v, so we don't gate on exit code; the caller checks
// the file exists.
export async function captureFullFrame(outPath: string): Promise<void> {
  await run("ffmpeg", [
    "-hide_banner",
    "-f",
    "avfoundation",
    "-capture_cursor",
    "0",
    "-i",
    `${SCREEN_DEVICE_INDEX}:none`,
    "-frames:v",
    "1",
    "-y",
    outPath,
  ]);
}

// Crop a still/clip with ffmpeg (used to verify the calibration crop visually).
export async function cropImage(
  inPath: string,
  outPath: string,
  crop: CropRect,
): Promise<void> {
  await run("ffmpeg", [
    "-hide_banner",
    "-i",
    inPath,
    "-vf",
    `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`,
    "-y",
    outPath,
  ]);
}

// Resolve the avfoundation index of "Capture screen 0" at runtime (audit B-F7):
// plugging/unplugging a display shifts device indices, and a stale hard-coded
// index silently films the WRONG screen. Falls back to the configured constant
// only if the device list can't be parsed at all.
export async function resolveScreenDevice(): Promise<number> {
  const { stderr } = await run("ffmpeg", [
    "-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", "",
  ]);
  const m = stderr.match(/\[(\d+)\] Capture screen 0/);
  if (!m) {
    console.error("[record] device list unparsable — falling back to configured index", SCREEN_DEVICE_INDEX);
    return SCREEN_DEVICE_INDEX;
  }
  const idx = Number(m[1]);
  if (idx !== SCREEN_DEVICE_INDEX) {
    console.log(`[record] screen device shifted: config ${SCREEN_DEVICE_INDEX} → live ${idx} (display setup changed)`);
  }
  return idx;
}

// Refuse to ship a black/blank capture (audit B-F2/F3): if screen-recording
// permission flips mid-run (or the wrong surface was grabbed), avfoundation
// happily records darkness and every later stage "succeeds". Same signal as the
// E2B blank-frame guard: sampled luminance spread — an all-black or all-cream
// capture stays < 40, any real UI (text on paper) spans 180+.
export async function assertRawHasContent(rawPath: string): Promise<void> {
  const { stdout } = await run("ffmpeg", [
    "-hide_banner", "-i", rawPath,
    "-vf", "fps=2,signalstats,metadata=print:file=-",
    "-f", "null", "-",
  ], { timeoutMs: 60_000 });
  const mins = [...stdout.matchAll(/lavfi\.signalstats\.YMIN=([\d.]+)/g)].map((m) => Number(m[1]));
  const maxs = [...stdout.matchAll(/lavfi\.signalstats\.YMAX=([\d.]+)/g)].map((m) => Number(m[1]));
  if (!mins.length || !maxs.length) {
    console.error("[record] blank-guard: signalstats unparsable — skipping the check");
    return;
  }
  const spread = Math.max(...maxs) - Math.min(...mins);
  if (spread < 40) {
    throw new Error(
      `capture looks blank (luminance spread ${spread.toFixed(0)} < 40) — ` +
        "screen-recording permission (TCC) or capture surface is broken; refusing to ship",
    );
  }
}

export type Recording = {
  proc: ChildProcess;
  stop: () => Promise<void>;
};

// Start a real-time 60fps capture of the cropped content region to outPath.
// Hardware H.264 (videotoolbox) keeps the M5 CPU free for the browser so we
// don't drop frames; this is a high-bitrate intermediate (re-encoded in post).
export function startRecording(outPath: string, crop: CropRect, deviceIndex: number = SCREEN_DEVICE_INDEX): Recording {
  const args = [
    "-hide_banner",
    "-f",
    "avfoundation",
    "-capture_cursor",
    "0", // hide the OS cursor — we draw a synthetic one
    "-capture_mouse_clicks",
    "0",
    "-framerate",
    String(FPS),
    "-i",
    `${deviceIndex}:none`,
    "-vf",
    `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`,
    "-r",
    String(FPS),
    "-fps_mode",
    "cfr",
    "-c:v",
    "h264_videotoolbox",
    "-b:v",
    "50M", // intermediate quality; downscaled+re-encoded in postprocess
    "-pix_fmt",
    "yuv420p",
    "-y",
    outPath,
  ];
  const proc = spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  let spawnError: Error | undefined;
  proc.stderr.on("data", (d) => (stderr += d.toString()));
  // Without this, a spawn failure (ffmpeg missing/broken) is an unhandled
  // 'error' event that kills the whole process (audit B-F1).
  proc.on("error", (e) => {
    spawnError = e;
    console.error("[record] ffmpeg spawn error:", e.message);
  });

  const stop = () =>
    new Promise<void>((resolve, reject) => {
      if (spawnError) return reject(spawnError);
      if (proc.exitCode !== null) return resolve();
      const onClose = () => resolve();
      proc.once("close", onClose);
      // 'q' on stdin = graceful stop (flushes the moov atom => playable file).
      try {
        proc.stdin?.write("q");
      } catch {
        /* fall through to SIGINT */
      }
      // Safety net: if it doesn't quit promptly, interrupt, then hard-kill.
      setTimeout(() => {
        if (proc.exitCode === null) proc.kill("SIGINT");
      }, 1500);
      setTimeout(() => {
        if (proc.exitCode === null) {
          proc.kill("SIGKILL");
          reject(new Error(`ffmpeg capture would not stop. stderr tail: ${stderr.slice(-400)}`));
        }
      }, 4000);
    });

  return { proc, stop };
}
