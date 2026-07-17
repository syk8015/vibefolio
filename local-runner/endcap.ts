// Render the typing endcap scene as a short mp4.
//
// Brand scene (logo B v2, 2026-07-18): on an ink-dark frame, the mono wordmark
// types out `nookframe.com/@handle`, holds, then erases — and the deletion STOPS
// at "n", landing on the "n + block cursor" logo (the block must never appear
// without a letter). One blink cycle, then the logo holds solid to the end.
//
// ffmpeg on this machine is built WITHOUT libfreetype (no `drawtext` filter), so
// frames are rasterized in a headless system Chrome (already a dependency for
// recording): the piecewise-static states (text length × cursor phase) are
// screenshotted once each, expanded to a numbered frame sequence, and encoded
// with the same args as the body so the concat can stream-copy.
import { copyFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { run } from "./util";

// Paper & Ink (dark) — mirrors app/globals.css [data-theme="dark"].
const INK_BG = "#1a1612";
const CREAM = "#f4ede0";

// ── Scene timing (film-paced: tighter than the site's TypingTagline) ──────────
const LEAD_SEC = 0.35; // dark + blinking cursor beat before typing starts
const FADE_IN_SEC = 0.25; // from black, covers the body→endcap cut
const TYPE_MIN_MS = 60, TYPE_JIT_MS = 40; // per keystroke
const HOLD_FULL_SEC = 0.8; // full URL on screen
const ERASE_MIN_MS = 35, ERASE_JIT_MS = 20; // per deleted char
const LAND_BLINK_SEC = 0.95; // one full blink cycle after landing on "n"
const LAND_HOLD_SEC = 1.0; // then solid n+block to the end
const BLINK_PERIOD_SEC = 0.95; // .vf-cursor: 0.95s steps(1) — first half ON

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

function sceneHtml(word: string, w: number, h: number): string {
  const esc = word.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // Fit: mono glyph ≈ 0.6em wide; keep the full URL inside ~86% of the frame.
  const fontPx = Math.min(Math.floor(h * 0.09), Math.floor((w * 0.86) / (word.length * 0.6)));
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
  html,body{margin:0}
  #frame{width:${w}px;height:${h}px;background:${INK_BG};position:relative;
    display:flex;align-items:center;justify-content:center;overflow:hidden}
  #row{display:inline-flex;align-items:center;min-height:1.3em;
    font-family:'JetBrains Mono',ui-monospace,'SF Mono',Menlo,monospace;
    font-weight:500;font-size:${fontPx}px;letter-spacing:-0.02em;color:${CREAM}}
  #txt{white-space:pre}
  #blk{display:inline-block;flex-shrink:0;width:.55em;height:1.02em;
    border-radius:.05em;background:currentColor;margin-left:.08em}
  #grain{position:absolute;inset:0;pointer-events:none;opacity:.08;mix-blend-mode:overlay;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")}
</style></head><body>
<div id="frame"><div id="grain"></div>
  <div id="row"><span id="txt"></span><span id="blk"></span></div>
</div>
<script>
  const WORD = ${JSON.stringify(esc)};
  window.__set = (len, on) => {
    document.getElementById("txt").textContent = WORD.slice(0, len);
    document.getElementById("blk").style.opacity = on ? "1" : "0";
  };
</script></body></html>`;
}

// Renders endcap.mp4 (w×h, `fps`) into outDir and returns its path + duration.
// handle is "@username". Throws on failure — the caller treats the endcap as
// best-effort and ships the plain film if this fails.
export async function renderEndcapVideo(opts: {
  handle: string;
  width: number;
  height: number;
  fps: number;
  outDir: string;
  encodeArgs: string[]; // must match the body encode so concat can stream-copy
}): Promise<{ endcapPath: string; durationSec: number }> {
  const { handle, width, height, fps, outDir, encodeArgs } = opts;
  const word = `nookframe.com/${handle}`;
  let seed = 0;
  for (const c of word) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const rand = mulberry32(seed || 1);

  // ── timeline: text length as a step function of time ────────────────────────
  // events[i] = time at which length becomes lens[i]
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
  const durationSec = tLand + LAND_BLINK_SEC + LAND_HOLD_SEC;

  const lenAt = (tt: number): number => {
    let len = 0;
    for (let i = 0; i < times.length; i++) { if (times[i] <= tt) len = lens[i]; else break; }
    return len;
  };
  // Cursor: free-running blink until landing; the blink phase restarts ON at the
  // landing so the logo lands lit, blinks once, then holds solid (cycleBCap).
  const blinkAt = (tt: number): boolean => {
    if (tt >= tLand + LAND_BLINK_SEC) return true;
    const base = tt >= tLand ? tt - tLand : tt;
    return (base % BLINK_PERIOD_SEC) < BLINK_PERIOD_SEC / 2;
  };

  // ── raster unique states, expand to the frame sequence ──────────────────────
  const framesDir = `${outDir}/endcap-frames`;
  await mkdir(framesDir, { recursive: true });
  const frameCount = Math.ceil(durationSec * fps);

  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.setContent(sceneHtml(word, width, height), { waitUntil: "load" });
    // Webfont is best-effort: on a cold/offline run the ui-monospace fallback
    // still ships a mono wordmark rather than failing the take.
    await page.evaluate(() => Promise.race([
      (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready,
      new Promise((r) => setTimeout(r, 3000)),
    ]));

    const cache = new Map<string, string>(); // state key → cached PNG path
    for (let f = 0; f < frameCount; f++) {
      const tt = f / fps;
      const len = lenAt(tt);
      const on = blinkAt(tt);
      const key = `${len}_${on ? 1 : 0}`;
      let statePath = cache.get(key);
      if (!statePath) {
        statePath = `${framesDir}/state_${key}.png`;
        await page.evaluate(
          ([l, o]) => (window as unknown as { __set: (l: number, o: boolean) => void }).__set(l as number, o as boolean),
          [len, on] as const,
        );
        await page.screenshot({ path: statePath });
        cache.set(key, statePath);
      }
      await copyFile(statePath, `${framesDir}/f${String(f).padStart(6, "0")}.png`);
    }
    await ctx.close();
  } finally {
    await browser.close().catch(() => {});
  }

  // ── encode ──────────────────────────────────────────────────────────────────
  const endcapPath = `${outDir}/endcap.mp4`;
  const { code, stderr } = await run(
    "ffmpeg",
    [
      "-y",
      "-framerate", String(fps),
      "-i", `${framesDir}/f%06d.png`,
      "-vf", `fade=t=in:st=0:d=${FADE_IN_SEC},format=yuv420p`,
      ...encodeArgs,
      "-movflags", "+faststart",
      endcapPath,
    ],
    { timeoutMs: 120_000 },
  );
  if (code !== 0) throw new Error(`ffmpeg endcap failed (exit ${code}): ${stderr.slice(-500)}`);
  return { endcapPath, durationSec };
}
