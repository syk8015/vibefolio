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

// --- Computer use config -------------------------------------------------
const API_KEY = process.env.ANTHROPIC_API_KEY || "";
// Computer use is NOT supported on the newest 4.6/4.8 models (the API rejects
// the computer_20250124 tool for them). The latest computer-use-capable Sonnet
// is 4.5 — keep this here, override via DEMO_CU_MODEL if needed.
const MODEL = process.env.DEMO_CU_MODEL || "claude-sonnet-4-5";
const CU_MAX_STEPS = 14;        // hard cap on agent turns
const CU_MAX_MS = 75000;        // wall-clock budget for the interaction
// Keep only the latest screenshot in history. Computer use only needs the
// current frame to decide the next action, and low API tiers cap input tokens
// per minute (e.g. 30k/min) — retaining several ~1.4k-token screenshots per
// rapid-fire call blows that budget fast. One image keeps us well under it.
const CU_KEEP_IMAGES = 1;
const ACTION_PACING_MS = 550;   // small dwell so the video reads smoothly

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
  "- After roughly 8-12 meaningful actions, or once you've shown the core feature well, stop by ending",
  "  your turn without any tool call.",
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

async function execAction(page, input, state) {
  const action = input.action;
  const coord = input.coordinate;
  if (Array.isArray(coord) && coord.length === 2) {
    state.x = coord[0];
    state.y = coord[1];
  }
  switch (action) {
    case "screenshot":
    case "cursor_position":
      break;
    case "wait":
      await sleep(Math.min(3000, (input.duration || 1) * 1000));
      break;
    case "mouse_move":
      await page.mouse.move(state.x, state.y);
      break;
    case "left_click":
    case "right_click":
    case "middle_click":
    case "double_click":
    case "triple_click": {
      const btn =
        action === "right_click" ? "right" : action === "middle_click" ? "middle" : "left";
      const heldMods = input.text
        ? String(input.text).split("+").map(mapMod).filter(Boolean)
        : [];
      for (const m of heldMods) await page.keyboard.down(m);
      if (action === "double_click") {
        await page.mouse.dblclick(state.x, state.y, { button: btn });
      } else if (action === "triple_click") {
        await page.mouse.click(state.x, state.y, { button: btn, clickCount: 3 });
      } else {
        await page.mouse.click(state.x, state.y, { button: btn });
      }
      for (const m of heldMods) await page.keyboard.up(m);
      break;
    }
    case "left_mouse_down":
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
      await page.mouse.move(start[0], start[1]);
      await page.mouse.down();
      await page.mouse.move(state.x, state.y, { steps: 12 });
      await page.mouse.up();
      break;
    }
    case "type":
      await page.keyboard.type(String(input.text || ""), { delay: 25 });
      break;
    case "key":
      await page.keyboard.press(mapKey(input.text || ""));
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
      await page.mouse.move(state.x, state.y);
      await page.mouse.wheel(dx, dy);
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

// Replace all but the most recent CU_KEEP_IMAGES tool_result screenshots with a
// short text stub so the conversation's image-token cost stays bounded.
function pruneImages(messages) {
  const refs = [];
  for (let i = 0; i < messages.length; i++) {
    const c = messages[i].content;
    if (!Array.isArray(c)) continue;
    for (let j = 0; j < c.length; j++) {
      const blk = c[j];
      if (blk && blk.type === "tool_result" && Array.isArray(blk.content)) {
        for (let k = 0; k < blk.content.length; k++) {
          if (blk.content[k] && blk.content[k].type === "image") refs.push([i, j, k]);
        }
      }
    }
  }
  const drop = refs.slice(0, Math.max(0, refs.length - CU_KEEP_IMAGES));
  for (const [i, j, k] of drop) {
    messages[i].content[j].content[k] = { type: "text", text: "[earlier screenshot omitted]" };
  }
}

// Drives the app with Claude. Returns the number of agent steps taken.
// Throws if the API key is missing or any request fails (caller falls back).
async function runComputerUse(page) {
  if (!API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
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
    pruneImages(messages);
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
  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport: { width: VIEW_W, height: VIEW_H },
    recordVideo: { dir: OUTPUT_DIR, size: { width: VIEW_W, height: VIEW_H } },
  });
  const videoStart = Date.now();
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

  // Everything before this point is dead load time the final video trims off.
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
      mode,
      steps,
      interactionStartMs: interactionStart - videoStart,
      interactionEndMs: interactionEnd - videoStart,
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
