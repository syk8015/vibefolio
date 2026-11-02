// No-API probe: netguard blocks private/LAN destinations in the demo browser
// (host-security audit item 4). Launches headless system Chrome with the REAL
// installSafety stack (read-only policy = write-mock + netguard) and asserts
// each leak vector against a live local "victim" server whose hit counter must
// stay at zero. No Anthropic/E2B/Supabase usage.
//
//   npx tsx local-runner/probe-netguard.ts
import { createServer } from "node:http";
import { chromium } from "playwright-core";
import { installSafety } from "./safety";
import { assertFinalUrlPublic, hostBlockReason, watchLanBreach } from "./netguard";

const VICTIM_PORT = 8931;

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? `  (${detail})` : ""}`);
  ok ? pass++ : fail++;
}

// LAN victim: if ANY guarded request reaches it, the guard failed.
let victimHits = 0;
const victimPaths: string[] = [];
const victim = createServer((req, res) => {
  victimHits++;
  victimPaths.push(req.url ?? "");
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end("<h1>LEAKED-LAN-CONTENT</h1>");
});
await new Promise<void>((r) => victim.listen(VICTIM_PORT, "127.0.0.1", r));

// ── 1) verdict unit spots (no browser) ──────────────────────────────────────
for (const [host, blocked] of [
  ["localhost", true],
  ["api.localhost", true],
  ["192.168.1.1", true],
  ["10.0.0.5", true],
  ["172.16.0.1", true],
  ["169.254.169.254", true],
  ["100.64.0.1", true],
  ["[::1]", true],
  ["printer.local", true],
  ["router.home.arpa", true],
  ["127.0.0.1.nip.io", true], // public DNS name → loopback (rebinding-style)
  ["example.com", false],
  ["8.8.8.8", false],
] as const) {
  const reason = await hostBlockReason(host);
  check(`verdict ${host} → ${blocked ? "blocked" : "allowed"}`, blocked ? reason !== null : reason === null, reason ?? "public");
}

// ── 2) browser-level vectors ────────────────────────────────────────────────
const errors: string[] = [];
const origError = console.error;
console.error = (...a: unknown[]) => {
  errors.push(a.map(String).join(" "));
  origError(...a);
};

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const ctx = await browser.newContext();
const page = await ctx.newPage();
await installSafety(page, "read-only");

// public navigation still works
await page.goto("https://example.com", { waitUntil: "domcontentloaded", timeout: 30000 });
check("public navigation allowed", (await page.title()).length > 0, await page.title());

// subresource fetch → loopback
const fetchResult = await page.evaluate(async (port) => {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/steal`);
    return `reached: ${r.status}`;
  } catch (e) {
    return `blocked: ${String(e)}`;
  }
}, VICTIM_PORT);
check("fetch to 127.0.0.1 blocked", fetchResult.startsWith("blocked"), fetchResult);

// subresource fetch → RFC1918 (no server there; must abort BEFORE connect, so
// it fails fast instead of hanging on an unroutable address)
const lanFetch = await page.evaluate(async () => {
  try {
    const r = await fetch("http://192.168.255.254/", { signal: AbortSignal.timeout(5000) });
    return `reached: ${r.status}`;
  } catch (e) {
    return `blocked: ${String(e)}`;
  }
});
check("fetch to 192.168.255.254 blocked", lanFetch.startsWith("blocked"), lanFetch.slice(0, 60));

// iframe → loopback (the actual "films the router page" vector)
await page.evaluate((port) => {
  const f = document.createElement("iframe");
  f.src = `http://127.0.0.1:${port}/frame`;
  document.body.appendChild(f);
}, VICTIM_PORT);
await page.waitForTimeout(1500);
const frameLeaked = page.frames().some((f) => f.url().includes(String(VICTIM_PORT)));
const frameContent = await page.evaluate(() => {
  const f = document.querySelector("iframe");
  try {
    return f?.contentDocument?.body?.innerText ?? "";
  } catch {
    return "(cross-origin)";
  }
});
check("iframe to loopback blocked", !frameContent.includes("LEAKED"), frameLeaked ? "frame url present but empty" : "no frame");

// main-frame navigation → public DNS name resolving to loopback (nip.io):
// the job.ts literal check alone MISSES this — netguard's DNS layer must catch
// it at the route level. goto (not fetch) so Chrome's mixed-content rules
// can't mask the result.
const nipNav = await page.goto(`http://127.0.0.1.nip.io:${VICTIM_PORT}/dns-steal`, { timeout: 15000 }).then(
  () => "navigated",
  (e) => String(e),
);
check(
  "goto via nip.io (DNS→loopback) blocked",
  nipNav.includes("ERR_BLOCKED_BY_CLIENT") && errors.some((e) => e.includes("resolves to 127.0.0.1")),
  nipNav.slice(0, 70),
);

// main-frame navigation → localhost
const navErr = await page.goto(`http://localhost:${VICTIM_PORT}/`, { timeout: 10000 }).then(
  () => "navigated",
  (e) => String(e),
);
check("goto localhost blocked", navErr.includes("ERR_BLOCKED_BY_CLIENT"), navErr.slice(0, 80));
// recover onto a public page for the remaining cases; the blocked goto leaves a
// chrome-error page that can race the next navigation → settle + retry once
await page.waitForTimeout(600);
await page
  .goto("https://example.com", { waitUntil: "domcontentloaded", timeout: 30000 })
  .catch(() => page.goto("https://example.com", { waitUntil: "domcontentloaded", timeout: 30000 }));

// write-mock still active UNDER netguard (fallback chain intact)
const mock = await page.evaluate(async () => {
  const r = await fetch("https://example.com/api/thing", { method: "POST", body: "{}" });
  return r.json();
});
check("write-mock fallback chain intact", mock?.ok === true && String(mock?.id ?? "").startsWith("mock_"), JSON.stringify(mock));

// websocket → loopback (bypasses page.route; routeWebSocket layer)
await page.evaluate((port) => new Promise<void>((resolve) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  ws.onopen = () => resolve();
  ws.onerror = () => resolve();
  setTimeout(resolve, 2000);
}), VICTIM_PORT);
check("websocket to loopback blocked", errors.some((e) => e.includes("BLOCKED websocket")), errors.filter((e) => e.includes("websocket")).slice(-1).join("") || "no netguard ws log");

// ── popups (audit-8 B4): window.open makes a NEW page — the guard lives on the
// context, so the popup's very first request is already covered.
const popupDirect = await Promise.all([
  ctx.waitForEvent("page", { timeout: 5000 }),
  page.evaluate((port) => { window.open(`http://127.0.0.1:${port}/popup`); }, VICTIM_PORT),
]).then(async ([p]) => {
  await p.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
  const body = await p.evaluate(() => document.body?.innerText ?? "").catch(() => "");
  await p.close();
  return body.includes("LEAKED") ? "leaked" : "not shown";
}, (e) => `no popup: ${String(e).slice(0, 60)}`);
check("popup opened straight at loopback blocked", !victimPaths.includes("/popup") && errors.some((e) => e.includes("BLOCKED") && e.includes("/popup")), popupDirect);

const popupNoopener = await Promise.all([
  ctx.waitForEvent("page", { timeout: 5000 }),
  page.evaluate(() => { window.open("http://192.168.255.254/noopener-popup", "_blank", "noopener"); }),
]).then(async ([p]) => {
  await p.waitForTimeout(800);
  const u = p.url();
  await p.close();
  return u;
}, (e) => `no popup: ${String(e).slice(0, 60)}`);
check("noopener popup to LAN blocked", errors.some((e) => e.includes("BLOCKED") && e.includes("noopener-popup")), popupNoopener.slice(0, 60));

// a public popup that then reaches into the LAN from inside
const pub = await Promise.all([
  ctx.waitForEvent("page", { timeout: 5000 }),
  page.evaluate(() => { window.open("https://example.com/"); }),
]).then(([p]) => p);
await pub.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
const popupFetch = await pub.evaluate(async (port) => {
  try { const r = await fetch(`http://127.0.0.1:${port}/from-popup`); return `reached: ${r.status}`; }
  catch (e) { return `blocked: ${String(e)}`; }
}, VICTIM_PORT);
// The netguard log is the proof — https→http fetches also die on Chrome's own
// mixed-content rule, which would pass this check without us.
check("fetch from inside a public popup to loopback blocked", !victimPaths.includes("/from-popup") && errors.some((e) => e.includes("BLOCKED") && e.includes("/from-popup")), popupFetch.slice(0, 60));
const popupMock = await pub.evaluate(async () => {
  const r = await fetch("https://example.com/api/thing", { method: "POST", body: "{}" });
  return r.json();
}).catch((e) => ({ err: String(e) }));
check("write-mock also covers popups", String((popupMock as { id?: string }).id ?? "").startsWith("mock_"), JSON.stringify(popupMock).slice(0, 60));
await pub.evaluate((port) => new Promise<void>((resolve) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws-popup`);
  ws.onopen = () => resolve(); ws.onerror = () => resolve(); setTimeout(resolve, 2000);
}), VICTIM_PORT);
check("websocket from popup blocked", errors.some((e) => e.includes("BLOCKED websocket") && e.includes("ws-popup")));
await pub.close();

check("victim server hits = 0", victimHits === 0, `${victimHits} hits`);

// ── 3) assertFinalUrlPublic (redirect-landing closure) ──────────────────────
// Simulated: an UNGUARDED page that ended up on the LAN (what a redirect hop
// produces, since Playwright routes don't re-intercept hops).
// Own context — the guarded ctx above would (correctly) block the landing.
const rawCtx = await browser.newContext();
const rawPage = await rawCtx.newPage();
await rawPage.goto(`http://127.0.0.1:${VICTIM_PORT}/landed`, { timeout: 10000 });
const landedVerdict = await assertFinalUrlPublic(rawPage).then(
  () => "passed (BAD)",
  (e) => String(e),
);
check("assertFinalUrlPublic rejects LAN landing", landedVerdict.includes("refusing to record"), landedVerdict.slice(0, 90));
await rawCtx.close();

// A popup that slipped onto the LAN (e.g. a redirect hop) must fail the take too:
// both the end-of-take check and the mid-take latch look at every page.
const popCtx = await browser.newContext();
const opener = await popCtx.newPage();
const breached = watchLanBreach(opener);
const [lanPopup] = await Promise.all([
  popCtx.waitForEvent("page"),
  opener.evaluate((port) => { window.open(`http://127.0.0.1:${port}/popup-landed`); }, VICTIM_PORT),
]);
await lanPopup.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 300));
const popVerdict = await assertFinalUrlPublic(opener).then(() => "passed (BAD)", (e) => String(e));
check("assertFinalUrlPublic sees a LAN popup", popVerdict.includes("refusing to record"), popVerdict.slice(0, 90));
check("watchLanBreach latches a LAN popup", (breached() ?? "").includes("127.0.0.1"), breached() ?? "no breach");
await popCtx.close();

console.error = origError;
await browser.close();
victim.close();

console.log(`\n=== netguard probe: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
