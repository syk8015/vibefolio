// One-take replay: drive the script deterministically (NO AI loop in the take =
// no dead-air). For each action we glide the synthetic cursor to the live element
// position, let the camera schedule its preview push-in, dwell, pull out so the
// click lands at 1x, then hold to show the result. Camera keyframes are collected
// in `cam` for the post-process zoom.
import type { Page } from "playwright-core";
import { CameraTrack, glideMsFor } from "./camera";
import type { Script, ScriptAction } from "./script";
import { cursorDown, cursorMoveTo, cursorPos, cursorPress, cursorUp } from "./cursor";
import { VIEW_W, VIEW_H } from "./config";
import { sleep } from "./util";

// Cinematic timing (tune by eyeball in PoC).
const SAME_PLACE_PX = 12; // closer than this → no glide/zoom (e.g. re-typing same input)
const SETTLE_MS = 180; // brief hold at full zoom before the pull-out begins
const PRECLICK_PAUSE_MS = 120; // tiny beat before a no-zoom click
// Hold at 1x after a click so the result reads. 600 → 900 (2026-08-15): a real app
// often paints its result AFTER 600ms (the landing fixture's tab panel lands at
// 900ms), so the camera was leaving for the next beat before the thing the click
// did appeared on film. Also the cheapest length lever — pacing costs no API fee.
const HOLD_MS = 900;
const TYPE_DELAY_MS = 55; // per-keystroke (human-like)
const DRAG_MIN_MS = 520; // even a short slider pull should read as a deliberate gesture
const DRAG_STEP_MS = 25; // real-mouse update cadence along the drag ease
// Freehand stroke pacing: per-SEGMENT, snappier than a UI drag — a sketch is a
// flowing gesture, not a deliberate slider pull. A 10-point smiley lands ~2s.
const PATH_SEG_MIN_MS = 160;
const PATH_SEG_MAX_MS = 650;

// Same cubic in-out the cursor overlay and camera use — the real mouse steps this
// exact curve during a drag so the app's thumb tracks the visible ring.
const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

type Pt = { x: number; y: number };

// One beat that had to click a raw coordinate because its explore-time selector
// no longer resolved (피드백 A-4). Collected per take and reported: a coordinate
// is only right if the app laid out exactly as it did during explore, so a film
// containing any of these is lower-confidence and worth eyeballing.
export type ReplayFallback = { kind: string; selector: string; label?: string; x: number; y: number };

export type ReplayResult = {
  actionsDone: number;
  actionsTotal: number;
  fallbacks: ReplayFallback[];
};

// Selector-first, coordinate-fallback target resolution. The selector is primary
// (recomputes the live position so relaid-out elements still work); when an
// explore-derived selector doesn't resolve on the reset page, we fall back to the
// logical-px coordinate explore observed (same 1280×720 space). M0's hand-written
// selector-only scripts always hit the selector path.
//
// Within a resolved element, element-CENTER is only right for point controls
// (buttons/inputs). For large containers it rewrites the click's meaning: a
// full-viewport <canvas> centers onto whatever UI overlays its middle —
// excalidraw's welcome-screen "Open" sat at (640,360) and got clicked, summoning
// the file picker. If explore's observed coordinate still lands inside the live
// box it IS the intended point; recompute center only when the element moved out
// from under it.
async function resolveTarget(
  page: Page,
  act: { selector?: string; x?: number; y?: number },
  // Where a coordinate fallback is recorded for the run report (피드백 A-4).
  // Optional: probes and M0 scripts call resolveTarget without reporting.
  fell?: { kind: string; label?: string; out: ReplayFallback[] },
): Promise<Pt> {
  if (act.selector) {
    try {
      const loc = page.locator(act.selector).first();
      // 2.5s, not longer: the coordinate fallback below is a fine answer, and a
      // miss costs real FILM time — two 7s waits once burned 14s of a 34s cap.
      await loc.waitFor({ state: "visible", timeout: 2500 });
      const box = await loc.boundingBox();
      if (!box) throw new Error("element has no box (not visible/laid out)");
      if (
        act.x !== undefined && act.y !== undefined &&
        act.x >= box.x && act.x <= box.x + box.width &&
        act.y >= box.y && act.y <= box.y + box.height
      ) {
        return { x: act.x, y: act.y };
      }
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    } catch (e) {
      if (act.x === undefined || act.y === undefined) throw e;
      console.error(`selector "${act.selector}" failed; using coordinate fallback`);
      fell?.out.push({
        kind: fell.kind,
        selector: act.selector!,
        label: fell.label,
        x: act.x,
        y: act.y,
      });
    }
  }
  if (act.x !== undefined && act.y !== undefined) return { x: act.x, y: act.y };
  throw new Error("action has neither a resolvable selector nor a coordinate fallback");
}

// Glide the synthetic cursor to `to`; the camera rides the same glide (push in on
// region entry, pan while held, pull out on a far jump). Skips entirely when the
// target is essentially where we already are.
async function approach(page: Page, cam: CameraTrack, to: Pt): Promise<void> {
  const cur = (await cursorPos(page)) as Pt;
  const dist = Math.hypot(to.x - cur.x, to.y - cur.y);
  if (dist < SAME_PLACE_PX) return; // already here
  const glideMs = glideMsFor(dist);
  cam.onApproach(cur, to, glideMs, /* moving */ false);
  // The REAL (synthetic) mouse steps the same cubic window as the ring, exactly
  // like dragTo. Jumping it ahead lit the target's :hover styling the moment the
  // glide STARTED — rail items glowed sky-blue before the cursor visually arrived,
  // and hover-revealed UI (tooltips) popped early (2026-07-20 user verdict).
  const ringArrival = cursorMoveTo(page, to.x, to.y, glideMs);
  const t0 = Date.now();
  for (;;) {
    const p = Math.min(1, (Date.now() - t0) / glideMs);
    const e = easeInOut(p);
    await page.mouse.move(cur.x + (to.x - cur.x) * e, cur.y + (to.y - cur.y) * e);
    if (p >= 1) break;
    await sleep(DRAG_STEP_MS);
  }
  await ringArrival;
}

// Brief settle so the (centered) target is seen, then click. With the hold-zoom
// policy the click lands AT the held zoom — no pull-out — so the result is revealed
// in close-up; the camera only pulls out on a far jump (region change) or the end.
async function settleAndClick(page: Page, cam: CameraTrack, to: Pt): Promise<void> {
  await sleep(cam.isZoomed() ? SETTLE_MS : PRECLICK_PAUSE_MS);
  cursorPress(page); // ripple (fire-and-forget, overlaps the real click)
  await page.mouse.click(to.x, to.y);
}

export async function replay(
  page: Page,
  script: Script,
  cam: CameraTrack,
  // Wall-clock budget for the whole take. A rich script (multi-stroke drawings,
  // selector misses) can run far past MAX_VIDEO_SEC — without this the clip cap
  // amputated films MID-GESTURE (2026-07-12: 77-105s replays cut at 34s). Stopping
  // at an action boundary instead ships a shorter but COMPLETE-feeling story.
  budgetMs: number = Infinity,
): Promise<ReplayResult> {
  const t0 = Date.now();
  let done = 0;
  const fallbacks: ReplayFallback[] = [];
  for (const act of script.actions) {
    if (Date.now() - t0 > budgetMs) {
      console.log(
        `[replay] time budget (${Math.round(budgetMs / 1000)}s) reached — ` +
          `stopping cleanly after ${done}/${script.actions.length} actions`,
      );
      break;
    }
    await runAction(page, cam, act, fallbacks);
    done++;
  }
  cam.finish(); // settle to 1× so the tail hold frames the whole window
  return { actionsDone: done, actionsTotal: script.actions.length, fallbacks };
}

async function runAction(
  page: Page,
  cam: CameraTrack,
  act: ScriptAction,
  fallbacks: ReplayFallback[],
): Promise<void> {
  const fell = { kind: act.kind, label: (act as { label?: string }).label, out: fallbacks };
  if (act.kind === "scroll") {
    await smoothScroll(page, act.dy, act.dx ?? 0);
    return;
  }
  if (act.kind === "key") {
    await page.keyboard.press(act.key).catch(() => {});
    await sleep(HOLD_MS / 2);
    return;
  }
  if (act.kind === "hover") {
    const to = await resolveTarget(page, act, fell);
    await approach(page, cam, to);
    await page.mouse.move(to.x, to.y);
    await sleep(HOLD_MS);
    return;
  }
  if (act.kind === "dismiss") {
    // Best-effort, no camera move. viaKey / empty selector = the explore pass
    // closed this surface with Escape — mirror that (audit A-C1).
    if (act.viaKey || !act.selector) {
      await page.keyboard.press("Escape").catch(() => {});
    } else {
      await page.locator(act.selector).first().click({ timeout: 3000 }).catch(() => {});
    }
    await sleep(HOLD_MS / 2);
    return;
  }
  if (act.kind === "drag") {
    // Re-anchor the gesture: resolve the live start via the selector (same policy
    // as clicks), then translate the end by however far the control moved since
    // explore — the drag's shape relative to the control is what matters, not the
    // absolute end point. Clamped so a relaid-out page can't push it off-window.
    const start = await resolveTarget(page, act, fell);
    const end = {
      x: Math.max(0, Math.min(VIEW_W - 1, act.toX + (start.x - act.x))),
      y: Math.max(0, Math.min(VIEW_H - 1, act.toY + (start.y - act.y))),
    };
    await approach(page, cam, start);
    await sleep(cam.isZoomed() ? SETTLE_MS : PRECLICK_PAUSE_MS);
    await dragTo(page, cam, start, end);
    // A text-grab drag smears a blue selection across the film (2026-07-18 take);
    // the gesture is over, so clearing it is invisible except for removing the smear.
    await page.evaluate("window.getSelection() && window.getSelection().removeAllRanges()").catch(() => {});
    await sleep(HOLD_MS);
    return;
  }
  if (act.kind === "path") {
    // Freehand stroke: drag's re-anchor policy applied to the WHOLE polyline —
    // resolve the live first point via the selector, then shift every waypoint by
    // how far the surface moved. Shape is what matters; clamp keeps a relaid-out
    // canvas from pushing the stroke off-window.
    const pts = act.points;
    const start = await resolveTarget(page, { selector: act.selector, x: pts[0][0], y: pts[0][1] }, fell);
    const dx = start.x - pts[0][0];
    const dy = start.y - pts[0][1];
    const shifted: Pt[] = pts.map(([px, py]) => ({
      x: Math.max(0, Math.min(VIEW_W - 1, px + dx)),
      y: Math.max(0, Math.min(VIEW_H - 1, py + dy)),
    }));
    await approach(page, cam, shifted[0]);
    await sleep(cam.isZoomed() ? SETTLE_MS : PRECLICK_PAUSE_MS);
    await strokePath(page, cam, shifted);
    await sleep(HOLD_MS);
    return;
  }

  // click | type
  const to = await resolveTarget(page, act, fell);
  await approach(page, cam, to);
  await settleAndClick(page, cam, to);

  if (act.kind === "type") {
    if (act.text) await page.keyboard.type(act.text, { delay: TYPE_DELAY_MS });
    if (act.submit) await page.keyboard.press("Enter");
  }
  await sleep(HOLD_MS);
}

// Press at `from`, ease to `to`, release. Three layers ride ONE cubic in-out
// window: the synthetic ring (in-page rAF glide), the REAL mouse (stepped along
// the same curve here, so mousemove-driven UI — a slider thumb — sticks to the
// ring), and the camera (onApproach pans the held zoom with the cursor, exactly
// as it does for a glide). Release waits for the ring's arrival so the let-go
// never reads before the gesture visually completes.
async function dragTo(page: Page, cam: CameraTrack, from: Pt, to: Pt): Promise<void> {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const dragMs = Math.max(DRAG_MIN_MS, glideMsFor(dist));
  await page.mouse.move(from.x, from.y); // ensure the grab starts exactly at `from`
  cursorDown(page); // ripple + ring holds pressed (fire-and-forget)
  await page.mouse.down();
  cam.onApproach(from, to, dragMs, /* moving */ false);
  const ringArrival = cursorMoveTo(page, to.x, to.y, dragMs);
  const t0 = Date.now();
  for (;;) {
    const p = Math.min(1, (Date.now() - t0) / dragMs);
    const e = easeInOut(p);
    await page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
    if (p >= 1) break;
    await sleep(DRAG_STEP_MS);
  }
  await ringArrival;
  cursorUp(page); // ring eases back to rest over the release
  await page.mouse.up();
}

// Press at the first waypoint, ease through every segment, release at the last —
// with ONE press held across the whole stroke so the app draws a single
// continuous line. Ring + real mouse move per segment; the CAMERA gets a single
// pan for the whole stroke (start → final point, total duration): per-segment
// camera events made a path-heavy take emit 50+ events, whose zoompan expression
// crossed ffmpeg's parse limit (2026-07-12). A drawing is compact relative to the
// held-zoom window, so one smooth pan keeps the pen comfortably in frame.
async function strokePath(page: Page, cam: CameraTrack, pts: Pt[]): Promise<void> {
  const segMs: number[] = [];
  let totalMs = 0;
  for (let i = 1; i < pts.length; i++) {
    const dist = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const ms = Math.max(PATH_SEG_MIN_MS, Math.min(PATH_SEG_MAX_MS, glideMsFor(dist) * 0.5));
    segMs.push(ms);
    totalMs += ms;
  }
  await page.mouse.move(pts[0].x, pts[0].y);
  cursorDown(page); // ring holds pressed for the whole stroke
  await page.mouse.down();
  cam.onApproach(pts[0], pts[pts.length - 1], totalMs, /* moving */ false);
  for (let i = 1; i < pts.length; i++) {
    const from = pts[i - 1];
    const to = pts[i];
    const ms = segMs[i - 1];
    const ringArrival = cursorMoveTo(page, to.x, to.y, ms);
    const t0 = Date.now();
    for (;;) {
      const p = Math.min(1, (Date.now() - t0) / ms);
      const e = easeInOut(p);
      await page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
      if (p >= 1) break;
      await sleep(DRAG_STEP_MS);
    }
    await ringArrival;
  }
  cursorUp(page); // ring eases back over the release
  await page.mouse.up();
}

// Smooth wheel scroll in small steps (TodoMVC M0 doesn't use it; here for parity).
async function smoothScroll(page: Page, dy: number, dx = 0): Promise<void> {
  const steps = 24;
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(dx / steps, dy / steps);
    await sleep(16);
  }
}
