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
const HOLD_MS = 600; // hold at 1x after a click so the result reads
const TYPE_DELAY_MS = 55; // per-keystroke (human-like)
const DRAG_MIN_MS = 520; // even a short slider pull should read as a deliberate gesture
const DRAG_STEP_MS = 25; // real-mouse update cadence along the drag ease

// Same cubic in-out the cursor overlay and camera use — the real mouse steps this
// exact curve during a drag so the app's thumb tracks the visible ring.
const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

type Pt = { x: number; y: number };

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
): Promise<Pt> {
  if (act.selector) {
    try {
      const loc = page.locator(act.selector).first();
      await loc.waitFor({ state: "visible", timeout: 7000 });
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
  await page.mouse.move(to.x, to.y); // real cursor too (drives hover states)
  await cursorMoveTo(page, to.x, to.y, glideMs); // synthetic glide (awaits arrival)
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
): Promise<void> {
  for (const act of script.actions) {
    await runAction(page, cam, act);
  }
  cam.finish(); // settle to 1× so the tail hold frames the whole window
}

async function runAction(page: Page, cam: CameraTrack, act: ScriptAction): Promise<void> {
  if (act.kind === "scroll") {
    await smoothScroll(page, act.dy);
    return;
  }
  if (act.kind === "hover") {
    const to = await resolveTarget(page, act);
    await approach(page, cam, to);
    await page.mouse.move(to.x, to.y);
    await sleep(HOLD_MS);
    return;
  }
  if (act.kind === "dismiss") {
    // M0 never emits this; M1 explore will. Best-effort, no camera move.
    await page.locator(act.selector).first().click({ timeout: 3000 }).catch(() => {});
    return;
  }
  if (act.kind === "drag") {
    // Re-anchor the gesture: resolve the live start via the selector (same policy
    // as clicks), then translate the end by however far the control moved since
    // explore — the drag's shape relative to the control is what matters, not the
    // absolute end point. Clamped so a relaid-out page can't push it off-window.
    const start = await resolveTarget(page, act);
    const end = {
      x: Math.max(0, Math.min(VIEW_W - 1, act.toX + (start.x - act.x))),
      y: Math.max(0, Math.min(VIEW_H - 1, act.toY + (start.y - act.y))),
    };
    await approach(page, cam, start);
    await sleep(cam.isZoomed() ? SETTLE_MS : PRECLICK_PAUSE_MS);
    await dragTo(page, cam, start, end);
    await sleep(HOLD_MS);
    return;
  }

  // click | type
  const to = await resolveTarget(page, act);
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

// Smooth wheel scroll in small steps (TodoMVC M0 doesn't use it; here for parity).
async function smoothScroll(page: Page, dy: number): Promise<void> {
  const steps = 24;
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    await sleep(16);
  }
}
