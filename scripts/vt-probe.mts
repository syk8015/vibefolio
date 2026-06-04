// De-risk the virtual-time capture primitive BEFORE rewriting the recorder.
// Runs headed Chromium on the same Xvfb sandbox as prod, drives CDP
// Emulation.setVirtualTimePolicy, and captures one screenshot per advanced
// frame. Validates two things the whole rewrite depends on:
//   1. unique frames ~= captured frames  -> screenshots reflect the stepped
//      state, i.e. we get true per-frame motion (a moving box at 60fps).
//   2. setInterval counter ~= elapsed virtual seconds / interval  -> the app's
//      OWN clock advances at TRUE speed per frame (not frantic, not frozen).
// If both hold, virtual time gives smooth 60fps AND correct app speed.
// Run: npx tsx --env-file=.env.local scripts/vt-probe.mts
import { Sandbox } from "e2b";
import { writeFileSync } from "node:fs";

const DISPLAY_NUM = ":99";
const DISPLAY_W = 1280;
const DISPLAY_H = 887;
const NODE_PATH_PREFIX = "export PATH=/opt/node/bin:$PATH && ";
const RUN_PREFIX =
  NODE_PATH_PREFIX +
  "export NODE_PATH=/usr/local/lib/node_modules && " +
  "export PLAYWRIGHT_BROWSERS_PATH=/opt/playwright && ";

const PROBE_SRC = String.raw`
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const OUT = process.argv[2] || "/tmp/vt";
const FPS = 60, FRAME_MS = 1000 / FPS, FRAMES = 120; // 2s of virtual time
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: false,
    args: ["--no-sandbox","--disable-dev-shm-usage","--ozone-platform=x11","--disable-infobars","--force-device-scale-factor=1"],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  // A linearly MOVING box (unique x each frame -> measures motion smoothness) +
  // a setInterval counter (measures whether the app clock runs at true speed) +
  // a focused input (caret blink, the exact thing that went frantic before).
  await page.setContent(
    "<style>body{margin:0;background:#fff;font-family:sans-serif}" +
    "#box{position:absolute;top:80px;left:0;width:80px;height:80px;background:#39f}" +
    "#c{position:absolute;top:260px;left:20px;font-size:64px}" +
    "input{position:absolute;top:420px;left:20px;font-size:40px;width:600px}</style>" +
    "<div id=box></div><div id=c>0</div><input value=''>" +
    "<scr" + "ipt>var n=0;setInterval(function(){n++;document.getElementById('c').textContent=n;},100);" +
    "var box=document.getElementById('box');var t0=null;" +
    "function mv(ts){if(t0===null)t0=ts;var p=Math.min(1,(ts-t0)/2000);box.style.left=(p*1100)+'px';if(p<1)requestAnimationFrame(mv);}" +
    "requestAnimationFrame(mv);</scr" + "ipt>"
  );
  await page.evaluate(() => { var el = document.querySelector("input"); if (el) el.focus(); });

  const client = await context.newCDPSession(page);
  await client.send("Emulation.setVirtualTimePolicy", { policy: "pause" });

  let frame = 0;
  for (let i = 0; i < FRAMES; i++) {
    const expired = new Promise((res) => client.once("Emulation.virtualTimeBudgetExpired", res));
    await client.send("Emulation.setVirtualTimePolicy", {
      policy: "pauseIfNetworkFetchesPending",
      budget: FRAME_MS,
    });
    await expired;
    const shot = await client.send("Page.captureScreenshot", {
      format: "jpeg", quality: 85, captureBeyondViewport: false,
    });
    fs.writeFileSync(path.join(OUT, "f_" + String(frame).padStart(5, "0") + ".jpg"), Buffer.from(shot.data, "base64"));
    frame++;
  }
  const counter = await page.evaluate(() => document.getElementById("c").textContent);
  console.log(JSON.stringify({ frames: frame, counter: counter, expectedCounter: Math.round((FRAMES * FRAME_MS) / 100) }));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
`;

const sandbox = await Sandbox.create("nookframe-builder", { timeoutMs: 300_000 });
console.log("sandbox:", sandbox.sandboxId);
async function sh(cmd: string, opts: any = {}) {
  return await sandbox.commands
    .run(cmd, opts)
    .catch((e: any) => ({ exitCode: -1, stdout: "", stderr: String(e?.message || e) }));
}
try {
  await sandbox.files.write("/tmp/vt-probe.js", PROBE_SRC);
  await sandbox.commands.run(
    `Xvfb ${DISPLAY_NUM} -screen 0 ${DISPLAY_W}x${DISPLAY_H}x24 -nolisten tcp >/tmp/xvfb.log 2>&1`,
    { background: true },
  );
  await new Promise((r) => setTimeout(r, 1500));
  await sandbox.commands.run(
    `DISPLAY=${DISPLAY_NUM} matchbox-window-manager -use_titlebar no >/tmp/wm.log 2>&1`,
    { background: true },
  );
  await new Promise((r) => setTimeout(r, 1000));

  console.log("--- running vt probe ---");
  const r = await sh(`${RUN_PREFIX}mkdir -p /tmp/vt && node /tmp/vt-probe.js /tmp/vt`, {
    timeoutMs: 180_000,
    envs: { DISPLAY: DISPLAY_NUM },
  });
  console.log("exit:", r.exitCode);
  console.log("stdout:", r.stdout);
  if (r.stderr) console.log("stderr:", r.stderr.slice(-800));

  // Assemble + measure unique frames (mpdecimate). Smooth motion => unique ~= total.
  await sh(`cd /tmp/vt && ffmpeg -y -framerate 60 -i f_%05d.jpg -c:v libx264 -crf 20 -pix_fmt yuv420p vt.mp4 2>/dev/null`);
  const stats = await sh(
    `echo -n 'total: '; ls /tmp/vt/*.jpg | wc -l; ` +
      `echo -n 'unique: '; ffmpeg -i /tmp/vt/vt.mp4 -vf mpdecimate,showinfo -an -f null - 2>&1 | grep -c pts_time`,
  );
  console.log(stats.stdout);

  const bytes = await sandbox.files.read("/tmp/vt/vt.mp4", { format: "bytes" }).catch(() => null);
  if (bytes) {
    writeFileSync("/tmp/vt_probe.mp4", Buffer.from(bytes as Uint8Array));
    console.log("downloaded /tmp/vt_probe.mp4 (", (bytes as Uint8Array).length, "bytes )");
  }
} finally {
  await sandbox.kill();
  console.log("sandbox killed.");
}
