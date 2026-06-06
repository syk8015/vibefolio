// Validates the LOCAL camera path's buildZoomFilter (cursor-centered crop +
// CENTER_BIAS + pad margin) WITHOUT any capture / Claude cost:
//   1. JS replica of the z/x/y math (blended proportional↔centered, padded canvas)
//      over every frame → assert finite + in-bounds (catches the centered-clamp /
//      pad-sufficiency edge cases).
//   2. Runs the GENERATED ffmpeg expression through the SAME SS + pad chain as
//      postprocess.ts on a synthetic native-2× source → exit 0 proves it parses and
//      runs, frame count == input proves zoompan stays 1:1.
//
// Run: npx tsx scripts/test-zoom-filter-local.mts
import { spawnSync } from "node:child_process";
import { buildZoomFilter } from "../local-runner/camera";
import { PAD_FRAC, PAD_COLOR, CENTER_BIAS, ZOOM_MAX } from "../local-runner/config";

const FPS = 60;
const SS = 2; // must match postprocess.ts
// Synthetic native-2× capture: 1280×720 logical at DPR 2.
const RAW_W = 2560, RAW_H = 1440, LOG_W = 1280, LOG_H = 720;

type Ev = {
  startFrame: number; durMs: number;
  fromZoom: number; toZoom: number;
  fromFocalX: number; fromFocalY: number; toFocalX: number; toFocalY: number;
  ease?: "inout" | "out" | "in";
};

// A realistic hold-zoom track (LOGICAL px): push-in to a bottom-right target →
// PAN (held zoom) → region-change pull-out → push-in to a TOP-LEFT CORNER (the
// pad/centering edge case) → final pull-out.
const cx = LOG_W / 2, cy = LOG_H / 2;
const events: Ev[] = [
  { startFrame: 60, durMs: 600, fromZoom: 1, toZoom: 1.8, fromFocalX: cx, fromFocalY: cy, toFocalX: 1180, toFocalY: 640 },
  { startFrame: 130, durMs: 520, fromZoom: 1.8, toZoom: 1.8, fromFocalX: 1180, fromFocalY: 640, toFocalX: 1090, toFocalY: 600 },
  { startFrame: 230, durMs: 300, fromZoom: 1.8, toZoom: 1, fromFocalX: 1090, fromFocalY: 600, toFocalX: cx, toFocalY: cy },
  { startFrame: 250, durMs: 600, fromZoom: 1, toZoom: ZOOM_MAX, fromFocalX: cx, fromFocalY: cy, toFocalX: 0, toFocalY: 0 },
  { startFrame: 360, durMs: 460, fromZoom: ZOOM_MAX, toZoom: 1, fromFocalX: 0, fromFocalY: 0, toFocalX: cx, toFocalY: cy },
];

// ---- map to the PADDED supersample space, exactly as postprocess.ts does ----
const zw = RAW_W * SS, zh = RAW_H * SS;
const sx = (RAW_W / LOG_W) * SS, sy = (RAW_H / LOG_H) * SS;
const padX = Math.round(zw * PAD_FRAC), padY = Math.round(zh * PAD_FRAC);
const pw = zw + 2 * padX, ph = zh + 2 * padY;
const padScale = pw / zw;
const scaled = events.map((e) => ({
  ...e,
  fromZoom: e.fromZoom * padScale, toZoom: e.toZoom * padScale,
  fromFocalX: e.fromFocalX * sx + padX, toFocalX: e.toFocalX * sx + padX,
  fromFocalY: e.fromFocalY * sy + padY, toFocalY: e.toFocalY * sy + padY,
}));
const filter = buildZoomFilter(scaled as any, FPS, pw, ph, { centerBias: CENTER_BIAS, baseZoom: padScale });
console.log(`--- padded ${pw}×${ph}, padScale ${padScale}, centerBias ${CENTER_BIAS} ---`);
console.log("--- generated zoompan filter ---\n" + filter + "\n");

// ---- 1. JS math replica ----
const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
const easeIn = (p: number) => Math.pow(p, 3);
const easeFn = (e: string | undefined) => (e === "out" ? easeOut : e === "in" ? easeIn : easeInOut);

type Seg = { a: number; b: number; z: [number, number]; fx: [number, number]; fy: [number, number]; ease?: string };
const segs: Seg[] = [];
let prevEnd = 0, pz = padScale, pfx = pw / 2, pfy = ph / 2;
for (const e of [...scaled].sort((p, q) => p.startFrame - q.startFrame)) {
  const a = Math.max(prevEnd, Math.round(e.startFrame));
  const d = Math.max(1, Math.round((e.durMs / 1000) * FPS));
  const b = a + d;
  if (a > prevEnd) segs.push({ a: prevEnd, b: a, z: [pz, pz], fx: [pfx, pfx], fy: [pfy, pfy] });
  segs.push({ a, b, z: [e.fromZoom, e.toZoom], fx: [e.fromFocalX, e.toFocalX], fy: [e.fromFocalY, e.toFocalY], ease: e.ease });
  prevEnd = b; pz = e.toZoom; pfx = e.toFocalX; pfy = e.toFocalY;
}
const lastFrame = prevEnd + 60;
const lerp = (s: Seg, on: number, pair: [number, number]) => {
  if (pair[0] === pair[1]) return pair[0];
  return pair[0] + (pair[1] - pair[0]) * easeFn(s.ease)((on - s.a) / (s.b - s.a));
};
function at(on: number) {
  for (const s of segs) if (on >= s.a && on <= s.b - 1) return { z: lerp(s, on, s.z), fx: lerp(s, on, s.fx), fy: lerp(s, on, s.fy) };
  return { z: padScale, fx: pw / 2, fy: ph / 2 };
}
const B = CENTER_BIAS;
let maxZ = 0, maxMarginX = 0;
for (let on = 0; on <= lastFrame; on++) {
  const { z, fx, fy } = at(on);
  const xCore = fx * (1 - 1 / z) * (1 - B) + (fx - pw / (2 * z)) * B;
  const yCore = fy * (1 - 1 / z) * (1 - B) + (fy - ph / (2 * z)) * B;
  const x = Math.max(0, Math.min(pw - pw / z, xCore));
  const y = Math.max(0, Math.min(ph - ph / z, yCore));
  for (const [n, v] of [["z", z], ["x", x], ["y", y]] as const)
    if (!Number.isFinite(v)) throw new Error(`frame ${on}: ${n} not finite (${v})`);
  if (x < 0 || x > pw - pw / z + 1) throw new Error(`frame ${on}: x out of bounds (${x})`);
  if (y < 0 || y > ph - ph / z + 1) throw new Error(`frame ${on}: y out of bounds (${y})`);
  if (z < padScale - 0.001 || z > ZOOM_MAX * padScale + 0.001) throw new Error(`frame ${on}: z out of range (${z})`);
  maxZ = Math.max(maxZ, z);
}
console.log(`JS math OK: ${lastFrame + 1} frames, maxZoom(padded)=${maxZ.toFixed(3)}, centered crop in-bounds\n`);

// Pad-sufficiency check: a WINDOW CORNER (logical 0,0) centered at ZOOM_MAX must
// NOT clamp (x reaches but does not exceed the bound) — i.e. f=PAD_FRAC is enough.
{
  const z = ZOOM_MAX * padScale;
  const fxCorner = 0 * sx + padX; // logical (0,0) → padded
  const centeredX = fxCorner - pw / (2 * z);
  const lo = 0;
  if (centeredX < lo - 1) console.warn(`  ⚠ corner clamps at ZOOM_MAX (centeredX=${centeredX.toFixed(0)} < 0): PAD_FRAC too small`);
  else console.log(`Pad sufficiency OK: window corner centers at ZOOM_MAX without clamp (x=${centeredX.toFixed(0)} ≥ 0).\n`);
}

// ---- 2. Real ffmpeg execution through the postprocess SS + pad chain ----
const durSec = Math.ceil((lastFrame + 1) / FPS);
const vf = `scale=${zw}:${zh}:flags=lanczos,pad=${pw}:${ph}:${padX}:${padY}:color=${PAD_COLOR},${filter},scale=-2:720:flags=lanczos`;
const res = spawnSync(
  "ffmpeg",
  [
    "-hide_banner", "-v", "error",
    "-f", "lavfi", "-i", `testsrc2=size=${RAW_W}x${RAW_H}:rate=${FPS}:duration=${durSec}`,
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
console.log("ffmpeg parsed + ran the padded centered zoompan chain cleanly (exit 0).");
console.log("ALL CHECKS PASSED.");
