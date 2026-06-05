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

export type Recording = {
  proc: ChildProcess;
  stop: () => Promise<void>;
};

// Start a real-time 60fps capture of the cropped content region to outPath.
// Hardware H.264 (videotoolbox) keeps the M5 CPU free for the browser so we
// don't drop frames; this is a high-bitrate intermediate (re-encoded in post).
export function startRecording(outPath: string, crop: CropRect): Recording {
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
    `${SCREEN_DEVICE_INDEX}:none`,
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
  proc.stderr.on("data", (d) => (stderr += d.toString()));

  const stop = () =>
    new Promise<void>((resolve, reject) => {
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
