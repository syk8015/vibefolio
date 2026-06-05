// §10 step 1 (part 2) — verify avfoundation sustains a real-time 60fps capture
// of the Chrome content viewport on this M5, and that motion is smooth.
//
// Run: npx -y tsx local-runner/probe-capture.ts
//
// Records ~5s of a rAF-driven animation (every frame differs), then reports the
// raw clip's dimensions / container fps / mpdecimate uniqueFps and writes a
// contact sheet to /tmp/nf-runner/sheet.png for a visual smoothness check.
import { mkdirSync } from "node:fs";
import { launchChromium, newRecordingPage, ensureExactViewport } from "./browser";
import { computeCropRect, startRecording } from "./record";
import { VIEW_W, VIEW_H, OUT_DIR } from "./config";
import { sleep, run, ffprobeValue } from "./util";

// Smooth full-height bar swept by requestAnimationFrame (independent of CSS
// throttling) + a per-frame HUD counter, so consecutive frames differ enough
// for mpdecimate to count them as unique.
const ANIM_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#0b0b16}
  #bar{position:fixed;top:0;height:100%;width:180px;
    background:linear-gradient(180deg,#7c5cff,#22d3ee);will-change:transform}
  #hud{position:fixed;left:16px;top:14px;font:bold 44px ui-monospace,monospace;color:#fff}
  #grid{position:fixed;inset:0;background-image:
    linear-gradient(#ffffff14 1px,transparent 1px),
    linear-gradient(90deg,#ffffff14 1px,transparent 1px);background-size:64px 64px}
</style></head><body>
  <div id="grid"></div><div id="bar"></div><div id="hud">frame 0</div>
  <script>
    const bar=document.getElementById('bar'),hud=document.getElementById('hud');
    let f=0;const W=Math.max(1,innerWidth-180);
    function tick(t){
      const x=(Math.sin(t/700)*0.5+0.5)*W;
      bar.style.transform='translateX('+x+'px)';
      hud.textContent='frame '+(f++);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  </script>
</body></html>`;

mkdirSync(OUT_DIR, { recursive: true });
const raw = `${OUT_DIR}/raw.mp4`;

const browser = await launchChromium();
try {
  const { page } = await newRecordingPage(browser);
  await page.setContent(ANIM_HTML, { waitUntil: "load" });
  const sized = await ensureExactViewport(browser, page, VIEW_W, VIEW_H);
  console.log("viewport after pin:", sized);
  await page.bringToFront();
  await sleep(400);

  const crop = await computeCropRect(page);
  console.log("crop:", crop.x, crop.y, crop.w, crop.h, `(dpr ${crop.dpr})`);

  const rec = startRecording(raw, crop);
  await sleep(5000); // ~5s of capture (minus avfoundation warmup)
  await rec.stop();
  console.log("capture stopped");

  // Measure the raw clip.
  const w = await ffprobeValue(raw, "stream=width");
  const h = await ffprobeValue(raw, "stream=height");
  const dur = await ffprobeValue(raw, "format=duration");
  const { stdout: rfr } = await run("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=r_frame_rate", "-of", "default=nk=1:nw=1", raw,
  ]);

  // uniqueFps via mpdecimate: -f null - reports the count of KEPT (non-dup) frames.
  const { stderr } = await run("ffmpeg", [
    "-hide_banner", "-i", raw, "-vf", "mpdecimate", "-an", "-f", "null", "-",
  ]);
  const frameMatches = [...stderr.matchAll(/frame=\s*(\d+)/g)];
  const uniqueFrames = frameMatches.length
    ? parseInt(frameMatches[frameMatches.length - 1][1], 10)
    : 0;
  const uniqueFps = dur ? uniqueFrames / dur : 0;

  // Visual smoothness contact sheet: 12 frames over the clip.
  await run("ffmpeg", [
    "-hide_banner", "-i", raw,
    "-vf", "fps=12,scale=320:-1,tile=4x3", "-frames:v", "1",
    "-y", `${OUT_DIR}/sheet.png`,
  ]);

  console.log("\n=== RAW CAPTURE REPORT ===");
  console.log(`dimensions : ${w}×${h}  (expect ${VIEW_W * crop.dpr}×${VIEW_H * crop.dpr})`);
  console.log(`duration   : ${dur.toFixed(2)}s`);
  console.log(`container  : ${rfr.trim()} fps`);
  console.log(`uniqueFrames: ${uniqueFrames}`);
  console.log(`uniqueFps  : ${uniqueFps.toFixed(1)}  (target ≥55)`);
  console.log(`raw clip   : ${raw}`);
  console.log(`contact    : ${OUT_DIR}/sheet.png`);
} finally {
  await browser.close();
}
