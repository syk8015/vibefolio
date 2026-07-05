// Verify the scripted drag gesture end-to-end on a REAL browser — no Anthropic
// call, no avfoundation capture: a native <input type=range> page + replay() with
// hand-written drag actions, asserting the app actually tracked the gesture.
//
// Run: npx -y tsx local-runner/probe-drag.ts
//
// Checks:
//   1. cursor overlay down()/up() — pressed ring holds, releases (eyeball pngs)
//   2. replay drag via SELECTOR — slider value lands at the drag end point
//   3. replay drag via COORDINATE FALLBACK (bogus selector) — same result
//   4. the synthetic ring ends at the drag end point (real mouse and ring agree)
// Camera events emitted during the take are dumped for eyeballing (a far approach
// pushes in, so the drag itself should ride as a pan at the held zoom).
import { mkdirSync, writeFileSync } from "node:fs";
import { launchChromium } from "./browser";
import { injectCursorOverlay, ensureCursor, cursorDown, cursorUp } from "./cursor";
import { CameraTrack } from "./camera";
import { replay } from "./replay";
import type { Script } from "./script";
import { VIEW_W, VIEW_H, OUT_DIR } from "./config";
import { sleep } from "./util";

// Slider top-left-ish → the approach from screen center is FAR (>zoom threshold),
// so the take exercises "push in → drag pans at the held zoom".
const SLIDER = { x: 180, y: 150, w: 480 };

const PAGE_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;background:#14141c;color:#eee;
    font:14px ui-monospace,monospace;overflow:hidden}
  #vol{position:fixed;left:${SLIDER.x}px;top:${SLIDER.y}px;width:${SLIDER.w}px}
  #out{position:fixed;left:${SLIDER.x}px;top:${SLIDER.y + 30}px;font-size:22px}
</style></head><body>
  <input id="vol" type="range" min="0" max="100" value="20">
  <div id="out">20</div>
  <script>
    vol.addEventListener("input", () => { out.textContent = vol.value; });
  </script>
</body></html>`;

const trackY = SLIDER.y + 8; // vertical middle of the native range control
const atFrac = (f: number) => Math.round(SLIDER.x + SLIDER.w * f);

function assertNear(what: string, got: number, want: number, tol: number): void {
  if (Math.abs(got - want) > tol) {
    throw new Error(`FAIL ${what}: got ${got}, want ${want}±${tol}`);
  }
  console.log(`  ok ${what}: ${got} (want ${want}±${tol})`);
}

mkdirSync(OUT_DIR, { recursive: true });
const browser = await launchChromium();
try {
  const context = await browser.newContext({
    viewport: { width: VIEW_W, height: VIEW_H },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await injectCursorOverlay(page);
  await page.setContent(PAGE_HTML, { waitUntil: "load" });
  await ensureCursor(page);

  // ── 1) pressed-ring visuals ────────────────────────────────────────────────
  console.log("[1] cursor down/up visuals");
  await cursorDown(page);
  await sleep(300); // hold ease done, ripple mid-flight
  writeFileSync(`${OUT_DIR}/probe-drag-pressed.png`, await page.screenshot());
  await cursorUp(page);
  await sleep(300);
  writeFileSync(`${OUT_DIR}/probe-drag-released.png`, await page.screenshot());

  // ── 2) selector drag 20%→80%, then 3) coordinate-fallback drag back to 40% ──
  console.log("[2] replay: selector drag + coordinate-fallback drag");
  const cam = new CameraTrack(Date.now(), VIEW_W, VIEW_H);
  const script: Script = {
    loginGated: false,
    actions: [
      { kind: "drag", selector: "#vol", x: atFrac(0.2), y: trackY, toX: atFrac(0.8), toY: trackY },
      { kind: "drag", selector: "#does-not-exist", x: atFrac(0.8), y: trackY, toX: atFrac(0.4), toY: trackY },
    ],
  };
  await replay(page, script, cam);
  writeFileSync(`${OUT_DIR}/probe-drag-final.png`, await page.screenshot());

  const value = Number(await page.locator("#vol").inputValue());
  // A native range maps track-x → value with half-thumb insets; ±8 absorbs that.
  assertNear("slider value after 80%→40% drags", value, 40, 8);

  const ring = (await page.evaluate(() => window.__nfCursor!.pos())) as { x: number; y: number };
  assertNear("ring x at drag end", ring.x, atFrac(0.4), 2);
  assertNear("ring y at drag end", ring.y, trackY, 2);

  console.log(`  camera events (${cam.events.length}):`);
  for (const e of cam.events) {
    console.log(
      `    f${e.startFrame} ${e.durMs}ms zoom ${e.fromZoom.toFixed(2)}→${e.toZoom.toFixed(2)} ` +
        `focal (${Math.round(e.fromFocalX)},${Math.round(e.fromFocalY)})→(${Math.round(e.toFocalX)},${Math.round(e.toFocalY)})`,
    );
  }

  console.log("\nPASS — pngs in " + OUT_DIR + " (probe-drag-*.png)");
} finally {
  await browser.close();
}
