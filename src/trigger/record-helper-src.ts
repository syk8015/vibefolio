// Source string for the Playwright recorder that runs inside the E2B sandbox.
// Kept inline (not read from disk) so Trigger.dev bundles it with the task.
export const RECORD_HELPER_SRC = String.raw`// Run inside the E2B sandbox.
// Usage: node /tmp/record-helper.js <URL> <OUTPUT_DIR> <DURATION_SEC>
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const [, , URL, OUTPUT_DIR, DURATION_SEC_STR] = process.argv;
if (!URL || !OUTPUT_DIR || !DURATION_SEC_STR) {
  console.error("Usage: record-helper.js <URL> <OUTPUT_DIR> <DURATION_SEC>");
  process.exit(1);
}
const DURATION_MS = parseFloat(DURATION_SEC_STR) * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: OUTPUT_DIR, size: { width: 1920, height: 1080 } },
  });
  const page = await context.newPage();

  console.log("goto", URL);
  await page.goto(URL, { waitUntil: "load", timeout: 30000 });
  try {
    await page.waitForLoadState("networkidle", { timeout: 5000 });
  } catch {}

  // Next.js / React 등은 load 이벤트 후에 hydration / 폰트 / 애니메이션이
  // 돌기 시작함. 그동안 page는 거의 비어 보일 수 있어서 settle 시간 줌.
  try {
    await page.evaluate(() => document.fonts && document.fonts.ready);
  } catch {}
  await sleep(3000);

  // 디버그: 페이지에 실제로 뭐가 떠있는지 trigger 로그로 확인 가능하게.
  try {
    const diag = await page.evaluate(() => ({
      title: document.title,
      bodyLen: (document.body && document.body.innerText && document.body.innerText.length) || 0,
      sample: (document.body && document.body.innerText && document.body.innerText.slice(0, 200)) || "",
    }));
    console.log("page diag:", JSON.stringify(diag));
  } catch (e) {
    console.log("page diag failed:", String(e));
  }

  const start = Date.now();
  while (Date.now() - start < DURATION_MS) {
    await page.evaluate(() => window.scrollBy({ top: 200, behavior: "smooth" }));
    await sleep(1500);
  }

  const video = page.video();
  await context.close();
  await browser.close();

  if (!video) throw new Error("no video handle on page");
  const rawPath = await video.path();
  const finalPath = path.join(OUTPUT_DIR, "demo.webm");
  fs.renameSync(rawPath, finalPath);
  const stat = fs.statSync(finalPath);
  console.log(JSON.stringify({ path: finalPath, bytes: stat.size }));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
`;
