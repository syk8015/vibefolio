// Run inside the E2B sandbox.
// Usage: node /tmp/record-helper.js <URL> <OUTPUT_DIR> <DURATION_SEC>
// Output: <OUTPUT_DIR>/demo.webm (Playwright records webm; convert later with ffmpeg)
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
  await page.goto(URL, { waitUntil: "load", timeout: 30_000 });
  try {
    await page.waitForLoadState("networkidle", { timeout: 5_000 });
  } catch {}

  const start = Date.now();
  // Light scroll pulses to give the recording some motion.
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
