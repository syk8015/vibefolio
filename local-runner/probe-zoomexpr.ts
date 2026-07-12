// Reproduce the take-1 postprocess failure in isolation: synthetic camera events
// → the exact baseChain postprocess builds (SS ×2 → pad → zoompan → downscale) →
// ffmpeg on a tiny generated clip. Bisects event count to find where the zoompan
// expression stops parsing. No recording, no Anthropic.
//
// Run: npx -y tsx local-runner/probe-zoomexpr.ts
import { buildZoomFilter, coalescePans, type CameraEvent } from "./camera";
import {
  FPS, PAD_FRAC, PAD_COLOR, CENTER_BIAS, CAMERA_MAX_EVENTS, CAMERA_VF_MAX_CHARS,
} from "./config";
import { run } from "./util";

const OUT = "/tmp/nf-runner";
const RAW = `${OUT}/probe-zoom-src.mp4`;
const rawW = 2560, rawH = 1440, logicalW = 1280, logicalH = 720;

// Mimic a real path-heavy take: alternating short pans at held zoom (what a
// stroke's per-segment cam.onApproach emits) after one push-in.
function synthEvents(n: number): CameraEvent[] {
  const ev: CameraEvent[] = [];
  let frame = 30;
  let x = 300, y = 300;
  ev.push({ startFrame: frame, durMs: 900, fromZoom: 1, toZoom: 1.41, fromFocalX: 640, fromFocalY: 360, toFocalX: x, toFocalY: y });
  frame += 30;
  for (let i = 1; i < n; i++) {
    const nx = 200 + ((i * 137) % 800);
    const ny = 200 + ((i * 89) % 400);
    ev.push({ startFrame: frame, durMs: 350, fromZoom: 1.41, toZoom: 1.41, fromFocalX: x, fromFocalY: y, toFocalX: nx, toFocalY: ny });
    x = nx; y = ny;
    frame += 12;
  }
  return ev;
}

function baseChain(events: CameraEvent[]): string {
  const SS = 2;
  const zw = rawW * SS, zh = rawH * SS;
  const sx = (rawW / logicalW) * SS, sy = (rawH / logicalH) * SS;
  const padX = Math.round(zw * PAD_FRAC), padY = Math.round(zh * PAD_FRAC);
  const pw = zw + 2 * padX, ph = zh + 2 * padY;
  const padScale = pw / zw;
  const scaled = events.map((e) => ({
    ...e,
    fromZoom: e.fromZoom * padScale, toZoom: e.toZoom * padScale,
    fromFocalX: e.fromFocalX * sx + padX, toFocalX: e.toFocalX * sx + padX,
    fromFocalY: e.fromFocalY * sy + padY, toFocalY: e.toFocalY * sy + padY,
  }));
  const zoom = buildZoomFilter(scaled, FPS, pw, ph, { centerBias: CENTER_BIAS, baseZoom: padScale });
  return `scale=${zw}:${zh}:flags=lanczos,pad=${pw}:${ph}:${padX}:${padY}:color=${PAD_COLOR},${zoom},scale=1280:720:flags=lanczos`;
}

// 2s grey source clip at capture size (tiny/cheap: crf 40, 10fps input is fine).
await run("ffmpeg", ["-y", "-f", "lavfi", "-i", `color=c=gray:s=${rawW}x${rawH}:r=${FPS}:d=2`, "-c:v", "libx264", "-preset", "ultrafast", "-crf", "40", RAW], { timeoutMs: 60_000 });

// Raw (unguarded) sweep documents where ffmpeg breaks; the guarded sweep applies
// postprocess's coalesce policy and must ALWAYS pass.
let failures = 0;
for (const guard of [false, true]) {
  for (const n of guard ? [58, 90, 150] : [12, 30, 58]) {
    let ev = synthEvents(n);
    if (guard && ev.length > CAMERA_MAX_EVENTS) ev = coalescePans(ev, CAMERA_MAX_EVENTS, FPS);
    let chain = baseChain(ev);
    while (guard && chain.length > CAMERA_VF_MAX_CHARS && ev.length > 12) {
      ev = coalescePans(ev, Math.max(12, Math.floor(ev.length / 2)), FPS);
      chain = baseChain(ev);
    }
    const { code, stderr } = await run(
      "ffmpeg",
      ["-y", "-i", RAW, "-vf", chain, "-t", "1", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "40", `${OUT}/probe-zoom-${n}.mp4`],
      { timeoutMs: 120_000 },
    );
    console.log(`${guard ? "GUARDED" : "raw    "} events=${n}→${ev.length}  vf-length=${chain.length}  exit=${code}`);
    if (guard && code !== 0) failures++;
    if (code !== 0) {
      const lines = stderr.split("\n").filter((l) => /error|Error|Invalid|failed|expr/i.test(l)).slice(0, 3);
      console.log("   " + lines.join("\n   "));
    }
  }
}
if (failures) throw new Error(`FAIL — ${failures} guarded run(s) still failed`);
console.log("\nPASS — guarded path always encodes");
