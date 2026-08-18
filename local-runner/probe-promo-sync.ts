// 무API 프로브 — 헤드리스 비디오의 "영상 시간 ↔ 벽시계" 대응을 실측한다.
// 알려진 벽시계 시각에 화면을 까맣게 뒤집고, 그 순간이 영상 몇 초에 찍혔는지
// 역으로 찾아 오프셋을 구한다(프로모 클립 앞부분 트림 계산의 근거).
import { chromium } from "playwright-core";
import { mkdirSync, rmSync } from "node:fs";
import { run, ffprobeValue } from "./util";

const OUT = "/tmp/promo-sync-probe";

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const ctx = await browser.newContext({
    viewport: { width: 480, height: 270 },
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT, size: { width: 480, height: 270 } },
  });
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.setContent('<body style="margin:0;background:#fdfaf3"></body>');
  const flashes: number[] = [];
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(1500);
    await page.evaluate(() => (document.body.style.background = "#000"));
    flashes.push(Date.now() - t0);
    await page.waitForTimeout(300);
    await page.evaluate(() => (document.body.style.background = "#fdfaf3"));
  }
  await page.waitForTimeout(2000);
  const recEnd = Date.now() - t0;
  const video = page.video()!;
  await ctx.close();
  const closed = Date.now() - t0;
  const p = `${OUT}/probe.webm`;
  await video.saveAs(p);
  await browser.close();

  const dur = await ffprobeValue(p, "format=duration");
  console.log(`wall: newPage=0  flashes=${flashes.join(",")}  recEnd=${recEnd}  closed=${closed}`);
  console.log(`video duration=${dur}`);

  const { stdout } = await run("ffmpeg", ["-hide_banner", "-v", "error", "-i", p,
    "-vf", "fps=20,signalstats,metadata=print:file=-", "-f", "null", "-"], { timeoutMs: 60000 });
  let t: number | null = null;
  const dark: number[] = [];
  for (const line of stdout.split("\n")) {
    const m = /pts_time:([\d.]+)/.exec(line);
    if (m) t = Number(m[1]);
    const a = /lavfi\.signalstats\.YAVG=([\d.]+)/.exec(line);
    if (a && t !== null && Number(a[1]) < 100) dark.push(t);
  }
  const starts: number[] = [];
  for (const d of dark) if (!starts.length || d - starts[starts.length - 1] > 0.5) starts.push(d);
  console.log("video flash starts (s):", starts.map((s) => s.toFixed(2)).join(", "));
  for (let i = 0; i < Math.min(starts.length, flashes.length); i++) {
    console.log(`  flash${i}: wall ${flashes[i]}ms → video ${(starts[i] * 1000).toFixed(0)}ms  offset=${(flashes[i] - starts[i] * 1000).toFixed(0)}ms`);
  }
  if (dur) console.log(`end-anchor offset = recEnd - dur = ${(recEnd - dur * 1000).toFixed(0)}ms`);
}
await main();
