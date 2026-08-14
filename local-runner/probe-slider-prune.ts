// Does the no-op pruner CUT a drag that really happened? (no API, no capture)
//
// Take F pruned three slider drags as "no visible change". The earlier probe only
// proved the fixture responds (25→70, PNGs differ) — it never ran the actual prune
// predicate, which is not "pixels differ" but "global SSIM ≥ 0.995 AND a 300×300
// patch at EACH endpoint ≥ 0.998". A slider is a few hundred changed pixels in a
// 1280×720 frame, so it can move for real and still score as unchanged. That would
// be a FALSE PRUNE — the dangerous kind (script↔live page desync).
//
// Measured 2026-08-15: a real slider drag lands at patch 0.962-0.982 against the
// 0.998 bar, so pixels alone do keep it — but not by much, which is why the drag
// branch now asks the DOM first (dragStateAt / dragStateOfGrab). This probe checks
// both layers on every gesture, and the DOM layer is the one that must never miss.
//
// Run: npm run demo:fixtures &   then   npx -y tsx local-runner/probe-slider-prune.ts
//
// Per gesture it reports: did the control move, the three SSIM scores, the DOM
// signature transition, and the verdict explore would reach — plus each thumb's
// real viewport coordinates, the reference for reading a take's log line
// `pruned drag … (x,y)→(x,y) [state … → …]`.
import { writeFileSync, mkdirSync } from "node:fs";
import type { Page } from "playwright-core";
import { launchChromium, parkCursorOffPage } from "./browser";
import { VIEW_W, VIEW_H, OUT_DIR, EXPLORE_NOOP_SSIM, EXPLORE_NOOP_SSIM_LOCAL } from "./config";
import { dragStateAt, dragStateOfGrab } from "./explore";
import { run, sleep } from "./util";

const URL = process.argv[2] || "http://localhost:5050/nookgym.html";
const ACTION_PACING_MS = 420; // explore.ts — the wait before the after-shot
const DRAG_STEPS = 18;
const DRAG_STEP_MS = 14;
const THUMB_W = 16; // Chromium default range thumb (only used to aim, not to judge)

mkdirSync(OUT_DIR, { recursive: true });

// ── the pruner, verbatim in behaviour (explore.ts) ────────────────────────────
const shotBuf = (page: Page) => page.screenshot({ type: "jpeg", quality: 70 });

async function ssim(a: Buffer, b: Buffer, crop?: { x: number; y: number; w: number; h: number }) {
  const pa = `${OUT_DIR}/probe-prune-a.jpg`;
  const pb = `${OUT_DIR}/probe-prune-b.jpg`;
  writeFileSync(pa, a);
  writeFileSync(pb, b);
  const c = crop ? `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}` : "";
  const lavfi = crop ? `[0:v]${c}[a];[1:v]${c}[b];[a][b]ssim` : "ssim";
  const { stderr } = await run("ffmpeg", ["-hide_banner", "-i", pa, "-i", pb, "-lavfi", lavfi, "-f", "null", "-"], {
    timeoutMs: 15000,
  });
  const m = /All:([0-9.]+)/.exec(stderr);
  return m ? parseFloat(m[1]) : 0;
}

async function patchScore(before: Buffer, after: Buffer, cx: number, cy: number) {
  const w = 300;
  const h = 300;
  const x = Math.max(0, Math.min(VIEW_W - w, Math.round(cx) - w / 2));
  const y = Math.max(0, Math.min(VIEW_H - h, Math.round(cy) - h / 2));
  return await ssim(before, after, { x, y, w, h });
}

const f = (n: number) => n.toFixed(5);
let failures = 0;
let checks = 0;

// One gesture, exactly as explore's left_click_drag branch performs and judges it.
async function gesture(
  page: Page,
  label: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  moved: () => Promise<boolean>, // did the app actually do something? (the truth)
  why: string,
) {
  const stateBefore = await dragStateAt(page, from.x, from.y).catch(() => "");
  const before = await shotBuf(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= DRAG_STEPS; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / DRAG_STEPS, from.y + ((to.y - from.y) * i) / DRAG_STEPS);
    await sleep(DRAG_STEP_MS);
  }
  await page.mouse.up();
  await page.evaluate("window.getSelection() && window.getSelection().removeAllRanges()").catch(() => {});
  await sleep(ACTION_PACING_MS);
  const after = await shotBuf(page);

  const stateAfter = stateBefore ? await dragStateOfGrab(page).catch(() => "") : "";
  const stateMoved = !!stateBefore && !!stateAfter && stateAfter !== stateBefore;
  const real = await moved();
  const g = await ssim(before, after);
  const ls = await patchScore(before, after, from.x, from.y);
  const le = await patchScore(before, after, to.x, to.y);
  const pixelsSayNoop = g >= EXPLORE_NOOP_SSIM && ls >= EXPLORE_NOOP_SSIM_LOCAL && le >= EXPLORE_NOOP_SSIM_LOCAL;
  const kept = stateMoved || !pixelsSayNoop; // explore's decision

  checks++;
  const ok = kept === real;
  if (!ok) failures++;
  const verdict = ok
    ? real
      ? `✅ kept, correctly (${stateMoved ? "DOM said so" : "pixels said so"})`
      : "✅ pruned, correctly (nothing happened)"
    : real
      ? "❌ FALSE PRUNE — it moved and explore cuts it"
      : "❌ false keep — nothing moved and explore keeps it";
  console.log(
    `  ${label.padEnd(11)} (${Math.round(from.x)},${Math.round(from.y)})→(${Math.round(to.x)},${Math.round(to.y)})  ` +
      `app ${real ? "MOVED" : "did nothing"}\n` +
      `    global ${f(g)} ${g >= EXPLORE_NOOP_SSIM ? "≥" : "<"} ${EXPLORE_NOOP_SSIM} | patch@start ${f(ls)} | ` +
      `patch@end ${f(le)} (bar ${EXPLORE_NOOP_SSIM_LOCAL})\n` +
      `    dom ${stateBefore || "(none)"} → ${stateAfter || "(none)"}\n` +
      `    → ${verdict}   [${why}]`,
  );
}

const browser = await launchChromium();
// explore's context exactly: fixed 1280×720 at DSF 1.
const ctx = await browser.newContext({ viewport: { width: VIEW_W, height: VIEW_H }, deviceScaleFactor: 1, locale: "en-US" });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: "networkidle" });

// ── sliders: the control that started this ────────────────────────────────────
for (const id of ["focus-slider", "priority-slider"]) {
  const el = page.locator(`[data-testid="${id}"]`);
  if ((await el.count()) === 0) {
    console.log(`\n### ${id}: NOT FOUND`);
    continue;
  }
  await el.scrollIntoViewIfNeeded();
  await sleep(400);

  const meta = await el.evaluate((n: HTMLInputElement) => ({ min: +n.min, max: +n.max, value: +n.value }));
  const box = (await el.boundingBox())!;
  const frac = (meta.value - meta.min) / (meta.max - meta.min);
  const thumbX = box.x + THUMB_W / 2 + frac * (box.width - THUMB_W);
  const trackY = box.y + box.height / 2;
  console.log(
    `\n### ${id}  value=${meta.value} (${meta.min}..${meta.max})  scrollY=${await page.evaluate("window.scrollY")}\n` +
      `    track x ${Math.round(box.x)}..${Math.round(box.x + box.width)}  y≈${Math.round(trackY)}  ` +
      `→ thumb sits at (${Math.round(thumbX)},${Math.round(trackY)})`,
  );

  const aims = [
    { name: "thumb", x: thumbX, dy: 0, why: "grab the thumb where it sits (the aim the prompt asks for)" },
    { name: "track-mid", x: box.x + box.width * 0.5, dy: 0, why: "grab the middle of the track (a plausible aim)" },
    { name: "off-track", x: thumbX, dy: -40, why: "40px above the track — a real miss (prune SHOULD fire)" },
  ];
  for (const aim of aims) {
    await el.evaluate((n: HTMLInputElement, v: number) => {
      n.value = String(v);
      n.dispatchEvent(new Event("input", { bubbles: true }));
    }, meta.value);
    await sleep(200);
    await gesture(
      page,
      aim.name,
      { x: aim.x, y: trackY + aim.dy },
      { x: box.x + box.width * 0.78, y: trackY + aim.dy },
      async () => +(await el.inputValue()) !== meta.value,
      aim.why,
    );
  }
}

// ── kanban: the other drag shape (an item that changes column) ────────────────
const card = page.locator('[data-testid="col-todo"] [data-testid="card"]').first();
if ((await card.count()) > 0) {
  await card.scrollIntoViewIfNeeded();
  // scrollIntoViewIfNeeded parks the card under the sticky topbar, so the grab
  // point lands on the bar instead of the grip — back off until the point really
  // resolves to the card (a probe that aims at the wrong pixel proves nothing).
  await page.evaluate("window.scrollBy(0, -140)");
  await sleep(400);
  const handle = card.locator('[data-testid="card-handle"]');
  const hb = (await handle.boundingBox())!;
  const onCard = await page.evaluate(
    `(() => { var e = document.elementFromPoint(${hb.x + hb.width / 2}, ${hb.y + hb.height / 2});
       return !!(e && e.closest('[data-testid="card"]')); })()`,
  );
  if (!onCard) throw new Error("probe aim check failed: the grip point is covered by something else");
  const doing = (await page.locator('[data-testid="col-doing"] .col-body').boundingBox())!;
  const title = (await card.locator(".t").textContent())!.trim();
  console.log(`\n### kanban card "${title}"  handle at (${Math.round(hb.x + hb.width / 2)},${Math.round(hb.y + hb.height / 2)})`);
  const inDoing = () =>
    page.locator('[data-testid="col-doing"]').innerText().then((t) => t.includes(title));
  await gesture(
    page,
    "handle",
    { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 },
    { x: doing.x + doing.width / 2, y: doing.y + 30 },
    inDoing,
    "the ⠿ grip — a card that really changes column",
  );
  // Empty space below the columns: nothing to grab, nothing to keep.
  const board = (await page.locator('[data-testid="col-done"]').boundingBox())!;
  await gesture(
    page,
    "empty",
    { x: board.x + board.width / 2, y: board.y + board.height - 12 },
    { x: doing.x + doing.width / 2, y: doing.y + 30 },
    async () => false,
    "empty board space — the phantom drag pruning exists for this",
  );
}

// ── the cursor park that keeps those drags alive ──────────────────────────────
// Why a drag dies is upstream of pruning: a physical cursor resting on the page
// ends a native slider's gesture (see parkCursorOffPage). That is statistical to
// measure, so assert the deterministic half — the cursor really ends up off the
// content — by reading it back from CoreGraphics.
const READ_CURSOR_PY = [
  "import ctypes",
  "cg = ctypes.CDLL('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics')",
  "class P(ctypes.Structure): _fields_ = [('x', ctypes.c_double), ('y', ctypes.c_double)]",
  "cg.CGEventCreate.restype = ctypes.c_void_p; cg.CGEventCreate.argtypes = [ctypes.c_void_p]",
  "cg.CGEventGetLocation.restype = P; cg.CGEventGetLocation.argtypes = [ctypes.c_void_p]",
  "p = cg.CGEventGetLocation(cg.CGEventCreate(None))",
  "print(p.x, p.y)",
].join("\n");
const geo = (await page.evaluate(
  "({sy: window.screenY, oh: window.outerHeight, ih: window.innerHeight})",
)) as { sy: number; oh: number; ih: number };
const contentTop = geo.sy + (geo.oh - geo.ih);
await page.mouse.move(200, 400); // synthetic mouse elsewhere — irrelevant to the real one
await parkCursorOffPage(page);
const [cx, cy] = (await run("python3", ["-c", READ_CURSOR_PY], { timeoutMs: 8000 })).stdout.trim().split(/\s+/).map(Number);
const parked = cy < contentTop;
checks++;
if (!parked) failures++;
console.log(
  `\n### physical cursor park\n  real cursor at (${Math.round(cx)},${Math.round(cy)}), content starts at y=${contentTop}\n` +
    `    → ${parked ? "✅ parked above the page (native drags keep tracking)" : "❌ still over the page — slider drags will die mid-gesture"}`,
);

console.log(
  `\n${failures === 0 ? "PASS" : "FAIL"}: ${failures} wrong verdict(s) in ${checks} checks. ` +
    (failures === 0
      ? "Real drags survive, dead ones get cut → a pruned drag in a take was a grab that did nothing; its logged [state …] says whether the aim even landed on a control."
      : "explore's drag verdict disagrees with what the app actually did — fix the predicate before trusting another take."),
);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
