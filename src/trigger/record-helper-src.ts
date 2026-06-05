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
const { spawnSync } = require("node:child_process");

const [, , URL, OUTPUT_DIR, DURATION_SEC_STR] = process.argv;
if (!URL || !OUTPUT_DIR || !DURATION_SEC_STR) {
  console.error("Usage: record-helper.js <URL> <OUTPUT_DIR> <DURATION_SEC>");
  process.exit(1);
}
// Only ever drive Chromium at an http(s) target. The caller already validates
// and shell-quotes the URL; this is the last guard so a stray file://, data:,
// or other scheme can never be navigated even if something upstream slips.
if (!/^https?:\/\//i.test(URL)) {
  console.error("refusing non-http(s) target: " + URL);
  process.exit(1);
}
const FONT_WAIT_MS = 8000;
const CONTENT_WAIT_MS = 12000;
const MIN_VISIBLE_CHARS = 20;

// Computer-use accuracy degrades at high resolution and the demo only ever
// plays in a small Theater card, so capture at WXGA (Anthropic's recommended
// max for the computer tool). Coordinates then map 1:1 to Playwright.
const VIEW_W = 1280;
const VIEW_H = 800;

// --- Deterministic virtual-time capture ----------------------------------
// We render headed Chromium onto a virtual X display (Xvfb) for rendering
// fidelity, but DON'T screen-grab it. Instead we drive CDP virtual time
// (Emulation.setVirtualTimePolicy) one 60fps frame-budget at a time and take a
// Page.captureScreenshot after each step. Two things this buys, both verified on
// this sandbox (scripts/vt-probe2.mts): (1) the page's OWN clock advances at TRUE
// speed per frame (setInterval/rAF/CSS/caret), so dynamic apps never run fast or
// frantic; (2) one fresh render per step = a genuine 60 unique fps, decoupled
// from how slowly the software compositor paints in wall-clock. Frames are then
// assembled into cap.mp4 at 60fps. No x11grab, no dead-air cut (virtual time is
// PAUSED during the Claude API round-trips, so the page simply doesn't advance).
const DISPLAY = process.env.DISPLAY || ":99";
const FPS = 60;
const FRAME_MS = 1000 / FPS;
// Hard cap on captured frames so a long agent run can't balloon the clip /
// screenshot cost. MAX_VIDEO_SEC (30) * 60fps.
const MAX_FRAMES = 30 * FPS;
// Wall-clock budget for the whole capture. Each frame costs a CDP round-trip +
// screenshot, so a demo is slower than real time; this guarantees we stop and
// assemble what we have well before the outer record timeout kills us. Sized
// above a full-length (~25s) interactive demo's capture + API time, and ordered
// below CU_MAX_MS (330s) < RECORD_TIMEOUT (480s).
const CAPTURE_BUDGET_MS = 300000;

// --- Computer use config -------------------------------------------------
const API_KEY = process.env.ANTHROPIC_API_KEY || "";
// Computer use is NOT supported on the newest 4.6/4.8 models (the API rejects
// the computer_20250124 tool for them). The latest computer-use-capable Sonnet
// is 4.5 — keep this here, override via DEMO_CU_MODEL if needed.
const MODEL = process.env.DEMO_CU_MODEL || "claude-sonnet-4-5";
// We want a 15-25s demo that actually exercises several features. Each step
// yields ~2-3s of footage under virtual time, and prompt caching keeps every
// extra Claude call cheap, so allow more turns and enforce a FLOOR via the
// re-prompts in runComputerUse (don't accept a too-short / scroll-only demo).
const CU_MAX_STEPS = 11;        // hard cap on agent turns (cost guard)
const CU_MIN_STEPS = 5;         // floor: re-prompt rather than end below this
const CU_MAX_REPROMPTS = 2;     // bounded nudges when the agent ends too early
const MIN_CLIP_FRAMES = 8 * FPS; // ~8s of footage floor before accepting an end
const ACTION_PACING_MS = 200;   // small extra dwell rendered after each action
// Wall-clock budget for the interaction. Each captured frame costs a CDP budget
// round-trip + a screenshot, and a demo is ~1000-1500 frames, so the capture is
// slower than real time. The agent still stops early once it has shown the core
// feature; this is just the ceiling.
const CU_MAX_MS = 330000;

const SYSTEM_PROMPT = [
  "You are a product demo presenter recording a short, polished walkthrough video of a web app.",
  "The app is already open. Your job: show a reviewer the app's core value by actually USING it —",
  "clicking its most important controls and exercising its standout features, one clear action at a time.",
  "",
  "Rules:",
  "- Stay on this app. Never navigate to external sites, never open new tabs, never touch the URL bar.",
  "- Lead with the hero: click the single most eye-catching primary call-to-action or the flashiest",
  "  interactive element first. Opening with the boldest control makes the demo instantly compelling.",
  "- Scrolling alone is NOT a demo. You MUST click / open / toggle / type into at least one real",
  "  interactive control. Use scrolling only to REACH a control, then interact with it.",
  "- Prefer actions that visibly change the screen: click buttons, open menus/modals, switch tabs,",
  "  toggle views, type into a short demo input, drag a slider.",
  "- Keep going until you have shown several (aim for 6-9) DISTINCT, meaningful interactions across",
  "  different features or screens. Each action should reveal something new.",
  "- Do not repeat yourself: never click the same element, or another element with the same purpose,",
  "  twice. Always move on to a NEW control or screen — a different tab, a search field, a new modal.",
  "- Do NOT perform destructive or irreversible actions (delete, purchase, pay, sign out, send a real",
  "  message). If a form looks like sign-up / login / payment, skip it and show something else.",
  "- One clear, unhurried action at a time.",
  "- Only end your turn (no tool call) once you have shown the core features well AND there is no",
  "  genuinely new interactive element left to demonstrate. Do not pad with pointless or repeated clicks.",
].join("\n");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Virtual-time frame capture ------------------------------------------
// Set once the CDP session + frames dir are ready (in main). cdp drives virtual
// time; FRAMES_DIR collects the JPEGs; frameCount is the running index/cap.
let cdp = null;
let FRAMES_DIR = null;
let frameCount = 0;
let captureDeadline = Infinity; // wall-clock; set when virtual time starts
let captureStopped = false;     // true once we hit the budget/cap (stop advancing)
let captureRetries = 0;         // screenshot retries (diagnostic; no time distortion)

// Advance virtual time by exactly one 60fps frame and return the freshly rendered
// JPEG (base64). The budget advance must IMMEDIATELY precede the screenshot:
// captureScreenshot waits on a fresh compositor frame, so a bare capture with no
// preceding advance hangs. pauseIfNetworkFetchesPending matches the verified probe
// (scripts/vt-probe2); the 1.2s guard bounds a persistent-network stall; the 5s
// guard bounds a stuck capture. Throws on capture timeout.
async function grabFrame(quality) {
  // Advance virtual time by EXACTLY one frame — ONCE. The advance must NOT be
  // inside the capture-retry loop: re-advancing would move the page's clock
  // forward again while still producing a single output frame, so the app would
  // play back sped up (worse the more captures retry). "advance" always consumes
  // the budget and fires the event, even with pending network.
  const expired = new Promise((res) => {
    const t = setTimeout(res, 1500);
    cdp.once("Emulation.virtualTimeBudgetExpired", () => { clearTimeout(t); res(); });
  });
  await cdp.send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: FRAME_MS });
  await expired;
  // Retry ONLY the screenshot of this single advanced frame (no extra advance).
  // The paint pump keeps a fresh frame available, so a transient stall recaptures
  // the same moment cleanly without distorting time.
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const s = await Promise.race([
        cdp.send("Page.captureScreenshot", { format: "jpeg", quality: quality || 85 }),
        new Promise((_, rej) => setTimeout(() => rej(new Error("captureScreenshot timeout")), 2500)),
      ]);
      return s.data;
    } catch (e) {
      lastErr = e;
      if (attempt > 0) captureRetries++;
    }
  }
  throw lastErr || new Error("grabFrame failed");
}

// Capture one VIDEO frame. While we're not calling this (e.g. during a Claude API
// round-trip) the page is frozen, so there's no dead air and the app never runs
// ahead. On capture trouble we stop and assemble what we have rather than wedge.
async function vtStep() {
  if (!cdp || captureStopped) return;
  if (frameCount >= MAX_FRAMES || Date.now() > captureDeadline) {
    captureStopped = true;
    return;
  }
  let data = null;
  try {
    data = await grabFrame(85);
  } catch (e) {
    try { fs.appendFileSync(path.join(OUTPUT_DIR, "errors.txt"), "shot@" + frameCount + ": " + (e && e.message) + "\n"); } catch {}
    captureStopped = true;
    return;
  }
  fs.writeFileSync(path.join(FRAMES_DIR, "f_" + String(frameCount).padStart(6, "0") + ".jpg"), Buffer.from(data, "base64"));
  frameCount++;
  // Progress to a file (survives a SIGKILL, unlike buffered stdout) so a timeout
  // can be diagnosed as hang-vs-slow.
  try {
    fs.writeFileSync(
      path.join(OUTPUT_DIR, "progress.txt"),
      "frames=" + frameCount + " elapsedMs=" + (Date.now() - (captureDeadline - CAPTURE_BUDGET_MS)),
    );
  } catch {}
}

// Render ms of final playback time as 60fps frames. Replaces every cinematic
// sleep(): instead of waiting in wall-clock, we advance virtual time frame by
// frame and capture each. App animations (CSS/rAF/caret) advance with it at true
// speed; our camera CSS transitions animate the same way -> smooth 60fps.
async function vt(ms) {
  const n = Math.max(1, Math.round(ms / FRAME_MS));
  for (let i = 0; i < n && !captureStopped; i++) await vtStep();
}

function probeDur(file) {
  try {
    const r = spawnSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nk=1:nw=1", file],
      { encoding: "utf8" },
    );
    return parseFloat((r.stdout || "").trim()) || 0;
  } catch (e) {
    return 0;
  }
}

// Unique (non-duplicate) frames per second: mpdecimate drops near-identical
// frames, so kept/duration ~= the genuine motion smoothness, independent of the
// container's (always-60) fps tag. Measure this on the SHIPPED clip, not the raw
// capture — the raw clip is padded with API-wait dead air that deflates the rate.
function uniqueFpsOf(file) {
  try {
    const r = spawnSync(
      "ffmpeg",
      ["-y", "-i", file, "-vf", "mpdecimate", "-fps_mode", "vfr", "-f", "null", "-"],
      { encoding: "utf8" },
    );
    const out = (r.stderr || "") + (r.stdout || "");
    const fm = out.match(/frame=\s*(\d+)/g);
    const kept = fm && fm.length ? parseInt(fm[fm.length - 1].replace(/frame=\s*/, ""), 10) : 0;
    const d = probeDur(file);
    return kept && d ? +(kept / d).toFixed(1) : 0;
  } catch (e) {
    return 0;
  }
}

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

// Screenshot of the CURRENT (virtual-time-frozen) state for the agent to look at.
// Does NOT advance virtual time or add a video frame. Uses page.screenshot (with a
// timeout) for the same reason as frame capture — raw CDP captureScreenshot can
// hang in headed mode under virtual time.
async function shot(page) {
  // Agent observation: just reuse the most recently captured VIDEO frame — it IS
  // the current state (we always vt()/capture right before observing). Avoids a
  // separate captureScreenshot, which intermittently stalls when not immediately
  // preceded by its own budget advance. Falls back to a fresh grab only if nothing
  // has been captured yet. Returns JPEG base64.
  if (frameCount > 0) {
    try {
      return fs.readFileSync(
        path.join(FRAMES_DIR, "f_" + String(frameCount - 1).padStart(6, "0") + ".jpg"),
      ).toString("base64");
    } catch {}
  }
  return await grabFrame(80);
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
    var doc = document, body = doc.body;
    var cur = doc.createElement("div");
    cur.id = "__demo_cursor";
    // No CSS transitions and no will-change: ALL motion is driven explicitly by a
    // perpetual rAF below, setting styles per frame. CSS transitions stall
    // Page.captureScreenshot under virtual time (verified); rAF-driven explicit
    // animation captures cleanly (scripts/vt-probe2). The perpetual rAF also keeps
    // the compositor producing frames, so capture never waits on an idle surface.
    cur.style.cssText =
      "position:fixed;left:50%;top:50%;width:24px;height:24px;margin-left:-12px;" +
      "margin-top:-12px;border-radius:50%;background:rgba(20,20,28,0.28);" +
      "border:2px solid rgba(255,255,255,0.96);box-shadow:0 0 0 5px rgba(255,255,255,0.12),0 5px 16px rgba(0,0,0,0.5);" +
      "z-index:2147483647;pointer-events:none;";
    var rip = doc.createElement("div");
    rip.id = "__demo_ripple";
    rip.style.cssText =
      "position:fixed;left:0;top:0;width:18px;height:18px;margin-left:-9px;margin-top:-9px;" +
      "border-radius:50%;border:2px solid rgba(90,150,255,0.95);z-index:2147483646;" +
      "pointer-events:none;opacity:0;transform:scale(1);";
    doc.documentElement.appendChild(cur);
    doc.documentElement.appendChild(rip);

    // Paint pump: a perpetual rAF that changes ONE near-invisible pixel every
    // frame. Page.captureScreenshot under virtual time stalls when the page is
    // idle (no compositor frame being produced) in some states; a rAF that paints
    // each frame keeps fresh frames flowing so capture never waits. (A perpetual
    // rAF that does NOT paint does not help — it must dirty something.) Verified
    // good pattern: the probe's per-frame-painting rAF captured 120/120.
    var pump = doc.createElement("div");
    pump.style.cssText =
      "position:fixed;left:0;top:0;width:2px;height:2px;z-index:2147483647;pointer-events:none;opacity:0.02;";
    doc.documentElement.appendChild(pump);
    var pumpN = 0;
    (function pumpLoop() {
      pumpN = (pumpN + 1) % 2;
      pump.style.background = pumpN ? "#000" : "#fff";
      requestAnimationFrame(pumpLoop);
    })();

    function easeInOut(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }

    var cx = window.innerWidth / 2, cy = window.innerHeight / 2; // cursor pos (current)
    var px0 = cx, py0 = cy, pxT = cx, pyT = cy, pStart = -1, pDur = 0; // pos tween
    var cs = 1, cs0 = 1, csT = 1, csStart = -1, csDur = 0;          // cursor press-scale tween
    var zs = 1, zs0 = 1, zsT = 1, zsStart = -1, zsDur = 0;          // zoom-scale tween
    var rActive = false, rStart = -1, rDur = 550;                  // ripple
    var running = false;
    cur.style.left = cx + "px"; cur.style.top = cy + "px";

    function active() { return pDur > 0 || csDur > 0 || zsDur > 0 || rActive; }
    // Animator: explicit per-frame style updates WHILE a tween is active, then it
    // stops (no pending rAF). ALL tween clocks are the rAF timestamp ts (a start of
    // -1 means init on the first frame) — never performance.now(), which doesn't
    // track CDP virtual time and made every tween jump to its end in one frame.
    // A painting rAF also keeps capture healthy under virtual time.
    function frame(ts) {
      if (pDur > 0) {
        if (pStart < 0) pStart = ts;
        var e = easeInOut(Math.min(1, (ts - pStart) / pDur));
        cx = px0 + (pxT - px0) * e; cy = py0 + (pyT - py0) * e;
        cur.style.left = cx + "px"; cur.style.top = cy + "px";
        if (ts - pStart >= pDur) pDur = 0;
      }
      if (csDur > 0) {
        if (csStart < 0) csStart = ts;
        var e2 = easeInOut(Math.min(1, (ts - csStart) / csDur));
        cs = cs0 + (csT - cs0) * e2;
        cur.style.transform = "scale(" + cs + ")";
        if (ts - csStart >= csDur) csDur = 0;
      }
      if (zsDur > 0 && body) {
        if (zsStart < 0) zsStart = ts;
        var e3 = easeInOut(Math.min(1, (ts - zsStart) / zsDur));
        zs = zs0 + (zsT - zs0) * e3;
        body.style.transform = "scale(" + zs + ")";
        if (ts - zsStart >= zsDur) zsDur = 0;
      }
      if (rActive) {
        if (rStart < 0) rStart = ts;
        var p4 = Math.min(1, (ts - rStart) / rDur);
        rip.style.transform = "scale(" + (1 + 2.4 * p4) + ")";
        rip.style.opacity = String(0.85 * (1 - p4));
        if (p4 >= 1) rActive = false;
      }
      if (active()) requestAnimationFrame(frame);
      else running = false;
    }
    function kick() { if (!running) { running = true; requestAnimationFrame(frame); } }

    window.__demoCam = {
      move: function (x, y) { px0 = cx; py0 = cy; pxT = x; pyT = y; pStart = -1; pDur = 550; kick(); },
      press: function () {
        cs0 = cs; csT = 0.78; csStart = -1; csDur = 120;
        rip.style.left = cx + "px"; rip.style.top = cy + "px";
        rip.style.transform = "scale(1)"; rip.style.opacity = "0.85";
        rActive = true; rStart = -1; kick();
      },
      release: function () { cs0 = cs; csT = 1; csStart = -1; csDur = 160; kick(); },
      // Set transform-origin to the click point (the fixed point of the scale), so
      // a real page.mouse click at the same viewport coord still hits the element.
      zoom: function (x, y, s) {
        if (!body) return;
        body.style.transformOrigin =
          (x + (window.pageXOffset || 0)) + "px " + (y + (window.pageYOffset || 0)) + "px";
        zs0 = zs; zsT = s; zsStart = -1; zsDur = 500; kick();
      },
      reset: function () { if (body) { zs0 = zs; zsT = 1; zsStart = -1; zsDur = 500; kick(); } },
      // rAF scroll tween (resolves when done); driven by vt() advancing time.
      scrollByDur: function (dx, dy, durMs) {
        return new Promise(function (resolve) {
          var el = doc.scrollingElement || doc.documentElement;
          var sx = el.scrollLeft, sy = el.scrollTop, t0 = 0;
          function step(ts) {
            if (!t0) t0 = ts;
            var p = Math.min(1, (ts - t0) / durMs);
            var e = easeInOut(p);
            el.scrollLeft = sx + dx * e; el.scrollTop = sy + dy * e;
            if (p < 1) requestAnimationFrame(step); else resolve();
          }
          requestAnimationFrame(step);
        });
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
    // Human-paced click: glide the cursor over (like a real hand), pause to
    // "acquire" the target, zoom in, click, HOLD on the zoomed result so the
    // viewer can read what happened, ease back out. Each vt() renders that span
    // as 60fps frames under virtual time — the camera CSS transitions AND the
    // app's own reaction (which fires on the click) advance together at true
    // speed. No dead air: while we're not in vt(), the page is frozen.
    await cam(page, "move", [state.x, state.y]);
    await vt(700); // cursor glide (550ms tween) + settle before acting
    await cam(page, "zoom", [state.x, state.y, 1.42]);
    await vt(620); // zoom-in (500ms tween) + brief settle
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
    await vt(120);
    await cam(page, "release");
    await vt(440); // brief hold so the click result reads, then ease back out
    await cam(page, "reset");
    await vt(640); // let the 500ms zoom-out FULLY play before the next action
    return;
  }

  switch (action) {
    case "screenshot":
    case "cursor_position":
      break;
    case "wait":
      await vt(Math.min(3000, (input.duration || 1) * 1000));
      break;
    case "mouse_move":
      await cam(page, "move", [state.x, state.y]);
      await page.mouse.move(state.x, state.y);
      await vt(500);
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
      await vt(300);
      await page.mouse.move(start[0], start[1]);
      await page.mouse.down();
      await cam(page, "move", [state.x, state.y]);
      await page.mouse.move(state.x, state.y, { steps: 18 });
      await page.mouse.up();
      await vt(200);
      break;
    }
    case "type": {
      // Cinematic typing: zoom onto the field, settle, then emit one character
      // at a time with a randomized human cadence so the text visibly appears
      // letter by letter. vt() after each char renders that beat (incl. the
      // caret blink, which now advances at TRUE speed under virtual time).
      const text = String(input.text || "");
      await cam(page, "zoom", [state.x, state.y, 1.3]); // >=1.3x onto the field
      await vt(560); // let the zoom-in settle before typing
      for (const ch of text) {
        await page.keyboard.type(ch);
        await vt(50 + Math.floor(Math.random() * 101)); // 50-150ms per char
      }
      await vt(700); // hold on the finished text so the viewer can read it
      await cam(page, "reset");
      await vt(600); // let the zoom-out finish before the screenshot
      break;
    }
    case "key":
      await page.keyboard.press(mapKey(input.text || ""));
      await vt(160);
      break;
    case "hold_key": {
      const kk = mapKey(input.text || "");
      await page.keyboard.down(kk);
      // Hold the key physically while virtual time advances by duration, so the app
      // sees it held for that long and we capture the result frame by frame.
      await vt(Math.min(2000, (input.duration || 0.5) * 1000));
      await page.keyboard.up(kk);
      break;
    }
    case "scroll": {
      const amt = (input.scroll_amount || 3) * 100;
      const dir = input.scroll_direction || "down";
      const dx = dir === "right" ? amt : dir === "left" ? -amt : 0;
      const dy = dir === "down" ? amt : dir === "up" ? -amt : 0;
      // Scrolls read best at 1x — reset any zoom, then kick off the rAF scroll
      // tween WITHOUT awaiting it (its promise only resolves as virtual time
      // advances, which we do via vt() right after — awaiting it here would
      // deadlock). vt() then drives + captures the scroll at 60fps.
      await cam(page, "reset");
      await cam(page, "move", [state.x, state.y]);
      await page
        .evaluate(
          (d) => { if (window.__demoCam) window.__demoCam.scrollByDur(d[0], d[1], d[2]); },
          [dx, dy, 700],
        )
        .catch(() => {});
      await vt(900); // 0.7s scroll + a beat to read
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
// a strict superset of the previous one. The whole prior prefix (tools + system +
// every earlier turn, screenshots included) is served from cache at ~1/10 the
// price — only the newest screenshot is paid at full rate. Far cheaper than
// re-sending, and unlike image-pruning it never mutates the prefix (which would
// bust cache). Breakpoints must not accumulate (max 4), so clear stale ones first,
// then set TWO:
//   1) a stable HEAD anchor on the first user message — re-caches the big fixed
//      prefix (tools+system+first screenshot) every call so it survives the 5-min
//      cache TTL even on a slow / rate-limited run; without it a single expiry
//      forces a full-prefix re-write.
//   2) a rolling TAIL breakpoint on the last block — extends the cache to cover
//      the whole conversation so far.
// (tools carries its own static cache_control, so this stays within the 4 max.)
function applyCache(messages) {
  for (const m of messages) {
    if (!Array.isArray(m.content)) continue;
    for (const b of m.content) {
      if (b && b.cache_control) delete b.cache_control;
    }
  }
  const setBreak = (m) => {
    if (m && Array.isArray(m.content) && m.content.length) {
      m.content[m.content.length - 1].cache_control = { type: "ephemeral" };
    }
  };
  setBreak(messages[0]);
  setBreak(messages[messages.length - 1]);
}

// Drives the app with Claude under virtual time. Returns { steps }. There is no
// dead air to track: virtual time is PAUSED during each callClaude round-trip, so
// the page (and thus the captured clip) simply doesn't advance while the agent
// thinks. Every frame the clip contains is produced by execAction's vt() calls.
// Throws if the API key is missing or any request fails (caller falls back).
async function runComputerUse(page) {
  if (!API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
  await ensureCinema(page); // synthetic cursor visible from the first frame
  await vt(450); // a short opening beat on the app before the first action
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
          source: { type: "base64", media_type: "image/jpeg", data: await shot(page) },
        },
      ],
    },
  ];

  // Actions that count as a real interaction (vs scroll/wait/observe). Used to
  // reject a "scroll-only" demo and nudge the agent to actually click something.
  const INTERACTIVE = {
    left_click: 1, right_click: 1, middle_click: 1, double_click: 1, triple_click: 1,
    type: 1, key: 1, left_click_drag: 1, hold_key: 1,
  };
  const started = Date.now();
  let steps = 0;
  let interactions = 0; // meaningful, non-scroll actions actually performed
  let reprompts = 0;    // bounded nudges issued when the agent ended too early
  while (steps < CU_MAX_STEPS && Date.now() - started < CU_MAX_MS && !captureStopped) {
    applyCache(messages);
    const resp = await callClaude(messages);
    messages.push({ role: "assistant", content: resp.content || [] });
    const toolUses = (resp.content || []).filter((b) => b && b.type === "tool_use");
    if (!toolUses.length) {
      // Claude ended its turn. Don't accept a demo that's too short or that never
      // actually interacted (scroll-only) — nudge it to keep going, bounded so a
      // stubborn end can't loop forever or balloon cost. Otherwise it's complete.
      const tooShort = steps < CU_MIN_STEPS || frameCount < MIN_CLIP_FRAMES;
      const neverInteracted = interactions === 0;
      if (reprompts < CU_MAX_REPROMPTS && (tooShort || neverInteracted)) {
        reprompts++;
        const text = neverInteracted
          ? "You've only scrolled so far — scrolling alone is not a demo. Click the single most " +
            "prominent interactive control NOW (a hero button, a tab, a toggle, or a field to type " +
            "into), then show one or two more distinct features."
          : "Good start. Before you finish, show one or two MORE distinct features — a different " +
            "button, tab, or section you haven't used yet. Don't repeat anything you've already done.";
        messages.push({ role: "user", content: [{ type: "text", text: text }] });
        continue; // re-ask without consuming a step
      }
      break; // demo complete
    }

    const results = [];
    for (const tu of toolUses) {
      const act = tu.input && tu.input.action;
      try {
        await execAction(page, tu.input || {}, state);
        if (act && INTERACTIVE[act]) interactions++;
      } catch (e) {
        console.error("action error", act, e && e.message);
      }
      await vt(ACTION_PACING_MS); // small rendered dwell before the next observation
      results.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: await shot(page) },
          },
        ],
      });
    }
    messages.push({ role: "user", content: results });
    steps++;
  }
  return { steps: steps, interactions: interactions, reprompts: reprompts };
}

// Fallback: gentle top->bottom scroll, easing to ~85%, captured under virtual
// time. scrollByDur is kicked off without awaiting (its rAF loop advances only as
// vt() grants budget); vt() then drives + captures it at 60fps.
async function runScroll(page) {
  await ensureCinema(page);
  const pageInfo = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));
  const maxScroll = Math.max(0, pageInfo.scrollHeight - pageInfo.innerHeight);
  await vt(450); // opening beat
  const passes = 6;
  let prev = 0;
  for (let i = 1; i <= passes && !captureStopped; i++) {
    const target = maxScroll * Math.min(0.85, i / passes);
    const delta = target - prev;
    prev = target;
    await page
      .evaluate((d) => { if (window.__demoCam) window.__demoCam.scrollByDur(0, d, 900); }, delta)
      .catch(() => {});
    await vt(1100); // 0.9s scroll + a beat to read
  }
}

(async () => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  // Headed Chromium on the Xvfb display (DISPLAY env) for rendering fidelity (some
  // target apps render differently / blank in headless). We don't screen-grab it
  // though — frames come from CDP Page.captureScreenshot under virtual time, which
  // forces a fresh render each frame regardless of the compositor's wall-clock
  // paint rate. Verified on this sandbox to yield true 60fps (scripts/vt-probe2).
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
  // Fixed viewport so screenshots are a deterministic 1280×800 (= the computer-use
  // coordinate space). page.screenshot/captureScreenshot grab only the viewport,
  // so there's no browser toolbar to crop and no Xvfb geometry to reason about.
  const context = await browser.newContext({ viewport: { width: VIEW_W, height: VIEW_H } });
  const page = await context.newPage();

  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e && e.message ? e.message : e)));

  console.log("goto", URL);
  await page.goto(URL, { waitUntil: "load", timeout: 30000 });
  try {
    await page.waitForLoadState("networkidle", { timeout: 8000 });
  } catch {}

  // Bounded wait for the target's webfonts. Many pages gate visible content on
  // document.fonts.ready; if a font stalls we still want to proceed. (Real time —
  // virtual time is only enabled after the page is ready.)
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

  // Page is loaded & painted. Switch to virtual time (paused) and capture frames
  // deterministically from here. vtStep() advances 1/60s of virtual time and
  // writes one JPEG per call; the agent loop / scroll fallback drive it.
  const capPath = path.join(OUTPUT_DIR, "cap.mp4");
  FRAMES_DIR = path.join(OUTPUT_DIR, "frames");
  fs.mkdirSync(FRAMES_DIR, { recursive: true });
  cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setVirtualTimePolicy", { policy: "pause" });
  captureDeadline = Date.now() + CAPTURE_BUDGET_MS;

  const interactionStart = Date.now();
  let mode = "computer-use";
  let steps = 0;
  let interactions = 0;
  let reprompts = 0;
  let cuError = null;
  try {
    const cu = await runComputerUse(page);
    steps = cu.steps;
    interactions = cu.interactions;
    reprompts = cu.reprompts;
    if (!steps) throw new Error("computer-use produced no steps");
  } catch (e) {
    cuError = String(e && e.message ? e.message : e);
    console.error("computer-use fallback to scroll:", cuError);
    mode = "scroll-fallback";
    try { await page.evaluate(() => window.scrollTo({ top: 0 })); } catch {}
    try { await runScroll(page); } catch (e2) { console.error("scroll fallback failed:", e2 && e2.message); }
  }
  const interactionEnd = Date.now();

  await context.close();
  await browser.close();

  if (frameCount < 2) throw new Error("captured too few frames: " + frameCount);

  // Assemble the captured frames into a constant-60fps clip. build-and-record then
  // does the 720p scale + fade + length clamp on this (tight:false -> uses cap.mp4).
  const asm = spawnSync(
    "ffmpeg",
    ["-y", "-framerate", String(FPS), "-start_number", "0",
     "-i", path.join(FRAMES_DIR, "f_%06d.jpg"),
     "-r", String(FPS), "-fps_mode", "cfr",
     "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
     "-movflags", "+faststart", capPath],
    { stdio: "ignore" },
  );
  if (asm.status !== 0 || !fs.existsSync(capPath)) {
    throw new Error("frame assembly failed (status " + asm.status + ")");
  }
  const stat = fs.statSync(capPath);
  const capDurSec = probeDur(capPath);
  // Should now be ~60 during motion; holds (static, by design) pull the average
  // down. A genuinely smooth clip reads high here vs the old ~13.
  const uniqueFps = uniqueFpsOf(capPath);

  console.log(
    JSON.stringify({
      path: capPath,
      bytes: stat.size,
      mode,
      steps,
      interactions,
      reprompts,
      frames: frameCount,
      fps: FPS,
      captureRetries,
      durationMs: interactionEnd - interactionStart,
      visibleChars,
      cuError,
      tight: false,
      capDurMs: Math.round(capDurSec * 1000),
      uniqueFps,
      pageErrors: pageErrors.slice(0, 5),
    }),
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
`;
