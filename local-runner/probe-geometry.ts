// §10 step 1 — verify the M5 can produce a clean, exactly-cropped capture of the
// Chrome content viewport (DPR / crop / screen-recording permission).
//
// Run: npx -y tsx local-runner/probe-geometry.ts
//
// It launches headed Chrome, pins the viewport to 1280×800, shows a calibration
// page (magenta fill, 3px green flush border, black corner squares), grabs one
// full-screen frame, crops it with the computed rect, and writes:
//   /tmp/nf-runner/full.png     (whole screen, for debugging a bad crop)
//   /tmp/nf-runner/cropped.png  (should be PURE magenta w/ green edges + corners)
// If cropped.png shows any desktop sliver or a clipped border, the crop is off.
import { mkdirSync } from "node:fs";
import { launchRecordingContext, ensureExactViewport } from "./browser";
import { computeCropRect, captureFullFrame, cropImage } from "./record";
import { VIEW_W, VIEW_H, OUT_DIR } from "./config";
import { sleep } from "./util";

const CAL_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;height:100%;width:100%;overflow:hidden;background:#ff00ff}
  #border{position:fixed;inset:0;border:3px solid #00ff00;box-sizing:border-box}
  .corner{position:fixed;width:32px;height:32px;background:#000}
  #tl{left:0;top:0}#tr{right:0;top:0}#bl{left:0;bottom:0}#br{right:0;bottom:0}
  #label{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);
    font:bold 26px ui-monospace,monospace;color:#fff;text-align:center;text-shadow:0 2px 6px #000}
</style></head><body>
  <div id="border"></div>
  <div class="corner" id="tl"></div><div class="corner" id="tr"></div>
  <div class="corner" id="bl"></div><div class="corner" id="br"></div>
  <div id="label">NOOKFRAME CALIBRATION<br><span id="dims"></span></div>
  <script>
    document.getElementById('dims').textContent =
      innerWidth + '×' + innerHeight + '  @' + devicePixelRatio + 'x';
  </script>
</body></html>`;

mkdirSync(OUT_DIR, { recursive: true });

const { context, page } = await launchRecordingContext();
try {
  await page.setContent(CAL_HTML, { waitUntil: "load" });
  const sized = await ensureExactViewport(page, VIEW_W, VIEW_H);
  console.log("viewport after pin:", sized);
  await page.bringToFront();
  await sleep(500); // let the window settle + paint before grabbing

  const crop = await computeCropRect(page);
  console.log("crop info:", JSON.stringify(crop, null, 2));

  await captureFullFrame(`${OUT_DIR}/full.png`);
  await cropImage(`${OUT_DIR}/full.png`, `${OUT_DIR}/cropped.png`, crop);
  console.log("\nwrote:");
  console.log("  " + OUT_DIR + "/full.png   (full screen)");
  console.log("  " + OUT_DIR + "/cropped.png (should be pure magenta + green edges)");
} finally {
  await context.close();
}
