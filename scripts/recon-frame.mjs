// 최종 캡처 레시피 검증: Xvfb(1280x887) + matchbox + 헤디드 크롬, 툴바는 크롭,
// 실제 커서는 ffmpeg -draw_mouse 0 으로 제거. 결과 = 깨끗한 1280x800 60fps.
import { Sandbox } from "e2b";
import { readFileSync, writeFileSync } from "node:fs";

if (!process.env.E2B_API_KEY) {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const m = env.match(/^E2B_API_KEY=(.+)$/m);
  if (m) process.env.E2B_API_KEY = m[1].trim().replace(/^['"]|['"]$/g, "");
}
const DISPLAY_W = 1280, DISPLAY_H = 887; // 800 content + ~87 toolbar
const sandbox = await Sandbox.create("nookframe-builder", { timeoutMs: 240_000 });
console.log("sandbox:", sandbox.sandboxId);
async function sh(cmd, opts = {}) {
  const r = await sandbox.commands.run(cmd, opts).catch((e) => ({ exitCode: -1, stdout: "", stderr: String(e?.message || e) }));
  console.log(`\n$ ${cmd}\n[exit ${r.exitCode}] ${r.stdout?.trim()?.slice(0, 400) || ""}${r.stderr ? "\n  ERR: " + r.stderr.trim().slice(0, 300) : ""}`);
  return r;
}
try {
  const html = "<!doctype html><html><head><meta charset=utf-8><style>html,body{margin:0;height:100vh;background:#0b0b10;overflow:hidden}.b{position:absolute;top:300px;left:540px;width:200px;height:200px;border-radius:24px;background:#5aa0ff;animation:m 1.1s linear infinite alternate}@keyframes m{from{transform:rotate(0) scale(0.8)}to{transform:rotate(360deg) scale(1.25)}}h1{color:#fff;font:54px sans-serif;text-align:center;padding-top:50px;margin:0}.edge{position:absolute;bottom:0;left:0;right:0;height:8px;background:#e33}</style></head><body><h1>FRAME RECIPE TEST</h1><div class='b'></div><div class='edge'></div></body></html>";
  await sandbox.files.write("/tmp/test.html", html);

  const smoke = String.raw`const { chromium } = require("playwright");
const { spawn, execSync } = require("node:child_process");
const fs = require("node:fs");
(async () => {
  const browser = await chromium.launch({ headless: false,
    args: ["--no-sandbox","--disable-dev-shm-usage","--ozone-platform=x11","--disable-infobars","--force-device-scale-factor=1"] });
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();
  await page.goto("file:///tmp/test.html");
  await new Promise(r => setTimeout(r, 1200));
  const dim = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  const cropY = ` + DISPLAY_H + ` - dim.h;
  console.log("content:", JSON.stringify(dim), "cropY:", cropY);
  const region = dim.w + "x" + dim.h;
  const off = ":99+0," + cropY;
  try { execSync("ffmpeg -y -draw_mouse 0 -f x11grab -video_size " + region + " -i '" + off + "' -frames:v 1 /tmp/one.png", { env: Object.assign({}, process.env, { DISPLAY: ":99" }), stdio: "ignore" }); } catch (e) { console.log("one err", e.message); }
  const ff = spawn("ffmpeg", ["-y","-draw_mouse","0","-f","x11grab","-framerate","60","-video_size",region,"-i",off,"-t","3","-c:v","libx264","-preset","ultrafast","-pix_fmt","yuv420p","/tmp/grab.mp4"], { stdio: "ignore", env: Object.assign({}, process.env, { DISPLAY: ":99" }) });
  await new Promise(res => ff.on("exit", res));
  await context.close(); await browser.close();
  console.log("one.png:", fs.existsSync("/tmp/one.png") ? fs.statSync("/tmp/one.png").size : "NONE", "| grab.mp4:", fs.existsSync("/tmp/grab.mp4") ? fs.statSync("/tmp/grab.mp4").size : "NONE");
})().catch(e => { console.error("SMOKE FAIL:", e && e.stack ? e.stack.slice(0,700) : e); process.exit(1); });`;
  await sandbox.files.write("/tmp/smoke.js", smoke);

  await sandbox.commands.run(`Xvfb :99 -screen 0 ${DISPLAY_W}x${DISPLAY_H}x24 -nolisten tcp >/tmp/xvfb.log 2>&1`, { background: true }).catch(() => {});
  await new Promise((r) => setTimeout(r, 2000));
  await sandbox.commands.run("DISPLAY=:99 matchbox-window-manager -use_titlebar no >/tmp/wm.log 2>&1", { background: true }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1200));
  const env = "export PATH=/opt/node/bin:$PATH && export NODE_PATH=/usr/local/lib/node_modules && export PLAYWRIGHT_BROWSERS_PATH=/opt/playwright && export DISPLAY=:99 && ";
  await sh(env + "node /tmp/smoke.js", { timeoutMs: 120_000 });
  await sh("echo -n 'unique/180: '; ffmpeg -i /tmp/grab.mp4 -vf 'mpdecimate,showinfo' -an -f null - 2>&1 | grep -c pts_time");
  await sh("ffprobe -v error -select_streams v:0 -show_entries stream=width,height,avg_frame_rate -of default=nw=1 /tmp/grab.mp4");
  const bytes = await sandbox.files.read("/tmp/one.png", { format: "bytes" }).catch(() => null);
  if (bytes) { writeFileSync("/tmp/recon_frame.png", Buffer.from(bytes)); console.log("downloaded /tmp/recon_frame.png"); }
} finally {
  await sandbox.kill();
  console.log("\nsandbox killed.");
}
