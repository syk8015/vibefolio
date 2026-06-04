// Probe v2: settle the fps ceiling. v1 proved virtual time advances the app
// CLOCK at true speed (setInterval counter exact), but the moving box only had
// ~24-30 distinct positions -> rAF/compositor is throttled under budget-stepped
// virtual time. This compares two capture methods on a FULL-FRAME animation
// (every pixel changes each rendered frame, so mpdecimate counts uniques
// reliably) to find which actually yields 60 unique fps:
//   A) headed + setVirtualTimePolicy budget-stepping + Page.captureScreenshot
//   B) headless + HeadlessExperimental.beginFrame per frame (the timecut way)
// For each: 120 frames over 2s virtual; report unique-frame count + the
// setInterval counter (should be 20 = true speed).
// Run: npx tsx --env-file=.env.local scripts/vt-probe2.mts
import { Sandbox } from "e2b";

const DISPLAY_NUM = ":99";
const DISPLAY_W = 1280;
const DISPLAY_H = 887;
const NODE_PATH_PREFIX = "export PATH=/opt/node/bin:$PATH && ";
const RUN_PREFIX =
  NODE_PATH_PREFIX +
  "export NODE_PATH=/usr/local/lib/node_modules && " +
  "export PLAYWRIGHT_BROWSERS_PATH=/opt/playwright && ";

// Full-frame animation: a full-viewport div whose hue is a function of elapsed
// time (driven by rAF) -> every distinct rendered time = a totally different
// frame. Plus a setInterval counter to check the clock speed.
const PAGE_HTML =
  "<style>html,body{margin:0;height:100%}#bg{position:fixed;inset:0}" +
  "#c{position:fixed;top:20px;left:20px;font:64px sans-serif;color:#000;background:#fff;padding:4px}</style>" +
  "<div id=bg></div><div id=c>0</div>" +
  "<scr" + "ipt>var n=0;setInterval(function(){n++;document.getElementById('c').textContent=n;},100);" +
  "var bg=document.getElementById('bg');var t0=null;" +
  "function f(ts){if(t0===null)t0=ts;var p=(ts-t0)/2000;" +
  "bg.style.background='hsl('+((p*1440)%360)+',85%,50%)';requestAnimationFrame(f);}" +
  "requestAnimationFrame(f);</scr" + "ipt>";

const PROBE_SRC = String.raw`
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const FPS = 60, FRAME_MS = 1000 / FPS, FRAMES = 120;
const HTML = ${JSON.stringify(PAGE_HTML)};
const LAUNCH = ["--no-sandbox","--disable-dev-shm-usage","--ozone-platform=x11","--disable-infobars","--force-device-scale-factor=1"];

async function methodA() {
  const browser = await chromium.launch({ headless: false, args: LAUNCH });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.setContent(HTML);
  const client = await ctx.newCDPSession(page);
  await client.send("Emulation.setVirtualTimePolicy", { policy: "pause" });
  const dir = "/tmp/vtA"; fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < FRAMES; i++) {
    const exp = new Promise((r) => client.once("Emulation.virtualTimeBudgetExpired", r));
    await client.send("Emulation.setVirtualTimePolicy", { policy: "pauseIfNetworkFetchesPending", budget: FRAME_MS });
    await exp;
    const s = await client.send("Page.captureScreenshot", { format: "jpeg", quality: 85 });
    fs.writeFileSync(path.join(dir, "f_" + String(i).padStart(5, "0") + ".jpg"), Buffer.from(s.data, "base64"));
  }
  const counter = await page.evaluate(() => document.getElementById("c").textContent);
  await browser.close();
  return { dir: dir, counter: counter };
}

async function methodB() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: LAUNCH });
  } catch (e) {
    return { error: "headless launch failed: " + (e && e.message) };
  }
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.setContent(HTML);
  const client = await ctx.newCDPSession(page);
  try { await client.send("HeadlessExperimental.enable"); } catch (e) {}
  try { await client.send("Emulation.setVirtualTimePolicy", { policy: "pause" }); } catch (e) {}
  const dir = "/tmp/vtB"; fs.mkdirSync(dir, { recursive: true });
  let t = 1;
  try {
    for (let i = 0; i < FRAMES; i++) {
      const res = await client.send("HeadlessExperimental.beginFrame", {
        frameTimeTicks: t, interval: FRAME_MS, noDisplayUpdates: false,
        screenshot: { format: "jpeg", quality: 85 },
      });
      if (res && res.screenshotData) {
        fs.writeFileSync(path.join(dir, "f_" + String(i).padStart(5, "0") + ".jpg"), Buffer.from(res.screenshotData, "base64"));
      }
      t += FRAME_MS;
    }
  } catch (e) {
    await browser.close();
    return { error: "beginFrame failed: " + (e && e.message) };
  }
  const counter = await page.evaluate(() => document.getElementById("c").textContent);
  await browser.close();
  return { dir: dir, counter: counter };
}

(async () => {
  const a = await methodA().catch((e) => ({ error: "A threw: " + (e && e.message) }));
  const b = await methodB().catch((e) => ({ error: "B threw: " + (e && e.message) }));
  console.log(JSON.stringify({ A: a, B: b }));
})();
`;

const sandbox = await Sandbox.create("nookframe-builder", { timeoutMs: 300_000 });
console.log("sandbox:", sandbox.sandboxId);
async function sh(cmd: string, opts: any = {}) {
  return await sandbox.commands
    .run(cmd, opts)
    .catch((e: any) => ({ exitCode: -1, stdout: "", stderr: String(e?.message || e) }));
}
try {
  await sandbox.files.write("/tmp/vt-probe2.js", PROBE_SRC);
  await sandbox.commands.run(`Xvfb ${DISPLAY_NUM} -screen 0 ${DISPLAY_W}x${DISPLAY_H}x24 -nolisten tcp >/tmp/xvfb.log 2>&1`, { background: true });
  await new Promise((r) => setTimeout(r, 1500));
  await sandbox.commands.run(`DISPLAY=${DISPLAY_NUM} matchbox-window-manager -use_titlebar no >/tmp/wm.log 2>&1`, { background: true });
  await new Promise((r) => setTimeout(r, 1000));

  console.log("--- running probe2 ---");
  const r = await sh(`${RUN_PREFIX}node /tmp/vt-probe2.js`, { timeoutMs: 200_000, envs: { DISPLAY: DISPLAY_NUM } });
  console.log("exit:", r.exitCode);
  console.log("stdout:", r.stdout);
  if (r.stderr) console.log("stderr:", r.stderr.slice(-1000));

  for (const d of ["vtA", "vtB"]) {
    const cnt = await sh(`ls /tmp/${d}/*.jpg 2>/dev/null | wc -l`);
    if ((cnt.stdout || "").trim() === "0" || !cnt.stdout) { console.log(d + ": no frames"); continue; }
    await sh(`cd /tmp/${d} && ffmpeg -y -framerate 60 -i f_%05d.jpg -c:v libx264 -crf 20 -pix_fmt yuv420p out.mp4 2>/dev/null`);
    const u = await sh(`echo -n '${d} total: '; ls /tmp/${d}/*.jpg | wc -l; echo -n '${d} unique: '; ffmpeg -i /tmp/${d}/out.mp4 -vf mpdecimate,showinfo -an -f null - 2>&1 | grep -c pts_time`);
    console.log(u.stdout);
  }
} finally {
  await sandbox.kill();
  console.log("sandbox killed.");
}
