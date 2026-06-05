// Cinematic camera for the local real-time path.
//
// The zoom is applied in POST (ffmpeg zoompan on the flat capture), never in the
// DOM — so page layout (fixed/sticky headers, modals) is never distorted and
// clicks map 1:1. This module owns two things:
//   1. CameraEvent + buildZoomFilter  — COPIED verbatim from
//      src/trigger/build-and-record.ts:154-271 (trap E: importing it would drag
//      the whole e2b/trigger/RECORD_HELPER_SRC graph into this lightweight worker).
//      The filter is unchanged and already unit-tested (scripts/test-zoom-filter.mts);
//      only WHEN/HOW we emit events differs.
//   2. CameraTrack — the NEW "예고 → 결과" (preview → reveal) zoom spec the user
//      specified (2026-06-05), replacing the rejected v2 held-zoom/pan behaviour.
import { FPS } from "./config";

// ── CameraEvent + buildZoomFilter (copied; do not edit independently) ─────────

// One keyframe of the cinematic camera: starting at frame `startFrame`, over
// `durMs`, ease the zoom from `fromZoom`→`toZoom` AND the focal point from
// (fromFocalX,fromFocalY)→(toFocalX,toFocalY) (in capture-frame space). Constant
// zoom with a moving focal = a PAN; constant focal with changing zoom = a
// push-in/out. Expanded into an ffmpeg zoompan by buildZoomFilter.
export type CameraEvent = {
  startFrame: number;
  durMs: number;
  fromZoom: number;
  toZoom: number;
  fromFocalX: number;
  fromFocalY: number;
  toFocalX: number;
  toFocalY: number;
};

// Expand the camera keyframe events into an ffmpeg `zoompan` filter that applies
// an Apple-ad focal push-in to the FLAT capture. Source is `w`×`h` and is
// downscaled to 720 afterwards, which (with lanczos) hides most zoompan sub-pixel
// shimmer.
//
// Math: to keep the focal point (fx,fy) fixed on screen while zooming by z, the
// crop window (iw/z × ih/z) top-left must be x=fx·(1−1/z), y=fy·(1−1/z), clamped
// to the frame. zoompan exposes `zoom` and iw/ih in the x/y expressions, so x/y
// track z automatically and only the focal needs to be piecewise. Returns "" when
// there are no events.
export function buildZoomFilter(
  events: CameraEvent[],
  fps: number,
  w: number,
  h: number,
): string {
  if (!events.length) return "";

  // Non-overlapping segments tiling the timeline. Each segment eases zoom + focal
  // from a start state to an end state (a "hold" is start===end). zoom and both
  // focal axes are [from,to] pairs so a pan and a push-in use the same machinery.
  type Seg = {
    a: number;
    b: number;
    z: [number, number];
    fx: [number, number];
    fy: [number, number];
  };
  const segs: Seg[] = [];
  const cx = Math.round(w / 2);
  const cy = Math.round(h / 2);
  let prevEnd = 0;
  let pz = 1;
  let pfx = cx;
  let pfy = cy;
  const sorted = [...events].sort((p, q) => p.startFrame - q.startFrame);
  for (const e of sorted) {
    const a = Math.max(prevEnd, Math.round(e.startFrame));
    const d = Math.max(1, Math.round((e.durMs / 1000) * fps));
    const b = a + d;
    if (a > prevEnd) {
      segs.push({ a: prevEnd, b: a, z: [pz, pz], fx: [pfx, pfx], fy: [pfy, pfy] }); // hold
    }
    segs.push({
      a,
      b,
      z: [e.fromZoom, e.toZoom],
      fx: [e.fromFocalX, e.toFocalX],
      fy: [e.fromFocalY, e.toFocalY],
    });
    prevEnd = b;
    pz = e.toZoom;
    pfx = e.toFocalX;
    pfy = e.toFocalY;
  }

  // easeInOut cubic interpolation from `from`→`to` over [a, a+dur), as an ffmpeg
  // expression. Constant when from===to (cheap, exact).
  const easeSeg = (a: number, from: number, to: number, dur: number): string => {
    if (from === to) return `${from}`;
    const P = `((on-${a})/${dur})`;
    return `(${from}+(${to - from})*(if(lt(${P},0.5),4*pow(${P},3),1-pow(-2*${P}+2,3)/2)))`;
  };

  // Nested if() over segments, built end-first so the innermost else is the default
  // (z=1, focal=center → a whole-frame no-op crop).
  let zExpr = "1";
  let fxExpr = String(cx);
  let fyExpr = String(cy);
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    const dur = s.b - s.a;
    const cond = `between(on,${s.a},${s.b - 1})`;
    zExpr = `if(${cond},${easeSeg(s.a, s.z[0], s.z[1], dur)},${zExpr})`;
    fxExpr = `if(${cond},${easeSeg(s.a, s.fx[0], s.fx[1], dur)},${fxExpr})`;
    fyExpr = `if(${cond},${easeSeg(s.a, s.fy[0], s.fy[1], dur)},${fyExpr})`;
  }

  // Clamp x/y so the zoom window can never reference pixels outside the frame.
  const xExpr = `max(0,min(iw-iw/zoom,(${fxExpr})*(1-1/zoom)))`;
  const yExpr = `max(0,min(ih-ih/zoom,(${fyExpr})*(1-1/zoom)))`;

  return `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=1:s=${w}x${h}:fps=${fps}`;
}

// ── New "예고 → 결과" zoom spec (CameraTrack) ─────────────────────────────────

// Zoom magnitude. 2.0 on a native-2× capture (2560×1440) means the push-in crops
// to exactly 1280×720 → 720p output 1:1, i.e. NO upscaling at peak zoom (crisper
// than 1.32 ever was). User 2026-06-06: bump to 2×.
export const ZOOM_LEVEL = 2.0;
// Push-in BEGINS once the cursor is ~1/5 into its glide (user 2026-06-06: the old
// fixed-600ms-before-arrival started the zoom too late — it only kicked in near
// the destination). It still COMPLETES exactly on arrival, so its duration scales
// with the glide (= 80% of it).
export const ZOOM_IN_START_FRAC = 0.2;
// Pull-out lasts this long and COMPLETES exactly as the click lands (→ 1x reveal).
export const ZOOM_OUT_MS = 460;

// Cursor glide is slowed to ~60% speed (user spec 2026-06-05): a longer, calmer
// approach. The push-in begins partway into the glide (ZOOM_IN_START_FRAC) and
// finishes on arrival, so a slower glide naturally lengthens the zoom too.
export const CURSOR_SLOWDOWN = 1.67; // 1 / 0.6

// Glide duration as a function of straight-line travel distance (logical px),
// with the 60% slowdown baked in. Far moves land ~1.0–1.5s (room for the 600ms
// push-in + a "short wait"); tiny moves still take ~0.6s so motion reads.
export function glideMsFor(dist: number): number {
  const base = 320 + dist * 0.9; // px → ms, pre-slowdown
  return Math.round(Math.min(900, Math.max(260, base)) * CURSOR_SLOWDOWN);
}

type Pt = { x: number; y: number };

// Builds the CameraEvent track during a one-take replay. State machine: at 1x we
// may push IN toward a far static target (preview), then pull OUT to land the
// click at 1x (reveal). Frame indices are wall-clock relative to the recording's
// frame-0 (trap C).
export class CameraTrack {
  readonly events: CameraEvent[] = [];
  private z = 1;
  private cursor: Pt;
  private focal: Pt;
  private readonly distThreshold: number;

  constructor(
    private readonly recStartTime: number, // wall-clock (ms) of raw frame 0
    viewW: number,
    viewH: number,
  ) {
    this.cursor = { x: viewW / 2, y: viewH / 2 };
    this.focal = { x: viewW / 2, y: viewH / 2 };
    // "직선 이동거리 ≥ 뷰포트 세로의 절반" → push-in only on long jumps.
    this.distThreshold = viewH * 0.5;
  }

  private frameOf(wallMs: number): number {
    return Math.max(0, Math.round(((wallMs - this.recStartTime) / 1000) * FPS));
  }

  // Call the instant the cursor starts gliding toward `target` (logical px).
  // Schedules a push-in (focal = target) that COMPLETES at arrival, iff the
  // target is static and the jump is long. Returns whether a zoom-in was emitted.
  onMoveStart(target: Pt, glideMs: number, moving: boolean): boolean {
    const dist = Math.hypot(target.x - this.cursor.x, target.y - this.cursor.y);
    this.cursor = { ...target }; // the glide ends here
    if (moving) return false; // moving target → no zoom (§4.2; M0 has none)
    if (this.z !== 1) return false; // already zoomed (shouldn't happen in-sequence)
    if (dist < this.distThreshold) return false; // small move → stay at 1x

    const startOffset = ZOOM_IN_START_FRAC * glideMs; // begin ~1/5 into the travel
    this.events.push({
      startFrame: this.frameOf(Date.now() + startOffset),
      durMs: glideMs - startOffset, // …and finish exactly ON arrival
      fromZoom: 1,
      toZoom: ZOOM_LEVEL,
      fromFocalX: target.x,
      fromFocalY: target.y,
      toFocalX: target.x,
      toFocalY: target.y,
    });
    this.z = ZOOM_LEVEL;
    this.focal = { ...target };
    return true;
  }

  // Call right before the click is dispatched. If currently zoomed, emits a
  // pull-out that STARTS now and completes in ZOOM_OUT_MS — the caller then waits
  // that long and clicks, so the click lands exactly at 1x (result revealed).
  // Returns the ms to wait before clicking (0 when already at 1x).
  onBeforeClick(): number {
    if (this.z === 1) return 0;
    this.events.push({
      startFrame: this.frameOf(Date.now()),
      durMs: ZOOM_OUT_MS,
      fromZoom: this.z,
      toZoom: 1,
      fromFocalX: this.focal.x,
      fromFocalY: this.focal.y,
      toFocalX: this.focal.x,
      toFocalY: this.focal.y,
    });
    this.z = 1;
    return ZOOM_OUT_MS;
  }
}
