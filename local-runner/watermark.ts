// 영상 워터마크 (2026-09-01, "작품 보호" 2축 — 도난 방지).
//
// 왜: 데모 영상 본문에는 출처 표식이 하나도 없었다. 엔드캡(마지막 로고)은
// 뒤를 잘라내면 그만이라, 영상이 퍼지는 순간 "누구 작품인지"가 사라진다.
// 그래서 프레임 내내 따라다니는 작은 핸들 표식을 넣는다.
//
// 무엇을 보이나 = **유저 핸들만**(`@username`). 서비스 이름은 넣지 않는다
// (2026-09-01 사용자 확정) — 목적이 홍보가 아니라 작품 귀속이기 때문.
//
// 왜 PNG인가: 이 맥의 ffmpeg에는 libfreetype이 없어 `drawtext`를 못 쓴다.
// 엔드캡이 이미 헤드리스 크롬으로 투명 PNG를 굽고 overlay로 얹는 방식이라
// 그 배선을 그대로 쓴다. 프레임 전체 크기로 굽고 `overlay=0:0`으로 얹으므로
// ffmpeg 쪽에 좌표 계산이 없다(엔드캡과 동일).
//
// 어디에 얹나: postprocess의 **body 인코드**. 그 패스는 엔드캡 성패와 무관하게
// 무조건 돌고, 포스터도 body에서 뽑으므로 썸네일에도 같은 표식이 남는다.
import { chromium } from "playwright-core";

const CREAM = "#f4ede0"; // 브랜드 잉크 2종 중 밝은 쪽(app/globals.css)

// 프레임 높이 대비 글자 크기. 엔드캡 워드마크가 0.05인데 그건 "서명"이고
// 이건 "각인"이라 눈에 걸리지 않을 만큼만 — 720p에서 약 16px.
const FONT_FRAC = 0.022;
const MARGIN_FRAC = 0.028; // 우하단 여백(높이 기준)

// 밝은 앱 위에서도 읽히도록 어두운 반투명 알약을 깐다. 엔드캡처럼 프레임 밝기를
// 재서 잉크를 고르는 방법도 있지만, 워터마크는 **움직이는 화면 내내** 떠 있다 —
// 한 장의 평균 밝기로 정하면 화면이 스크롤되는 순간 틀린 색이 된다. 알약은
// 배경이 무엇이든 한 가지 코드로 읽힌다.
//
// 알파 0.55의 근거(0.30에서 올림): 흰 배경(255)에 깔면 알약이 ~129가 되어 크림
// 글자(244)와 대비가 확실히 선다. 0.30에서는 알약이 ~186이라 크림 글자가 묻혔다
// (2026-09-01 육안 확인). 어두운 앱에서는 알약이 배경에 가깝게 사라지고 글자만 남는다.
const PILL_BG = "rgba(26,22,18,0.55)";
const TEXT_ALPHA = 0.9;

function watermarkHtml(handle: string, w: number, h: number): string {
  const esc = handle.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fontPx = Math.max(10, Math.round(h * FONT_FRAC));
  const margin = Math.round(h * MARGIN_FRAC);
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;background:transparent}
  #frame{width:${w}px;height:${h}px;position:relative}
  #mark{position:absolute;right:${margin}px;bottom:${margin}px;
    font-family:'JetBrains Mono',ui-monospace,'SF Mono',Menlo,monospace;
    font-weight:500;font-size:${fontPx}px;letter-spacing:-0.01em;line-height:1;
    color:${CREAM};opacity:${TEXT_ALPHA};
    background:${PILL_BG};padding:${Math.round(fontPx * 0.42)}px ${Math.round(fontPx * 0.7)}px;
    border-radius:${Math.round(fontPx * 0.62)}px;white-space:pre}
</style></head><body>
<div id="frame"><span id="mark">${esc}</span></div>
</body></html>`;
}

/** 투명 PNG 한 장을 구워 경로를 돌려준다. 프레임과 같은 크기라 `overlay=0:0`.
 * 실패하면 던진다 — 호출부가 워터마크 없이 진행할지 정한다(촬영을 죽이지 않는다). */
export async function renderWatermark(opts: {
  handle: string; // "@username"
  width: number;
  height: number;
  outDir: string;
}): Promise<string> {
  const { handle, width, height, outDir } = opts;
  const outPath = `${outDir}/watermark.png`;
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.setContent(watermarkHtml(handle, width, height), { waitUntil: "load" });
    // 웹폰트는 best-effort — 오프라인/콜드 런에서도 ui-monospace 폴백으로 찍힌다.
    await page.evaluate(() => Promise.race([
      (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready,
      new Promise((r) => setTimeout(r, 3000)),
    ]));
    await page.screenshot({ path: outPath, omitBackground: true });
    await ctx.close();
  } finally {
    await browser.close().catch(() => {});
  }
  return outPath;
}
