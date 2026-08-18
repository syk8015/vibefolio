// 로고 엔드캡 — "nookframe.com" 타이핑 → 지우다 n에서 멈춰 n+블록 로고로
// 착지 → 블링크 → 고정. local-runner/endcap.ts(데모 영상용, 실촬영 검증
// 완료)의 타이밍·프레임 렌더링 로직을 그대로 가져오되 두 가지를 뺐다:
//  - handle(@username) 없음 — 프로모 클립은 특정 유저가 아니라 사이트 자체
//    홍보라 "nookframe.com"만 쓴다(단어가 고정이라 지터 시드도 고정값).
//  - 블러 크로스페이드 없음 — body가 이미 solid 크림 배경(녹화 페이지
//    배경, app/promo-record/page.tsx var(--bg))이라 엔드캡도 같은 solid
//    배경이면 전환이 저절로 매끄럽다(블러가 필요했던 건 데모 영상 위 앱
//    UI를 지워야 했기 때문 — 여기는 애초에 배경이 심플함).
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { run } from "./util";

// app/globals.css 라이트 토큰과 정확히 같아야 한다 — 프로모 본편은 이 배경을
// 그대로 채운 페이지(app/promo-record/page.tsx의 var(--bg))이고 엔드캡이 컷 없이
// 이어붙으므로, 값이 다르면 이음매에서 배경 톤이 한 번 튄다(2026-08-18 실측:
// 데모 엔드캡 상수 #f4ede0을 그대로 썼다가 본편 #fdfaf3와 어긋난 걸 발견).
// 데모용 endcap.ts는 블러 크로스페이드가 앞에 있어 이 문제가 없으므로 안 건드림.
const CREAM = "#fdfaf3"; // --bg (light) — 실제로는 본편에서 샘플한 색이 우선한다
const INK = "#1a1612";

const WORD = "nookframe.com";
const LEAD_SEC = 0.35; // 깜빡이는 커서로 시작하는 리드
const TYPE_MIN_MS = 60, TYPE_JIT_MS = 40; // 글자당
const HOLD_FULL_SEC = 0.8; // 다 쓴 상태로 유지
const ERASE_MIN_MS = 35, ERASE_JIT_MS = 20; // 지워지는 글자당
const LAND_BLINK_SEC = 0.95; // n에 착지한 뒤 한 번 깜빡
const LAND_HOLD_SEC = 1.0; // 그 다음 고정 유지
const BLINK_PERIOD_SEC = 0.95;
// 프레임 하나에 로고만 있는 화면이라 데모 엔드캡(0.05)보다 살짝 크게.
const FONT_FRAC = 0.07;

// 매 촬영마다 동일한 타이핑 리듬(결정론적 — Date.now/Math.random 없음).
// WORD가 고정 문자열이라 시드도 항상 같다.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sceneHtml(w: number, h: number, bg: string): string {
  const fontPx = Math.min(Math.floor(h * FONT_FRAC), Math.floor((w * 0.86) / (WORD.length * 0.6)));
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;background:${bg}}
  #frame{width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center}
  #row{display:inline-flex;align-items:center;min-height:1.3em;
    font-family:'JetBrains Mono',ui-monospace,'SF Mono',Menlo,monospace;
    font-weight:500;font-size:${fontPx}px;letter-spacing:-0.02em;color:${INK}}
  #txt{white-space:pre}
  #blk{display:inline-block;flex-shrink:0;width:.55em;height:1.02em;
    border-radius:.05em;background:currentColor;margin-left:.08em}
</style></head><body>
<div id="frame"><div id="row"><span id="txt"></span><span id="blk"></span></div></div>
<script>
  const WORD = ${JSON.stringify(WORD)};
  window.__set = (len, on) => {
    document.getElementById("txt").textContent = WORD.slice(0, len);
    document.getElementById("blk").style.opacity = on ? "1" : "0";
  };
</script></body></html>`;
}

// endcap 씬만 별도 mp4로 렌더한다(body와 동일 encodeArgs여야 무손실 concat 가능).
export async function renderPromoEndcap(opts: {
  outPath: string;
  width: number;
  height: number;
  fps: number;
  outDir: string;
  encodeArgs: string[];
  // 본편 마지막 프레임에서 실측한 배경색. Chrome 스크린캐스트를 거치면
  // --bg(#fdfaf3)가 살짝 어둡게 인코딩돼서(2026-08-18 실측 #f8f4ec) 토큰값을
  // 그대로 쓰면 이음매에서 배경이 한 번 튄다. 못 재면 토큰값으로 폴백.
  bg?: string;
}): Promise<{ durationSec: number }> {
  const { outPath, width, height, fps, outDir, encodeArgs } = opts;
  const bg = opts.bg || CREAM;
  let seed = 0;
  for (const c of WORD) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const rand = mulberry32(seed || 1);

  // ── timeline: text length as a step function of time (endcap.ts와 동일 패턴) ──
  const times: number[] = [0];
  const lens: number[] = [0];
  let t = LEAD_SEC;
  for (let i = 1; i <= WORD.length; i++) {
    times.push(t); lens.push(i);
    t += (TYPE_MIN_MS + rand() * TYPE_JIT_MS) / 1000;
  }
  t += HOLD_FULL_SEC;
  for (let i = WORD.length - 1; i >= 1; i--) {
    times.push(t); lens.push(i);
    t += (ERASE_MIN_MS + rand() * ERASE_JIT_MS) / 1000;
  }
  const tLand = times[times.length - 1]; // 지워져서 "n"까지 온 시점
  const capDur = tLand + LAND_BLINK_SEC + LAND_HOLD_SEC;

  const lenAt = (tt: number): number => {
    let len = 0;
    for (let i = 0; i < times.length; i++) { if (times[i] <= tt) len = lens[i]; else break; }
    return len;
  };
  const blinkAt = (tt: number): boolean => {
    if (tt >= tLand + LAND_BLINK_SEC) return true;
    const base = tt >= tLand ? tt - tLand : tt;
    return (base % BLINK_PERIOD_SEC) < BLINK_PERIOD_SEC / 2;
  };

  const framesDir = `${outDir}/promo-endcap-frames`;
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });
  const frameCount = Math.ceil(capDur * fps);

  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.setContent(sceneHtml(width, height, bg), { waitUntil: "load" });
    // 웹폰트는 best-effort — 오프라인/콜드면 ui-monospace 폴백으로 그대로 진행.
    await page.evaluate(() => Promise.race([
      (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready,
      new Promise((r2) => setTimeout(r2, 3000)),
    ]));

    const cache = new Map<string, string>();
    for (let f = 0; f < frameCount; f++) {
      const tt = f / fps;
      const key = `${lenAt(tt)}_${blinkAt(tt) ? 1 : 0}`;
      let statePath = cache.get(key);
      if (!statePath) {
        statePath = `${framesDir}/state_${key}.png`;
        const [len, on] = key.split("_");
        await page.evaluate(
          ([l, o]) => (window as unknown as { __set: (l: number, o: boolean) => void }).__set(l as number, o as boolean),
          [Number(len), on === "1"] as const,
        );
        // 크림 solid 배경(투명 아님 — body와 그대로 이어붙일 프레임이라 불투명해야 함).
        await page.screenshot({ path: statePath });
        cache.set(key, statePath);
      }
      await copyFile(statePath, `${framesDir}/f${String(f).padStart(6, "0")}.png`);
    }
    await ctx.close();
  } finally {
    await browser.close().catch(() => {});
  }

  const r = await run(
    "ffmpeg",
    ["-y", "-framerate", String(fps), "-i", `${framesDir}/f%06d.png`, "-t", capDur.toFixed(2), ...encodeArgs, "-movflags", "+faststart", outPath],
    { timeoutMs: 120_000 },
  );
  if (r.code !== 0) throw new Error(`promo endcap render failed (exit ${r.code}): ${r.stderr.slice(-500)}`);

  return { durationSec: capDur };
}

// body.mp4 뒤에 렌더된 endcap을 무손실 concat. 둘 다 동일 encodeArgs로
// 인코딩된 경우에만 안전(stream-copy라 파라미터가 다르면 깨진 파일이 나옴).
export async function concatWithEndcap(
  bodyPath: string,
  endcapPath: string,
  outPath: string,
  outDir: string,
): Promise<void> {
  const listPath = `${outDir}/promo-concat-list.txt`;
  await writeFile(listPath, `file '${bodyPath}'\nfile '${endcapPath}'\n`);
  const r = await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outPath], {
    timeoutMs: 60_000,
  });
  if (r.code !== 0) throw new Error(`promo concat failed (exit ${r.code}): ${r.stderr.slice(-500)}`);
}
