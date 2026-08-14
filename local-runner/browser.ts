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
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { VIEW_W, VIEW_H, WINDOW_POSITION, OUT_DIR } from "./config";
import { sleep, run } from "./util";

// Shared launch env + args for both the explore browser and the recording
// profile. LANGUAGE/LANG force English on the Linux path; the mac translate kill
// is the profile pref in ensureEnglishProfile (flags alone don't do it).
const ENGLISH_ENV = {
  ...process.env,
  LANGUAGE: "en_US:en",
  LANG: "en_US.UTF-8",
  LC_ALL: "en_US.UTF-8",
};

function baseChromeArgs(): string[] {
  // Escape hatch for a broken SYSTEM DNS resolver (e.g. a flaky phone hotspot whose
  // resolver stops answering on :53 while IP routing still works): set
  // NF_HOST_RESOLVER_RULES='MAP host 1.2.3.4' to resolve in-browser via a fixed IP,
  // no system change. Empty by default.
  const resolverRules = process.env.NF_HOST_RESOLVER_RULES;
  return [
    ...(resolverRules ? [`--host-resolver-rules=${resolverRules}`] : []),
    `--window-position=${WINDOW_POSITION.x},${WINDOW_POSITION.y}`,
    // Generous height so the toolbar fits and innerHeight can still reach VIEW_H;
    // the exact size is set precisely via CDP after launch.
    `--window-size=${VIEW_W},${VIEW_H + 160}`,
    "--hide-scrollbars",
    // Suppress the "지원되지 않는 명령줄 플래그(--no-sandbox)" warning infobar that
    // Playwright's persistent context triggers — it stole ~56px of window height
    // (viewport pinned to 692 instead of 720). --test-type is the canonical flag
    // for this and does not change sandboxing.
    "--test-type",
    "--disable-features=Translate,TranslateUI",
    "--lang=en-US",
    "--disable-infobars",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-session-crashed-bubble",
    "--disable-popup-blocking",
    // NOTE: do NOT add --headless / --use-gl=swiftshader — that kills the GPU
    // path and reintroduces the soft-compositor problems we left E2B to escape.
  ];
}

// Explore browser (NOT recorded): a plain launch is fine — the translate bubble
// only has to be gone from the *recorded* window, which uses the profile below.
export async function launchChromium(): Promise<Browser> {
  return chromium.launch({
    headless: false,
    channel: "chrome", // system Chrome; playwright-core ships no browser binary
    env: ENGLISH_ENV,
    args: baseChromeArgs(),
  });
}

// A disposable Chrome profile whose Preferences disable Translate and put English
// in the language list. The "영어/한국어" translate bubble is driven by the PROFILE
// language list (intl.accept_languages), NOT by --disable-features / --accept-lang
// — verified: Chrome received --disable-features=Translate yet still offered to
// translate on a Korean-locale macOS. A profile pref is the only reliable kill,
// and chromium.launch rejects --user-data-dir, so the recording pass must use
// launchPersistentContext with this profile. Wiped each run for clean footing.
function ensureEnglishProfile(): string {
  const dir = join(OUT_DIR, "chrome-profile");
  rmSync(dir, { recursive: true, force: true }); // clean state + no stale SingletonLock
  mkdirSync(join(dir, "Default"), { recursive: true });
  writeFileSync(
    join(dir, "Default", "Preferences"),
    JSON.stringify({
      translate: { enabled: false },
      translate_blocked_languages: ["en", "en-US"],
      intl: { accept_languages: "en-US,en", selected_languages: "en-US,en" },
      bookmark_bar: { show_on_all_tabs: false }, // no bookmark strip eating window height
    }),
  );
  writeFileSync(join(dir, "Local State"), JSON.stringify({ intl: { app_locale: "en-US" } }));
  return dir;
}

// Recording context: a headed, GPU-backed PERSISTENT context on the English
// profile (so the capture is translate-bubble-free), viewport:null so the real OS
// window dictates what avfoundation grabs. Seeds the explore pass's cookies for
// the same footing (§4.6). Capture-cleanliness (native-picker neuter) is installed
// before any navigation.
export async function launchRecordingContext(
  storageState?: StorageState,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await chromium.launchPersistentContext(ensureEnglishProfile(), {
    headless: false,
    channel: "chrome",
    viewport: null,
    locale: "en-US",
    env: ENGLISH_ENV,
    args: baseChromeArgs(),
    // Playwright suppresses the "controlled by automated test software" infobar on
    // a normal launch but NOT on a persistent context — left in, it stole ~56px of
    // window height (viewport pinned to 692 instead of 720). Drop the flag.
    ignoreDefaultArgs: ["--enable-automation"],
  });
  if (storageState?.cookies?.length) {
    await context.addCookies(storageState.cookies).catch(() => {});
  }
  const page = context.pages()[0] ?? (await context.newPage());
  await installCaptureCleanliness(context, page);
  await page.bringToFront();
  return { context, page };
}

// ── Capture-cleanliness guard (native-surface leakage) ────────────────────────
// A safety layer DISTINCT from the network write-blocking in safety.ts. The
// avfoundation screen-grab captures whatever OS window sits over the crop rect,
// so any *native* surface a page can summon — a file picker, a JS dialog — gets
// filmed. Excalidraw's "Open" (Cmd+O) uses the File System Access API
// (window.showOpenFilePicker), a real macOS picker Playwright can NOT intercept;
// it leaked the user's Documents into the demo. We neuter those APIs before any
// page script runs so the site falls back to a classic <input type=file> (which
// Playwright DOES intercept), then cancel any file chooser / dialog that opens.
//
// MUST ship as a STRING: esbuild wraps named functions with __name(...), which is
// undefined in-page and throws (same reason cursor.ts's OVERLAY_SRC is a string).
// Plain JS only, no backticks inside.
const NEUTER_NATIVE_PICKERS_SRC = `(() => {
  var names = ["showOpenFilePicker", "showSaveFilePicker", "showDirectoryPicker"];
  for (var i = 0; i < names.length; i++) {
    try { delete window[names[i]]; } catch (e) {}
    try { delete Window.prototype[names[i]]; } catch (e) {}
  }
})();`;

// Install on a context+page pair BEFORE any navigation. The addInitScript is on
// the context, so it re-runs on every page and every navigation within the take.
export async function installCaptureCleanliness(
  context: BrowserContext,
  page: Page,
): Promise<void> {
  await context.addInitScript({ content: NEUTER_NATIVE_PICKERS_SRC });
  // Classic <input type=file>: registering a filechooser listener makes Playwright
  // hold the native dialog. Do NOT setFiles([]) — an empty change event makes the
  // site's fallback read files[0]===undefined and crash with an in-app error modal
  // (excalidraw: "Symbol(fileNormalized)"). Leaving the chooser un-actioned keeps
  // the page's promise pending forever: nothing on screen, nothing to crash.
  page.on("filechooser", (fc) => {
    console.log(`[cleanliness] file chooser suppressed (left pending): ${fc.page().url().slice(0, 80)}`);
  });
  // alert/confirm/beforeunload are native surfaces too — dismiss, never film them.
  page.on("dialog", (d) => {
    d.dismiss().catch(() => {});
  });
}

// The avfoundation grab is cursor-less, but the PHYSICAL cursor still has side
// effects the crop can film: resting on the Dock pops the app-name tooltip (a
// "Tailscale" label leaked into a take's bottom-right), and menu-bar extras can
// tooltip too. Before capture, teleport it onto the browser's own chrome strip
// just above the content crop — inside our window, outside the filmed rect.
// CGWarpMouseCursorPosition emits no input events (no page hover, no tooltip
// tracking) and needs no Accessibility permission. Coordinates are logical
// (global display space). Non-fatal on failure.
const WARP_PY = [
  "import ctypes, sys",
  "cg = ctypes.CDLL('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics')",
  "class P(ctypes.Structure): _fields_ = [('x', ctypes.c_double), ('y', ctypes.c_double)]",
  "cg.CGWarpMouseCursorPosition.argtypes = [P]",
  "cg.CGWarpMouseCursorPosition(P(float(sys.argv[1]), float(sys.argv[2])))",
].join("\n");

export async function parkPhysicalCursor(x: number, y: number): Promise<void> {
  try {
    await run("python3", ["-c", WARP_PY, String(x), String(y)]);
    console.log(`[cleanliness] physical cursor parked at (${Math.round(x)}, ${Math.round(y)})`);
  } catch (e) {
    console.error("[cleanliness] cursor park failed (non-fatal):", (e as Error).message);
  }
}

// Same warp, but for a page whose window position we have to ask for: park the
// real cursor on the browser's own chrome strip, just above the content.
//
// This is not about tooltips (nothing is filmed yet during explore) — it is about
// INPUT. A physical cursor resting over the page makes Blink re-fire hover as a
// mousemove with buttons=0 whenever the DOM changes underneath it, and that ends a
// native <input type=range> drag mid-gesture: the slider takes the first step or
// two and then stops following. JS drag handlers (a kanban board's own mousemove
// listener) ignore the button state and never noticed, which is why takes showed
// cards moving fine while sliders "did nothing" and got pruned. Measured
// 2026-08-15 on the nookgym fixture: 4/36 drags died with the cursor on the page,
// 0/30 with it parked here.
export async function parkCursorOffPage(page: Page): Promise<void> {
  try {
    const g = (await page.evaluate(
      "({sx: window.screenX, sy: window.screenY, oh: window.outerHeight, ih: window.innerHeight, iw: window.innerWidth})",
    )) as { sx: number; sy: number; oh: number; ih: number; iw: number };
    await parkPhysicalCursor(g.sx + g.iw / 2, Math.max(8, g.sy + (g.oh - g.ih) - 35));
  } catch (e) {
    console.error("[cleanliness] cursor park failed (non-fatal):", (e as Error).message);
  }
}

// A cookies+localStorage snapshot (from context.storageState()), used to start
// the recording context on the same footing the explore pass reached (§4.6).
export type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

// Pin the content area to exactly w×h logical px using CDP Browser.setWindowBounds.
// macOS reports outer/inner deltas (the toolbar/tab strip height); we set the
// window frame to target + that delta, then re-measure and converge. The Browser.*
// commands go over a PAGE CDP session (not a browser-level one) so this works for
// the persistent recording context, which exposes no browser() object.
export async function ensureExactViewport(
  page: Page,
  w = VIEW_W,
  h = VIEW_H,
): Promise<{ iw: number; ih: number }> {
  const cdp = await page.context().newCDPSession(page);
  const { targetInfo } = (await cdp.send("Target.getTargetInfo")) as {
    targetInfo: { targetId: string };
  };
  const { windowId } = (await cdp.send("Browser.getWindowForTarget", {
    targetId: targetInfo.targetId,
  })) as { windowId: number };

  // Make sure it isn't maximized/fullscreen first.
  await cdp.send("Browser.setWindowBounds", {
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
    await cdp.send("Browser.setWindowBounds", {
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
  // Fail loud (audit B-C6): a viewport stuck off-size (Dock/display constraint
  // change) skews the crop AND every recorded coordinate — a silently mis-cropped
  // take costs an explore fee and ships garbage.
  if (Math.abs(last.iw - w) > 1 || Math.abs(last.ih - h) > 1) {
    throw new Error(
      `viewport did not converge to ${w}×${h} (got ${last.iw}×${last.ih}) — ` +
        "display/Dock constraints changed; aborting instead of filming a mis-cropped take",
    );
  }
  return last;
}
