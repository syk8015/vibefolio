// Post-process the raw capture into the shipped demo.mp4: apply the cinematic
// zoompan (camera events), downscale to 720p, fade in/out.
//
// trap B: the raw is ALREADY native 2× (e.g. 2560×1440 = 1280×720 logical × DPR2),
// so it IS the supersample — we DROP the E2B path's leading `scale=CAP*SS` step
// (a second upscale would double-scale and break the zoom). zoompan runs at the
// native 2× size (finer sub-pixel granularity → no integer-position shimmer),
// then a single lanczos downscale to 720p. Focal coords come in as LOGICAL px
// (getBoundingClientRect space) and are scaled to capture px here.
import type { CameraEvent } from "./camera";
import { buildZoomFilter } from "./camera";
import { FPS, MAX_VIDEO_SEC, PAD_FRAC, PAD_COLOR, CENTER_BIAS } from "./config";
import { run, ffprobeValue } from "./util";

export type PostInput = {
  rawPath: string;
  outPath: string;
  events: CameraEvent[];
  // raw capture pixel dims (= crop.w/h) and the logical viewport they came from,
  // used to map focal (logical px) → capture px without trusting DPR rounding.
  rawW: number;
  rawH: number;
  logicalW: number;
  logicalH: number;
};

export async function postprocess(input: PostInput): Promise<{
  durationSec: number;
  clipLen: number;
}> {
  const { rawPath, outPath, events, rawW, rawH, logicalW, logicalH } = input;
  const durationSec = await ffprobeValue(rawPath, "format=duration");
  const clipLen = Math.max(2, Math.min(MAX_VIDEO_SEC, durationSec || 0));
  const fadeOutStart = Math.max(0, clipLen - 0.5).toFixed(2);

  let vf: string;
  if (events.length) {
    // SUPERSAMPLE the native-2× raw by a further ×SS before zoompan. zoompan snaps
    // its crop-window position to integer SOURCE pixels; at ZOOM_MAX 2 that stepping
    // is telephoto-amplified into a visible shake (user 2026-06-06). At native 2× a
    // step is 0.5 output px; ×2 more makes it 0.25 px → smooth. Focal scales by DPR·SS.
    const SS = 2;
    const zw = rawW * SS;
    const zh = rawH * SS;
    const sx = (rawW / logicalW) * SS; // logical px → supersampled-capture px
    const sy = (rawH / logicalH) * SS;
    // PAD a solid margin around the supersampled capture so a cursor-CENTERED crop
    // (CENTER_BIAS) near an edge pans into the margin instead of clamping. padX/Y is
    // per side; padded canvas = ~1.5× (8K on the M5 — benchmarked ~36s for a 30s
    // clip, well under the timeout). padScale makes logical z=1 crop exactly the
    // WINDOW region back out of the padded frame, and the window center == padded
    // center, so the camera's z=1/focal=center invariant frames the whole window.
    const padX = Math.round(zw * PAD_FRAC);
    const padY = Math.round(zh * PAD_FRAC);
    const pw = zw + 2 * padX;
    const ph = zh + 2 * padY;
    const padScale = pw / zw;
    const scaled = events.map((e) => ({
      ...e,
      fromZoom: e.fromZoom * padScale,
      toZoom: e.toZoom * padScale,
      fromFocalX: e.fromFocalX * sx + padX,
      toFocalX: e.toFocalX * sx + padX,
      fromFocalY: e.fromFocalY * sy + padY,
      toFocalY: e.toFocalY * sy + padY,
    }));
    const zoom = buildZoomFilter(scaled, FPS, pw, ph, {
      centerBias: CENTER_BIAS,
      baseZoom: padScale, // un-keyframed frames frame the window, not the whole pad
    });
    // No fade-IN: the raw is bright from frame 0 (verified), so a fade-in just
    // opens on black before the intro hold (user 2026-06-06). Keep the fade-OUT.
    vf =
      `scale=${zw}:${zh}:flags=lanczos,` +
      `pad=${pw}:${ph}:${padX}:${padY}:color=${PAD_COLOR},${zoom},` +
      `scale=-2:720:flags=lanczos,fade=t=out:st=${fadeOutStart}:d=0.5`;
  } else {
    vf = `scale=-2:720:flags=lanczos,fade=t=out:st=${fadeOutStart}:d=0.5`;
  }

  const { code, stderr } = await run(
    "ffmpeg",
    [
      "-y",
      "-i", rawPath,
      "-t", clipLen.toFixed(2),
      "-vf", vf,
      "-r", String(FPS),
      "-fps_mode", "cfr",
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "26",
      "-pix_fmt", "yuv420p",
      "-an",
      "-movflags", "+faststart",
      outPath,
    ],
    { timeoutMs: 360_000 }, // ~4K zoompan supersample is heavier
  );
  if (code !== 0) {
    throw new Error(`ffmpeg post-process failed (exit ${code}): ${stderr.slice(-600)}`);
  }
  return { durationSec, clipLen };
}
