// 틀 공용 도구 — 필름 실험실 engine.js를 옮긴 것(2026-10-04). 수학·씨앗 난수·움직임 곡선·색·글자·질감.
// 모두 순수 함수다(grain만 첫 호출 때 노이즈 타일을 한 번 만든다). 좌표는 1600×900 논리 크기.
export const W = 1600;
export const H = 900;

// ---------- 수학 ----------
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, x: number) => clamp((x - a) / (b - a));
/** [a, a+d] 안에서 t의 진행(0..1). */
export const seg = (t: number, a: number, d: number) => clamp((t - a) / d);
/** 더 낮은 프레임으로 시간을 끊는다(그린 층은 12·24fps로, 화면은 60fps로). */
export const step = (t: number, fps: number) => Math.floor(t * fps) / fps;

// ---------- 씨앗 난수 ----------
export function hash(s: string | number): number {
  let h = 2166136261 >>> 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** mulberry32 — [0,1)을 돌려주는 함수. */
export function rng(seed: number | string): () => number {
  let a = (typeof seed === "number" ? seed : hash(seed)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** (seed, i, j)마다 늘 같은 [0,1) 값. */
export const rand = (seed: number | string, i = 0, j = 0) => rng(hash(seed + ":" + i + ":" + j))();
/** 부드러운 1차원 노이즈 [-1, 1]. */
export function noise(x: number, seed: number | string = 0): number {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  const a = rand(seed, i) * 2 - 1, b = rand(seed, i + 1) * 2 - 1;
  return a + (b - a) * u;
}

// ---------- 움직임 곡선(공간 이동에 대칭 기본 곡선을 쓰지 않는다) ----------
export const ease = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
  outQuint: (t: number) => 1 - Math.pow(1 - t, 5),
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inCubic: (t: number) => t * t * t,
  inQuad: (t: number) => t * t,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t: number, s = 1.4) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  /** 감쇠 스프링 0→1. bounce 0 = 튕김 없음, 0.4가 상한. t·dur는 초. */
  spring: (t: number, dur = 0.6, bounce = 0.2) => {
    if (t <= 0) return 0;
    if (t >= dur * 1.6) return 1;
    const omega = (2 * Math.PI) / dur;
    const zeta = 1 - bounce;
    if (zeta >= 1) return 1 - (1 + omega * t) * Math.exp(-omega * t);
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * omega * t) * (Math.cos(wd * t) + ((zeta * omega) / wd) * Math.sin(wd * t));
  },
  /** CSS cubic-bezier(x1,y1,x2,y2)와 같은 곡선. */
  bezier: (x1: number, y1: number, x2: number, y2: number) => {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (u: number) => ((ax * u + bx) * u + cx) * u;
    const sy = (u: number) => ((ay * u + by) * u + cy) * u;
    const dx = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
    return (x: number) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let u = x;
      for (let i = 0; i < 6; i++) { const d = dx(u); if (Math.abs(d) < 1e-6) break; u -= (sx(u) - x) / d; }
      return sy(clamp(u));
    };
  },
};

// ---------- 색 ----------
export function rgb(h: string): [number, number, number] {
  let s = h.replace("#", "");
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const hex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
export const rgba = (h: string, a: number) => { const [r, g, b] = rgb(h); return `rgba(${r},${g},${b},${a})`; };
const lin = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const srgb = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
/** hex → [L, C, H°] (OKLCH). */
export function oklch(h: string): [number, number, number] {
  const [r, g, b] = rgb(h).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}
/** [L, C, H°] → hex(sRGB 밖은 자른다). */
export function fromOklch(L: number, C: number, Hd: number): string {
  const A = C * Math.cos((Hd * Math.PI) / 180), B = C * Math.sin((Hd * Math.PI) / 180);
  const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3);
  const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3);
  const s = Math.pow(L - 0.0894841775 * A - 1.291485548 * B, 3);
  return hex(
    srgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    srgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    srgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  );
}
export function mix(a: string, b: string, w: number): string {
  const x = rgb(a), y = rgb(b);
  return hex(x[0] + (y[0] - x[0]) * w, x[1] + (y[1] - x[1]) * w, x[2] + (y[2] - x[2]) * w);
}
/** 정해 둔 잉크 중 가장 가까운 것("snap" 색 정책). */
export function snap(h: string | null, inks: string[]): string {
  if (!h) return inks[0];
  const [L, C, Hd] = oklch(h);
  let best = inks[0], bd = 1e9;
  for (const k of inks) {
    const [l, c, hh] = oklch(k);
    const dh = Math.min(Math.abs(hh - Hd), 360 - Math.abs(hh - Hd)) / 180;
    const d = (l - L) ** 2 + (c - C) ** 2 * 4 + dh * dh * (c > 0.03 && C > 0.03 ? 1 : 0);
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

// ---------- 글자 ----------
/** family는 따옴표를 포함한 font-family 목록(GenreFonts 값)을 그대로 넘긴다. */
export const font = (size: number, family: string, weight: number | string = 400, style = "normal") =>
  `${style} ${weight} ${Math.round(size)}px ${family}`;
/** maxW에 들어가는 가장 큰 크기(≤ maxSize). */
export function fitSize(g: CanvasRenderingContext2D, text: string, family: string, weight: number | string, maxW: number, maxSize: number, minSize = 10): number {
  let s = maxSize;
  g.save();
  while (s > minSize) { g.font = font(s, family, weight); if (g.measureText(text).width <= maxW) break; s -= 2; }
  g.restore();
  return s;
}
/** 단어 단위 줄바꿈(한국어도 띄어쓰기 단위). 지금 g.font 기준. */
export function wrap(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = String(text).split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (g.measureText(next).width > maxW && cur) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---------- 질감 ----------
const grainTiles: HTMLCanvasElement[] = [];
/** 되풀이 없는 필름 입자(fps로 끊어 바뀐다). amount 0..1. */
export function grain(g: CanvasRenderingContext2D, t: number, amount = 0.08, seed: number | string = 1, fps = 12, mode: GlobalCompositeOperation = "overlay"): void {
  if (!grainTiles.length) {
    for (let k = 0; k < 4; k++) {
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      const x = c.getContext("2d")!;
      const im = x.createImageData(256, 256);
      const r = rng(9001 + k);
      for (let i = 0; i < im.data.length; i += 4) { const v = r() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
      x.putImageData(im, 0, 0);
      grainTiles.push(c);
    }
  }
  const f = Math.floor(t * fps);
  const tile = grainTiles[Math.floor(rand(seed, f, 7) * 4)];
  const ox = Math.floor(rand(seed, f, 1) * 256), oy = Math.floor(rand(seed, f, 2) * 256);
  g.save();
  g.globalAlpha = amount;
  g.globalCompositeOperation = mode;
  const pat = g.createPattern(tile, "repeat");
  if (pat) {
    g.translate(-ox, -oy);
    g.fillStyle = pat;
    g.fillRect(ox, oy, W, H);
  }
  g.restore();
}

/**
 * 끝 2초 넘김 — 모든 틀이 같이 가진 단 하나(작게, 그 틀의 잉크·글꼴로 nookframe.com/@handle을 친다).
 * p = 넘김 구간 진행 0..1.
 */
export function handoff(
  g: CanvasRenderingContext2D,
  p: number,
  { ink = "#111", family = "monospace", size = 30, x = 96, y = H - 84, handle = "", align = "left" as CanvasTextAlign } = {},
): void {
  const full = `nookframe.com/@${handle}`;
  const n = Math.round(clamp(p / 0.55) * full.length);
  g.save();
  g.fillStyle = ink;
  g.textAlign = align;
  g.textBaseline = "alphabetic";
  g.font = font(size, family, 500);
  g.globalAlpha = clamp(p * 6);
  g.fillText(full.slice(0, n), x, y);
  g.restore();
}
