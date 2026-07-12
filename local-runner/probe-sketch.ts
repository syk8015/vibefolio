// Verify the scripted freehand `path` action end-to-end on a REAL browser — no
// Anthropic call, no avfoundation capture: a canvas page (same mousedown/move/up
// painting model as fixtures/canvas-sketch.html) + replay() with hand-written
// path actions, asserting the app actually inked the stroke.
//
// Run: npx -y tsx local-runner/probe-sketch.ts
//
// Checks:
//   1. selector path — a zigzag stroke paints pixels at EVERY waypoint, as ONE
//      continuous line (pointerdown count 1, not per-segment)
//   2. coordinate-fallback path (bogus selector) — same stroke, shifted region
//   3. re-anchor shift — the recorded points land where the LIVE canvas is
//   4. the synthetic ring ends at the stroke's final point
// Camera events are dumped for eyeballing (segments should ride as pans).
import { mkdirSync, writeFileSync } from "node:fs";
import { launchChromium } from "./browser";
import { injectCursorOverlay, ensureCursor } from "./cursor";
import { CameraTrack } from "./camera";
import { replay } from "./replay";
import type { Script } from "./script";
import { VIEW_W, VIEW_H, OUT_DIR } from "./config";
import { run } from "./util";

const PAGE_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;background:#14141c;overflow:hidden}
  canvas{position:fixed;left:0;top:80px;background:#fbfbfe;cursor:crosshair}
</style></head><body>
  <canvas id="board" width="${VIEW_W}" height="${VIEW_H - 80}"></canvas>
  <script>
    var c = document.getElementById("board"), ctx = c.getContext("2d");
    var drawing = false, last = null, strokes = 0;
    function pos(e){ var r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    c.addEventListener("mousedown", function(e){ drawing = true; strokes++; last = pos(e); e.preventDefault(); });
    window.addEventListener("mousemove", function(e){
      if(!drawing) return; var p = pos(e);
      ctx.strokeStyle = "#1b1f2a"; ctx.lineWidth = 6; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p;
    });
    window.addEventListener("mouseup", function(){ drawing = false; last = null; });
    window.__probe = {
      strokes: function(){ return strokes; },
      // Is there ink within r px of viewport point (x, y)? (alpha>0 & non-white)
      inkNear: function(x, y, r){
        var rect = c.getBoundingClientRect();
        var cx = Math.round(x - rect.left), cy = Math.round(y - rect.top);
        var d = ctx.getImageData(Math.max(0, cx - r), Math.max(0, cy - r), r * 2, r * 2).data;
        for (var i = 0; i < d.length; i += 4) {
          if (d[i + 3] > 0 && (d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 240)) return true;
        }
        return false;
      },
    };
  </script>
</body></html>`;

function assertTrue(what: string, ok: boolean): void {
  if (!ok) throw new Error(`FAIL ${what}`);
  console.log(`  ok ${what}`);
}

// A zigzag "wave" — segments in all four directions, waypoints well inside the
// canvas (which starts at y=80).
const WAVE: [number, number][] = [
  [200, 400],
  [320, 300],
  [440, 460],
  [560, 320],
  [680, 480],
  [800, 360],
];
// Second stroke replayed via coordinate fallback, drawn lower-right.
const LOOP: [number, number][] = [
  [860, 520],
  [940, 470],
  [1010, 540],
  [930, 590],
  [860, 520],
];

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

  console.log("[1] replay: selector path + coordinate-fallback path");
  const cam = new CameraTrack(Date.now(), VIEW_W, VIEW_H);
  const script: Script = {
    loginGated: false,
    actions: [
      { kind: "path", selector: "#board", points: WAVE, label: "wave" },
      { kind: "path", selector: "#does-not-exist", points: LOOP, label: "loop" },
    ],
  };
  await replay(page, script, cam);
  writeFileSync(`${OUT_DIR}/probe-sketch-final.png`, await page.screenshot());

  // Display-level check FIRST — buffer ink alone once passed while the whole take
  // was blanked by an opaque cursor overlay (bare `canvas{background:…}` page CSS
  // hitting the overlay canvas). The composited screenshot must SHOW dark stroke
  // pixels in the wave band, not just hold them in the canvas buffer.
  const { stderr } = await run(
    "ffmpeg",
    ["-hide_banner", "-i", `${OUT_DIR}/probe-sketch-final.png`,
     "-vf", "crop=700:260:150:270,signalstats,metadata=print:key=lavfi.signalstats.YMIN",
     "-f", "null", "-"],
    { timeoutMs: 15000 },
  );
  const ymin = /YMIN=([0-9.]+)/.exec(stderr);
  assertTrue(
    `stroke visible in composited screenshot (band YMIN ${ymin?.[1] ?? "?"} < 120)`,
    !!ymin && parseFloat(ymin[1]) < 120,
  );

  const strokes = (await page.evaluate("window.__probe.strokes()")) as number;
  assertTrue(`exactly 2 continuous strokes (got ${strokes})`, strokes === 2);

  for (const [i, [x, y]] of WAVE.entries()) {
    const ink = (await page.evaluate(`window.__probe.inkNear(${x}, ${y}, 10)`)) as boolean;
    assertTrue(`wave ink at waypoint ${i} (${x},${y})`, ink);
  }
  for (const [i, [x, y]] of LOOP.entries()) {
    const ink = (await page.evaluate(`window.__probe.inkNear(${x}, ${y}, 10)`)) as boolean;
    assertTrue(`loop ink at waypoint ${i} (${x},${y})`, ink);
  }
  // Negative control: an untouched corner of the canvas stays clean.
  const clean = (await page.evaluate("window.__probe.inkNear(120, 640, 12)")) as boolean;
  assertTrue("no ink in untouched corner", !clean);

  const ring = (await page.evaluate(() => window.__nfCursor!.pos())) as { x: number; y: number };
  const last = LOOP[LOOP.length - 1];
  assertTrue(
    `ring ends at final waypoint (ring ${Math.round(ring.x)},${Math.round(ring.y)} vs ${last[0]},${last[1]})`,
    Math.abs(ring.x - last[0]) <= 2 && Math.abs(ring.y - last[1]) <= 2,
  );

  console.log(`  camera events (${cam.events.length}):`);
  for (const e of cam.events) {
    console.log(
      `    f${e.startFrame} ${e.durMs}ms zoom ${e.fromZoom.toFixed(2)}→${e.toZoom.toFixed(2)} ` +
        `focal (${Math.round(e.fromFocalX)},${Math.round(e.fromFocalY)})→(${Math.round(e.toFocalX)},${Math.round(e.toFocalY)})`,
    );
  }

  console.log("\nPASS — png in " + OUT_DIR + " (probe-sketch-final.png)");
} finally {
  await browser.close();
}
