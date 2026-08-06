// Private-network guard for the explore/recording browser (host-security audit
// item 4). The pipeline navigates USER-PROVIDED urls from the user's home LAN:
// a page that iframes/fetches localhost, 192.168.*, or the router admin page
// would film that content straight into a PUBLIC video. lib/ssrf.ts guards
// server-side fetches only — browser navigation needs its own gate, at the
// page.route level, covering main frame + iframes + subresources alike.
//
// Verdicts reuse lib/ssrf's isBlockedIp so the browser gate and the server gate
// can never disagree on what "private" means. Hostnames are resolved here
// (getaddrinfo also normalises decimal/hex IP notations), literal IPs checked
// directly, and LAN-only name suffixes (.local, .home.arpa, …) blocked outright.
//
// Known residual gaps — accepted, documented in the host-security memory:
//  - Playwright routes don't re-intercept server redirect hops (public URL
//    302→private slips the request-level check; main-frame landings are still
//    caught by assertFinalUrlPublic below).
//  - WebSockets: name/literal-level check only (async DNS inside routeWebSocket
//    risks eating first messages of legit sockets) + verdicts cached by earlier
//    http requests from the same host.
//  - DNS rebinding TOCTOU between our lookup and Chrome's own resolution.
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { isBlockedIp } from "../lib/ssrf";
import type { Page } from "playwright-core";

// hostname → { block reason (null = public), expiry }. TTL-bounded: pinning a
// verdict forever only helps in the private→public direction; a DNS-rebinding
// record that resolves public ONCE would otherwise be trusted for the whole
// (days-long) worker process. A short TTL forces re-resolution.
const VERDICT_TTL_MS = 120_000;
type Verdict = { reason: string | null; expires: number };
const verdictCache = new Map<string, Verdict>();

function stripBrackets(host: string): string {
  return host.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
}

// Synchronous layer: names that are LAN-only by construction + literal IPs.
function nameBlockReason(hostRaw: string): string | null {
  const host = stripBrackets(hostRaw);
  if (host === "localhost" || host.endsWith(".localhost")) return "localhost";
  if (host.endsWith(".local") || host.endsWith(".home.arpa") || host.endsWith(".internal")) {
    return "LAN-only name";
  }
  const family = isIP(host);
  if (family && isBlockedIp(host, family)) return "private/reserved address";
  return null;
}

// Full verdict: sync layer, then DNS — every resolved address must be public.
export async function hostBlockReason(hostRaw: string): Promise<string | null> {
  const host = stripBrackets(hostRaw);
  const byName = nameBlockReason(host);
  if (byName) return byName;
  if (isIP(host)) return null; // literal, already cleared above
  const cached = verdictCache.get(host);
  if (cached && cached.expires > Date.now()) return cached.reason;
  let reason: string | null = null;
  let resolved = false;
  try {
    const addrs = await lookup(host, { all: true });
    resolved = true;
    for (const a of addrs) {
      if (isBlockedIp(a.address, a.family)) {
        reason = `resolves to ${a.address}`;
        break;
      }
    }
  } catch {
    // Fail CLOSED. The old code let a DNS error through, but an attacker only needs
    // OUR resolver to fail while Chrome's own lookup succeeds (a host that answers
    // Chrome's query pattern with a LAN IP and times out ours) — then the router /
    // NAS admin page films into a public video. A genuinely unresolvable host
    // produces a dead take anyway, so failing closed costs nothing real.
    reason = "dns resolution failed";
  }
  // Only cache a verdict we actually resolved, with a TTL. A fail-closed block from a
  // transient DNS error is NOT cached, so a real host recovers on the next request
  // instead of being stuck blocked for the process lifetime.
  if (resolved) verdictCache.set(host, { reason, expires: Date.now() + VERDICT_TTL_MS });
  return reason;
}

export async function installNetGuard(page: Page): Promise<void> {
  // Registered AFTER the write-mock route in installSafety → runs FIRST
  // (Playwright runs handlers newest-first); fallback() hands allowed requests
  // down to the write-mock layer (or default continue when there is none).
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return route.abort("blockedbyclient");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return route.fallback();
    const reason = await hostBlockReason(parsed.hostname);
    if (reason) {
      console.error(`[netguard] BLOCKED ${route.request().method()} ${url.slice(0, 100)} — ${reason}`);
      return route.abort("blockedbyclient");
    }
    return route.fallback();
  });

  // WebSockets bypass page.route entirely. Sync check only (see header): the
  // verdictCache usually already holds the DNS verdict because the page loaded
  // http(s) resources from the same host first.
  await page.routeWebSocket(/./, (ws) => {
    let host: string;
    try {
      host = new URL(ws.url()).hostname;
    } catch {
      return; // unparsable → never connect upstream
    }
    const cachedWs = verdictCache.get(stripBrackets(host));
    const cachedReason = cachedWs && cachedWs.expires > Date.now() ? cachedWs.reason : null;
    const reason = nameBlockReason(host) ?? cachedReason;
    if (reason) {
      console.error(`[netguard] BLOCKED websocket ${ws.url().slice(0, 100)} — ${reason}`);
      return; // no connectToServer → page-side socket stays dead
    }
    ws.connectToServer();
  });
}

// Continuous redirect-hop guard for the DURATION of a take. assertFinalUrlPublic
// is point-in-time (nav settle); but page JS can, mid-recording, navigate to a
// public URL that 302s into the LAN — page.route never sees the redirect hop, so
// the router page films into the take. Latch any frame that navigates to a
// private/LAN host; the caller checks breached() before uploading and refuses.
export function watchLanBreach(page: Page): () => string | null {
  let breach: string | null = null;
  page.on("framenavigated", (frame) => {
    let host: string;
    try {
      host = new URL(frame.url()).hostname;
    } catch {
      return; // about:blank etc.
    }
    if (!host) return;
    void hostBlockReason(host)
      .then((reason) => {
        if (reason && !breach) {
          breach = `${frame.url().slice(0, 100)} — ${reason}`;
          console.error(`[netguard] LAN breach during take: ${breach}`);
        }
      })
      .catch(() => {});
  });
  return () => breach;
}

// Redirect-hop closure for the MAIN document: routes don't see server redirect
// hops, so a public URL can 302 into the LAN and the request-level guard never
// fires. Called after navigation settles — a private landing kills the take
// before any frame of it is recorded.
export async function assertFinalUrlPublic(page: Page): Promise<void> {
  const seen = new Set<string>();
  for (const frame of page.frames()) {
    let host: string;
    try {
      host = new URL(frame.url()).hostname;
    } catch {
      continue; // about:blank etc.
    }
    if (!host || seen.has(host)) continue;
    seen.add(host);
    const reason = await hostBlockReason(host);
    if (reason) {
      throw new Error(
        `netguard: page landed on a private/LAN address after redirects (${frame.url().slice(0, 100)} — ${reason}) — refusing to record`,
      );
    }
  }
}
