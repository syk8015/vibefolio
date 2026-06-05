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
import { FPS, MAX_VIDEO_SEC } from "./config";
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
    const sx = rawW / logicalW; // ≈ DPR
    const sy = rawH / logicalH;
    const scaled = events.map((e) => ({
      ...e,
      fromFocalX: e.fromFocalX * sx,
      toFocalX: e.toFocalX * sx,
      fromFocalY: e.fromFocalY * sy,
      toFocalY: e.toFocalY * sy,
    }));
    // zoompan at native 2× (no pre-upscale — the raw already is the supersample).
    const zoom = buildZoomFilter(scaled, FPS, rawW, rawH);
    vf =
      `${zoom},scale=-2:720:flags=lanczos,` +
      `fade=t=in:st=0:d=0.4,fade=t=out:st=${fadeOutStart}:d=0.5`;
  } else {
    vf =
      `scale=-2:720:flags=lanczos,` +
      `fade=t=in:st=0:d=0.4,fade=t=out:st=${fadeOutStart}:d=0.5`;
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
    { timeoutMs: 180_000 },
  );
  if (code !== 0) {
    throw new Error(`ffmpeg post-process failed (exit ${code}): ${stderr.slice(-600)}`);
  }
  return { durationSec, clipLen };
}
