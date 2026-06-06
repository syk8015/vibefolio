// One-take replay: drive the script deterministically (NO AI loop in the take =
// no dead-air). For each action we glide the synthetic cursor to the live element
// position, let the camera schedule its preview push-in, dwell, pull out so the
// click lands at 1x, then hold to show the result. Camera keyframes are collected
// in `cam` for the post-process zoom.
import type { Page, Locator } from "playwright-core";
import { CameraTrack, glideMsFor } from "./camera";
import type { Script, ScriptAction } from "./script";
import { cursorMoveTo, cursorPos, cursorPress } from "./cursor";
import { sleep } from "./util";

// Cinematic timing (tune by eyeball in PoC).
const SAME_PLACE_PX = 12; // closer than this → no glide/zoom (e.g. re-typing same input)
const SETTLE_MS = 180; // brief hold at full zoom before the pull-out begins
const PRECLICK_PAUSE_MS = 120; // tiny beat before a no-zoom click
const HOLD_MS = 600; // hold at 1x after a click so the result reads
const TYPE_DELAY_MS = 55; // per-keystroke (human-like)

type Pt = { x: number; y: number };

async function centerOf(loc: Locator): Promise<Pt> {
  const box = await loc.boundingBox();
  if (!box) throw new Error("element has no box (not visible/laid out)");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// Selector-first, coordinate-fallback target resolution. The selector is primary
// (recomputes the live position so relaid-out elements still work); when an
// explore-derived selector doesn't resolve on the reset page, we fall back to the
// logical-px coordinate explore observed (same 1280×720 space). M0's hand-written
// selector-only scripts always hit the selector path.
async function resolveTarget(
  page: Page,
  act: { selector?: string; x?: number; y?: number },
): Promise<Pt> {
  if (act.selector) {
    try {
      const loc = page.locator(act.selector).first();
      await loc.waitFor({ state: "visible", timeout: 7000 });
      return await centerOf(loc);
    } catch (e) {
      if (act.x === undefined || act.y === undefined) throw e;
      console.error(`selector "${act.selector}" failed; using coordinate fallback`);
    }
  }
  if (act.x !== undefined && act.y !== undefined) return { x: act.x, y: act.y };
  throw new Error("action has neither a resolvable selector nor a coordinate fallback");
}

// Glide the synthetic cursor to `to`, scheduling a preview push-in for long static
// jumps. Skips entirely when the target is essentially where we already are.
async function approach(page: Page, cam: CameraTrack, to: Pt): Promise<void> {
  const cur = (await cursorPos(page)) as Pt;
  const dist = Math.hypot(to.x - cur.x, to.y - cur.y);
  if (dist < SAME_PLACE_PX) return; // already here
  const glideMs = glideMsFor(dist);
  cam.onMoveStart(to, glideMs, /* moving */ false); // emits zoom-in iff far
  await page.mouse.move(to.x, to.y); // real cursor too (drives hover states)
  await cursorMoveTo(page, to.x, to.y, glideMs); // synthetic glide (awaits arrival)
}

// Dwell (so the zoomed target is seen), pull out, and click so the click lands at
// 1x. cam.onBeforeClick returns 0 when we were never zoomed (→ just a small beat).
async function revealAndClick(page: Page, cam: CameraTrack, to: Pt): Promise<void> {
  await sleep(SETTLE_MS);
  const waitMs = cam.onBeforeClick(); // schedules pull-out (or 0)
  if (waitMs === 0) await sleep(PRECLICK_PAUSE_MS);
  else await sleep(waitMs); // let the pull-out finish → frame is at 1x
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

  // click | type
  const to = await resolveTarget(page, act);
  await approach(page, cam, to);
  await revealAndClick(page, cam, to);

  if (act.kind === "type") {
    if (act.text) await page.keyboard.type(act.text, { delay: TYPE_DELAY_MS });
    if (act.submit) await page.keyboard.press("Enter");
  }
  await sleep(HOLD_MS);
}

// Smooth wheel scroll in small steps (TodoMVC M0 doesn't use it; here for parity).
async function smoothScroll(page: Page, dy: number): Promise<void> {
  const steps = 24;
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    await sleep(16);
  }
}
