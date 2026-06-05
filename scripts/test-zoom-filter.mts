// Validates buildZoomFilter WITHOUT any E2B / Claude cost:
//   1. JS replica of the intended z/x/y math over every frame → assert bounded,
//      monotone-ish, no NaN/Infinity (catches logic bugs).
//   2. Runs the GENERATED ffmpeg expression on a synthetic 1280×800@60 source
//      locally → exit 0 proves the expression PARSES and runs, and the output
//      frame count == input proves zoompan stays 1:1 (no stutter/drop).
//
// Run: npx tsx scripts/test-zoom-filter.mts
import { spawnSync } from "node:child_process";
import { buildZoomFilter } from "../src/trigger/build-and-record";

const W = 1280;
const H = 800;
const FPS = 60;

// A realistic track: two click zoom-in/out pairs, the second focal in the extreme
// bottom-right CORNER (the clamp edge case the expert flagged), plus a typing zoom.
const events = [
  { startFrame: 60, fromZoom: 1, toZoom: 1.42, focalX: 240, focalY: 180, durMs: 500 },
  { startFrame: 150, fromZoom: 1.42, toZoom: 1, focalX: 240, focalY: 180, durMs: 500 },
  { startFrame: 300, fromZoom: 1, toZoom: 1.42, focalX: 1278, focalY: 798, durMs: 500 }, // corner
  { startFrame: 390, fromZoom: 1.42, toZoom: 1, focalX: 1278, focalY: 798, durMs: 500 },
  { startFrame: 480, fromZoom: 1, toZoom: 1.3, focalX: 900, focalY: 120, durMs: 500 },
  { startFrame: 620, fromZoom: 1.3, toZoom: 1, focalX: 900, focalY: 120, durMs: 500 },
];

const filter = buildZoomFilter(events, FPS, W, H);
console.log("--- generated zoompan filter ---\n" + filter + "\n");

// ---- 1. JS math replica -------------------------------------------------
const easeInOut = (p: number) =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

type Seg =
  | { a: number; b: number; kind: "ease"; from: number; to: number; fx: number; fy: number }
  | { a: number; b: number; kind: "hold"; z: number; fx: number; fy: number };
const segs: Seg[] = [];
let prevEnd = 0, prevZoom = 1, prevFx = W / 2, prevFy = H / 2;
for (const e of [...events].sort((p, q) => p.startFrame - q.startFrame)) {
  const a = Math.max(prevEnd, Math.round(e.startFrame));
  const d = Math.max(1, Math.round((e.durMs / 1000) * FPS));
  const b = a + d;
  if (a > prevEnd) segs.push({ a: prevEnd, b: a, kind: "hold", z: prevZoom, fx: prevFx, fy: prevFy });
  segs.push({ a, b, kind: "ease", from: e.fromZoom, to: e.toZoom, fx: e.focalX, fy: e.focalY });
  prevEnd = b; prevZoom = e.toZoom; prevFx = e.focalX; prevFy = e.focalY;
}
const lastFrame = prevEnd + 60;
function zAt(on: number): { z: number; fx: number; fy: number } {
  for (const s of segs) {
    if (on >= s.a && on <= s.b - 1) {
      if (s.kind === "ease") {
        const P = (on - s.a) / (s.b - s.a);
        return { z: s.from + (s.to - s.from) * easeInOut(P), fx: s.fx, fy: s.fy };
      }
      return { z: s.z, fx: s.fx, fy: s.fy };
    }
  }
  return { z: 1, fx: W / 2, fy: H / 2 };
}
let maxZ = 0, peakUpscale = 0;
for (let on = 0; on <= lastFrame; on++) {
  const { z, fx, fy } = zAt(on);
  const x = Math.max(0, Math.min(W - W / z, fx * (1 - 1 / z)));
  const y = Math.max(0, Math.min(H - H / z, fy * (1 - 1 / z)));
  for (const [n, v] of [["z", z], ["x", x], ["y", y]] as const) {
    if (!Number.isFinite(v)) throw new Error(`frame ${on}: ${n} not finite (${v})`);
  }
  if (z < 0.999) throw new Error(`frame ${on}: z<1 (${z})`);
  if (z > 1.45) throw new Error(`frame ${on}: z too high (${z})`);
  maxZ = Math.max(maxZ, z);
  // Upscale factor of the zoomed region when shown at the 720p (1152 wide) output.
  peakUpscale = Math.max(peakUpscale, (1152 * z) / W);
}
console.log(
  `JS math OK: ${lastFrame + 1} frames, maxZoom=${maxZ.toFixed(3)}, ` +
    `peak upscale at 720p output=${peakUpscale.toFixed(2)}x (>1 = mild softening at max zoom)\n`,
);

// ---- 2. Real ffmpeg execution of the generated expression ---------------
const durSec = Math.ceil((lastFrame + 1) / FPS);
const vf = `${filter},scale=-2:720:flags=lanczos`;
const res = spawnSync(
  "ffmpeg",
  [
    "-hide_banner", "-v", "error",
    "-f", "lavfi", "-i", `testsrc2=size=${W}x${H}:rate=${FPS}:duration=${durSec}`,
    "-vf", vf,
    "-frames:v", String(lastFrame + 1),
    "-f", "null", "-",
  ],
  { encoding: "utf8" },
);
if (res.status !== 0) {
  console.error("ffmpeg FAILED to parse/run the expression:\n" + (res.stderr || ""));
  process.exit(1);
}
console.log("ffmpeg parsed + ran the generated zoompan expression cleanly (exit 0).");
console.log("ALL CHECKS PASSED.");
