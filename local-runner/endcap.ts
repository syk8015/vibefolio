// Endcap v2 (2026-07-18, user direction): no separate background scene. The film's
// LAST FRAME blurs in slowly (crossfade to a heavily-blurred still = perceptual
// "blur ramp"), and the typing brand line — nookframe.com/@handle typed, held,
// erased, landing on the n+block logo — plays ON TOP of that blur. Text ink is
// picked automatically from the blurred frame's measured luminance (ink on light
// apps, cream on dark apps — always one of the two brand inks), backed by a soft
// scrim so legibility never depends on the app's palette.
//
// ffmpeg on this machine has NO libfreetype (no drawtext), so the typing states
// (text length × cursor phase) are rasterized once each in headless Chrome as
// TRANSPARENT rgba PNGs, expanded to a 60fps frame sequence, and composited in a
// single ffmpeg pass: [body] xfade [blur+scrim] overlay [typing].
import { copyFile, mkdir, rm } from "node:fs/promises";
import { chromium } from "playwright-core";
import { run } from "./util";

// Brand inks (mirror app/globals.css).
const INK = "#1a1612";
const CREAM = "#f4ede0";

// ── Scene timing ──────────────────────────────────────────────────────────────
const BLUR_RAMP_SEC = 0.9; // body → blurred-still crossfade ("blur strengthens")
const LEAD_SEC = 0.35; // blinking cursor beat before typing starts
const TYPE_MIN_MS = 60, TYPE_JIT_MS = 40; // per keystroke
const HOLD_FULL_SEC = 0.8; // full URL on screen
const ERASE_MIN_MS = 35, ERASE_JIT_MS = 20; // per deleted char
const LAND_BLINK_SEC = 0.95; // one full blink cycle after landing on "n"
const LAND_HOLD_SEC = 1.0; // then solid n+block to the end
const BLINK_PERIOD_SEC = 0.95; // .vf-cursor: 0.95s steps(1) — first half ON

// Wordmark size: fraction of frame height (user 2026-07-18: the first cut's
// 0.09 was far too big — the logo is a signature, not a title card).
const FONT_FRAC = 0.05;

const BLUR_SIGMA = 44; // heavy enough that no UI detail competes with the type

// Deterministic per-handle keystroke jitter so retries of the same take encode
// identical films (no wall-clock, no Math.random).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sceneHtml(word: string, w: number, h: number, color: string): string {
  const esc = word.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fontPx = Math.min(Math.floor(h * FONT_FRAC), Math.floor((w * 0.86) / (word.length * 0.6)));
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;background:transparent}
  #frame{width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center}
  #row{display:inline-flex;align-items:center;min-height:1.3em;
    font-family:'JetBrains Mono',ui-monospace,'SF Mono',Menlo,monospace;
    font-weight:500;font-size:${fontPx}px;letter-spacing:-0.02em;color:${color}}
  #txt{white-space:pre}
  #blk{display:inline-block;flex-shrink:0;width:.55em;height:1.02em;
    border-radius:.05em;background:currentColor;margin-left:.08em}
</style></head><body>
<div id="frame"><div id="row"><span id="txt"></span><span id="blk"></span></div></div>
<script>
  const WORD = ${JSON.stringify(esc)};
  window.__set = (len, on) => {
    document.getElementById("txt").textContent = WORD.slice(0, len);
    document.getElementById("blk").style.opacity = on ? "1" : "0";
  };
</script></body></html>`;
}

// Measure the average luma of a still (0–255) via signalstats.
async function frameLuma(pngPath: string): Promise<number> {
  const { stdout } = await run("ffmpeg", [
    "-hide_banner", "-i", pngPath,
    "-vf", "signalstats,metadata=print:file=-",
    "-f", "null", "-",
  ], { timeoutMs: 30_000 });
  const m = stdout.match(/lavfi\.signalstats\.YAVG=([\d.]+)/);
  if (!m) throw new Error("endcap: YAVG unparsable from signalstats");
  return Number(m[1]);
}

// Compose the endcap onto bodyPath → outPath in ONE encode:
//   body plays to clipLen, its tail crossfades into a blurred+scrimmed still of
//   its own last frame, and the typing overlay runs on top until the logo hold.
// Throws on any failure — the caller ships the plain film instead.
export async function appendEndcap(opts: {
  bodyPath: string;
  outPath: string;
  handle: string; // "@username"
  width: number;
  height: number;
  fps: number;
  clipLen: number;
  outDir: string;
  encodeArgs: string[];
}): Promise<{ durationSec: number; tone: "ink" | "cream" }> {
  const { bodyPath, outPath, handle, width, height, fps, clipLen, outDir, encodeArgs } = opts;
  const word = `nookframe.com/${handle}`;
  let seed = 0;
  for (const c of word) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const rand = mulberry32(seed || 1);

  // ── background: last body frame, heavily blurred ───────────────────────────
  const lastPng = `${outDir}/endcap-last.png`;
  const blurPng = `${outDir}/endcap-blur.png`;
  let r = await run("ffmpeg", ["-y", "-sseof", "-0.1", "-i", bodyPath, "-frames:v", "1", "-update", "1", lastPng], { timeoutMs: 30_000 });
  if (r.code !== 0) throw new Error(`endcap last-frame extract failed: ${r.stderr.slice(-300)}`);
  r = await run("ffmpeg", ["-y", "-i", lastPng, "-vf", `gblur=sigma=${BLUR_SIGMA}`, blurPng], { timeoutMs: 30_000 });
  if (r.code !== 0) throw new Error(`endcap blur failed: ${r.stderr.slice(-300)}`);

  // Auto contrast: bright blurred frame → ink type + light scrim; dark → cream
  // type + dark scrim. Always the two brand inks, never an invented color.
  const luma = await frameLuma(blurPng);
  const tone: "ink" | "cream" = luma >= 128 ? "ink" : "cream";
  const scrim = tone === "ink" ? "white@0.30" : "black@0.32";
  const color = tone === "ink" ? INK : CREAM;

  // ── timeline: text length as a step function of time ───────────────────────
  const times: number[] = [0];
  const lens: number[] = [0];
  let t = LEAD_SEC;
  for (let i = 1; i <= word.length; i++) {
    times.push(t); lens.push(i);
    t += (TYPE_MIN_MS + rand() * TYPE_JIT_MS) / 1000;
  }
  t += HOLD_FULL_SEC;
  for (let i = word.length - 1; i >= 1; i--) {
    times.push(t); lens.push(i);
    t += (ERASE_MIN_MS + rand() * ERASE_JIT_MS) / 1000;
  }
  const tLand = times[times.length - 1]; // erased down to "n"
  const capDur = tLand + LAND_BLINK_SEC + LAND_HOLD_SEC;

  const lenAt = (tt: number): number => {
    let len = 0;
    for (let i = 0; i < times.length; i++) { if (times[i] <= tt) len = lens[i]; else break; }
    return len;
  };
  // Free-running blink until landing; phase restarts ON at the landing so the
  // logo lands lit, blinks once, then holds solid.
  const blinkAt = (tt: number): boolean => {
    if (tt >= tLand + LAND_BLINK_SEC) return true;
    const base = tt >= tLand ? tt - tLand : tt;
    return (base % BLINK_PERIOD_SEC) < BLINK_PERIOD_SEC / 2;
  };

  // ── raster unique states as TRANSPARENT rgba, expand to frames ─────────────
  // Wipe stale frames from a previous take: the image2 demuxer reads EVERY
  // consecutive f%06d.png, so a shorter word would inherit an older tail.
  const framesDir = `${outDir}/endcap-frames`;
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });
  const frameCount = Math.ceil(capDur * fps);

  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.setContent(sceneHtml(word, width, height, color), { waitUntil: "load" });
    // Webfont is best-effort: on a cold/offline run the ui-monospace fallback
    // still ships a mono wordmark rather than failing the take.
    await page.evaluate(() => Promise.race([
      (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready,
      new Promise((r2) => setTimeout(r2, 3000)),
    ]));

    const cache = new Map<string, string>();
    for (let f = 0; f < frameCount; f++) {
      const tt = f / fps;
      const key = `${lenAt(tt)}_${blinkAt(tt) ? 1 : 0}`;
      let statePath = cache.get(key);
      if (!statePath) {
        statePath = `${framesDir}/state_${key}.png`;
        const [len, on] = key.split("_");
        await page.evaluate(
          ([l, o]) => (window as unknown as { __set: (l: number, o: boolean) => void }).__set(l as number, o as boolean),
          [Number(len), on === "1"] as const,
        );
        await page.screenshot({ path: statePath, omitBackground: true });
        cache.set(key, statePath);
      }
      await copyFile(statePath, `${framesDir}/f${String(f).padStart(6, "0")}.png`);
    }
    await ctx.close();
  } finally {
    await browser.close().catch(() => {});
  }

  // ── single-pass composite ──────────────────────────────────────────────────
  const ramp = Math.min(BLUR_RAMP_SEC, clipLen * 0.3);
  const offset = Math.max(0, clipLen - ramp);
  const total = clipLen + capDur;
  // settb=AVTB on every xfade/overlay input: the mp4 body (1/15360) and the
  // image loop (1/60) otherwise fail xfade's timebase match check (-22).
  const fc =
    `[0:v]fps=${fps},settb=AVTB[bd];` +
    `[1:v]drawbox=c=${scrim}:t=fill,setsar=1,fps=${fps},settb=AVTB[bg];` +
    `[bd][bg]xfade=transition=fade:duration=${ramp.toFixed(2)}:offset=${offset.toFixed(2)}[xf];` +
    `[2:v]format=rgba,settb=AVTB,setpts=PTS-STARTPTS+${clipLen.toFixed(2)}/TB[typ];` +
    `[xf][typ]overlay=0:0:enable='gte(t,${clipLen.toFixed(2)})',format=yuv420p[v]`;
  r = await run("ffmpeg", [
    "-y",
    "-i", bodyPath,
    "-loop", "1", "-framerate", String(fps), "-t", (ramp + capDur + 0.5).toFixed(2), "-i", blurPng,
    "-framerate", String(fps), "-i", `${framesDir}/f%06d.png`,
    "-filter_complex", fc,
    "-map", "[v]",
    "-t", total.toFixed(2),
    ...encodeArgs,
    "-movflags", "+faststart",
    outPath,
  ], { timeoutMs: 360_000 });
  if (r.code !== 0) throw new Error(`endcap composite failed: ${r.stderr.slice(-500)}`);
  return { durationSec: capDur, tone };
}
