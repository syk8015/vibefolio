// 무API 프로브 — 홍보 클립 촬영 페이지에서 **타이핑 도중 글꼴이 바뀌지 않는지**
// 확인한다. 웹폰트가 늦게 도착하면 이미 찍힌 글자가 fallback → 본폰트로 다시
// 그려지는데(FOUT), 영상에선 "글자가 휙 바뀌는" 것으로 보인다.
//
// 판별법: 글자 수가 그대로인데 h1 폭이 변하면 = 이미 찍힌 글자가 다시 그려진 것.
// 2026-08-18 실측 — 수리 전 prod는 9번째 글자쯤에서 277.0 → 275.7로 튀었다.
// 대상 URL은 PROMO_APP_URL(기본 prod). 로컬 검증은 PROMO_APP_URL=http://localhost:3000.
import { chromium } from "playwright-core";
import { PROMO_APP_URL } from "./config";

const TAG = '영역전개 — "로컬에선 됐는데"';

async function main() {
  const url = `${PROMO_APP_URL}/promo-record?promo=${encodeURIComponent(TAG)}&locale=ko&format=vertical`;
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const failures: string[] = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-promo-tagline-status]", { timeout: 15_000 });

    // 프리워밍이 실제로 쓰이는 스택(--font-serif = Hahmlet 계열)까지 덮는지.
    // **첫 글자가 찍힌 순간**에 재야 한다 — 마커는 프리워밍보다 먼저 뜬다.
    await page.waitForFunction(`(() => {
      var h1 = document.querySelector(".vf-logged-in-headline h1");
      return !!h1 && (h1.textContent || "").replace(/\u200b/g, "").trim().length > 0;
    })()`, { timeout: 20_000 });
    const serifReady = await page.evaluate(`(() => {
      var v = getComputedStyle(document.documentElement).getPropertyValue("--font-serif").trim();
      return !v || document.fonts.check("500 40px " + v, ${JSON.stringify(TAG)});
    })()`);
    if (!serifReady) failures.push("첫 글자가 찍히는 시점에 --font-serif 스택이 아직 안 준비됨");

    const seen = new Map<number, number>();
    for (let i = 0; i < 140; i++) {
      const m = (await page.evaluate(`(() => {
        var h1 = document.querySelector(".vf-logged-in-headline h1");
        if (!h1) return null;
        var t = (h1.textContent || "").replace(/\\u200b/g, "");
        return { n: t.length, w: h1.getBoundingClientRect().width };
      })()`)) as { n: number; w: number } | null;
      if (m && m.n > 0) {
        const prev = seen.get(m.n);
        if (prev === undefined) seen.set(m.n, m.w);
        else if (Math.abs(prev - m.w) > 0.3) {
          failures.push(`${m.n}자에서 폭이 ${prev.toFixed(1)} → ${m.w.toFixed(1)} 로 바뀜 = 글꼴 교체(FOUT)`);
          break;
        }
      }
      await page.waitForTimeout(40);
    }
    if (seen.size < 5) failures.push(`타이핑을 거의 못 봤음(관측 ${seen.size}단계) — 페이지/문구 확인 필요`);
    await ctx.close();
  } finally {
    await browser.close().catch(() => {});
  }

  if (failures.length) {
    console.error(`[probe-promo-font] FAIL (${failures.length})`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`[probe-promo-font] PASS — ${PROMO_APP_URL} 타이핑 중 글꼴 교체 없음`);
}
await main();
