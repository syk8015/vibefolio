// Launch a REAL (headed) GPU-backed Chrome and pin its content viewport to an
// exact logical size at a fixed screen position, so the avfoundation crop is
// deterministic. Headed (not headless) is mandatory: only a real window gets
// the M5 Metal compositor — the whole point of moving capture local.
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright-core";
import { VIEW_W, VIEW_H, WINDOW_POSITION } from "./config";
import { sleep } from "./util";

export async function launchChromium(): Promise<Browser> {
  return chromium.launch({
    headless: false,
    channel: "chrome", // system Chrome; playwright-core ships no browser binary
    args: [
      `--window-position=${WINDOW_POSITION.x},${WINDOW_POSITION.y}`,
      // Generous height so the toolbar fits and innerHeight can still reach
      // VIEW_H; the exact size is set precisely via CDP after launch.
      `--window-size=${VIEW_W},${VIEW_H + 160}`,
      "--hide-scrollbars",
      "--disable-features=Translate,InfobarsBarsMessage",
      "--disable-infobars",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-session-crashed-bubble",
      "--disable-popup-blocking",
      // NOTE: do NOT add --headless / --use-gl=swiftshader — that kills the GPU
      // path and reintroduces the soft-compositor problems we left E2B to escape.
    ],
  });
}

// A cookies+localStorage snapshot (from context.storageState()), used to start
// the recording context on the same footing the explore pass reached (§4.6).
export type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

// Open a fresh context+page sized to the window (viewport:null => the OS window
// dictates the viewport, which is what we capture). Optionally seed it with a
// prior storageState snapshot.
export async function newRecordingPage(
  browser: Browser,
  storageState?: StorageState,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext(
    storageState ? { viewport: null, storageState } : { viewport: null },
  );
  const page = await context.newPage();
  await page.bringToFront();
  return { context, page };
}

// Pin the content area to exactly w×h logical px using CDP Browser.setWindowBounds.
// macOS reports outer/inner deltas (the toolbar/tab strip height); we set the
// window frame to target + that delta, then re-measure and converge.
export async function ensureExactViewport(
  browser: Browser,
  page: Page,
  w = VIEW_W,
  h = VIEW_H,
): Promise<{ iw: number; ih: number }> {
  const bs = await browser.newBrowserCDPSession();
  const ps = await page.context().newCDPSession(page);
  const { targetInfo } = (await ps.send("Target.getTargetInfo")) as {
    targetInfo: { targetId: string };
  };
  const { windowId } = (await bs.send("Browser.getWindowForTarget", {
    targetId: targetInfo.targetId,
  })) as { windowId: number };

  // Make sure it isn't maximized/fullscreen first.
  await bs.send("Browser.setWindowBounds", {
    windowId,
    bounds: { windowState: "normal" },
  });
  await sleep(80);

  let last = { iw: 0, ih: 0 };
  for (let i = 0; i < 4; i++) {
    const m = (await page.evaluate(() => ({
      iw: window.innerWidth,
      ih: window.innerHeight,
      ow: window.outerWidth,
      oh: window.outerHeight,
    }))) as { iw: number; ih: number; ow: number; oh: number };
    last = { iw: m.iw, ih: m.ih };
    if (Math.abs(m.iw - w) <= 1 && Math.abs(m.ih - h) <= 1) break;
    const dw = m.ow - m.iw; // horizontal chrome (≈0 on mac)
    const dh = m.oh - m.ih; // vertical chrome (toolbar + tab strip)
    await bs.send("Browser.setWindowBounds", {
      windowId,
      bounds: {
        left: WINDOW_POSITION.x,
        top: WINDOW_POSITION.y,
        width: Math.round(w + dw),
        height: Math.round(h + dh),
      },
    });
    await sleep(140);
  }
  return last;
}
