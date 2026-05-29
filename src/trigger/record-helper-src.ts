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
const FONT_WAIT_MS = 8000;
const CONTENT_WAIT_MS = 12000;
const MIN_VISIBLE_CHARS = 20;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: OUTPUT_DIR, size: { width: 1920, height: 1080 } },
  });
  const page = await context.newPage();

  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e && e.message ? e.message : e)));

  console.log("goto", URL);
  await page.goto(URL, { waitUntil: "load", timeout: 30000 });
  try {
    await page.waitForLoadState("networkidle", { timeout: 8000 });
  } catch {}

  // Bounded wait for the target's webfonts. Many pages gate their visible
  // content on document.fonts.ready (e.g. typed headlines that refuse to
  // paint until fonts resolve); if a font stalls we still want to proceed.
  await page
    .evaluate(
      (ms) =>
        Promise.race([
          (document.fonts && document.fonts.ready) || Promise.resolve(),
          new Promise((r) => setTimeout(r, ms)),
        ]),
      FONT_WAIT_MS,
    )
    .catch(() => {});

  // Wait until something is actually on screen. innerText respects
  // visibility:hidden / display:none, so reveal-on-scroll and typing
  // animations only count once they've truly painted. Capped.
  const contentDeadline = Date.now() + CONTENT_WAIT_MS;
  let visibleChars = 0;
  while (Date.now() < contentDeadline) {
    visibleChars = await page.evaluate(
      () => (document.body && document.body.innerText ? document.body.innerText.trim().length : 0),
    );
    if (visibleChars >= MIN_VISIBLE_CHARS) break;
    await sleep(500);
  }

  const pageInfo = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));

  // Gentle top->bottom scroll clamped to the real page height, easing to ~85%
  // and resting there — so the final frames sit on content instead of empty
  // void past the end of the page.
  const maxScroll = Math.max(0, pageInfo.scrollHeight - pageInfo.innerHeight);
  const start = Date.now();
  while (Date.now() - start < DURATION_MS) {
    const t = (Date.now() - start) / DURATION_MS;
    const target = maxScroll * Math.min(0.85, t);
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "smooth" }), target);
    await sleep(700);
  }

  const video = page.video();
  await context.close();
  await browser.close();

  if (!video) throw new Error("no video handle on page");
  const rawPath = await video.path();
  const finalPath = path.join(OUTPUT_DIR, "demo.webm");
  fs.renameSync(rawPath, finalPath);
  const stat = fs.statSync(finalPath);
  console.log(
    JSON.stringify({
      path: finalPath,
      bytes: stat.size,
      visibleChars,
      scrollHeight: pageInfo.scrollHeight,
      pageErrors: pageErrors.slice(0, 5),
    }),
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
`;
