// Post-process the raw capture into the shipped demo.mp4: apply the cinematic
// zoompan (camera events), downscale to 720p, then the endcap — the film's last
// frame blurs in and the typing brand line (nookframe.com/@handle → n+block
// logo) plays on top (endcap.ts) — and extract a poster frame for OG images.
//
// trap B: the raw is ALREADY native 2× (e.g. 2560×1440 = 1280×720 logical × DPR2),
// so it IS the supersample — we DROP the E2B path's leading `scale=CAP*SS` step
// (a second upscale would double-scale and break the zoom). zoompan runs at the
// native 2× size (finer sub-pixel granularity → no integer-position shimmer),
// then a single lanczos downscale to 720p. Focal coords come in as LOGICAL px
// (getBoundingClientRect space) and are scaled to capture px here.
//
// trap (endcap): this machine's ffmpeg has NO libfreetype (no `drawtext`), so
// the typing overlay is rasterized in a headless Chrome (endcap.ts) and
// composited with xfade+overlay. The endcap is best-effort — any failure ships
// the plain film (body + fade-out) rather than failing the take.
import { dirname } from "node:path";
import type { CameraEvent } from "./camera";
import { buildZoomFilter, coalescePans } from "./camera";
import {
  FPS, MAX_VIDEO_SEC, PAD_FRAC, PAD_COLOR, CENTER_BIAS,
  CAMERA_MAX_EVENTS, CAMERA_VF_MAX_CHARS,
} from "./config";
import { run, ffprobeValue } from "./util";
import { appendEndcap } from "./endcap";
import { renderWatermark } from "./watermark";

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
  // Fail loud on an unreadable raw (audit C-B3): the old max(2,…) floor silently
  // shipped a 2-second stub off a moov-less capture.
  if (!durationSec || durationSec < 1) {
    throw new Error(`raw duration unreadable (${durationSec}) — capture is likely corrupt; refusing to ship a stub`);
  }
  const clipLen = Math.max(2, Math.min(MAX_VIDEO_SEC, durationSec));
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

  // ── body (always) ────────────────────────────────────────────────────────────
  // Encoded once, unconditionally, with NO fade-out: the endcap's blur crossfade
  // consumes the live tail. A body failure surfaces as its own error instead of
  // masquerading as an endcap failure.
  const handle = "@" + username;
  const bodyPath = `${outDir}/body.mp4`;

  // 워터마크(2026-09-01, 도난 방지): 프레임 전체 크기의 투명 PNG를 구워 body에
  // 얹는다. body 패스에 얹는 이유 — 엔드캡 성패와 무관하게 무조건 돌고, 포스터도
  // 여기서 뽑으므로 썸네일에도 같은 표식이 남는다. 굽기 실패는 촬영을 죽이지
  // 않는다(표식 없이 진행하고 로그에 남긴다).
  let wmPath: string | null = null;
  try {
    wmPath = await renderWatermark({ handle, width: outW, height: outH, outDir });
  } catch (e) {
    console.error("[postprocess] watermark render failed (non-fatal):", (e as Error).message);
  }

  // 워터마크가 있으면 filter_complex로 합성한다. -vf 한 줄로는 두 번째 입력을
  // 못 받는다. baseChain은 카메라 이벤트에 따라 길어질 수 있으나(CAMERA_VF_MAX_CHARS
  // 가드) filter_complex 쪽 길이 제약은 없다.
  const bodyFilterArgs = wmPath
    ? [
        "-i", wmPath,
        "-filter_complex",
        `[0:v]${baseChain},format=yuv420p[bd];[bd][1:v]overlay=0:0:format=auto,format=yuv420p[v]`,
        "-map", "[v]",
      ]
    : ["-vf", `${baseChain},format=yuv420p`];

  await ff(
    [
      "-y",
      "-i", rawPath,
      ...bodyFilterArgs,
      "-t", clipLen.toFixed(2),
      ...ENCODE_ARGS,
      "-movflags", "+faststart",
      bodyPath,
    ],
    360_000,
    "body",
  );
  const posterSource = bodyPath; // grab the poster from the film, not the endcap

  // ── endcap (best-effort) ─────────────────────────────────────────────────────
  // Blur-in over the film's own last frame + auto-contrast typing overlay.
  try {
    const { tone } = await appendEndcap({
      bodyPath,
      outPath,
      handle,
      width: outW,
      height: outH,
      fps: FPS,
      clipLen,
      outDir,
      encodeArgs: ENCODE_ARGS,
    });
    console.log(`[postprocess] endcap composited (tone: ${tone})`);
  } catch (e) {
    console.error(
      "[postprocess] endcap failed (non-fatal), shipping plain film:",
      (e as Error).message,
    );
    // Plain film needs the classic fade-out ending the endcap would have replaced.
    await ff(
      [
        "-y",
        "-i", bodyPath,
        "-vf", `fade=t=out:st=${fadeOutStart}:d=0.5,format=yuv420p`,
        ...ENCODE_ARGS,
        "-movflags", "+faststart",
        outPath,
      ],
      120_000,
      "plain",
    );
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

