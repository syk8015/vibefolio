// Cinematic camera for the local real-time path.
//
// The zoom is applied in POST (ffmpeg zoompan on the flat capture), never in the
// DOM — so page layout (fixed/sticky headers, modals) is never distorted and
// clicks map 1:1. This module owns two things:
//   1. CameraEvent + buildZoomFilter  — the zoompan expression builder. Forked
//      from src/trigger/build-and-record.ts (trap E: importing it would drag the
//      whole e2b/trigger graph into this lightweight worker). DIVERGED from the
//      E2B copy: the x/y framing now supports CENTER_BIAS (cursor-centered crop +
//      pad margin), so do NOT re-sync it verbatim.
//   2. CameraTrack — the "cursor-centered hold-zoom" policy (user 2026-06-07):
//      push in once on region ENTRY, then hold the zoom and pan the focal so the
//      cursor stays screen-centered, pulling out only on a far jump or the end.
import { FPS } from "./config";
import {
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_ENTER_DIST,
  ZOOM_FAR_DIST,
  ZOOM_REGION_PX,
  ZOOM_OUT_MS,
  EDGE_SAFE_PX,
  EDGE_MIN_FACTOR,
  ZOOM_FLOOR,
} from "./config";

// ── CameraEvent + buildZoomFilter ─────────────────────────────────────────────

// One keyframe of the cinematic camera: starting at frame `startFrame`, over
// `durMs`, ease the zoom from `fromZoom`→`toZoom` AND the focal point from
// (fromFocalX,fromFocalY)→(toFocalX,toFocalY) (in capture-frame space). Constant
// zoom with a moving focal = a PAN; constant focal with changing zoom = a
// push-in/out. Expanded into an ffmpeg zoompan by buildZoomFilter.
// Easing for a segment's interpolation. "inout" = cubic ease-in-out (default,
// and what the synthetic cursor uses — so a focal PAN tracks the cursor exactly).
// "out"/"in" remain available for hand-tuned moves.
export type Ease = "inout" | "out" | "in";

export type CameraEvent = {
  startFrame: number;
  durMs: number;
  fromZoom: number;
  toZoom: number;
  fromFocalX: number;
  fromFocalY: number;
  toFocalX: number;
  toFocalY: number;
  ease?: Ease;
};

// Expand the camera keyframe events into an ffmpeg `zoompan` filter that applies
// an Apple-ad focal push-in to the FLAT capture. Source is `w`×`h` and is
// downscaled to 720 afterwards, which (with lanczos) hides most zoompan sub-pixel
// shimmer.
//
// Framing math (two modes, blended by `centerBias` ∈ [0,1]):
//   proportional (bias 0): the focal keeps its RELATIVE position in the frame as
//     it zooms — top-left x = fx·(1−1/z). No out-of-bounds risk; corners cramp.
//   centered (bias 1): the focal is pinned to the screen CENTER — top-left x =
//     fx − (iw/z)/2. Needs head-room (a padded canvas) or it clamps at edges.
// The crop window is iw/z × ih/z; x/y are clamped to the frame so zoompan never
// references pixels outside it. Returns "" when there are no events.
export function buildZoomFilter(
  events: CameraEvent[],
  fps: number,
  w: number,
  h: number,
  opts: { centerBias?: number; baseZoom?: number } = {},
): string {
  if (!events.length) return "";
  // Round before building: focal to 0.1px, zoom to 4dp. Raw replay values are
  // full-precision doubles (~18 chars each) and the x/y expressions embed the
  // whole focal chain TWICE — unrounded, a path-heavy take's filter arg crosses
  // ffmpeg's expression limit and zoompan fails to configure (-22, found
  // 2026-07-12: 58 real events ≈ >48k chars → exit 234; rounded ≈ 1/3 the size).
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const r4 = (v: number) => Math.round(v * 10000) / 10000;
  events = events.map((e) => ({
    ...e,
    fromZoom: r4(e.fromZoom),
    toZoom: r4(e.toZoom),
    fromFocalX: r1(e.fromFocalX),
    toFocalX: r1(e.toFocalX),
    fromFocalY: r1(e.fromFocalY),
    toFocalY: r1(e.toFocalY),
  }));
  const B = opts.centerBias ?? 0;
  // The state for un-keyframed frames (the intro hold, gaps, and the tail). With a
  // pad margin this is NOT 1 (= whole padded canvas incl. all margin) but padScale
  // (= the window region fills the frame). focal defaults to center either way.
  const baseZoom = r4(opts.baseZoom ?? 1);

  // Non-overlapping segments tiling the timeline. Each segment eases zoom + focal
  // from a start state to an end state (a "hold" is start===end). zoom and both
  // focal axes are [from,to] pairs so a pan and a push-in use the same machinery.
  type Seg = {
    a: number;
    b: number;
    z: [number, number];
    fx: [number, number];
    fy: [number, number];
    ease: Ease;
  };
  const segs: Seg[] = [];
  const cx = Math.round(w / 2);
  const cy = Math.round(h / 2);
  let prevEnd = 0;
  let pz = baseZoom;
  let pfx = cx;
  let pfy = cy;
  const sorted = [...events].sort((p, q) => p.startFrame - q.startFrame);
  for (const e of sorted) {
    const a = Math.max(prevEnd, Math.round(e.startFrame));
    const d = Math.max(1, Math.round((e.durMs / 1000) * fps));
    const b = a + d;
    if (a > prevEnd) {
      // hold (constant; ease irrelevant)
      segs.push({ a: prevEnd, b: a, z: [pz, pz], fx: [pfx, pfx], fy: [pfy, pfy], ease: "inout" });
    }
    segs.push({
      a,
      b,
      z: [e.fromZoom, e.toZoom],
      fx: [e.fromFocalX, e.toFocalX],
      fy: [e.fromFocalY, e.toFocalY],
      ease: e.ease ?? "inout",
    });
    prevEnd = b;
    pz = e.toZoom;
    pfx = e.toFocalX;
    pfy = e.toFocalY;
  }

  // Cubic interpolation from `from`→`to` over [a, a+dur), as an ffmpeg expression,
  // with selectable easing. Constant when from===to (cheap, exact).
  const easeCurve = (P: string, ease: Ease): string => {
    if (ease === "out") return `(1-pow(1-${P},3))`; // fast start, gentle settle
    if (ease === "in") return `pow(${P},3)`; // gentle start, fast end
    return `(if(lt(${P},0.5),4*pow(${P},3),1-pow(-2*${P}+2,3)/2))`; // in-out
  };
  const easeSeg = (
    a: number, from: number, to: number, dur: number, ease: Ease,
  ): string => {
    if (from === to) return `${from}`;
    const P = `((on-${a})/${dur})`;
    return `(${from}+(${to - from})*${easeCurve(P, ease)})`;
  };

  // Nested if() over segments, built end-first so the innermost else is the default
  // (z=baseZoom, focal=center → the window region fills the frame).
  let zExpr = String(baseZoom);
  let fxExpr = String(cx);
  let fyExpr = String(cy);
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    const dur = s.b - s.a;
    const cond = `between(on,${s.a},${s.b - 1})`;
    zExpr = `if(${cond},${easeSeg(s.a, s.z[0], s.z[1], dur, s.ease)},${zExpr})`;
    fxExpr = `if(${cond},${easeSeg(s.a, s.fx[0], s.fx[1], dur, s.ease)},${fxExpr})`;
    fyExpr = `if(${cond},${easeSeg(s.a, s.fy[0], s.fy[1], dur, s.ease)},${fyExpr})`;
  }

  // Blend the proportional and centered top-left, then clamp so the crop window
  // can never reference pixels outside the frame. B=0 → proportional (legacy);
  // B=1 → centered (cursor pinned to screen center, relies on the pad margin).
  const xCore = `((${fxExpr})*(1-1/zoom)*(1-${B})+((${fxExpr})-iw/(2*zoom))*${B})`;
  const yCore = `((${fyExpr})*(1-1/zoom)*(1-${B})+((${fyExpr})-ih/(2*zoom))*${B})`;
  const xExpr = `max(0,min(iw-iw/zoom,${xCore}))`;
  const yExpr = `max(0,min(ih-ih/zoom,${yCore}))`;

  return `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=1:s=${w}x${h}:fps=${fps}`;
}

// Merge adjacent camera events until at most `max` remain — the safety valve for
// pathological takes whose zoompan expression would otherwise cross ffmpeg's
// parse limit. Prefers merging same-zoom pan pairs (pure pans blend invisibly);
// falls back to the shortest adjacent pair. The merged event spans both and eases
// start-of-first → end-of-second; intermediate waypoints are lost, which is the
// accepted cost of shipping at all.
export function coalescePans(events: CameraEvent[], max: number, fps: number): CameraEvent[] {
  const ev = [...events].sort((p, q) => p.startFrame - q.startFrame);
  const merge = (i: number) => {
    const a = ev[i];
    const b = ev[i + 1];
    const endB = b.startFrame + (b.durMs / 1000) * fps;
    ev.splice(i, 2, {
      ...a,
      durMs: Math.max(a.durMs, ((endB - a.startFrame) / fps) * 1000),
      toZoom: b.toZoom,
      toFocalX: b.toFocalX,
      toFocalY: b.toFocalY,
    });
  };
  while (ev.length > max && ev.length >= 2) {
    let best = -1;
    let bestDur = Infinity;
    for (let i = 0; i < ev.length - 1; i++) {
      const a = ev[i];
      const b = ev[i + 1];
      const samePan =
        a.fromZoom === a.toZoom && b.fromZoom === b.toZoom && a.toZoom === b.fromZoom;
      const dur = a.durMs + b.durMs + (samePan ? 0 : 10_000); // heavily prefer pan pairs
      if (dur < bestDur) {
        bestDur = dur;
        best = i;
      }
    }
    merge(best);
  }
  return ev;
}

// ── Cursor glide speed ────────────────────────────────────────────────────────

// Cursor glide is slowed to ~60% speed (user spec 2026-06-05): a longer, calmer
// approach. The camera zoom/pan rides the SAME glide window, so a slower glide
// naturally lengthens the camera move too.
export const CURSOR_SLOWDOWN = 1.67; // 1 / 0.6

// Glide duration as a function of straight-line travel distance (logical px),
// with the 60% slowdown baked in. Far moves land ~1.0–1.5s; tiny moves still take
// ~0.6s so motion reads.
export function glideMsFor(dist: number): number {
  const base = 320 + dist * 0.9; // px → ms, pre-slowdown
  return Math.round(Math.min(900, Math.max(260, base)) * CURSOR_SLOWDOWN);
}

// ── Cursor-centered hold-zoom policy (CameraTrack) ────────────────────────────

type Pt = { x: number; y: number };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Builds the CameraEvent track during a one-take replay. Invariant: whenever the
// logical zoom is 1×, the focal is the viewport CENTER (so 1× always frames the
// whole window); whenever zoomed, the focal is the cursor/target (kept centered by
// the post CENTER_BIAS). Frame indices are wall-clock relative to the recording's
// frame-0 (trap C).
export class CameraTrack {
  readonly events: CameraEvent[] = [];
  private z = 1;
  private focal: Pt; // camera center (logical); === center while at 1×
  private readonly center: Pt;

  constructor(
    private readonly recStartTime: number, // wall-clock (ms) of raw frame 0
    private readonly viewW: number,
    private readonly viewH: number,
  ) {
    this.center = { x: viewW / 2, y: viewH / 2 };
    this.focal = { ...this.center };
  }

  private frameOf(wallMs: number): number {
    return Math.max(0, Math.round(((wallMs - this.recStartTime) / 1000) * FPS));
  }

  isZoomed(): boolean {
    return this.z > 1.001;
  }

  // Dynamic zoom magnitude for a jump of `dist` landing on `target`: scales with
  // distance (ZOOM_MIN→ZOOM_MAX over ZOOM_ENTER_DIST→ZOOM_FAR_DIST) and backs off
  // toward viewport edges so a centered crop doesn't over-reveal the pad margin.
  private zoomFor(dist: number, target: Pt): number {
    const span = ZOOM_FAR_DIST - ZOOM_ENTER_DIST;
    const t = clamp((dist - ZOOM_ENTER_DIST) / (span > 0 ? span : 1), 0, 1);
    const base = ZOOM_MIN + (ZOOM_MAX - ZOOM_MIN) * t;
    const edge = Math.min(
      target.x, this.viewW - target.x, target.y, this.viewH - target.y,
    );
    const ef =
      edge >= EDGE_SAFE_PX
        ? 1
        : EDGE_MIN_FACTOR + (1 - EDGE_MIN_FACTOR) * clamp(edge / EDGE_SAFE_PX, 0, 1);
    return clamp(base * ef, ZOOM_FLOOR, ZOOM_MAX);
  }

  private emit(
    startWall: number, durMs: number,
    fromZoom: number, toZoom: number,
    fromFocal: Pt, toFocal: Pt, ease: Ease = "inout",
  ): void {
    this.events.push({
      startFrame: this.frameOf(startWall),
      durMs,
      fromZoom, toZoom,
      fromFocalX: fromFocal.x, fromFocalY: fromFocal.y,
      toFocalX: toFocal.x, toFocalY: toFocal.y,
      ease,
    });
  }

  // Call the instant the cursor begins gliding from `from` to `target` over
  // `glideMs` (logical px). The camera move rides the SAME window so it eases in
  // lockstep with the synthetic cursor (both cubic in-out). No-op for tiny hops.
  onApproach(from: Pt, target: Pt, glideMs: number, moving: boolean): void {
    const dist = Math.hypot(target.x - from.x, target.y - from.y);
    const now = Date.now();

    if (moving) {
      // Moving/relaid-out target: never commit the camera to it. Settle wide if we
      // were zoomed so a shifting target can't desync the framing.
      if (this.isZoomed()) {
        this.emit(now, Math.min(ZOOM_OUT_MS, glideMs), this.z, 1, this.focal, this.center);
        this.z = 1;
        this.focal = { ...this.center };
      }
      return;
    }

    if (!this.isZoomed()) {
      if (dist < ZOOM_ENTER_DIST) return; // short hop → stay wide
      const Z = this.zoomFor(dist, target);
      // Push in: 1× (whole window, focal=center) → Z (cursor-centered on target).
      this.emit(now, glideMs, 1, Z, this.center, target);
      this.z = Z;
      this.focal = { ...target };
      return;
    }

    // Already zoomed.
    if (dist <= ZOOM_REGION_PX) {
      // Same region → PAN at the held zoom; focal tracks the cursor, so it stays
      // screen-centered for the whole glide.
      this.emit(now, glideMs, this.z, this.z, this.focal, target);
      this.focal = { ...target };
      return;
    }

    // Region change → pull out to 1× over the first half of the glide (the far
    // travel reads wide), then push back in to the new target over the rest.
    const outMs = Math.min(ZOOM_OUT_MS, Math.max(1, Math.round(glideMs * 0.5)));
    this.emit(now, outMs, this.z, 1, this.focal, this.center);
    const Z = this.zoomFor(dist, target);
    this.emit(now + outMs, Math.max(1, glideMs - outMs), 1, Z, this.center, target);
    this.z = Z;
    this.focal = { ...target };
  }

  // Deliberate reframe onto a REGION (script `focus` beat, 2026-08-20): fit the
  // w×h box into the frame and ease zoom+focal there in ONE blended move — no
  // pull-out theatrics, this is "look here", not travel. The zoom is whatever
  // magnifies the region to fill ~85% of the frame (breathing margin), capped by
  // the same range as cursor zooms so post-crop sharpness rules still hold.
  // Cursor position is irrelevant — emphasis comes from the crop.
  focusRegion(center: Pt, w: number, h: number, moveMs: number): void {
    const fit = Math.min(
      this.viewW / Math.max(1, w),
      this.viewH / Math.max(1, h),
    ) * 0.85;
    const Z = clamp(fit, ZOOM_FLOOR, ZOOM_MAX);
    const from = this.isZoomed() ? this.focal : this.center;
    this.emit(Date.now(), Math.max(1, moveMs), this.z, Z, from, center);
    this.z = Z;
    this.focal = { ...center };
  }

  // Settle back to 1× (whole window). Used before a scroll (a zoomed crop over a
  // scrolling page reads as content sliding under a keyhole) and at take end.
  settleWide(): void {
    if (!this.isZoomed()) return;
    this.emit(Date.now(), ZOOM_OUT_MS, this.z, 1, this.focal, this.center);
    this.z = 1;
    this.focal = { ...this.center };
  }

  // End of take: settle back to 1× so the final hold frames the whole window.
  // Call after the last action, before the tail hold (which gives it frames).
  finish(): void {
    this.settleWide();
  }
}
