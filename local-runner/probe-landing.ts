// No-API sanity check for the new landing fixture, run BEFORE spending an explore
// fee: the A-2 take is only a real test if the tab click is visually SILENT for
// longer than the old single 600ms re-check and visibly different inside the new
// 600ms × 4 poll window. Pixel-identical screenshots are the strict form of
// "the pruner would have seen no change".
import { launchChromium } from "./browser";

const URL = "http://localhost:5050/landing.html";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (ok: boolean, msg: string) => { ok ? pass++ : fail++; console.log(`${ok ? "✓" : "✗"} ${msg}`); };

const browser = await launchChromium();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: "en-US" });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: "networkidle" });

// The tabs live below the fold — same place explore reaches them after scrolling.
await page.locator('[data-testid="tab-teams"]').scrollIntoViewIfNeeded();
await sleep(400);

const shot = () => page.screenshot({ type: "png" });
const before = await shot();
check((await shot()).equals(before), "idle page is pixel-stable (no ambient animation)");

await page.locator('[data-testid="tab-teams"]').click();
const at600 = await (async () => { await sleep(600); return shot(); })();
check(at600.equals(before), "600ms after the click: pixel-identical (old single re-check would PRUNE)");

const at1200 = await (async () => { await sleep(600); return shot(); })();
check(!at1200.equals(before), "1200ms after the click: changed (new poll window KEEPS it)");

const title = await page.locator('[data-testid="panel-title"]').textContent();
check(title === "Everyone on the same program", `panel actually switched → "${title}"`);
check(
  (await page.locator('[data-testid="tab-teams"]').getAttribute("aria-selected")) === "true",
  "clicked tab is the selected one",
);

// The instant controls must NOT be silent — otherwise the whole page reads as
// dead and the A-2 signal can't be attributed to the tabs.
const beforePrice = await shot();
await page.locator('[data-testid="billing-yearly"]').click();
await sleep(250);
check(!(await shot()).equals(beforePrice), "pricing toggle changes pixels immediately (contrast control)");

const beforeFaq = await shot();
await page.locator('[data-testid="faq-2"] button').click();
await sleep(250);
check(!(await shot()).equals(beforeFaq), "FAQ accordion changes pixels immediately (contrast control)");

// No app UI anywhere: this is the landing-only pole for the coverage read.
for (const sel of [".kanban", "[role=slider]", "input[type=range]", ".board"]) {
  check((await page.locator(sel).count()) === 0, `no app-UI element on the landing: ${sel}`);
}

await browser.close();
console.log(`\n${fail === 0 ? "ALL PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
