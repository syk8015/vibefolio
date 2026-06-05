// Synthetic cursor + click ripple, drawn on a full-screen <canvas> overlay.
//
// Why synthetic: the OS cursor is hidden in capture (record.ts -capture_cursor 0)
// so a real click would look like "nothing happened". We draw our own.
//
// trap A: this is the LOCAL real-time path, so NONE of the E2B virtual-time cursor
// hacks apply — no paint pump, no "rAF ts vs performance.now" dance, no last-frame
// reuse. It is a plain rAF animation; performance.now() is the correct clock. The
// overlay is `pointer-events:none` at max z-index, so real page.mouse clicks pass
// straight through to the page beneath; the canvas just narrates them.
//
// The overlay body ships as a STRING (not a function): tsx/esbuild rewraps named
// functions with a `__name(...)` helper for `.name` preservation, and when
// Playwright serializes a passed function via toString() that helper is undefined
// in the page → "__name is not defined". A string is injected verbatim, untouched
// (the same reason src/trigger keeps RECORD_HELPER_SRC as a string). Keep this
// body plain JS, and NO backticks inside it.
import type { Page } from "playwright-core";

export type NfCursor = {
  setPos(x: number, y: number): void;
  pos(): { x: number; y: number };
  moveTo(x: number, y: number, dur: number): Promise<void>;
  press(): void;
  reset(): void;
};

declare global {
  interface Window {
    __nfCursor?: NfCursor;
  }
}

// Self-installing IIFE. Idempotent (guards on window.__nfCursor). Defers to
// DOMContentLoaded if the document isn't ready yet (addInitScript runs at
// document_start). Drawn in logical px (canvas backing store ×DPR for crispness).
const OVERLAY_SRC = `(() => {
  var install = () => {
    if (window.__nfCursor) return;
    var canvas = document.createElement("canvas");
    canvas.id = "__nf_cursor_canvas";
    canvas.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
    var ctx = canvas.getContext("2d");
    var sizeCanvas = () => {
      var dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    sizeCanvas();
    window.addEventListener("resize", sizeCanvas);
    document.documentElement.appendChild(canvas);

    var easeInOut = (p) => p < 0.5 ? 4*p*p*p : 1 - Math.pow(-2*p+2, 3)/2;
    var cx = window.innerWidth/2, cy = window.innerHeight/2, scale = 1;
    var glide = null, pressT0 = -1, raf = 0;
    var PRESS_MS = 260, RIPPLE_MS = 520;
    var ripples = [];

    var draw = () => {
      var w = window.innerWidth, h = window.innerHeight, now = performance.now();
      ctx.clearRect(0, 0, w, h);
      for (var i = ripples.length - 1; i >= 0; i--) {
        var rp = Math.min(1, (now - ripples[i].t0) / RIPPLE_MS);
        ctx.beginPath();
        ctx.arc(ripples[i].x, ripples[i].y, 9*(1 + 2.6*rp), 0, Math.PI*2);
        ctx.strokeStyle = "rgba(90,150,255," + (0.85*(1 - rp)) + ")";
        ctx.lineWidth = 2; ctx.stroke();
        if (rp >= 1) ripples.splice(i, 1);
      }
      ctx.save();
      ctx.translate(cx, cy); ctx.scale(scale, scale);
      ctx.beginPath(); ctx.arc(0, 0, 15.5, 0, Math.PI*2);
      ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.lineWidth = 5; ctx.stroke();
      ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 16; ctx.shadowOffsetY = 4;
      ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI*2);
      ctx.fillStyle = "rgba(20,20,28,0.30)"; ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,255,255,0.96)"; ctx.stroke();
      ctx.restore();
    };

    var frame = () => {
      var now = performance.now(), busy = false;
      if (glide) {
        var p = Math.min(1, (now - glide.t0) / glide.dur), e = easeInOut(p);
        cx = glide.x0 + (glide.xT - glide.x0)*e;
        cy = glide.y0 + (glide.yT - glide.y0)*e;
        if (p >= 1) { var r = glide.resolve; glide = null; r(); } else busy = true;
      }
      if (pressT0 >= 0) {
        var pp = Math.min(1, (now - pressT0) / PRESS_MS);
        scale = pp < 0.5 ? 1 - 0.2*easeInOut(pp/0.5) : 0.8 + 0.2*easeInOut((pp - 0.5)/0.5);
        if (pp >= 1) { pressT0 = -1; scale = 1; } else busy = true;
      }
      if (ripples.length) busy = true;
      draw();
      raf = busy ? requestAnimationFrame(frame) : 0;
    };
    var kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

    window.__nfCursor = {
      setPos: (x, y) => { cx = x; cy = y; kick(); },
      pos: () => ({ x: cx, y: cy }),
      moveTo: (x, y, dur) => new Promise((resolve) => {
        glide = { x0: cx, y0: cy, xT: x, yT: y, t0: performance.now(), dur: Math.max(1, dur), resolve: resolve };
        kick();
      }),
      press: () => {
        pressT0 = performance.now();
        ripples.push({ x: cx, y: cy, t0: performance.now() });
        kick();
      },
      reset: () => {
        glide = null; pressT0 = -1; ripples.length = 0; scale = 1;
        cx = window.innerWidth/2; cy = window.innerHeight/2; kick();
      },
    };
    kick();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
})();`;

// ── Node-side drivers ─────────────────────────────────────────────────────────

// Register the overlay so it (re)installs on every navigation in the take.
export async function injectCursorOverlay(page: Page): Promise<void> {
  await page.addInitScript({ content: OVERLAY_SRC });
}

// Guarantee the overlay is live on the CURRENT document (idempotent), then wait
// for the API. Call after goto — covers the case where the page was already
// loaded before addInitScript could run for it.
export async function ensureCursor(page: Page): Promise<void> {
  await page.evaluate(OVERLAY_SRC).catch(() => {});
  await page.waitForFunction(() => !!window.__nfCursor, undefined, { timeout: 8000 });
}

export const cursorSetPos = (page: Page, x: number, y: number) =>
  page.evaluate(([x, y]) => window.__nfCursor!.setPos(x, y), [x, y]);

export const cursorPos = (page: Page) =>
  page.evaluate(() => window.__nfCursor!.pos());

export const cursorMoveTo = (page: Page, x: number, y: number, dur: number) =>
  page.evaluate(
    ([x, y, d]) => window.__nfCursor!.moveTo(x, y, d),
    [x, y, dur] as [number, number, number],
  );

// Fire-and-forget: the press/ripple animates in-page while Node dispatches the
// real click. Not awaited so the ripple overlaps the actual mouse event.
export const cursorPress = (page: Page) =>
  page.evaluate(() => window.__nfCursor!.press()).catch(() => {});
