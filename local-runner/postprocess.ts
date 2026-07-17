// Post-process the raw capture into the shipped demo.mp4: apply the cinematic
// zoompan (camera events), downscale to 720p, fade in/out, then append the endcap
// (the typing brand scene — nookframe.com/@handle typed and erased, landing on
// the n+block logo) and extract a poster frame for OG images.
//
// trap B: the raw is ALREADY native 2× (e.g. 2560×1440 = 1280×720 logical × DPR2),
// so it IS the supersample — we DROP the E2B path's leading `scale=CAP*SS` step
// (a second upscale would double-scale and break the zoom). zoompan runs at the
// native 2× size (finer sub-pixel granularity → no integer-position shimmer),
// then a single lanczos downscale to 720p. Focal coords come in as LOGICAL px
// (getBoundingClientRect space) and are scaled to capture px here.
//
// trap (endcap): this machine's ffmpeg has NO libfreetype (no `drawtext`), so the
// endcap frames are rasterized in a headless Chrome (endcap.ts) and appended with
// `concat`. The endcap is best-effort — any failure ships the plain film rather
// than failing the take.
import { writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { CameraEvent } from "./camera";
import { buildZoomFilter, coalescePans } from "./camera";
import {
  FPS, MAX_VIDEO_SEC, PAD_FRAC, PAD_COLOR, CENTER_BIAS,
  CAMERA_MAX_EVENTS, CAMERA_VF_MAX_CHARS,
} from "./config";
import { run, ffprobeValue } from "./util";
import { renderEndcapVideo } from "./endcap";

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
  // "@handle" burned into the endcap chip + end card. "@preview" for dry-runs.
  username: string;
};

export async function postprocess(input: PostInput): Promise<{
  durationSec: number;
  clipLen: number;
  posterPath?: string;
}> {
  const { rawPath, outPath, events, rawW, rawH, logicalW, logicalH, username } = input;
  const outDir = dirname(outPath);
  const durationSec = await ffprobeValue(rawPath, "format=duration");
  const clipLen = Math.max(2, Math.min(MAX_VIDEO_SEC, durationSec || 0));
  const fadeOutStart = Math.max(0, clipLen - 0.5).toFixed(2);

  // Final frame size. Height is fixed 720p; width follows the logical viewport
  // aspect (rounded even). We force BOTH the body and the end card to exactly
  // these dims so the concat is dimension-clean by construction.
  const outH = 720;
  const outWraw = Math.round((logicalW / logicalH) * outH);
  const outW = outWraw % 2 ? outWraw + 1 : outWraw;

  // ── base chain (everything up to the 720p downscale, no fade yet) ────────────
  let baseChain: string;
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
    // (CENTER_BIAS) near an edge pans into the margin instead of clamping.
    const padX = Math.round(zw * PAD_FRAC);
    const padY = Math.round(zh * PAD_FRAC);
    const pw = zw + 2 * padX;
    const ph = zh + 2 * padY;
    const padScale = pw / zw;
    const build = (evs: CameraEvent[]): string => {
      const scaled = evs.map((e) => ({
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
      return (
        `scale=${zw}:${zh}:flags=lanczos,` +
        `pad=${pw}:${ph}:${padX}:${padY}:color=${PAD_COLOR},${zoom},` +
        `scale=${outW}:${outH}:flags=lanczos`
      );
    };
    // Expression guard: an event-heavy take must never kill the post again (the
    // 2026-07-12 take died here with 58 events). Cap the count, then verify the
    // BUILT length and coalesce harder if some future shape still blows past it.
    let ev = events;
    if (ev.length > CAMERA_MAX_EVENTS) {
      ev = coalescePans(ev, CAMERA_MAX_EVENTS, FPS);
      console.log(`[postprocess] coalesced camera events ${events.length} → ${ev.length} (zoompan guard)`);
    }
    baseChain = build(ev);
    while (baseChain.length > CAMERA_VF_MAX_CHARS && ev.length > 12) {
      ev = coalescePans(ev, Math.max(12, Math.floor(ev.length / 2)), FPS);
      baseChain = build(ev);
      console.log(`[postprocess] filter ${baseChain.length} chars after coalescing to ${ev.length} events`);
    }
  } else {
    baseChain = `scale=${outW}:${outH}:flags=lanczos`;
  }

  // ── endcap (best-effort) ─────────────────────────────────────────────────────
  const handle = "@" + username;
  const bodyPath = `${outDir}/body.mp4`;
  let usedEndcap = false;
  let posterSource = outPath;
  try {
    // Typing brand scene (dark, matches the body's fade-to-black → no cream flash).
    const { endcapPath } = await renderEndcapVideo({
      handle,
      width: outW,
      height: outH,
      fps: FPS,
      outDir,
      encodeArgs: ENCODE_ARGS,
    });

    // Body: base chain → fade out (chip removed 2026-07-18 — clean film body).
    await ff(
      [
        "-y",
        "-i", rawPath,
        "-vf", `${baseChain},fade=t=out:st=${fadeOutStart}:d=0.5,format=yuv420p`,
        "-t", clipLen.toFixed(2),
        ...ENCODE_ARGS,
        "-movflags", "+faststart",
        bodyPath,
      ],
      360_000,
      "body",
    );

    await concatSegments(bodyPath, endcapPath, outPath, outDir);
    usedEndcap = true;
    posterSource = bodyPath; // grab the poster from the film, not the endcap
  } catch (e) {
    console.error(
      "[postprocess] endcap failed (non-fatal), shipping plain film:",
      (e as Error).message,
    );
    usedEndcap = false;
  }

  // Plain film (no endcap): single pass straight to outPath (legacy behaviour).
  if (!usedEndcap) {
    await ff(
      [
        "-y",
        "-i", rawPath,
        "-vf", `${baseChain},fade=t=out:st=${fadeOutStart}:d=0.5`,
        "-t", clipLen.toFixed(2),
        ...ENCODE_ARGS,
        "-movflags", "+faststart",
        outPath,
      ],
      360_000,
      "plain",
    );
    posterSource = outPath;
  }

  // ── poster (best-effort) ─────────────────────────────────────────────────────
  let posterPath: string | undefined;
  try {
    const p = `${outDir}/poster.jpg`;
    const ss = Math.max(0.5, clipLen * 0.4).toFixed(2);
    const { code, stderr } = await run(
      "ffmpeg",
      ["-y", "-ss", ss, "-i", posterSource, "-frames:v", "1", "-q:v", "3", p],
      { timeoutMs: 30_000 },
    );
    if (code !== 0) throw new Error(stderr.slice(-300));
    posterPath = p;
  } catch (e) {
    console.error("[postprocess] poster extraction failed (non-fatal):", (e as Error).message);
  }

  return { durationSec, clipLen, posterPath };
}

// Shared libx264 encode args (identical across body + end card so the concat can
// stream-copy without a re-encode).
const ENCODE_ARGS = [
  "-r", String(FPS),
  "-fps_mode", "cfr",
  "-c:v", "libx264",
  "-preset", "medium",
  "-crf", "26",
  "-pix_fmt", "yuv420p",
  "-an",
];

async function ff(args: string[], timeoutMs: number, label: string): Promise<void> {
  const { code, stderr } = await run("ffmpeg", args, { timeoutMs });
  if (code !== 0) {
    throw new Error(`ffmpeg ${label} failed (exit ${code}): ${stderr.slice(-600)}`);
  }
}

// Join body + end card. Both share identical codec params, so try a lossless
// stream-copy via the concat demuxer first; fall back to a filter re-encode if
// the copy is rejected (SPS/timebase mismatch).
async function concatSegments(
  bodyPath: string,
  endcardPath: string,
  outPath: string,
  outDir: string,
): Promise<void> {
  const listPath = `${outDir}/concat.txt`;
  await writeFile(listPath, `file '${bodyPath}'\nfile '${endcardPath}'\n`);
  const copy = await run(
    "ffmpeg",
    ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-movflags", "+faststart", outPath],
    { timeoutMs: 60_000 },
  );
  if (copy.code === 0) return;
  const enc = await run(
    "ffmpeg",
    [
      "-y",
      "-i", bodyPath,
      "-i", endcardPath,
      "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]",
      "-map", "[v]",
      "-r", String(FPS), "-fps_mode", "cfr",
      "-c:v", "libx264", "-preset", "medium", "-crf", "20",
      "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart",
      outPath,
    ],
    { timeoutMs: 180_000 },
  );
  if (enc.code !== 0) {
    throw new Error(`concat failed (exit ${enc.code}): ${enc.stderr.slice(-500)}`);
  }
}
