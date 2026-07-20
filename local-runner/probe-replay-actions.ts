// Verify the 2026-07-18 replay additions end-to-end on a REAL browser — no
// Anthropic call, no capture: a synthetic page + replay() with hand-written
// actions, asserting the page actually reacted.
//
// Run: npx -y tsx local-runner/probe-replay-actions.ts
//
// Checks:
//   1. hover      — mouseenter reveals a tooltip (hover beat replays)
//   2. key        — ArrowRight nudges a focused range input (non-typing key beat)
//   3. scroll dx  — horizontal wheel pans a wide container
//   4. dismiss viaKey — Escape closes a modal the script recorded closing
//   5. drag selection clear — a text-grab drag leaves NO selection behind
//   6. approach hover timing — the mouse STEPS the glide (several far-away
//      mousemoves land before the target's first mouseover); a teleporting
//      mouse lit :hover at glide start (2026-07-20 verdict)
import { launchChromium } from "./browser";
import { injectCursorOverlay, ensureCursor } from "./cursor";
import { CameraTrack } from "./camera";
import { replay } from "./replay";
import type { Script } from "./script";
import { VIEW_W, VIEW_H } from "./config";

const PAGE_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;background:#fff;font:14px ui-monospace,monospace}
  /* everything interactive sits OUTSIDE the modal's box so no beat is occluded */
  #hoverme{position:fixed;left:60px;top:120px;width:160px;height:40px;background:#eee}
  #tip{display:none;position:fixed;left:60px;top:165px}
  #hoverme:hover + #tip{display:block}
  #vol{position:fixed;left:100px;top:600px;width:300px}
  #wide{position:fixed;left:500px;top:590px;width:300px;height:60px;overflow-x:scroll}
  #wide>div{width:2000px;height:40px;background:linear-gradient(90deg,#ccc,#333)}
  #modal{position:fixed;left:400px;top:150px;width:400px;height:250px;background:#fdd;display:block}
  #seltext{position:fixed;left:100px;top:480px;width:500px}
</style></head><body>
  <div id="hoverme">hover me</div><div id="tip">TIP</div>
  <input id="vol" type="range" min="0" max="100" value="50" step="1">
  <div id="wide"><div></div></div>
  <div id="modal">modal (Esc closes)</div>
  <p id="seltext">grab this text and drag across it like a phantom drag would</p>
  <script>
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") document.getElementById("modal").style.display = "none";
    });
    // Approach-timing instrumentation: every mousemove + the first mouseover on
    // the hover target. A stepped glide leaves a trail of far-away moves BEFORE
    // the target hovers; a teleport leaves none.
    window.__mm = [];
    window.addEventListener("mousemove", (e) => window.__mm.push({ t: performance.now(), x: e.clientX, y: e.clientY }));
    document.getElementById("hoverme").addEventListener(
      "mouseover",
      () => { window.__hoverAt = window.__hoverAt || performance.now(); },
      { once: true }
    );
  </script>
</body></html>`;

function assert(what: string, ok: boolean): void {
  if (!ok) throw new Error(`FAIL ${what}`);
  console.log(`  ok ${what}`);
}

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

  const cam = new CameraTrack(Date.now(), VIEW_W, VIEW_H);
  const script: Script = {
    loginGated: false,
    actions: [
      { kind: "hover", selector: "#hoverme", x: 140, y: 140 },
      { kind: "click", selector: "#vol", x: 250, y: 608 },
      { kind: "key", key: "ArrowRight" },
      { kind: "key", key: "ArrowRight" },
      // wheel targets the element under the cursor — hover the pane first,
      // exactly as explore's mouse_move → scroll sequence records it.
      { kind: "hover", selector: "#wide", x: 650, y: 615 },
      { kind: "scroll", dy: 0, dx: 600 },
      { kind: "dismiss", selector: "", viaKey: true },
      { kind: "drag", selector: "#seltext", x: 110, y: 488, toX: 560, toY: 488 },
    ],
  };

  // Mid-replay probe: tooltip must be visible WHILE the hover beat holds.
  const tipSeen = page
    .waitForSelector("#tip", { state: "visible", timeout: 8000 })
    .then(() => true)
    .catch(() => false);

  await replay(page, script, cam);

  assert("hover revealed the tooltip during its beat", await tipSeen);
  const vol = Number(await page.locator("#vol").inputValue());
  assert(`key beats nudged the slider 50→${vol} (want 52)`, vol === 52);
  const sx = await page.evaluate("document.getElementById('wide').scrollLeft");
  assert(`horizontal scroll panned the container (scrollLeft ${sx} > 200)`, Number(sx) > 200);
  const modalGone = await page.evaluate("document.getElementById('modal').style.display === 'none'");
  assert("dismiss(viaKey) closed the modal with Escape", modalGone === true);
  const sel = await page.evaluate("String(window.getSelection())");
  assert(`drag left no text selection behind ("${String(sel).slice(0, 20)}")`, sel === "");
  const mm = (await page.evaluate(
    "(() => { const at = window.__hoverAt || 0; const far = window.__mm.filter(m => m.t < at && Math.hypot(m.x - 140, m.y - 140) > 30).length; return { far, hovered: at > 0 }; })()",
  )) as { far: number; hovered: boolean };
  assert(`approach stepped the mouse (${mm.far} far moves before target hover, want >= 3)`, mm.hovered && mm.far >= 3);

  console.log("\nPASS — replay handles hover/key/dx-scroll/dismiss(viaKey)/selection-clear/stepped-approach");
} finally {
  await browser.close();
}
