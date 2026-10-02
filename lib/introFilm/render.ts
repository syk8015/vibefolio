// 소개 영상 그리기 — 대본 + 스타일 → SVG 하나, `render(t)`는 시간 t의 순수 함수.
//
// 같은 코드가 검토 창 미리보기·명함 재생·워커 영상 렌더에 쓰인다(미리보기 = 결과).
// 지킬 것(npm test `probe-intro-film-unit`가 이 폴더를 검사한다): 시계·애니메이션 프레임·타이머·
// 시드 없는 난수·CSS 애니메이션을 쓰지 않는다. 시간은 오직 render(t)의 t에서 온다.
// 글꼴은 부르는 쪽이 다 불러온 뒤 createFilm을 부른다(글자 폭을 재서 배치한다).
import { SCENE_SECONDS, honestyLabel, type IntroFilm, type IntroScene, type Loc } from "./schema";
import { mixHex, luminance, type Palette, type ResolvedStyle, INTRO_FONTS } from "./styles";
import { SAFE_ZONES, type IntroSurface } from "./safeZones";

const NS = "http://www.w3.org/2000/svg";
export const FILM_W = 1600;
export const FILM_H = 900;
const CELL = 1800;

export type FilmOptions = {
  locale: "en" | "ko";
  /** 같은 문서에 영상이 여러 개면 서로 다른 값(SVG id 충돌 방지). */
  idPrefix?: string;
  /** 가족 이름 → 실제 CSS 이름(next/font가 붙이는 이름 등). */
  fontMap?: Partial<Record<string, string>>;
  /** 가려지는 곳 그리기(검토 창 확인용). */
  showSafe?: IntroSurface | null;
};
export type Film = { duration: number; starts: number[]; render: (t: number) => void };

type Ease = (t: number) => number;
const clamp = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const E: Record<string, Ease> = {
  expoOut: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  expoInOut: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
  quartInOut: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  sineInOut: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  cubicIn: (t) => t * t * t,
};
const prog = (t: number, a: number, d: number, e = "expoOut") => (d <= 0 ? (t >= a ? 1 : 0) : E[e](clamp((t - a) / d)));

function el(tag: string, attrs: Record<string, string | number>, parent?: Element): SVGElement {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, String(attrs[k]));
  if (parent) parent.appendChild(n);
  return n as SVGElement;
}

/** 시드 고정 잡음 그림(필름 입자·종이). 매번 같은 그림이 나와야 프레임이 같다. */
const noiseCache: Record<string, string> = {};
function noise(size: number, warm: boolean): string {
  const key = `${size}:${warm}`;
  if (noiseCache[key]) return noiseCache[key];
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const x = c.getContext("2d")!;
  const img = x.createImageData(size, size);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rnd() * 255;
    img.data[i] = v; img.data[i + 1] = warm ? v * 0.92 : v; img.data[i + 2] = warm ? v * 0.8 : v; img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return (noiseCache[key] = c.toDataURL());
}

type Font = { family: string; weight: number; ls: number; size: number };
/** CSS 글꼴 이름. next/font가 주는 이름은 이미 따옴표·대체 글꼴 목록이 붙어 있어 그대로 쓴다. */
const cssFamily = (f: string) => (/[',"]/.test(f) ? f : `"${f}"`);

export function createFilm(svg: SVGSVGElement, film: IntroFilm, S: ResolvedStyle, opt: FilmOptions): Film {
  const loc = opt.locale, id = opt.idPrefix ?? "nf", fam = (n: string) => opt.fontMap?.[n] ?? n;
  const tr = (v: Loc | string | undefined) => (v == null ? "" : typeof v === "string" ? v : v[loc] || v.en || "");
  svg.innerHTML = "";
  svg.setAttribute("viewBox", `0 0 ${FILM_W} ${FILM_H}`);
  const T = S.type, M = S.motion, X = S.texture, PAL = S.color.scenes, shapes = X.shapes;
  const ups: ((t: number) => void)[] = [];
  let cid = 0;

  const defs = el("defs", {}, svg);
  const wobF = el("filter", { id: id + "wob" }, defs);
  el("feTurbulence", { type: "fractalNoise", baseFrequency: 0.018, numOctaves: 2, seed: 7 }, wobF);
  el("feDisplacementMap", { in: "SourceGraphic", scale: 5 }, wobF);
  const mbF = el("filter", { id: id + "mb", x: "-20%", y: "-20%", width: "140%", height: "140%" }, defs);
  const mbBlur = el("feGaussianBlur", { stdDeviation: "0 0" }, mbF);
  const tipF = el("filter", { id: id + "tip", x: "-300%", y: "-300%", width: "700%", height: "700%" }, defs);
  el("feGaussianBlur", { stdDeviation: 6 }, tipF);
  const glowG = el("radialGradient", { id: id + "glow", cx: "50%", cy: "42%", r: "62%" }, defs);
  const vigG = el("radialGradient", { id: id + "vig", cx: "50%", cy: "50%", r: "75%" }, defs);
  el("stop", { offset: "55%", "stop-color": "#000", "stop-opacity": 0 }, vigG);
  el("stop", { offset: "100%", "stop-color": "#000", "stop-opacity": 0.6 }, vigG);
  const gpat = el("pattern", { id: id + "noise", patternUnits: "userSpaceOnUse", width: 180, height: 180 }, defs);
  el("image", { href: noise(180, false), width: 180, height: 180 }, gpat);
  const ppat = el("pattern", { id: id + "paper", patternUnits: "userSpaceOnUse", width: 256, height: 256 }, defs);
  el("image", { href: noise(256, true), width: 256, height: 256 }, ppat);

  const cv = document.createElement("canvas").getContext("2d")!;
  const fnt = (role: "display" | "text" | "label", size: number): Font => {
    const r = T[role], ko = loc === "ko";
    return {
      family: fam(ko ? r.ko : r.f),
      weight: ko ? Math.max(500, Math.min(800, r.w + (r.w < 400 ? 200 : 0))) : r.w,
      ls: ko ? Math.max(-1, Math.min(r.ls, 2)) : r.ls,
      size,
    };
  };
  const measure = (s: string, f: Font) => {
    cv.font = `${f.weight} ${f.size}px ${cssFamily(f.family)}`;
    return cv.measureText(s).width + f.ls * Math.max(0, [...s].length - 1);
  };
  const fit = (s: string, f: Font, maxW: number) => {
    const w = measure(s, f);
    if (w > maxW) f.size = Math.floor((f.size * maxW) / w);
    return f;
  };
  const txt = (parent: Element, s: string, x: number, y: number, f: Font, fill: string, anchor = "start") => {
    const t = el("text", { x, y, "font-family": `${cssFamily(f.family)},sans-serif`, "font-size": f.size, "font-weight": f.weight, fill, "text-anchor": anchor }, parent);
    if (f.ls) t.setAttribute("letter-spacing", String(f.ls));
    t.textContent = s;
    return t;
  };

  /** 글자 줄 등장 — 글자 스타일의 방식(선 뒤에서 올라옴 · 흐림에서 또렷 · 살짝 기울며 그려짐). */
  function line(parent: Element, s: string, x: number, y: number, f: Font, fill: string, anchor: string, at: number, o: { maxW?: number; whole?: boolean } = {}) {
    if (o.maxW) fit(s, f, o.maxW);
    const g = el("g", {}, parent), kind = M.enter, words = o.whole ? [s] : s.split(" ");
    if (kind === "mask") {
      const cpId = `${id}c${cid++}`;
      const cp = el("clipPath", { id: cpId, clipPathUnits: "userSpaceOnUse" }, defs);
      el("rect", { x: -1e5, y: y - f.size * 1.05, width: 2e5, height: f.size * 1.4 }, cp);
      g.setAttribute("clip-path", `url(#${cpId})`);
    }
    const sp = measure(" ", f), ws = words.map((w) => measure(w, f));
    const tot = ws.reduce((a, b) => a + b, 0) + sp * (words.length - 1);
    let cx = anchor === "middle" ? x - tot / 2 : anchor === "end" ? x - tot : x;
    const nodes = words.map((w, i) => { const n = txt(g, w, cx, y, f, fill); cx += ws[i] + sp; return n; });
    ups.push((t) => {
      nodes.forEach((n, i) => {
        const p = prog(t, at + i * M.stagger, M.inDur);
        let tf: string, op: number, fl = "none";
        if (kind === "mask") { tf = `translate(0,${((1 - p) * f.size * 1.2).toFixed(1)})`; op = clamp(p * 1.6); }
        else if (kind === "blur") { tf = `translate(0,${((1 - p) * 18).toFixed(1)})`; op = p; if (p < 0.999) fl = `blur(${((1 - p) * 14).toFixed(1)}px)`; }
        else { tf = `translate(0,${((1 - p) * 12).toFixed(1)}) rotate(${((1 - p) * -3).toFixed(2)})`; op = clamp(p * 1.5); }
        n.setAttribute("transform", tf);
        n.setAttribute("opacity", op.toFixed(3));
        n.style.filter = fl;
      });
    });
    return g;
  }
  function pop(node: SVGElement, at: number, cx: number, cy: number) {
    ups.push((t) => {
      const p = prog(t, at, M.inDur * 0.9), s = 0.9 + 0.1 * p;
      node.setAttribute("opacity", clamp(p * 1.5).toFixed(3));
      node.setAttribute("transform", `translate(${cx},${cy}) scale(${s.toFixed(4)}) translate(${-cx},${-cy})`);
      if (M.enter === "blur") node.style.filter = p < 0.999 ? `blur(${((1 - p) * 10).toFixed(1)}px)` : "none";
    });
  }
  /** 도형 — 분위기의 질감(손그림 낙서 · 색 면 · 가는 선). */
  function box(parent: Element, x: number, y: number, w: number, h: number, r: number, C: Palette, fill?: string) {
    const g = el("g", {}, parent);
    if (shapes === "doodle") {
      el("rect", { x: x + 9, y: y + 8, width: w, height: h, rx: r, fill: mixHex(C.accent, C.bg, 0.55) }, g);
      el("rect", { x, y, width: w, height: h, rx: r, fill: "none", stroke: C.ink, "stroke-width": 6, filter: `url(#${id}wob)` }, g);
    } else if (shapes === "block") {
      el("rect", { x, y, width: w, height: h, rx: r, fill: fill ?? mixHex(C.bg, C.ink, 0.1) }, g);
    } else {
      el("rect", { x, y, width: w, height: h, rx: r, fill: mixHex(C.bg, "#ffffff", 0.03), stroke: C.line, "stroke-opacity": 0.4, "stroke-width": 2 }, g);
    }
    return g;
  }
  const onColor = (fill: string, C: Palette) =>
    Math.abs(luminance(fill) - luminance(C.ink)) > Math.abs(luminance(fill) - luminance(C.bg)) ? C.ink : C.bg;
  function wire(parent: Element, d: string, C: Palette, at: number, dur: number) {
    const p = el("path", {
      d, fill: "none", stroke: C.line, "stroke-opacity": shapes === "line" ? 0.3 : 0.85,
      "stroke-width": shapes === "doodle" ? 6 : shapes === "block" ? 8 : 2, "stroke-linecap": "round",
    }, parent) as SVGPathElement;
    if (shapes === "doodle") p.setAttribute("filter", `url(#${id}wob)`);
    const len = p.getTotalLength();
    p.setAttribute("stroke-dasharray", String(len));
    const tip = X.glow > 0.3 ? el("circle", { r: 7, fill: C.ink, filter: `url(#${id}tip)` }, parent) : null;
    ups.push((t) => {
      const q = prog(t, at, dur, "quartInOut");
      p.setAttribute("stroke-dashoffset", (len * (1 - q)).toFixed(1));
      if (tip) {
        const on = q > 0 && q < 1;
        tip.setAttribute("opacity", on ? "1" : "0");
        if (on) { const pt = p.getPointAtLength(len * q); tip.setAttribute("cx", String(pt.x)); tip.setAttribute("cy", String(pt.y)); }
      }
    });
  }
  /** 큰 숫자 + 단위. "68%" → 68 + %, "$0" → $0, "12,480" → 쉼표 유지하며 세기. */
  function bigNumber(parent: Element, value: string, unitOverride: string | null, x: number, y: number, size: number, C: Palette, color: string, at: number, count: boolean) {
    const m = /^([^0-9]*)([0-9][0-9,]*)(.*)$/.exec(value);
    const pre = m ? m[1] : "", digits = m ? m[2] : value, rest = m ? m[3].trim() : "";
    const unit = unitOverride ?? rest, main = pre + digits + (unitOverride != null ? rest : "");
    const fN = fnt("display", size), fU = fnt("text", Math.round(size * 0.42)), gap = size * 0.08;
    const wN = measure(main, fN) + fN.ls, wU = unit ? measure(unit, fU) + gap : 0, left = x - (wN + wU) / 2;
    const g = el("g", {}, parent);
    const n = txt(g, main, left, y, fN, color);
    if (unit) txt(g, unit, left + wN + gap, y, fU, C.sub);
    pop(g, at, x, y - size * 0.35);
    const target = parseInt(digits.replace(/,/g, ""), 10);
    if (count && m && !isNaN(target)) {
      const comma = digits.includes(","), from = Math.round(target * 0.6);
      ups.push((t) => {
        const v = Math.round(from + (target - from) * prog(t, at, M.count));
        n.textContent = pre + (comma ? v.toLocaleString("en-US") : String(v));
      });
    }
    return g;
  }

  // ── 장면 배치: 장면마다 한 칸(가로 1800), 카메라가 칸 사이를 옮긴다 ─────────────────
  const scenes = film.scenes, starts: number[] = [];
  let acc = 0;
  for (const s of scenes) { starts.push(acc); acc += SCENE_SECONDS[s.kind] ?? 4.6; }
  const total = acc, pan = M.pan;
  el("rect", { width: FILM_W, height: FILM_H, fill: PAL[0].bg }, svg);
  const glowR = el("rect", { width: FILM_W, height: FILM_H, fill: `url(#${id}glow)`, opacity: X.glow * 0.9 }, svg);
  const cam = el("g", {}, svg), world = el("g", { filter: `url(#${id}mb)` }, cam);
  const cells: { g: SVGElement; s: number; e: number }[] = [];

  scenes.forEach((sc, i) => {
    const C = PAL[i % PAL.length], ox = i * CELL, s0 = starts[i];
    const at = s0 + (i > 0 && pan > 0.25 ? pan * 0.4 : 0.2);
    el("rect", { x: ox - 100, y: -400, width: CELL, height: FILM_H + 800, fill: C.bg }, world);
    const g = el("g", {}, world);
    cells.push({ g, s: s0, e: s0 + (SCENE_SECONDS[sc.kind] ?? 4.6) });
    const L = (s: string, x: number, y: number, role: "display" | "text" | "label", size: number, fill: string, anchor: string, a: number, o?: { maxW?: number; whole?: boolean }) =>
      line(g, s, ox + x, y, fnt(role, Math.round(size * (role === "label" ? 1 : T.scale))), fill, anchor, a, o);
    drawScene(sc, C, ox, at, g, L);
  });

  function drawScene(
    sc: IntroScene, C: Palette, ox: number, at: number, g: SVGElement,
    L: (s: string, x: number, y: number, role: "display" | "text" | "label", size: number, fill: string, anchor: string, a: number, o?: { maxW?: number; whole?: boolean }) => SVGElement,
  ) {
    switch (sc.kind) {
      case "hook":
        L(tr(sc.label), 800, 205, "label", 22, C.sub, "middle", at, { whole: true, maxW: 1100 });
        bigNumber(g, sc.value, null, ox + 800, 575, 380, C, sc.alarm ? C.accent : C.ink, at + 0.15, true);
        L(tr(sc.line), 800, 745, "text", 72, C.ink, "middle", at + 1.9, { maxW: 1240 });
        return;
      case "story":
        L(tr(sc.line), 800, 400, "text", 96, C.sub, "middle", at, { maxW: 1280 });
        L(tr(sc.line2), 800, 540, "display", 130, C.ink, "middle", at + 0.5, { maxW: 1280 });
        return;
      case "items": {
        const n = sc.items.length, gap = Math.min(300, 1240 / n), x0 = 800 - (gap * (n - 1)) / 2;
        sc.items.forEach((it, k) => {
          const x = x0 + k * gap, a = at + k * 0.09;
          if (shapes !== "line") {
            const b = box(g, ox + x - gap * 0.42, 230, gap * 0.84, 300, shapes === "doodle" ? 24 : 28, C, it.alarm ? C.accent : mixHex(C.bg, C.ink, 0.1));
            pop(b, a, ox + x, 380);
          }
          const col = it.alarm ? (shapes === "block" ? onColor(C.accent, C) : C.accent) : C.ink;
          bigNumber(g, it.value, null, ox + x, 430, Math.min(150, gap * 0.5), C, col, a + 0.05, false);
          L(tr(it.label).toUpperCase(), x, 495, "label", 17, shapes === "block" && it.alarm ? onColor(C.accent, C) : C.sub, "middle", a + 0.2, { whole: true, maxW: gap * 0.8 });
        });
        L(tr(sc.line), 800, 745, "text", 62, C.ink, "middle", at + 1.2, { maxW: 1240 });
        return;
      }
      case "flow": {
        const nn = sc.nodes.length, step = 1080 / (nn - 1), fx = 260;
        sc.nodes.forEach((nd, k) => {
          const x = fx + k * step, a = at + 0.3 + k * 0.55, sz = 96;
          const b = box(g, ox + x - sz / 2, 360 - sz / 2, sz, sz, shapes === "line" ? 18 : 22, C, k === nn - 1 ? C.accent : mixHex(C.bg, C.ink, 0.12));
          pop(b, a, ox + x, 360);
          L(tr(nd).toUpperCase(), x, 470, "label", 17, C.sub, "middle", a + 0.1, { whole: true, maxW: step * 0.9 });
          if (k < nn - 1) wire(g, `M${ox + x + sz / 2 + 10} 360 H ${ox + x + step - sz / 2 - 10}`, C, a + 0.15, 0.55);
        });
        L(tr(sc.line), 800, 720, "text", 60, C.ink, "middle", at + 0.6, { maxW: 1240 });
        return;
      }
      case "terminal": {
        const tb = box(g, ox + 240, 150, 1120, 470, 22, C, mixHex(C.bg, C.ink, 0.08));
        pop(tb, at, ox + 800, 385);
        [0, 1, 2].forEach((k) => el("circle", { cx: ox + 284 + k * 28, cy: 192, r: 8, fill: C.sub, opacity: 0.55 }, tb));
        const mono: Font = { family: fam(INTRO_FONTS.mono), weight: 500, ls: 0, size: 30 };
        const cmd = "$ " + sc.command, cmdT = txt(g, "", ox + 290, 270, mono, C.ink);
        const tStart = at + 0.5, tDur = sc.command.length * 0.035;
        ups.push((t) => {
          const k = Math.floor(clamp((t - tStart) / tDur) * cmd.length);
          const caret = (t - tStart) % 0.9 < 0.45 && k < cmd.length ? "▍" : "";
          cmdT.textContent = cmd.slice(0, Math.max(2, k)) + caret;
          cmdT.setAttribute("opacity", t >= at ? "1" : "0");
        });
        sc.output.forEach((ln, k) => {
          const o2 = txt(g, ln, ox + 290, 330 + k * 52, fit(ln, { ...mono }, 1020), k === 2 ? C.accent : C.sub);
          const a2 = tStart + tDur + 0.25 + k * 0.22;
          ups.push((t) => o2.setAttribute("opacity", t >= a2 ? "1" : "0"));
        });
        L(tr(sc.line), 800, 745, "text", 58, C.ink, "middle", tStart + tDur + 1.4, { maxW: 1240 });
        return;
      }
      case "alert": {
        const px = 330, phFill = mixHex(C.bg, C.ink, 0.1);
        const ph = box(g, ox + px, 140, 300, 600, 50, C, phFill);
        pop(ph, at, ox + px + 150, 440);
        txt(ph, "23:12", ox + px + 150, 280, { family: fam(INTRO_FONTS.ui), weight: 300, ls: 0, size: 64 }, shapes === "block" ? onColor(phFill, C) : C.ink, "middle");
        const note = el("g", {}, g);
        el("rect", { x: ox + px + 18, y: 344, width: 264, height: 120, rx: 22, fill: shapes === "block" ? C.ink : mixHex(C.bg, "#ffffff", 0.12), stroke: C.line, "stroke-opacity": shapes === "line" ? 0.2 : 0 }, note);
        el("circle", { cx: ox + px + 42, cy: 374, r: 6, fill: C.accent }, note);
        const nf = shapes === "block" ? C.bg : C.ink, uiFam = fam(loc === "ko" ? INTRO_FONTS.ko : INTRO_FONTS.ui);
        txt(note, tr(sc.title), ox + px + 36, 414, fit(tr(sc.title), { family: uiFam, weight: 600, ls: 0, size: 21 }, 230), nf);
        txt(note, tr(sc.body), ox + px + 36, 442, fit(tr(sc.body), { family: uiFam, weight: 400, ls: 0, size: 18 }, 230), nf);
        pop(note as SVGElement, at + 0.9, ox + px + 150, 404);
        L(tr(sc.line), 720, 420, "display", 110, C.ink, "start", at + 1.5, { maxW: 760 });
        L(tr(sc.line2), 720, 535, "text", 62, C.sub, "start", at + 1.9, { maxW: 760 });
        return;
      }
      case "stats": {
        const ns = sc.stats.length, sw = 1240 / ns, sx0 = 180;
        sc.stats.forEach((st, k) => {
          const x = sx0 + sw * k + sw / 2, a = at + k * 0.14, fillC = [C.accent, mixHex(C.bg, C.ink, 0.14), C.ink][k % 3];
          if (shapes !== "line") { const b = box(g, ox + x - sw * 0.44, 180, sw * 0.88, 380, 30, C, fillC); pop(b, a, ox + x, 370); }
          else if (k > 0) {
            const dv = el("path", { d: `M${ox + sx0 + sw * k} 220 V 520`, stroke: C.line, "stroke-opacity": 0.25, "stroke-width": 2 }, g);
            pop(dv, a, ox + sx0 + sw * k, 370);
          }
          const tc = shapes === "block" ? onColor(fillC, C) : C.ink;
          bigNumber(g, st.value, tr(st.unit), ox + x, 440, Math.min(190, sw * 0.42), C, tc, a + 0.05, false);
          L(tr(st.label).toUpperCase(), x, 505, "label", 17, shapes === "block" ? tc : C.sub, "middle", a + 0.25, { whole: true, maxW: sw * 0.8 });
        });
        L(tr(sc.line), 800, 720, "text", 60, C.ink, "middle", at + 1.1, { maxW: 1240 });
        return;
      }
      case "ending":
        L(tr(sc.line), 800, 390, "text", 100, C.sub, "middle", at, { maxW: 1280 });
        L(tr(sc.line2), 800, 530, "display", 130, C.ink, "middle", at + 0.5, { maxW: 1300 });
        L(tr(sc.name), 800, 660, "label", 20, C.sub, "middle", at + 1.4, { whole: true, maxW: 1200 });
        return;
    }
  }

  // ── 화면 위 층: 종이·입자·그늘·정직 표시·가려지는 곳 ─────────────────────────────
  const paperR = el("rect", { width: FILM_W, height: FILM_H, fill: `url(#${id}paper)`, opacity: X.paper * 0.16 }, svg);
  paperR.style.mixBlendMode = "multiply";
  const grainR = el("rect", { x: -180, y: -180, width: FILM_W + 360, height: FILM_H + 360, fill: `url(#${id}noise)`, opacity: X.grain }, svg);
  el("rect", { width: FILM_W, height: FILM_H, fill: `url(#${id}vig)`, opacity: X.vignette }, svg);
  const tag = el("g", {}, svg);
  const tagBg = el("rect", { y: 840, height: 38, rx: 19, fill: "#000", "fill-opacity": 0.38 }, tag);
  const tagT = el("text", { y: 865, "text-anchor": "middle", "font-family": `${cssFamily(fam(INTRO_FONTS.mono))},monospace`, "font-size": 16, fill: "#ece6da" }, tag);
  if (opt.showSafe) {
    const sg = el("g", { "pointer-events": "none" }, svg);
    for (const z of SAFE_ZONES[opt.showSafe]) {
      el("rect", { x: z.x, y: z.y, width: z.w, height: z.h, rx: 12, fill: "#ff3b30", "fill-opacity": 0.2, stroke: "#ff3b30", "stroke-dasharray": "10 8", "stroke-width": 3 }, sg);
    }
  }

  const camX = (t: number) => {
    let x = 800;
    for (let i = 1; i < scenes.length; i++) {
      x += CELL * (pan > 0.05 ? E.expoInOut(clamp((t - (starts[i] - pan / 2)) / pan)) : t >= starts[i] ? 1 : 0);
    }
    return x;
  };
  const sceneAt = (t: number) => { let i = 0; for (let k = 0; k < starts.length; k++) if (t >= starts[k]) i = k; return i; };
  let lastGrain = -1, lastScene = -1;

  return {
    duration: total,
    starts,
    render(t: number) {
      const i = sceneAt(t), C = PAL[i % PAL.length], sc = scenes[i];
      const x = camX(t), x0 = camX(Math.max(0, t - 1 / 30));
      const z = 1 + M.push * E.sineInOut(clamp((t - starts[i]) / (SCENE_SECONDS[sc.kind] ?? 4.6)));
      cam.setAttribute("transform", `translate(800,450) scale(${z.toFixed(4)}) translate(${(-x).toFixed(2)},-450)`);
      mbBlur.setAttribute("stdDeviation", `${Math.min(28, Math.abs(x - x0) * 0.45 * M.blur).toFixed(2)} 0`);
      for (const c of cells) {
        c.g.style.display = t > c.s - 2.2 && t < c.e + 2.2 ? "" : "none";
        if (pan < 0.3) c.g.setAttribute("opacity", (1 - prog(t, c.e - 0.25, 0.25, "cubicIn")).toFixed(3));
      }
      for (const u of ups) u(t);
      if (i !== lastScene) {
        lastScene = i;
        glowG.innerHTML = "";
        el("stop", { offset: "0%", "stop-color": C.glow, "stop-opacity": 1 }, glowG);
        el("stop", { offset: "100%", "stop-color": C.bg, "stop-opacity": 0 }, glowG);
        glowR.setAttribute("fill", `url(#${id}glow)`);
        const label = honestyLabel(sc, loc);
        tagT.textContent = label;
        tag.setAttribute("opacity", label ? "1" : "0");
        const tw = [...label].length * 10 + 36;
        tagBg.setAttribute("x", String(1500 - tw)); tagBg.setAttribute("width", String(tw)); tagT.setAttribute("x", String(1500 - tw / 2));
      }
      const gf = Math.floor(t * 24);
      if (gf !== lastGrain) { lastGrain = gf; grainR.setAttribute("transform", `translate(${(gf * 67) % 180},${(gf * 113) % 180})`); }
    },
  };
}
