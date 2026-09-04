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
// (the same reason record helpers are kept as strings). Keep this
// body plain JS, and NO backticks inside it.
import type { Page } from "playwright-core";

export type NfCursor = {
  setPos(x: number, y: number): void;
  pos(): { x: number; y: number };
  moveTo(x: number, y: number, dur: number): Promise<void>;
  press(): void;
  down(): void; // grab: ripple + ring eases to pressed scale and HOLDS (drag)
  up(): void; // release: ring eases back to rest
  // 가시성(2026-08-25): 커서는 "조작하는 비트"에서만 화면에 있다. 설치 직후는
  // 숨김이고, 조작 액션이 프레임 안에서 페이드인시킨 뒤 목표로 글라이드한다.
  show(dur: number): void;
  hide(dur: number): void;
  visible(): boolean;
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
    // background/border/filter/opacity carry !important: the overlay is a CANVAS
    // element, so a target app's bare "canvas { background: ... }" rule would
    // otherwise paint it OPAQUE over the whole viewport and blank the entire take
    // (found 2026-07-12 via probe-sketch — the sketch fixture styles bare canvas).
    canvas.style.cssText = "position:fixed !important;inset:0 !important;pointer-events:none !important;" +
      "z-index:2147483647 !important;background:transparent !important;border:none !important;" +
      "filter:none !important;opacity:1 !important;";
    var ctx = canvas.getContext("2d");
    var sizeCanvas = () => {
      var dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      canvas.style.setProperty("width", window.innerWidth + "px", "important");
      canvas.style.setProperty("height", window.innerHeight + "px", "important");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    sizeCanvas();
    // 리사이즈는 캔버스 백킹스토어를 새로 잡으면서 그림을 통째로 지운다. 애니메이션
    // 루프는 할 일이 없으면 멈춰 있으므로(raf=0) 아무도 다시 그리지 않았다 →
    // **창 크기가 한 번 바뀌면 커서가 화면에서 증발**(2026-08-25 프로브로 실증:
    // 리사이즈 직후 그려진 픽셀 1302 → 0). 크기를 다시 잡은 뒤엔 반드시 kick().
    window.addEventListener("resize", () => { sizeCanvas(); kick(); });
    document.documentElement.appendChild(canvas);

    var easeInOut = (p) => p < 0.5 ? 4*p*p*p : 1 - Math.pow(-2*p+2, 3)/2;
    var cx = window.innerWidth/2, cy = window.innerHeight/2, scale = 1;
    // alpha=0 으로 설치된다: 아무 조작도 없는 구간(스크롤·focus 비트·페이지 이동
    // 직후)에 커서가 화면 한복판에 붙박이로 떠 있던 것의 수리. 조작 액션만 show().
    var alpha = 0, fadeFrom = 0, fadeTo = 0, fadeT0 = -1, fadeDur = 200;
    var glide = null, pressT0 = -1, raf = 0;
    var holdT0 = -1, releaseT0 = -1;
    var PRESS_MS = 260, RIPPLE_MS = 520, HOLD_EASE_MS = 140, HOLD_SCALE = 0.82;
    var ripples = [];

    var draw = () => {
      var w = window.innerWidth, h = window.innerHeight, now = performance.now();
      ctx.clearRect(0, 0, w, h);
      if (alpha <= 0.01) return; // 숨김: 캔버스를 비운 채로 끝낸다
      ctx.globalAlpha = alpha;
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
      // 대비 강화(2026-08-20 사용자 판정 "회색이라 잘 안 보임"): 반투명 회색
      // 0.30 → 잉크 0.62 + 흰 헤일로를 키워 밝은/어두운 배경 어디서든 읽히게.
      ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI*2);
      ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 6; ctx.stroke();
      ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 16; ctx.shadowOffsetY = 4;
      ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI*2);
      ctx.fillStyle = "rgba(20,20,28,0.62)"; ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,255,255,0.96)"; ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
    };

    var frame = () => {
      var now = performance.now(), busy = false;
      if (fadeT0 >= 0) {
        var fp = Math.min(1, (now - fadeT0) / fadeDur);
        alpha = fadeFrom + (fadeTo - fadeFrom)*easeInOut(fp);
        if (fp >= 1) { fadeT0 = -1; alpha = fadeTo; } else busy = true;
      }
      if (glide) {
        var p = Math.min(1, (now - glide.t0) / glide.dur), e = easeInOut(p);
        cx = glide.x0 + (glide.xT - glide.x0)*e;
        cy = glide.y0 + (glide.yT - glide.y0)*e;
        if (p >= 1) { var r = glide.resolve; glide = null; r(); } else busy = true;
      }
      if (holdT0 >= 0) {
        // Drag grab: ease down to the held scale and STAY there until up().
        var hp = Math.min(1, (now - holdT0) / HOLD_EASE_MS);
        scale = 1 - (1 - HOLD_SCALE)*easeInOut(hp);
        if (hp < 1) busy = true;
      } else if (releaseT0 >= 0) {
        var rlp = Math.min(1, (now - releaseT0) / HOLD_EASE_MS);
        scale = HOLD_SCALE + (1 - HOLD_SCALE)*easeInOut(rlp);
        if (rlp >= 1) { releaseT0 = -1; scale = 1; } else busy = true;
      } else if (pressT0 >= 0) {
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
      down: () => {
        holdT0 = performance.now(); releaseT0 = -1; pressT0 = -1;
        ripples.push({ x: cx, y: cy, t0: performance.now() });
        kick();
      },
      up: () => {
        if (holdT0 < 0) return;
        holdT0 = -1; releaseT0 = performance.now(); kick();
      },
      show: (dur) => {
        fadeFrom = alpha; fadeTo = 1;
        fadeT0 = performance.now(); fadeDur = Math.max(1, dur || 200); kick();
      },
      hide: (dur) => {
        fadeFrom = alpha; fadeTo = 0;
        fadeT0 = performance.now(); fadeDur = Math.max(1, dur || 200); kick();
      },
      // "지금 필름에 있나" — 페이드 중이면 도착점 기준(등장 중=있다고 본다).
      visible: () => fadeT0 >= 0 ? fadeTo > 0.5 : alpha > 0.5,
      reset: () => {
        glide = null; pressT0 = -1; holdT0 = -1; releaseT0 = -1;
        ripples.length = 0; scale = 1;
        alpha = 0; fadeTo = 0; fadeT0 = -1;
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

// 가시성 드라이버(2026-08-25). show/hide는 페이드가 끝날 때까지 Node 쪽에서
// 기다려 준다 — 페이드 도중에 글라이드가 시작되면 "반쯤 투명한 커서가 이미
// 움직이는" 어정쩡한 등장이 되기 때문.
export const cursorShow = async (page: Page, dur: number) => {
  await page.evaluate((d) => window.__nfCursor!.show(d), dur);
  await new Promise((r) => setTimeout(r, dur));
};

export const cursorHide = async (page: Page, dur: number) => {
  if (!(await cursorVisible(page))) return; // 이미 숨김 = 할 일 없음
  await page.evaluate((d) => window.__nfCursor!.hide(d), dur);
  await new Promise((r) => setTimeout(r, dur));
};

export const cursorVisible = (page: Page) =>
  page.evaluate(() => !!window.__nfCursor?.visible()).catch(() => false);

export const cursorMoveTo = (page: Page, x: number, y: number, dur: number) =>
  page.evaluate(
    ([x, y, d]) => window.__nfCursor!.moveTo(x, y, d),
    [x, y, dur] as [number, number, number],
  );

// Fire-and-forget: the press/ripple animates in-page while Node dispatches the
// real click. Not awaited so the ripple overlaps the actual mouse event.
export const cursorPress = (page: Page) =>
  page.evaluate(() => window.__nfCursor!.press()).catch(() => {});

// Drag grab/release visuals (fire-and-forget, same rationale as cursorPress).
export const cursorDown = (page: Page) =>
  page.evaluate(() => window.__nfCursor!.down()).catch(() => {});
export const cursorUp = (page: Page) =>
  page.evaluate(() => window.__nfCursor!.up()).catch(() => {});
