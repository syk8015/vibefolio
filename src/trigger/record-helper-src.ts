// Source string for the Playwright recorder that runs inside the E2B sandbox.
// Kept inline (not read from disk) so Trigger.dev bundles it with the task.
//
// Primary mode: a Claude *computer use* agent loop drives the open app —
// clicking, typing, scrolling — so the demo shows the product actually being
// used, not just scrolled past. Needs ANTHROPIC_API_KEY in the process env
// (injected by the task via `envs`). If the key is missing or the loop errors,
// it falls back to the original gentle top->bottom scroll so a video is always
// produced.
export const RECORD_HELPER_SRC = String.raw`// Run inside the E2B sandbox.
// Usage: node /tmp/record-helper.js <URL> <OUTPUT_DIR> <DURATION_SEC>
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const [, , URL, OUTPUT_DIR, DURATION_SEC_STR] = process.argv;
if (!URL || !OUTPUT_DIR || !DURATION_SEC_STR) {
  console.error("Usage: record-helper.js <URL> <OUTPUT_DIR> <DURATION_SEC>");
  process.exit(1);
}
const DURATION_MS = parseFloat(DURATION_SEC_STR) * 1000;
const FONT_WAIT_MS = 8000;
const CONTENT_WAIT_MS = 12000;
const MIN_VISIBLE_CHARS = 20;

// Computer-use accuracy degrades at high resolution and the demo only ever
// plays in a small Theater card, so capture at WXGA (Anthropic's recommended
// max for the computer tool). Coordinates then map 1:1 to Playwright.
const VIEW_W = 1280;
const VIEW_H = 800;

// --- Headed capture (Xvfb + ffmpeg x11grab) ------------------------------
// We render headed Chromium onto a virtual X display and screen-grab it at a
// real 60fps. Headless Playwright recordVideo only captured ~4.5 unique fps
// (Chromium repaints on-demand in headless), which looked choppy. The Xvfb
// display is VIEW_H + the browser toolbar tall; we grab only the content
// region below the toolbar so the toolbar never shows in the video.
const DISPLAY = process.env.DISPLAY || ":99";
const DISPLAY_H = parseInt(process.env.DEMO_DISPLAY_H || "887", 10);
const CAPTURE_FPS = 60;

// --- Computer use config -------------------------------------------------
const API_KEY = process.env.ANTHROPIC_API_KEY || "";
// Computer use is NOT supported on the newest 4.6/4.8 models (the API rejects
// the computer_20250124 tool for them). The latest computer-use-capable Sonnet
// is 4.5 — keep this here, override via DEMO_CU_MODEL if needed.
const MODEL = process.env.DEMO_CU_MODEL || "claude-sonnet-4-5";
const CU_MAX_STEPS = 10;        // hard cap on agent turns (cost guard)
const CU_MAX_MS = 90000;        // wall-clock budget for the interaction (cinematics included)
const ACTION_PACING_MS = 200;   // execAction now self-paces the cinematics; small extra dwell

const SYSTEM_PROMPT = [
  "You are operating a web app inside a browser to record a short, attractive product demo video.",
  "The app is already open. Your goal: in a handful of deliberate actions, exercise the app's most",
  "visually interesting primary feature so a viewer instantly understands what it does.",
  "",
  "Rules:",
  "- Stay on this app. Never navigate to external sites, never open new tabs, never touch the URL bar.",
  "- Prefer actions that visibly change the screen: click buttons, open menus/modals, switch tabs,",
  "  toggle views, type into a short demo input, drag a slider.",
  "- Do NOT perform destructive or irreversible actions (delete, purchase, pay, sign out, send a real",
  "  message). If a form looks like sign-up / login / payment, skip it and show something else.",
  "- One clear, unhurried action at a time.",
  "- Be economical: after roughly 5-7 meaningful actions, or once you've shown the core feature well,",
  "  stop by ending your turn without any tool call. Do not pad with extra steps.",
  "- If the screen is mostly static marketing text, scroll to reveal more, then interact with any visible controls.",
].join("\n");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MODS = {
  ctrl: "Control", control: "Control", alt: "Alt", option: "Alt",
  shift: "Shift", super: "Meta", meta: "Meta", cmd: "Meta", command: "Meta",
};
function mapMod(m) {
  return MODS[String(m).toLowerCase()] || "";
}

// xdotool-style key names -> Playwright key names. Handles "ctrl+shift+a".
const NAMED_KEYS = {
  return: "Enter", enter: "Enter", tab: "Tab", escape: "Escape", esc: "Escape",
  backspace: "Backspace", delete: "Delete", del: "Delete", space: " ",
  up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight",
  page_up: "PageUp", page_down: "PageDown", prior: "PageUp", next: "PageDown",
  home: "Home", end: "End",
};
function mapKey(k) {
  const parts = String(k).split("+");
  const out = [];
  for (const raw of parts) {
    const p = raw.toLowerCase();
    if (MODS[p]) out.push(MODS[p]);
    else if (NAMED_KEYS[p]) out.push(NAMED_KEYS[p]);
    else out.push(raw);
  }
  return out.join("+");
}

async function shot(page) {
  const buf = await page.screenshot({ type: "png" });
  return buf.toString("base64");
}

// --- Cinematic camera layer ---------------------------------------------
// Headless Chromium renders no OS cursor, so a real click looks like "nothing
// happened". We inject a synthetic cursor + click ripple, and an Apple-ad-style
// camera that zooms toward each click. The trick that keeps clicks accurate
// while zoomed: set the page's transform-origin to the click point. That point
// is the fixed point of the scale transform, so the real page.mouse click at
// the same viewport coordinate still lands on the same element.
async function ensureCinema(page) {
  await page.evaluate(() => {
    if (window.__demoCam) return;
    var doc = document;
    var cur = doc.createElement("div");
    cur.id = "__demo_cursor";
    cur.style.cssText =
      "position:fixed;left:50%;top:50%;width:24px;height:24px;margin-left:-12px;" +
      "margin-top:-12px;border-radius:50%;background:rgba(15,15,20,0.22);" +
      "border:2px solid rgba(255,255,255,0.95);box-shadow:0 3px 10px rgba(0,0,0,0.4);" +
      "z-index:2147483647;pointer-events:none;will-change:left,top,transform;" +
      "transition:left 0.45s cubic-bezier(0.4,0,0.2,1),top 0.45s cubic-bezier(0.4,0,0.2,1),transform 0.12s ease;";
    var rip = doc.createElement("div");
    rip.id = "__demo_ripple";
    rip.style.cssText =
      "position:fixed;left:0;top:0;width:18px;height:18px;margin-left:-9px;margin-top:-9px;" +
      "border-radius:50%;border:2px solid rgba(90,150,255,0.95);z-index:2147483646;" +
      "pointer-events:none;opacity:0;transform:scale(1);will-change:transform,opacity;";
    doc.documentElement.appendChild(cur);
    doc.documentElement.appendChild(rip);
    var body = doc.body;
    if (body) {
      body.style.transition = "transform 0.42s cubic-bezier(0.22,1,0.36,1)";
      body.style.willChange = "transform";
    }
    var lastX = window.innerWidth / 2;
    var lastY = window.innerHeight / 2;
    cur.style.left = lastX + "px";
    cur.style.top = lastY + "px";
    window.__demoCam = {
      move: function (x, y) {
        cur.style.left = x + "px";
        cur.style.top = y + "px";
        lastX = x;
        lastY = y;
      },
      press: function () {
        cur.style.transform = "scale(0.78)";
        rip.style.transition = "none";
        rip.style.left = lastX + "px";
        rip.style.top = lastY + "px";
        rip.style.opacity = "0.85";
        rip.style.transform = "scale(1)";
        requestAnimationFrame(function () {
          rip.style.transition = "transform 0.55s ease-out,opacity 0.55s ease-out";
          rip.style.transform = "scale(3.4)";
          rip.style.opacity = "0";
        });
      },
      release: function () {
        cur.style.transform = "scale(1)";
      },
      // Always called from scale(1), so transform-origin only takes visible
      // effect for the upcoming zoom — no jump from a stale origin.
      zoom: function (x, y, s) {
        if (!body) return;
        var ox = x + (window.pageXOffset || 0);
        var oy = y + (window.pageYOffset || 0);
        body.style.transformOrigin = ox + "px " + oy + "px";
        void body.offsetWidth; // flush origin before animating the scale
        body.style.transform = "scale(" + s + ")";
      },
      reset: function () {
        if (body) body.style.transform = "scale(1)";
      },
    };
  });
}

// Convenience: fire a __demoCam method on the page, swallowing the rare case
// where a navigation dropped the injected harness (re-injected on next call).
async function cam(page, method, args) {
  await page
    .evaluate(
      (p) => {
        var c = window.__demoCam;
        if (!c || typeof c[p.m] !== "function") return;
        c[p.m].apply(c, p.a || []);
      },
      { m: method, a: args || [] },
    )
    .catch(() => {});
}

async function execAction(page, input, state) {
  const action = input.action;
  const coord = input.coordinate;
  if (Array.isArray(coord) && coord.length === 2) {
    state.x = coord[0];
    state.y = coord[1];
  }
  await ensureCinema(page);

  const isClick =
    action === "left_click" ||
    action === "right_click" ||
    action === "middle_click" ||
    action === "double_click" ||
    action === "triple_click";

  if (isClick) {
    const btn =
      action === "right_click" ? "right" : action === "middle_click" ? "middle" : "left";
    const heldMods = input.text
      ? String(input.text).split("+").map(mapMod).filter(Boolean)
      : [];
    // Glide the cursor to the target, then zoom toward it.
    await cam(page, "move", [state.x, state.y]);
    await sleep(600);  // cursor glide (CSS 0.45s) + brief dwell
    await cam(page, "zoom", [state.x, state.y, 1.42]);
    await sleep(450);  // zoom-in CSS transition (0.42s) + settle
    await cam(page, "press");
    for (const m of heldMods) await page.keyboard.down(m);
    if (action === "double_click") {
      await page.mouse.dblclick(state.x, state.y, { button: btn });
    } else if (action === "triple_click") {
      await page.mouse.click(state.x, state.y, { button: btn, clickCount: 3 });
    } else {
      await page.mouse.click(state.x, state.y, { button: btn });
    }
    for (const m of heldMods) await page.keyboard.up(m);
    await sleep(120);
    await cam(page, "release");
    // Hold the zoom so the viewer reads the result. A plain sleep would be
    // removed by mpdecimate (static frames look identical → dropped). Instead,
    // drift the cursor 4px and back — CSS transition animates each micro-move,
    // keeping every frame distinct so mpdecimate preserves the hold duration.
    await cam(page, "move", [state.x + 4, state.y + 2]);
    await sleep(350);
    await cam(page, "move", [state.x, state.y]);
    await sleep(350);
    await cam(page, "reset");
    await sleep(500);  // zoom-out CSS transition (0.42s) + settle before screenshot
    return;
  }

  switch (action) {
    case "screenshot":
    case "cursor_position":
      break;
    case "wait":
      await sleep(Math.min(3000, (input.duration || 1) * 1000));
      break;
    case "mouse_move":
      await cam(page, "move", [state.x, state.y]);
      await page.mouse.move(state.x, state.y);
      await sleep(300);
      break;
    case "left_mouse_down":
      await cam(page, "move", [state.x, state.y]);
      await page.mouse.move(state.x, state.y);
      await page.mouse.down();
      break;
    case "left_mouse_up":
      await page.mouse.up();
      break;
    case "left_click_drag": {
      const start =
        Array.isArray(input.start_coordinate) && input.start_coordinate.length === 2
          ? input.start_coordinate
          : [state.x, state.y];
      await cam(page, "move", [start[0], start[1]]);
      await sleep(300);
      await page.mouse.move(start[0], start[1]);
      await page.mouse.down();
      await cam(page, "move", [state.x, state.y]);
      await page.mouse.move(state.x, state.y, { steps: 18 });
      await page.mouse.up();
      await sleep(200);
      break;
    }
    case "type": {
      // Zoom gently on the field while typing so the typed text is legible.
      await cam(page, "zoom", [state.x, state.y, 1.3]);
      await sleep(300);
      await page.keyboard.type(String(input.text || ""), { delay: 70 });
      // Brief drift after typing keeps frames distinct (mpdecimate guard)
      await cam(page, "move", [state.x + 3, state.y]);
      await sleep(280);
      await cam(page, "move", [state.x, state.y]);
      await sleep(280);
      await cam(page, "reset");
      await sleep(400);
      break;
    }
    case "key":
      await page.keyboard.press(mapKey(input.text || ""));
      await sleep(160);
      break;
    case "hold_key": {
      const kk = mapKey(input.text || "");
      await page.keyboard.down(kk);
      await sleep(Math.min(2000, (input.duration || 0.5) * 1000));
      await page.keyboard.up(kk);
      break;
    }
    case "scroll": {
      const amt = (input.scroll_amount || 3) * 100;
      const dir = input.scroll_direction || "down";
      const dx = dir === "right" ? amt : dir === "left" ? -amt : 0;
      const dy = dir === "down" ? amt : dir === "up" ? -amt : 0;
      // Scrolls read best at 1x — reset any zoom, then scroll smoothly.
      await cam(page, "reset");
      await cam(page, "move", [state.x, state.y]);
      await page.evaluate(
        (d) => window.scrollBy({ left: d[0], top: d[1], behavior: "smooth" }),
        [dx, dy],
      );
      await sleep(720);
      break;
    }
    default:
      // Unknown action: do nothing, just return a fresh screenshot below.
      break;
  }
}

async function callClaude(messages) {
  const body = JSON.stringify({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [
      {
        type: "computer_20250124",
        name: "computer",
        display_width_px: VIEW_W,
        display_height_px: VIEW_H,
        display_number: 1,
        // Static cache anchor: tools + system never change across the loop, so
        // they're served from cache on every call after the first.
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: messages,
  });
  // Retry transient rate limits (429) and overload/5xx, honouring Retry-After.
  // Low API tiers cap input tokens/min, so a brief wait beats aborting the whole
  // run to the scroll fallback. Persistent failures still throw -> fallback.
  let attempt = 0;
  while (true) {
    let res;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": API_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "computer-use-2025-01-24",
        },
        body: body,
      });
    } catch (netErr) {
      // fetch itself threw (ECONNRESET, DNS, TLS reset) — transient, retry.
      if (attempt < 4) {
        const waitMs = Math.min(15000, 2000 * Math.pow(2, attempt));
        console.error("anthropic fetch error — retry in " + waitMs + "ms");
        await sleep(waitMs);
        attempt++;
        continue;
      }
      throw new Error(
        "anthropic fetch failed: " + (netErr && netErr.message ? netErr.message : netErr),
      );
    }
    if (res.ok) return res.json();
    const text = await res.text().catch(() => "");
    const retriable = res.status === 429 || res.status === 529 || res.status >= 500;
    if (retriable && attempt < 4) {
      const ra = parseFloat(res.headers.get("retry-after") || "");
      const waitMs = Number.isFinite(ra)
        ? Math.min(20000, ra * 1000)
        : Math.min(15000, 2000 * Math.pow(2, attempt));
      console.error("anthropic " + res.status + " — retry in " + waitMs + "ms");
      await sleep(waitMs);
      attempt++;
      continue;
    }
    throw new Error("anthropic " + res.status + ": " + text.slice(0, 300));
  }
}

// Prompt caching: the message history is append-only, so each call's payload is
// a strict superset of the previous one. Put a single rolling cache breakpoint on
// the last content block and the whole prior prefix (tools + system + every
// earlier turn, screenshots included) is served from cache at ~1/10 the price —
// only the newest screenshot is paid at full rate. Far cheaper than re-sending,
// and unlike image-pruning it never mutates the prefix (which would bust cache).
// Breakpoints must not accumulate (max 4), so clear stale ones first.
function applyCache(messages) {
  for (const m of messages) {
    if (!Array.isArray(m.content)) continue;
    for (const b of m.content) {
      if (b && b.cache_control) delete b.cache_control;
    }
  }
  const last = messages[messages.length - 1];
  if (last && Array.isArray(last.content) && last.content.length) {
    last.content[last.content.length - 1].cache_control = { type: "ephemeral" };
  }
}

// Drives the app with Claude. Returns the number of agent steps taken.
// Throws if the API key is missing or any request fails (caller falls back).
async function runComputerUse(page) {
  if (!API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
  await ensureCinema(page); // synthetic cursor visible from the first frame
  const state = { x: Math.floor(VIEW_W / 2), y: Math.floor(VIEW_H / 2) };
  const messages = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text:
            "The web app is open and ready (screenshot below). Record a short product demo by " +
            "interacting with its main features. Begin now.",
        },
        {
          type: "image",
          source: { type: "base64", media_type: "image/png", data: await shot(page) },
        },
      ],
    },
  ];

  const started = Date.now();
  let steps = 0;
  while (steps < CU_MAX_STEPS && Date.now() - started < CU_MAX_MS) {
    applyCache(messages);
    const resp = await callClaude(messages);
    messages.push({ role: "assistant", content: resp.content || [] });
    const toolUses = (resp.content || []).filter((b) => b && b.type === "tool_use");
    if (!toolUses.length) break; // Claude ended its turn -> demo complete

    const results = [];
    for (const tu of toolUses) {
      try {
        await execAction(page, tu.input || {}, state);
      } catch (e) {
        console.error("action error", tu.input && tu.input.action, e && e.message);
      }
      await sleep(ACTION_PACING_MS);
      results.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: await shot(page) },
          },
        ],
      });
    }
    messages.push({ role: "user", content: results });
    steps++;
  }
  return steps;
}

// Original behaviour: gentle top->bottom scroll, easing to ~85% and resting
// there so the final frames sit on content, not empty void past the page end.
async function runScroll(page) {
  const pageInfo = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));
  const maxScroll = Math.max(0, pageInfo.scrollHeight - pageInfo.innerHeight);
  const start = Date.now();
  while (Date.now() - start < DURATION_MS) {
    const t = (Date.now() - start) / DURATION_MS;
    const target = maxScroll * Math.min(0.85, t);
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "smooth" }), target);
    await sleep(700);
  }
}

(async () => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  // Headed Chromium rendered onto the Xvfb display (DISPLAY env). A window
  // manager (matchbox) maximizes the window; --ozone-platform=x11 makes it
  // paint to X. No Playwright recordVideo — we screen-grab the X display below.
  const browser = await chromium.launch({
    headless: false,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--ozone-platform=x11",
      "--disable-infobars",
      "--force-device-scale-factor=1",
    ],
  });
  // viewport:null -> the page adopts the real (maximized) window size.
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();

  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e && e.message ? e.message : e)));

  console.log("goto", URL);
  await page.goto(URL, { waitUntil: "load", timeout: 30000 });
  try {
    await page.waitForLoadState("networkidle", { timeout: 8000 });
  } catch {}

  // Bounded wait for the target's webfonts. Many pages gate visible content on
  // document.fonts.ready; if a font stalls we still want to proceed.
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

  // Wait until something is actually painted. innerText respects
  // visibility/display, so reveal-on-scroll and typing animations only count
  // once they've truly painted. Capped.
  const contentDeadline = Date.now() + CONTENT_WAIT_MS;
  let visibleChars = 0;
  while (Date.now() < contentDeadline) {
    visibleChars = await page.evaluate(() =>
      document.body && document.body.innerText ? document.body.innerText.trim().length : 0,
    );
    if (visibleChars >= MIN_VISIBLE_CHARS) break;
    await sleep(500);
  }

  // The window is now maximized to fill the Xvfb display; innerHeight is the
  // content area below the browser toolbar, so the toolbar height (the y-offset
  // we grab from) is DISPLAY_H - innerHeight. Grab only that content region so
  // the toolbar never appears in the video.
  const dim = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const cropY = Math.max(0, DISPLAY_H - dim.h);
  const capPath = path.join(OUTPUT_DIR, "cap.mp4");
  const grabLog = fs.openSync(path.join(OUTPUT_DIR, "ffmpeg-grab.log"), "w");
  // -draw_mouse 0: don't capture the real X pointer (we draw our own synthetic
  // cursor). ultrafast/crf18: cheap high-quality intermediate; the task does the
  // 720p + fade pass afterwards.
  const ff = spawn(
    "ffmpeg",
    [
      "-y", "-draw_mouse", "0",
      "-f", "x11grab", "-framerate", String(CAPTURE_FPS),
      "-video_size", dim.w + "x" + dim.h,
      "-i", DISPLAY + "+0," + cropY,
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", "-pix_fmt", "yuv420p",
      capPath,
    ],
    { stdio: ["ignore", grabLog, grabLog], env: Object.assign({}, process.env, { DISPLAY: DISPLAY }) },
  );
  let ffExited = false;
  ff.on("exit", () => { ffExited = true; });
  await sleep(500); // let ffmpeg start grabbing before the first action

  const interactionStart = Date.now();
  let mode = "computer-use";
  let steps = 0;
  let cuError = null;
  try {
    steps = await runComputerUse(page);
    if (!steps) throw new Error("computer-use produced no steps");
  } catch (e) {
    cuError = String(e && e.message ? e.message : e);
    console.error("computer-use fallback to scroll:", cuError);
    mode = "scroll-fallback";
    try {
      await page.evaluate(() => window.scrollTo({ top: 0 }));
    } catch {}
    await runScroll(page);
  }
  const interactionEnd = Date.now();

  // Stop the grab cleanly — SIGINT lets ffmpeg finalize the mp4 (moov atom).
  if (!ffExited) {
    await new Promise((res) => {
      const t = setTimeout(() => {
        try { ff.kill("SIGKILL"); } catch {}
        res();
      }, 8000);
      ff.on("exit", () => { clearTimeout(t); res(); });
      try { ff.kill("SIGINT"); } catch { clearTimeout(t); res(); }
    });
  }
  try { fs.closeSync(grabLog); } catch {}

  await context.close();
  await browser.close();

  if (!fs.existsSync(capPath)) throw new Error("capture file missing: " + capPath);
  const stat = fs.statSync(capPath);
  console.log(
    JSON.stringify({
      path: capPath,
      bytes: stat.size,
      mode,
      steps,
      durationMs: interactionEnd - interactionStart,
      contentW: dim.w,
      contentH: dim.h,
      cropY,
      visibleChars,
      cuError,
      pageErrors: pageErrors.slice(0, 5),
    }),
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
`;
