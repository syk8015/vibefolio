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
const CELL_Y = 1300;

/**
 * 장면 사이 전환(10-02 3차 품질 — "틀로 만든 느낌"의 뿌리는 모든 장면이 같은 미끄럼 전환이었다).
 * 마음에 들었던 2차 시안처럼 장면 짝마다 다르게 고른다. 고르는 건 장면 종류뿐이라 같은 대본은 늘 같은 전환이다.
 *   carry — 첫 장면의 큰 숫자가 작아지며 화면 위 구석에 남는다(이어 붙이기). 카메라는 아래로.
 *   slide — 오른쪽으로 이동(흐름·알림: 읽는 방향).  drop — 아래로 이동(숫자 장면).
 *   zoom  — 앞 장면 안으로 파고들어 다음 장면이 멀리서 다가온다(터미널·알림 — 흐름의 마지막 칸 "내 폰" 속으로).
 *   cut   — 박자에 맞춘 그냥 자르기(말 한 줄 장면).  fade — 검게 닫혔다 열기(끝 장면).
 *   wipe  — 산호색 판이 화면을 쓸고 지나간다. 영상마다 딱 한 번(결과 숫자 장면 앞) — 어두운 화면만 이어지면 단조롭다.
 */
type Trans = "carry" | "slide" | "drop" | "zoom" | "cut" | "fade" | "wipe";
function pickTransitions(scenes: IntroScene[]): Trans[] {
  const out: Trans[] = ["cut"];
  const move = (x: Trans) => (x === "carry" ? "drop" : x);
  for (let i = 1; i < scenes.length; i++) {
    const prev = scenes[i - 1].kind, cur = scenes[i].kind;
    let tr: Trans = prev === "hook" ? "carry"
      : cur === "ending" ? "fade"
      : cur === "terminal" || cur === "alert" ? "zoom"
      : cur === "stats" || cur === "items" ? "drop"
      : cur === "story" ? "cut"
      : "slide";
    // 같은 움직임이 두 번 이어지면 다른 쪽으로(되풀이가 곧 틀 느낌이다).
    if (i > 1 && move(tr) === move(out[i - 1]) && tr !== "fade") tr = move(tr) === "slide" ? "drop" : "slide";
    out.push(tr);
  }
  // 한 번의 색 뒤집기 — 결과·숫자 장면으로 들어가는 첫 전환(이어 붙이기는 그대로 둔다), 없으면 가운데쯤.
  let w = out.findIndex((x, i) => i > 1 && (scenes[i].kind === "stats" || scenes[i].kind === "items") && x !== "carry" && x !== "zoom");
  if (w < 0) w = out.findIndex((x, i) => i >= Math.floor(scenes.length / 2) && (x === "slide" || x === "drop" || x === "cut"));
  if (w > 0) out[w] = "wipe";
  return out;
}
/** 시드 고정 해시(0–1) — 흩어지는 조각·뒤섞인 글자처럼 "무작위처럼 보이는" 것도 프레임마다 같아야 한다. */
const hash = (a: number, b = 0) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
const SCRAMBLE = "#$%&*+/<=>?@[]{}0123456789ABCDEFXYZ";
const moving = (x: Trans | undefined) => x === "slide" || x === "drop" || x === "carry";

export type FilmOptions = {
  locale: "en" | "ko";
  /** 같은 문서에 영상이 여러 개면 서로 다른 값(SVG id 충돌 방지). */
  idPrefix?: string;
  /** 가족 이름 → 실제 CSS 이름(next/font가 붙이는 이름 등). */
  fontMap?: Partial<Record<string, string>>;
  /** 가려지는 곳 그리기(검토 창 확인용). */
  showSafe?: IntroSurface | null;
};
export type Film = { duration: number; starts: number[]; transitions: string[]; render: (t: number) => void };

type Ease = (t: number) => number;
const clamp = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const E: Record<string, Ease> = {
  expoOut: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  expoInOut: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
  quartInOut: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  cubicInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  sineInOut: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  cubicIn: (t) => t * t * t,
  expoIn: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  // 닫힌 꼴 용수철(감쇠비 0.8 — 1.5%만 살짝 넘었다가 앉는다). 시간의 순수 함수라 아무 프레임이나 바로 그린다.
  spring: (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const z = 0.8, w = 12, wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
  },
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
      // 한글은 자간을 좁히면 단어가 붙어 보인다(10-02) — 라벨만 살짝 벌리고 나머지는 0.
      ls: ko ? (role === "label" ? 2 : 0) : r.ls,
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
  function line(parent: Element, s: string, x: number, y: number, f: Font, fill: string, anchor: string, at: number, o: { maxW?: number; whole?: boolean; scramble?: boolean } = {}): SVGElement {
    if (o.maxW) fit(s, f, o.maxW);
    const g = el("g", {}, parent), kind = M.enter, words = o.whole ? [s] : s.split(" "), ex = curExit;
    if (kind === "mask") {
      const cpId = `${id}c${cid++}`;
      const cp = el("clipPath", { id: cpId, clipPathUnits: "userSpaceOnUse" }, defs);
      el("rect", { x: -1e5, y: y - f.size * 1.05, width: 2e5, height: f.size * 1.4 }, cp);
      g.setAttribute("clip-path", `url(#${cpId})`);
    }
    // 한글 글꼴의 띄어쓰기 폭은 좁아서 단어를 따로 놓으면 붙어 보였다 — 조금 넓힌다.
    const sp = measure(" ", f) * (loc === "ko" ? 1.25 : 1), ws = words.map((w) => measure(w, f));
    const tot = ws.reduce((a, b) => a + b, 0) + sp * (words.length - 1);
    let cx = anchor === "middle" ? x - tot / 2 : anchor === "end" ? x - tot : x;
    const nodes = words.map((w, i) => { const n = txt(g, w, cx, y, f, fill); cx += ws[i] + sp; return n; });
    if (o.scramble && words.length === 1) {
      // 뒤섞인 글자가 왼쪽부터 제자리를 찾는다(플랩 시계) — 한글은 그 줄의 글자 안에서만 섞는다(다른 글꼴로 튀지 않게).
      const chars = [...s], pool = /[^\x00-\x7f]/.test(s) ? chars.filter((c) => c !== " ") : [...SCRAMBLE];
      const n0 = nodes[0];
      ups.push((t) => {
        const k = Math.floor((t - at - 0.1) / 0.035);
        if (t < at || k >= chars.length) { if (n0.textContent !== s) n0.textContent = s; return; }
        const fr = Math.floor(t * 30);
        n0.textContent = chars.map((c, j) => (j < k || c === " " ? c : pool[Math.floor(hash(j, fr) * pool.length)])).join("");
      });
    }
    ups.push((t) => {
      nodes.forEach((n, i) => {
        const p = prog(t, at + i * M.stagger, M.inDur, "spring");
        // 나가기 — 다음 장면이 자르기·암전·숫자 이어 붙이기로 오면 글자가 먼저 빠진다(들어온 길 반대로).
        const q = ex == null ? 0 : prog(t, ex + i * 0.025, 0.32, "cubicIn");
        let tf: string, op: number, fl = "none";
        if (kind === "mask") { tf = `translate(0,${((1 - p) * f.size * 1.2 - q * f.size * 1.45).toFixed(1)})`; op = clamp(p * 1.6); }
        else if (kind === "blur") { tf = `translate(0,${((1 - p) * 18).toFixed(1)})`; op = clamp(p) * (1 - q); if (p < 0.999 || q > 0) fl = `blur(${(Math.max(0, 1 - p) * 14 + q * 10).toFixed(1)}px)`; }
        else { tf = `translate(0,${((1 - p) * 12).toFixed(1)}) rotate(${((1 - p) * -3).toFixed(2)})`; op = clamp(p * 1.5) * (1 - q); }
        n.setAttribute("transform", tf);
        n.setAttribute("opacity", op.toFixed(3));
        n.style.filter = fl;
      });
    });
    return g;
  }
  /**
   * 글 묶음을 세로 가운데(cy)에 쌓는다. 긴 문장은 글자를 줄이지 않고 두 줄로 나누고, 그만큼 묶음 전체가
   * 위아래로 자리를 다시 잡는다 — 줄마다 y를 박아 두면 두 줄이 된 문장이 다음 줄과 겹쳤다(10-02 품질 점검).
   */
  type StackItem = { s: string; role: "display" | "text" | "label"; size: number; fill: string; at: number; whole?: boolean; scramble?: boolean };
  /** 마지막 줄이 끝나는 자리(x, 글자 바닥선, 글자 크기) — 산호색 점이 마침표로 앉는다. */
  type LineEnd = { x: number; y: number; size: number; punct: boolean };
  function stack(parent: Element, items: StackItem[], x: number, cy: number, anchor: string, maxW: number): LineEnd | null {
    // 마지막 줄 끝의 마침표는 산호색 점이 대신한다("우리 집을 위해.." 두 번 찍히던 것, 10-03).
    const lastI = items.map((it) => !!it.s).lastIndexOf(true);
    items = items.map((it, k) => (k === lastI && /[.。]$/.test(it.s) ? { ...it, s: it.s.replace(/[.。]$/, "") } : it));
    const laid = items.filter((it) => it.s).map((it) => {
      const f = fnt(it.role, Math.round(it.size * (it.role === "label" ? 1 : T.scale)));
      let lines = [it.s];
      const words = it.s.split(" ");
      if (!it.whole && words.length >= 3 && measure(it.s, f) > maxW * 1.08) {
        let best = 1, bestW = Infinity;
        for (let k = 1; k < words.length; k++) {
          // 한글은 둘째 줄이 한 글자 낱말(게·것·수·때…)로 시작하면 꾸밈말과 갈라져 어색하다 — 그 자리는 피한다.
          const bad = loc === "ko" && [...words[k]].length === 1;
          const w = Math.max(measure(words.slice(0, k).join(" "), f), measure(words.slice(k).join(" "), f)) * (bad ? 1.4 : 1);
          if (w < bestW) { bestW = w; best = k; }
        }
        lines = [words.slice(0, best).join(" "), words.slice(best).join(" ")];
      }
      const widest = Math.max(...lines.map((l) => measure(l, f)));
      if (widest > maxW) f.size = Math.floor((f.size * maxW) / widest);
      return { it, f, lines };
    });
    const lineH = (f: Font) => f.size * 1.16;
    const total = laid.reduce((h, l, i) => h + l.lines.length * lineH(l.f) + (i ? l.f.size * 0.3 : 0), 0);
    let top = cy - total / 2, end: LineEnd | null = null;
    laid.forEach((l, i) => {
      if (i) top += l.f.size * 0.3;
      l.lines.forEach((text, j) => {
        const f = { ...l.f }, base = top + l.f.size * 0.86;
        line(parent, text, x, base, f, l.it.fill, anchor, l.it.at + j * 0.12, { maxW, whole: l.it.whole, scramble: l.it.scramble });
        const w = measure(text, f) * (loc === "ko" ? 1.02 : 1);
        end = { x: anchor === "middle" ? x + w / 2 : anchor === "end" ? x : x + w, y: base, size: f.size, punct: /[?!…]$/.test(text) };
        top += lineH(l.f);
      });
    });
    return end;
  }
  function pop(node: SVGElement, at: number, cx: number, cy: number) {
    const ex = curExit;
    ups.push((t) => {
      const q = ex == null ? 0 : prog(t, ex, 0.3, "cubicIn");
      const p = prog(t, at, M.inDur * 0.9, "spring"), s = (0.9 + 0.1 * p) * (1 - 0.05 * q);
      node.setAttribute("opacity", (clamp(p * 1.5) * (1 - q)).toFixed(3));
      node.setAttribute("transform", `translate(${cx},${cy}) scale(${s.toFixed(4)}) translate(${-cx},${-cy})`);
      if (M.enter === "blur") node.style.filter = p < 0.999 ? `blur(${((1 - p) * 10).toFixed(1)}px)` : "none";
    });
  }
  /** 손으로 그린 동그라미 — 핵심 숫자·줄을 산호색 펜으로 한 바퀴 조금 넘게 둘러 그린다(떨림은 시드 고정). */
  function marker(parent: Element, cx: number, cy: number, rx: number, ry: number, at: number, color: string, seed: number) {
    const pts: string[] = [];
    for (let a = -24; a <= 384; a += 6) {
      const th = (a * Math.PI) / 180, k = 1 + 0.035 * Math.sin(3 * th + seed) + 0.02 * Math.cos(5 * th + seed * 2) + (a > 330 ? (a - 330) * 0.0012 : 0);
      pts.push(`${(cx + Math.cos(th) * rx * k).toFixed(1)} ${(cy + Math.sin(th) * ry * k - (a > 300 ? (a - 300) * 0.25 : 0)).toFixed(1)}`);
    }
    const p = el("path", { d: "M" + pts.join(" L"), fill: "none", stroke: color, "stroke-width": 5, "stroke-linecap": "round", "stroke-linejoin": "round", pathLength: 1, "stroke-dasharray": 1, "stroke-dashoffset": 1, opacity: 0.92 }, parent);
    const ex = curExit;
    ups.push((t) => {
      p.setAttribute("stroke-dashoffset", (1 - prog(t, at, 0.5, "cubicInOut")).toFixed(4));
      if (ex != null) p.setAttribute("opacity", (0.92 * (1 - prog(t, ex, 0.3, "cubicIn"))).toFixed(3));
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
  /** cy는 장면 칸 안 좌표, wy는 세상 좌표(칸이 아래로 내려가 있으면 그만큼 더한다). */
  type Hero = { g: SVGElement; cx: number; cy: number; w: number; size: number; wy?: number };
  let lastNumber: Hero | null = null;
  /** 지금 그리는 장면의 나가는 시각(없으면 null) — line()·pop()이 만들 때 읽는다. */
  let curExit: number | null = null;
  /** 지금 그리는 장면이 끝나는 시각(끝 장면의 접히기·터지기 시간표에 쓴다). */
  let curEnd = 0;
  /** 산호색 점이 이 장면에서 앉을 자리(시간의 함수, x는 세상 좌표·y는 칸 안 좌표·r 반지름). */
  type Home = (t: number) => [number, number, number];
  let home: Home | null = null;
  /** 큰 숫자 + 단위. "68%" → 68 + %, "$0" → $0, "12,480" → 쉼표 유지하며 세기. */
  function bigNumber(parent: Element, value: string, unitOverride: string | null, x: number, y: number, size0: number, C: Palette, color: string, at: number, count: boolean, maxW = 1400) {
    const m = /^([^0-9]*)([0-9][0-9,]*)(.*)$/.exec(value);
    const pre = m ? m[1] : "", digits = m ? m[2] : value, rest = m ? m[3].trim() : "";
    const unit = unitOverride ?? rest, main = pre + digits + (unitOverride != null ? rest : "");
    // 칸보다 넓으면 숫자째 줄인다(글꼴마다 폭이 달라 칸 밖으로 나갔다, 10-02).
    const w0 = measure(main, fnt("display", size0)) + (unit ? measure(unit, fnt("text", Math.round(size0 * 0.42))) + size0 * 0.08 : 0);
    const size = w0 > maxW ? Math.floor((size0 * maxW) / w0) : size0;
    const fN = fnt("display", size), fU = fnt("text", Math.round(size * 0.42)), gap = size * 0.08;
    const wN = measure(main, fN) + fN.ls, wU = unit ? measure(unit, fU) + gap : 0, left = x - (wN + wU) / 2;
    const g = el("g", {}, parent);
    if (count && m) {
      // 자릿수마다 0–9 띠가 굴러가다 왼쪽부터 차례로 멈춘다(주행 거리계). 쉼표·기호는 제자리.
      // 기본 상태(만든 직후)는 최종 숫자라 복제본(이어 붙이기)도 끝 모습을 갖는다.
      const chars = [...main], lh = size * 1.02;
      let px = left, di = 0;
      chars.forEach((ch, j) => {
        const cw = measure(ch, fN) + (j < chars.length - 1 ? fN.ls : 0);
        if (!/[0-9]/.test(ch)) { txt(g, ch, px, y, fN, color); px += cw; return; }
        const d = +ch, k = di++, colX = px + measure(ch, fN) / 2;
        const cpId = `${id}c${cid++}`, cp = el("clipPath", { id: cpId, clipPathUnits: "userSpaceOnUse" }, defs);
        el("rect", { x: px - 4, y: y - size * 0.84, width: cw + 8, height: size * 0.98 }, cp);
        const col = el("g", { "clip-path": `url(#${cpId})` }, g);
        const a = txt(col, ch, colX, y, fN, color, "middle"), b = txt(col, ch, colX, y, fN, color, "middle");
        b.setAttribute("opacity", "0");
        const spins = 1 + k, t0 = at + 0.05 * k, dur = M.count * 0.75 + 0.12 * k;
        ups.push((t) => {
          const q = prog(t, t0, dur, "expoOut"), v = (d + 10 * spins) * q, base = Math.floor(v), fr = v - base;
          if (q >= 1) { a.textContent = ch; a.setAttribute("transform", ""); b.setAttribute("opacity", "0"); return; }
          a.textContent = String(base % 10); b.textContent = String((base + 1) % 10);
          a.setAttribute("transform", `translate(0,${(-fr * lh).toFixed(1)})`);
          b.setAttribute("transform", `translate(0,${((1 - fr) * lh).toFixed(1)})`);
          b.setAttribute("opacity", "1");
        });
        px += cw;
      });
    } else txt(g, main, left, y, fN, color);
    if (unit) txt(g, unit, left + wN + gap, y, fU, C.sub);
    pop(g, at, x, y - size * 0.35);
    lastNumber = { g, cx: x, cy: y - size * 0.35, w: wN + wU, size };
    return g;
  }

  // ── 장면 배치: 장면마다 한 칸, 전환에 따라 오른쪽(가로 1800) 또는 아래(세로 1300)로 이어 놓는다 ─────
  const scenes = film.scenes, starts: number[] = [];
  let acc = 0;
  for (const s of scenes) { starts.push(acc); acc += SCENE_SECONDS[s.kind] ?? 4.6; }
  const total = acc, pan = M.pan, trans = pickTransitions(scenes);
  const ends = scenes.map((sc, i) => starts[i] + (SCENE_SECONDS[sc.kind] ?? 4.6));
  const pos: { x: number; y: number }[] = [];
  scenes.forEach((_, i) => {
    if (!i) { pos.push({ x: 0, y: 0 }); return; }
    const p = pos[i - 1], tr = trans[i];
    pos.push(tr === "drop" || tr === "carry" ? { x: p.x, y: p.y + CELL_Y } : { x: p.x + CELL, y: p.y });
  });
  el("rect", { width: FILM_W, height: FILM_H, fill: PAL[0].bg }, svg);
  const glowR = el("rect", { width: FILM_W, height: FILM_H, fill: `url(#${id}glow)`, opacity: X.glow * 0.9 }, svg);
  const cam = el("g", {}, svg), world = el("g", {}, cam);
  // 화면 위 층들(카메라 밖) — 그리는 순서가 곧 겹치는 순서다.
  const carryL = el("g", {}, svg), irisL = el("g", {}, svg), slabL = el("g", {}, svg), sparkL = el("g", {}, svg), hudL = el("g", {}, svg);
  const blackR = el("rect", { width: FILM_W, height: FILM_H, fill: "#000", opacity: 0 }, svg);
  const cells: { g: SVGElement; s: number; e: number }[] = [];
  const heroes: (Hero | null)[] = [];
  /** 파고들기(zoom) 전환이 겨누는 곳 — 장면 칸 안 좌표. 흐름 장면은 마지막(강조) 칸, 나머지는 가운데. */
  let focus: [number, number] = [800, 450];
  /** 장면 안의 작은 숫자들 — 첫 숫자와 같은 값이 있으면 그 자리로 바로 이어 붙인다(2차 시안의 68% → 욕실 칸). */
  let sceneNums: { value: string; h: Hero }[] = [];
  const nums: { value: string; h: Hero }[][] = [];
  const focuses: [number, number][] = [];
  const homes: Home[] = [];

  scenes.forEach((sc, i) => {
    const C = PAL[i % PAL.length], ox = pos[i].x, oy = pos[i].y, s0 = starts[i], tin = trans[i];
    // 들어오는 글자 시작 — 카메라가 움직여 오면 이동 중간부터(빈 화면을 두지 않는다), 자르기는 바로.
    const at = !i ? 0.2 : moving(tin) && pan > 0.25 ? s0 + 0.4 - pan / 2 : tin === "zoom" ? s0 + 0.08 : tin === "fade" ? s0 + 0.3 : tin === "wipe" ? s0 + 0.1 : s0;
    el("rect", { x: ox - 100, y: oy - 200, width: CELL, height: CELL_Y, fill: C.bg }, world);
    const g = el("g", { transform: `translate(0,${oy})` }, world);
    cells.push({ g, s: s0, e: ends[i] });
    const L = (s: string, x: number, y: number, role: "display" | "text" | "label", size: number, fill: string, anchor: string, a: number, o?: { maxW?: number; whole?: boolean; scramble?: boolean }) =>
      line(g, s, ox + x, y, fnt(role, Math.round(size * (role === "label" ? 1 : T.scale))), fill, anchor, a, o);
    lastNumber = null; focus = [800, 450]; sceneNums = []; home = null; curEnd = ends[i];
    const tout = trans[i + 1];
    curExit = tout === "cut" || tout === "fade" ? ends[i] - 0.4 : tout === "carry" ? ends[i] - pan / 2 - 0.05 : null;
    drawScene(sc, C, ox, at, g, L);
    nums.push(sceneNums.map((n) => ({ value: n.value, h: { ...n.h, wy: n.h.cy + oy } })));
    focuses.push([ox + focus[0], oy + focus[1]]);
    const hm = home as Home | null; // drawScene 안에서 채워진다
    homes.push(hm ? (t) => { const r = hm(t); return [r[0], r[1] + oy, r[2]]; } : () => [ox + 800, oy + 840, 7]);
    const hero = lastNumber as Hero | null;
    heroes.push(sc.kind === "hook" && hero ? { ...hero, wy: hero.cy + oy } : null);
  });

  // ── 카메라: 열쇠 장면(시간·중심·확대)을 이어 움직인다. "jump"는 그 시각에 바로 옮겨 간다(자르기) ─────
  type Key = { t: number; x: number; y: number; z: number; e: string };
  const keys: Key[] = [];
  scenes.forEach((_, i) => {
    const s = starts[i], e = ends[i], cx = pos[i].x + 800, cy = pos[i].y + 450, tin = trans[i], tout = trans[i + 1];
    const inEnd = !i ? 0 : moving(tin) ? s + pan / 2 : tin === "zoom" ? s + 0.7 : s;
    const outStart = i === scenes.length - 1 ? e : moving(tout) ? e - pan / 2 : tout === "zoom" ? e - 0.5 : e;
    if (!i) keys.push({ t: 0, x: cx, y: cy, z: 1, e: "jump" });
    else if (tin === "zoom") { keys.push({ t: s, x: cx, y: cy, z: 0.78, e: "jump" }); keys.push({ t: inEnd, x: cx, y: cy, z: 1, e: "expoOut" }); }
    else if (moving(tin)) keys.push({ t: inEnd, x: cx, y: cy, z: 1, e: "cubicInOut" });
    else keys.push({ t: s, x: cx, y: cy, z: 1, e: "jump" });
    keys.push({ t: outStart, x: cx, y: cy, z: 1 + M.push, e: "sineInOut" });
    if (tout === "zoom") keys.push({ t: e - 0.001, x: focuses[i][0], y: focuses[i][1], z: 3.2, e: "expoIn" });
  });
  const camAt = (t: number): [number, number, number] => {
    for (let k = 1; k < keys.length; k++) {
      const a = keys[k - 1], b = keys[k];
      if (t < b.t) {
        if (b.e === "jump" || b.t <= a.t) return [a.x, a.y, a.z];
        const p = E[b.e](clamp((t - a.t) / (b.t - a.t)));
        return [a.x + (b.x - a.x) * p, a.y + (b.y - a.y) * p, a.z + (b.z - a.z) * p];
      }
    }
    const l = keys[keys.length - 1];
    return [l.x, l.y, l.z];
  };
  const jumpIn = (t0: number, t1: number) => keys.some((k) => k.e === "jump" && k.t > t0 && k.t <= t1);
  /** 화면 위 속도(초당 칸) — 자르기를 건너 재면 순간이동이 엄청난 흐림이 되니 같은 구간 안에서만 잰다. */
  const camVel = (t: number) => {
    const h = 1 / 120;
    const [t0, t1] = t - h >= 0 && !jumpIn(t - h, t) ? [t - h, t] : [t, t + h];
    const a = camAt(t0), b = camAt(t1);
    return { vx: ((b[0] - a[0]) * b[2]) / h, vy: ((b[1] - a[1]) * b[2]) / h, vz: ((b[2] - a[2]) * 800) / h };
  };

  // 첫 장면의 큰 숫자가 다음 장면 위 구석에 남는다 — 원래 자리(카메라를 따라 화면에 비친 곳)에서 출발한다.
  scenes.forEach((_, i) => {
    const h = heroes[i - 1];
    if (!i || trans[i] !== "carry" || !h) return;
    const clone = h.g.cloneNode(true) as SVGElement;
    clone.removeAttribute("transform"); clone.removeAttribute("opacity"); clone.style.filter = "none";
    const wrap = el("g", { opacity: 0 }, carryL);
    wrap.appendChild(clone);
    const t0 = starts[i] - pan / 2, dur = 1.15, sc = 84 / h.size;
    const tx = 120 + (h.w * sc) / 2, ty = 140;
    // 출발점은 떠나는 순간 화면에 비친 자리로 고정 — 카메라를 따라가면 화면 밖으로 튀었다가 돌아왔다.
    const [c0x, c0y, z0] = camAt(t0), px = 800 + (h.cx - c0x) * z0, py = 450 + ((h.wy ?? h.cy) - c0y) * z0;
    const leave = (moving(trans[i + 1]) ? ends[i] - pan / 2 : ends[i]) - 0.55;
    const prevSc = scenes[i - 1], m = prevSc.kind === "hook" ? nums[i].find((n) => n.value === prevSc.value)?.h : undefined;
    ups.push((t) => {
      if (t < t0) { wrap.setAttribute("opacity", "0"); return; }
      h.g.setAttribute("opacity", "0");
      const p = E.cubicInOut(clamp((t - t0) / dur));
      if (m) {
        // 같은 값 칸으로 내려앉는다 — 도착 자리는 움직이는 카메라를 따라 매 순간 다시 잰다. 앉으면 그 칸에 넘긴다.
        if (p >= 1) { wrap.setAttribute("opacity", "0"); m.g.setAttribute("opacity", "1"); m.g.removeAttribute("transform"); return; }
        m.g.setAttribute("opacity", "0");
        const [cx, cy, z] = camAt(t), mx = 800 + (m.cx - cx) * z, my = 450 + ((m.wy ?? m.cy) - cy) * z, mk = (z * m.size) / h.size;
        wrap.setAttribute("opacity", "1");
        clone.setAttribute("transform", `translate(${(px + (mx - px) * p).toFixed(2)},${(py + (my - py) * p).toFixed(2)}) scale(${(z0 + (mk - z0) * p).toFixed(4)}) translate(${-h.cx},${-h.cy})`);
        return;
      }
      const x = px + (tx - px) * p, y = py + (ty - py) * p, k = z0 + (sc - z0) * p;
      wrap.setAttribute("opacity", (1 - prog(t, leave, 0.45, "cubicIn")).toFixed(3));
      clone.setAttribute("transform", `translate(${x.toFixed(2)},${y.toFixed(2)}) scale(${k.toFixed(4)}) translate(${-h.cx},${-h.cy})`);
    });
  });

  // ── 산호색 점: 영상 처음부터 끝까지 한 개 — 장면마다 맡은 자리(마침표·신호·커서·알림·이름 끝 점)로 옮겨 다닌다 ─────
  const ACC = PAL[0].accent;
  const sgrad = el("radialGradient", { id: id + "spk" }, defs);
  el("stop", { offset: "0%", "stop-color": ACC, "stop-opacity": 0.55 }, sgrad);
  el("stop", { offset: "100%", "stop-color": ACC, "stop-opacity": 0 }, sgrad);
  const spark = el("g", {}, sparkL);
  const sGlow = el("circle", { r: 3.2, fill: `url(#${id}spk)` }, spark), sCore = el("circle", { r: 1, fill: ACC }, spark);
  const wins = scenes.map((_, i) => {
    if (i === scenes.length - 1) return null;
    const s = starts[i + 1], x = trans[i + 1];
    return moving(x) ? [s - pan / 2 - 0.05, s + pan / 2 + 0.1] : x === "zoom" ? [s - 0.2, s + 0.45] : x === "fade" ? [s - 0.5, s + 0.6] : [s - 0.28, s + 0.32];
  });
  const proj = (i: number, t: number, tc: number): [number, number, number] => {
    const [hx, hy, hr] = homes[i](t), [cx, cy, z] = camAt(tc);
    return [800 + (hx - cx) * z, 450 + (hy - cy) * z, hr * z];
  };
  /** [x, y, r, 숨김] — 파고들기 전환 동안은 점 대신 원(iris)이 화면을 덮었다가 다음 자리로 줄어든다. */
  const sparkAt = (t: number): [number, number, number, boolean] => {
    for (let i = 0; i < wins.length; i++) {
      const w = wins[i];
      if (!w || t < w[0] || t >= w[1]) continue;
      const x = trans[i + 1], s = starts[i + 1], mv = moving(x);
      const A = proj(i, t, mv ? t : Math.min(t, s - 0.002)), B = proj(i + 1, t, mv ? t : Math.max(t, s));
      if (x === "zoom") return [t < s ? A[0] : B[0], t < s ? A[1] : B[1], t < s ? A[2] : B[2], true];
      const p = E.cubicInOut((t - w[0]) / (w[1] - w[0])), d = Math.hypot(B[0] - A[0], B[1] - A[1]);
      return [A[0] + (B[0] - A[0]) * p, A[1] + (B[1] - A[1]) * p - Math.sin(Math.PI * p) * Math.min(220, d * 0.25), A[2] + (B[2] - A[2]) * p, false];
    }
    let i = 0;
    for (let k = 0; k < wins.length; k++) if (wins[k] && t >= wins[k]![1]) i = k + 1;
    const P = proj(i, t, t);
    if (i === 0 && t < 0.8) { const q = prog(t, 0.12, 0.65, "spring"); return [P[0], -60 + (P[1] + 60) * q, P[2], false]; }
    return [P[0], P[1], P[2], false];
  };
  const iris = el("circle", { r: 0, fill: ACC, opacity: 0 }, irisL);

  // ── 색 판 쓸기(영상마다 한 번) ─────────────────────────────────────────────────
  const slabs = trans.map((x, i) => (x === "wipe" ? starts[i] : -1)).filter((x) => x >= 0).map((s0) => {
    const main = el("polygon", { fill: ACC }, slabL), edge = el("polygon", { fill: PAL[0].ink }, slabL);
    return { s0, main, edge };
  });

  // ── 계기판(카메라 밖, 영상 내내): 모서리 표시 · 장면 번호와 이름 · 진행 막대 · 시간 ─────────────────
  const KIND_LABEL: Record<string, [string, string]> = {
    hook: ["OPEN", "시작"], story: ["STORY", "이야기"], items: ["FIGURES", "숫자"], flow: ["FLOW", "흐름"],
    terminal: ["TERMINAL", "터미널"], alert: ["ALERT", "알림"], stats: ["RESULTS", "결과"], ending: ["END", "끝"],
  };
  const hudFam = `${cssFamily(fam(INTRO_FONTS.mono))},${cssFamily(fam(INTRO_FONTS.ko))},monospace`;
  const hudTxt = (x: number, y: number, anchor: string) =>
    el("text", { x, y, "text-anchor": anchor, "font-family": hudFam, "font-size": 18, "letter-spacing": 1.5, fill: PAL[0].ink, opacity: 0.55 }, hudL);
  for (const [x, y, dx, dy] of [[30, 30, 1, 1], [1570, 30, -1, 1], [30, 870, 1, -1], [1570, 870, -1, -1]]) {
    el("path", { d: `M${x} ${y + dy * 26} V${y} H${x + dx * 26}`, fill: "none", stroke: PAL[0].ink, "stroke-width": 2, opacity: 0.45 }, hudL);
  }
  const RX0 = 62, RX1 = 1538, RY = 50;
  el("line", { x1: RX0, y1: RY, x2: RX1, y2: RY, stroke: PAL[0].ink, "stroke-width": 1.5, opacity: 0.2 }, hudL);
  starts.forEach((s0) => { const x = RX0 + ((RX1 - RX0) * s0) / total; el("line", { x1: x, y1: RY - 6, x2: x, y2: RY + 6, stroke: PAL[0].ink, "stroke-width": 1.5, opacity: 0.35 }, hudL); });
  const railFill = el("line", { x1: RX0, y1: RY, x2: RX0, y2: RY, stroke: PAL[0].ink, "stroke-width": 1.5, opacity: 0.7 }, hudL);
  const hudLabel = hudTxt(RX0, 86, "start"), hudTime = hudTxt(RX0, 866, "start");
  const endScene = scenes.find((x) => x.kind === "ending");
  hudTxt(RX1, 86, "end").textContent = endScene && endScene.kind === "ending" ? tr(endScene.name) : "";
  const labelOf = (i: number) => `${String(i + 1).padStart(2, "0")} / ${String(scenes.length).padStart(2, "0")} · ${KIND_LABEL[scenes[i].kind]?.[loc === "ko" ? 1 : 0] ?? ""}`;

  function drawScene(
    sc: IntroScene, C: Palette, ox: number, at: number, g: SVGElement,
    L: (s: string, x: number, y: number, role: "display" | "text" | "label", size: number, fill: string, anchor: string, a: number, o?: { maxW?: number; whole?: boolean; scramble?: boolean }) => SVGElement,
  ) {
    switch (sc.kind) {
      case "hook":
      {
        L(tr(sc.label), 800, 205, "label", 28, C.sub, "middle", at, { whole: true, maxW: 1100, scramble: true });
        bigNumber(g, sc.value, null, ox + 800, 575, 380, C, sc.alarm ? C.accent : C.ink, at + 0.15, true);
        const h = lastNumber as Hero | null;
        if (h) {
          // 숫자 뒤 마침표 = 산호색 점. 숫자가 다 굴러간 뒤 펜으로 한 바퀴 둘러 그린다.
          const px = h.cx + h.w / 2 + h.size * 0.1, py = h.cy + h.size * 0.28;
          home = () => [px, py, h.size * 0.062];
          marker(g, h.cx, h.cy, h.w / 2 + 70, h.size * 0.48, at + 1.0, sc.alarm ? C.ink : C.accent, 3);
        }
        stack(g, [{ s: tr(sc.line), role: "text", size: 72, fill: C.ink, at: at + 1.25 }], ox + 800, 752, "middle", 1240);
        return;
      }
      case "story":
        // 말 장면은 왼쪽 정렬(잡지 지면처럼) — 모든 장면이 가운데 정렬이면 같은 틀로 보였다.
      {
        const end = stack(g, [
          { s: tr(sc.line), role: "text", size: 72, fill: C.sub, at },
          { s: tr(sc.line2), role: "display", size: 128, fill: C.ink, at: at + 0.45 },
        ], ox + 170, 470, "start", 1260);
        if (end) home = () => [end.x + end.size * (end.punct ? 0.26 : 0.14), end.y - end.size * 0.08, Math.max(9, end.size * 0.075)];
        return;
      }
      case "items": {
        const n = sc.items.length, gap = Math.min(300, 1240 / n), x0 = 800 - (gap * (n - 1)) / 2;
        sc.items.forEach((it, k) => {
          const x = x0 + k * gap, a = at + k * 0.09;
          if (shapes !== "line") {
            const b = box(g, ox + x - gap * 0.42, 230, gap * 0.84, 300, shapes === "doodle" ? 24 : 28, C, it.alarm ? C.accent : mixHex(C.bg, C.ink, 0.1));
            pop(b, a, ox + x, 380);
          }
          const col = it.alarm ? (shapes === "block" ? onColor(C.accent, C) : C.accent) : C.ink;
          bigNumber(g, it.value, null, ox + x, 430, Math.min(150, gap * 0.5), C, col, a + 0.05, false, gap * 0.84);
          if (lastNumber) {
            const ln = lastNumber as Hero;
            sceneNums.push({ value: it.value, h: ln });
            if (it.alarm || (!home && k === 0)) home = () => [ox + x, 430 - ln.size * 0.95 - 22, 10];
          }
          L(tr(it.label).toUpperCase(), x, 506, "label", 26, shapes === "block" && it.alarm ? onColor(C.accent, C) : C.sub, "middle", a + 0.2, { whole: true, maxW: gap * 0.8 });
        });
        stack(g, [{ s: tr(sc.line), role: "text", size: 62, fill: C.ink, at: at + 1.2 }], ox + 800, 735, "middle", 1240);
        return;
      }
      case "flow": {
        // 단계마다 번호가 든 큰 칸 + 그 밑에 굵은 이름(작은 고정폭 라벨은 안 읽혔다, 10-02). 마지막 칸만 강조색.
        const nn = sc.nodes.length, step = 1080 / (nn - 1), fx = 260, cy = 330, sz = 132;
        focus = [fx + 1080, cy];
        // 산호색 점이 신호가 되어 첫 칸에서 마지막 칸까지 선을 타고 달린 뒤, 마지막 칸 모서리에 알림 점처럼 앉는다.
        const go0 = at + 0.3, go1 = at + 0.15 + (nn - 1) * 0.45 + 0.45, xEnd = ox + fx + 1080, land = go1 + 0.3;
        home = (t) => {
          if (t < go1) return [ox + fx + (xEnd - sz / 2 - 18 - ox - fx) * E.cubicInOut(clamp((t - go0) / (go1 - go0))), cy, 12];
          const q = E.cubicInOut(clamp((t - go1) / 0.3));
          return [xEnd - sz / 2 - 18 + (sz + 18) * q, cy - (sz / 2) * q - Math.sin(Math.PI * q) * 40, 12 + 2 * q];
        };
        const ring = el("circle", { cx: xEnd, cy, r: sz * 0.6, fill: "none", stroke: C.accent, "stroke-width": 4, opacity: 0 }, g);
        ups.push((t) => {
          const q = prog(t, land, 0.7, "expoOut");
          ring.setAttribute("r", (sz * (0.6 + 0.9 * q)).toFixed(1));
          ring.setAttribute("opacity", (q > 0 && q < 1 ? 0.75 * (1 - q) : 0).toFixed(3));
        });
        sc.nodes.forEach((nd, k) => {
          const x = fx + k * step, a = at + 0.15 + k * 0.45, last = k === nn - 1;
          const b = box(g, ox + x - sz / 2, cy - sz / 2, sz, sz, shapes === "line" ? 26 : 30, C, last ? C.accent : mixHex(C.bg, C.ink, 0.12));
          const numFill = shapes === "block" && last ? onColor(C.accent, C) : last && shapes === "line" ? C.accent : C.sub;
          txt(b, String(k + 1).padStart(2, "0"), ox + x, cy + 11, { family: fam(INTRO_FONTS.mono), weight: 500, ls: 2, size: 30 }, numFill, "middle");
          pop(b, a, ox + x, cy);
          L(tr(nd), x, cy + sz / 2 + 62, "text", 36, last ? C.ink : C.sub, "middle", a + 0.1, { whole: true, maxW: step * 0.92 });
          if (k < nn - 1) {
            const x1 = ox + x + sz / 2 + 14, x2 = ox + x + step - sz / 2 - 14;
            wire(g, `M${x1} ${cy} H ${x2}`, C, a + 0.15, 0.5);
            // 선이 다 그려진 뒤엔 작은 신호가 끊임없이 흐른다 — 멈춘 화면에도 늘 뭔가 움직인다.
            const pk = el("circle", { cx: x1, cy, r: 4, fill: C.ink, opacity: 0 }, g), t1 = a + 0.7, ex = curExit;
            ups.push((t) => {
              if (t < t1) { pk.setAttribute("opacity", "0"); return; }
              const ph = ((t - t1) / 1.1 + k * 0.37) % 1;
              pk.setAttribute("cx", (x1 + (x2 - x1) * ph).toFixed(1));
              pk.setAttribute("opacity", ((0.6 * Math.sin(Math.PI * ph)) * (ex == null ? 1 : 1 - prog(t, ex, 0.3))).toFixed(3));
            });
          }
        });
        stack(g, [{ s: tr(sc.line), role: "text", size: 64, fill: C.ink, at: at + 0.5 }], ox + 800, 740, "middle", 1240);
        return;
      }
      case "terminal": {
        const tb = box(g, ox + 240, 150, 1120, 470, 22, C, mixHex(C.bg, C.ink, 0.08));
        pop(tb, at, ox + 800, 385);
        [0, 1, 2].forEach((k) => el("circle", { cx: ox + 284 + k * 28, cy: 192, r: 8, fill: C.sub, opacity: 0.55 }, tb));
        const mono: Font = { family: fam(INTRO_FONTS.mono), weight: 500, ls: 0, size: 30 };
        const cmd = "$ " + sc.command, cmdT = txt(g, "", ox + 290, 270, mono, C.ink);
        const tStart = at + 0.35, tDur = sc.command.length * 0.028;
        const typed = (t: number) => Math.max(2, Math.floor(clamp((t - tStart) / tDur) * cmd.length));
        ups.push((t) => {
          cmdT.textContent = cmd.slice(0, typed(t));
          cmdT.setAttribute("opacity", t >= at ? "1" : "0");
        });
        const keyLine = Math.min(2, sc.output.length - 1), keyAt = tStart + tDur + 0.2 + keyLine * 0.16, keyY = 330 + keyLine * 52;
        // 산호색 점 = 입력 커서 → 결과가 나오면 핵심 줄 앞 글머리로 옮겨 앉는다.
        home = (t) => {
          const cx0 = ox + 290 + measure(cmd.slice(0, typed(t)), mono) + 16, q = E.cubicInOut(clamp((t - keyAt) / 0.3));
          return [cx0 + (ox + 266 - cx0) * q, 260 + (keyY - 10 - 260) * q, 9];
        };
        sc.output.forEach((ln, k) => {
          const f2 = fit(ln, { ...mono }, 1020), o2 = txt(g, ln, ox + 290, 330 + k * 52, f2, k === keyLine ? C.accent : C.sub);
          const a2 = tStart + tDur + 0.2 + k * 0.16;
          ups.push((t) => o2.setAttribute("opacity", t >= a2 ? "1" : "0"));
          if (k === keyLine) { const w = measure(ln, f2); marker(g, ox + 290 + w / 2, keyY - 10, w / 2 + 40, 36, a2 + 0.35, C.accent, 7); }
        });
        stack(g, [{ s: tr(sc.line), role: "text", size: 58, fill: C.ink, at: tStart + tDur + 0.95 }], ox + 800, 738, "middle", 1240);
        return;
      }
      case "alert": {
        const px = 330, phFill = mixHex(C.bg, C.ink, 0.1);
        const ph = box(g, ox + px, 140, 300, 600, 50, C, phFill);
        pop(ph, at, ox + px + 150, 440);
        txt(ph, "23:12", ox + px + 150, 280, { family: fam(INTRO_FONTS.ui), weight: 300, ls: 0, size: 64 }, shapes === "block" ? onColor(phFill, C) : C.ink, "middle");
        const note = el("g", {}, g);
        el("rect", { x: ox + px + 18, y: 344, width: 264, height: 120, rx: 22, fill: shapes === "block" ? C.ink : mixHex(C.bg, "#ffffff", 0.12), stroke: C.line, "stroke-opacity": shapes === "line" ? 0.2 : 0 }, note);
        home = () => [ox + px + 42, 374, 9];
        const nf = shapes === "block" ? C.bg : C.ink, uiFam = fam(loc === "ko" ? INTRO_FONTS.ko : INTRO_FONTS.ui);
        txt(note, tr(sc.title), ox + px + 36, 414, fit(tr(sc.title), { family: uiFam, weight: 600, ls: 0, size: 21 }, 230), nf);
        txt(note, tr(sc.body), ox + px + 36, 442, fit(tr(sc.body), { family: uiFam, weight: 400, ls: 0, size: 18 }, 230), nf);
        pop(note as SVGElement, at + 0.9, ox + px + 150, 404);
        stack(g, [
          { s: tr(sc.line), role: "display", size: 104, fill: C.ink, at: at + 1.5 },
          { s: tr(sc.line2), role: "text", size: 60, fill: C.sub, at: at + 1.9 },
        ], ox + 720, 450, "start", 780);
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
          bigNumber(g, st.value, tr(st.unit), ox + x, 440, Math.min(190, sw * 0.42), C, tc, a + 0.05, true, sw * 0.82);
          if (k === 0 && lastNumber) {
            const ln = lastNumber as Hero;
            home = () => [ln.cx, ln.cy - ln.size * 0.62 - 26, 10];
            marker(g, ln.cx, ln.cy, ln.w / 2 + 44, ln.size * 0.62, a + 1.15, C.accent, 11);
          }
          L(tr(st.label).toUpperCase(), x, 516, "label", 26, shapes === "block" ? tc : C.sub, "middle", a + 0.25, { whole: true, maxW: sw * 0.8 });
        });
        stack(g, [{ s: tr(sc.line), role: "text", size: 60, fill: C.ink, at: at + 1.1 }], ox + 800, 728, "middle", 1240);
        return;
      }
      case "ending": {
        // 끝: 글을 읽고 나면 화면 전체가 산호색 점 하나로 빨려 들어갔다가(접히기) 빛줄기·고리와 함께 터지며
        // 이름이 한 글자씩 떨어져 앉는다. 점은 이름 끝의 마침표로 남는다. 마지막 0.45초는 검정으로 닫힌다.
        const cx = ox + 800, cy = 450, imp0 = curEnd - 2.2, tb = imp0 + 0.55;
        const inner = el("g", {}, g);
        const end = stack(inner, [
          { s: tr(sc.line), role: "text", size: 92, fill: C.sub, at },
          { s: tr(sc.line2), role: "display", size: 128, fill: C.ink, at: at + 0.5 },
        ], cx, 450, "middle", 1300);
        ups.push((t) => {
          const p = prog(t, imp0, 0.55, "cubicIn");
          if (p <= 0) { inner.removeAttribute("transform"); inner.setAttribute("opacity", "1"); return; }
          const k = Math.pow(1 - p, 1.5);
          inner.setAttribute("transform", `translate(${cx},${cy}) rotate(${(48 * p * p).toFixed(2)}) scale(${Math.max(0.001, k).toFixed(4)}) translate(${-cx},${-cy})`);
          inner.setAttribute("opacity", (1 - p * p).toFixed(3));
        });
        // 빛줄기 28개 — 안쪽에서 바깥으로 뻗었다가 바깥으로 빠지며 사라진다.
        for (let k = 0; k < 28; k++) {
          const ang = (2 * Math.PI * k) / 28 + hash(k, 1) * 0.18, r0 = 46 + 26 * hash(k, 2), Lk = 150 + 190 * hash(k, 3);
          const ln = el("line", { stroke: k % 4 ? C.accent : C.ink, "stroke-width": k % 4 ? 3 : 2, "stroke-linecap": "round", opacity: 0 }, g);
          ups.push((t) => {
            const q = prog(t, tb, 0.38, "expoOut"), q2 = prog(t, tb + 0.42, 0.4, "cubicIn");
            if (q <= 0 || q2 >= 1) { ln.setAttribute("opacity", "0"); return; }
            const a = r0 + Lk * q2, b = r0 + Lk * q;
            ln.setAttribute("x1", (cx + Math.cos(ang) * a).toFixed(1)); ln.setAttribute("y1", (cy + Math.sin(ang) * a).toFixed(1));
            ln.setAttribute("x2", (cx + Math.cos(ang) * b).toFixed(1)); ln.setAttribute("y2", (cy + Math.sin(ang) * b).toFixed(1));
            ln.setAttribute("opacity", "0.9");
          });
        }
        const ring = el("circle", { cx, cy, r: 0, fill: "none", stroke: C.ink, opacity: 0 }, g);
        ups.push((t) => {
          const q = prog(t, tb, 0.75, "expoOut");
          ring.setAttribute("r", (330 * q).toFixed(1));
          ring.setAttribute("stroke-width", (6 * (1 - q) + 0.5).toFixed(2));
          ring.setAttribute("opacity", (q > 0 && q < 1 ? 0.8 * (1 - q) : 0).toFixed(3));
        });
        // 부스러기 글자 — 터지는 힘으로 날아가다 공기에 걸려 느려지며 사라진다.
        const mono: Font = { family: fam(INTRO_FONTS.mono), weight: 500, ls: 0, size: 28 };
        for (let k = 0; k < 14; k++) {
          const d = txt(g, "#{}$/<>*+;=_[]"[k], cx, cy, mono, k % 3 ? C.sub : C.accent, "middle"), ang = hash(k, 5) * Math.PI * 2, sp = 520 + 420 * hash(k, 6), rot = (hash(k, 7) - 0.5) * 540;
          d.setAttribute("opacity", "0");
          ups.push((t) => {
            const tau = t - tb;
            if (tau <= 0 || tau > 0.9) { d.setAttribute("opacity", "0"); return; }
            const r = (sp * (1 - Math.exp(-4 * tau))) / 4;
            d.setAttribute("transform", `translate(${(Math.cos(ang) * r).toFixed(1)},${(Math.sin(ang) * r).toFixed(1)}) rotate(${(rot * tau).toFixed(1)} ${cx} ${cy})`);
            d.setAttribute("opacity", (1 - tau / 0.9).toFixed(3));
          });
        }
        // 이름 — 한 글자씩 위에서 떨어져 용수철로 앉는다.
        const nm = tr(sc.name), fN = fnt("display", 132);
        fit(nm, fN, 1150);
        const chars = [...nm], wsN = chars.map((c) => measure(c, fN));
        const totN = wsN.reduce((a2, b) => a2 + b, 0) + fN.ls * (chars.length - 1);
        let nx = cx - totN / 2 - fN.size * 0.08;
        const nb = cy + fN.size * 0.34;
        chars.forEach((c, k) => {
          const n = txt(g, c, nx, nb, { ...fN, ls: 0 }, C.ink), a2 = tb + 0.12 + k * 0.035;
          n.setAttribute("opacity", "0");
          ups.push((t) => {
            const p = prog(t, a2, 0.6, "spring");
            n.setAttribute("opacity", clamp(p * 2.5).toFixed(3));
            n.setAttribute("transform", `translate(0,${((1 - p) * -fN.size * 0.7).toFixed(1)})`);
          });
          nx += wsN[k] + fN.ls;
        });
        const dotX = cx + totN / 2 + fN.size * 0.06, dotY = nb - fN.size * 0.07;
        home = (t) => {
          const lineEnd: [number, number, number] = end ? [end.x + end.size * (end.punct ? 0.26 : 0.14), end.y - end.size * 0.08, Math.max(9, end.size * 0.075)] : [cx, cy, 9];
          if (t < imp0) return lineEnd;
          if (t < tb) { const q = E.cubicIn(clamp((t - imp0) / 0.55)); return [lineEnd[0] + (cx - lineEnd[0]) * q, lineEnd[1] + (cy - lineEnd[1]) * q, lineEnd[2] + (16 - lineEnd[2]) * q]; }
          const q = E.spring(clamp((t - tb - 0.2) / 0.7));
          return [cx + (dotX - cx) * q, cy + (dotY - cy) * q, 16 + (fN.size * 0.075 - 16) * q];
        };
        return;
      }
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

  const sceneAt = (t: number) => { let i = 0; for (let k = 0; k < starts.length; k++) if (t >= starts[k]) i = k; return i; };
  let lastGrain = -1, lastScene = -1;

  return {
    duration: total,
    starts,
    transitions: trans,
    render(t: number) {
      const i = sceneAt(t), C = PAL[i % PAL.length], sc = scenes[i];
      const [x, y, z] = camAt(t), v = camVel(t);
      cam.setAttribute("transform", `translate(800,450) scale(${z.toFixed(4)}) translate(${(-x).toFixed(2)},${(-y).toFixed(2)})`);
      // 움직임 흐림 = 속도에 비례(셔터 반 바퀴만큼 번진다). 확대·축소는 가장자리 속도의 절반을 양쪽에.
      const zb = Math.abs(v.vz) * 0.5;
      const bx = Math.min(40, ((Math.abs(v.vx) + zb) / 150) * M.blur), by = Math.min(40, ((Math.abs(v.vy) + zb) / 150) * M.blur);
      // 흐림 필터는 움직일 때만 건다 — 멈춰 있어도 걸려 있으면 화면 전체를 매 장면 다시 계산해 끊겼다(10-03).
      if (bx + by > 0.4) { mbBlur.setAttribute("stdDeviation", `${bx.toFixed(2)} ${by.toFixed(2)}`); world.setAttribute("filter", `url(#${id}mb)`); }
      else world.removeAttribute("filter");
      // 끝 장면은 검게 닫혔다 열린다.
      let black = 0;
      // 처음은 검정에서 열리고 끝은 검정으로 닫힌다 — 명함에서 되풀이될 때 끝→처음이 툭 끊기지 않게.
      black = Math.max(1 - prog(t, 0, 0.35, "cubicInOut"), prog(t, total - 0.45, 0.45, "cubicIn"));
      trans.forEach((tr, k) => { if (tr === "fade") black = Math.max(black, prog(t, starts[k] - 0.5, 0.5, "cubicIn") * (1 - prog(t, starts[k], 0.7, "cubicInOut"))); });
      blackR.setAttribute("opacity", black.toFixed(3));
      for (const c of cells) {
        c.g.style.display = t > c.s - 2.2 && t < c.e + 2.2 ? "" : "none";
        if (pan < 0.3) c.g.setAttribute("opacity", (1 - prog(t, c.e - 0.25, 0.25, "cubicIn")).toFixed(3));
      }
      for (const u of ups) u(t);

      // 산호색 점 — 속도 방향으로 늘어난다(빠를수록 길게).
      const sp = sparkAt(t), sp0 = sparkAt(Math.max(0, t - 1 / 120));
      const vx = (sp[0] - sp0[0]) * 120, vy = (sp[1] - sp0[1]) * 120, spd = Math.hypot(vx, vy), st = 1 + Math.min(0.7, spd / 3500);
      const rr = Math.max(2, sp[2]);
      spark.setAttribute("transform", `translate(${sp[0].toFixed(1)},${sp[1].toFixed(1)}) rotate(${((Math.atan2(vy, vx) * 180) / Math.PI).toFixed(1)}) scale(${st.toFixed(3)},${(1 / Math.sqrt(st)).toFixed(3)})`);
      sCore.setAttribute("r", rr.toFixed(2)); sGlow.setAttribute("r", (rr * 3.2).toFixed(2));
      spark.setAttribute("opacity", sp[3] ? "0" : "1");
      // 파고들기: 점이 화면을 덮는 원으로 커졌다가, 다음 장면의 자리로 줄어들며 점이 된다.
      let irisOn = false;
      trans.forEach((x, k) => {
        if (x !== "zoom" || irisOn) return;
        const s0 = starts[k];
        if (t >= s0 - 0.2 && t < s0) { irisOn = true; iris.setAttribute("r", (sp[2] + 1250 * E.expoIn(clamp((t - s0 + 0.2) / 0.2))).toFixed(1)); }
        else if (t >= s0 && t < s0 + 0.45) { irisOn = true; iris.setAttribute("r", (sp[2] + 1250 * (1 - E.expoInOut(clamp((t - s0) / 0.45)))).toFixed(1)); }
        if (irisOn) { iris.setAttribute("cx", sp[0].toFixed(1)); iris.setAttribute("cy", sp[1].toFixed(1)); }
      });
      iris.setAttribute("opacity", irisOn ? "1" : "0");
      for (const sl of slabs) {
        const q = E.cubicInOut(clamp((t - sl.s0 + 0.38) / 0.76)), x = -2500 + 4200 * q, W = 2300, k = 260;
        const on = q > 0 && q < 1;
        sl.main.setAttribute("points", on ? `${x},0 ${x + W},0 ${x + W - k},900 ${x - k},900` : "");
        sl.edge.setAttribute("points", on ? `${x + W + 18},0 ${x + W + 64},0 ${x + W + 64 - k},900 ${x + W + 18 - k},900` : "");
      }
      // 계기판
      hudL.setAttribute("opacity", clamp((t - 0.25) / 0.4).toFixed(3));
      railFill.setAttribute("x2", (RX0 + ((RX1 - RX0) * t) / total).toFixed(1));
      const cs = Math.floor(t * 100);
      hudTime.textContent = `00:${String(Math.floor(t)).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
      const lbl = labelOf(i), since = t - starts[i];
      hudLabel.textContent = since < 0.22 ? [...lbl].map((c, j) => (c === " " || j < (since / 0.22) * lbl.length ? c : SCRAMBLE[Math.floor(hash(j, Math.floor(t * 30)) * SCRAMBLE.length)])).join("") : lbl;
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
      // 필름 입자는 초당 24번 바뀐다 — 12번이면 매끈한 화면 위에서 입자만 덜컥거렸다.
      const gf = Math.floor(t * 24);
      if (gf !== lastGrain) { lastGrain = gf; grainR.setAttribute("transform", `translate(${(gf * 67) % 180},${(gf * 113) % 180})`); }
    },
  };
}
