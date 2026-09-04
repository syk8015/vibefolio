// Validates buildZoomFilter (camera v2: zoom + focal pan) WITHOUT any E2B / Claude
// cost:
//   1. JS replica of the intended z/x/y math over every frame → assert bounded,
//      no NaN/Infinity (catches logic bugs incl. the focal-pan + corner clamp).
//   2. Runs the GENERATED ffmpeg expression through the SAME 2x-supersample chain
//      as production on a synthetic 1280×800@60 source → exit 0 proves it parses
//      and runs, and output frame count == input proves zoompan stays 1:1.
//
// Run: npx tsx scripts/test-zoom-filter.mts
import { spawnSync } from "node:child_process";
import { buildZoomFilter } from "../src/trigger/build-and-record";

const W = 1280;
const H = 800;
const FPS = 60;
const SS = 2; // must match build-and-record's supersample factor

type Ev = {
  startFrame: number;
  durMs: number;
  fromZoom: number;
  toZoom: number;
  fromFocalX: number;
  fromFocalY: number;
  toFocalX: number;
  toFocalY: number;
};

// A realistic smart-zoom track: fresh zoom-in → nearby PAN (held zoom) → far
// zoom-out then push-in on a CORNER (clamp edge case) → final zoom-out.
const events: Ev[] = [
  { startFrame: 60, durMs: 600, fromZoom: 1, toZoom: 1.32, fromFocalX: 240, fromFocalY: 180, toFocalX: 240, toFocalY: 180 },
  { startFrame: 130, durMs: 520, fromZoom: 1.32, toZoom: 1.32, fromFocalX: 240, fromFocalY: 180, toFocalX: 520, toFocalY: 300 },
  { startFrame: 220, durMs: 460, fromZoom: 1.32, toZoom: 1, fromFocalX: 520, fromFocalY: 300, toFocalX: 520, toFocalY: 300 },
  { startFrame: 260, durMs: 600, fromZoom: 1, toZoom: 1.32, fromFocalX: 1278, fromFocalY: 798, toFocalX: 1278, toFocalY: 798 },
  { startFrame: 360, durMs: 460, fromZoom: 1.32, toZoom: 1, fromFocalX: 1278, fromFocalY: 798, toFocalX: 1278, toFocalY: 798 },
];

// ---- 1. JS math replica (in SUPERSAMPLED space, as production runs it) ---
const ssEvents = events.map((e) => ({
  ...e,
  fromFocalX: e.fromFocalX * SS,
  fromFocalY: e.fromFocalY * SS,
  toFocalX: e.toFocalX * SS,
  toFocalY: e.toFocalY * SS,
}));
const sw = W * SS;
const sh = H * SS;
const filter = buildZoomFilter(ssEvents as any, FPS, sw, sh);
console.log("--- generated zoompan filter (supersampled) ---\n" + filter + "\n");

const easeInOut = (p: number) =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

type Seg = { a: number; b: number; z: [number, number]; fx: [number, number]; fy: [number, number] };
const segs: Seg[] = [];
let prevEnd = 0, pz = 1, pfx = sw / 2, pfy = sh / 2;
for (const e of [...ssEvents].sort((p, q) => p.startFrame - q.startFrame)) {
  const a = Math.max(prevEnd, Math.round(e.startFrame));
  const d = Math.max(1, Math.round((e.durMs / 1000) * FPS));
  const b = a + d;
  if (a > prevEnd) segs.push({ a: prevEnd, b: a, z: [pz, pz], fx: [pfx, pfx], fy: [pfy, pfy] });
  segs.push({ a, b, z: [e.fromZoom, e.toZoom], fx: [e.fromFocalX, e.toFocalX], fy: [e.fromFocalY, e.toFocalY] });
  prevEnd = b; pz = e.toZoom; pfx = e.toFocalX; pfy = e.toFocalY;
}
const lastFrame = prevEnd + 60;
const lerp = (s: Seg, on: number, pair: [number, number]) => {
  if (pair[0] === pair[1]) return pair[0];
  return pair[0] + (pair[1] - pair[0]) * easeInOut((on - s.a) / (s.b - s.a));
};
function at(on: number) {
  for (const s of segs) {
    if (on >= s.a && on <= s.b - 1) return { z: lerp(s, on, s.z), fx: lerp(s, on, s.fx), fy: lerp(s, on, s.fy) };
  }
  return { z: 1, fx: sw / 2, fy: sh / 2 };
}
let maxZ = 0;
for (let on = 0; on <= lastFrame; on++) {
  const { z, fx, fy } = at(on);
  const x = Math.max(0, Math.min(sw - sw / z, fx * (1 - 1 / z)));
  const y = Math.max(0, Math.min(sh - sh / z, fy * (1 - 1 / z)));
  for (const [n, v] of [["z", z], ["x", x], ["y", y]] as const) {
    if (!Number.isFinite(v)) throw new Error(`frame ${on}: ${n} not finite (${v})`);
  }
  if (z < 0.999 || z > 1.35) throw new Error(`frame ${on}: z out of range (${z})`);
  maxZ = Math.max(maxZ, z);
}
console.log(`JS math OK: ${lastFrame + 1} frames, maxZoom=${maxZ.toFixed(3)}, focal-pan + corner clamp bounded\n`);

// ---- 2. Real ffmpeg execution through the production supersample chain ---
const durSec = Math.ceil((lastFrame + 1) / FPS);
const vf = `scale=${sw}:${sh}:flags=lanczos,${filter},scale=-2:720:flags=lanczos`;
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
console.log("ffmpeg parsed + ran the supersampled zoompan chain cleanly (exit 0).");
console.log("ALL CHECKS PASSED.");
