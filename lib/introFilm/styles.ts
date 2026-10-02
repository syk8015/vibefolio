// 소개 영상 스타일 토큰 3벌 + "글자 + 분위기" 두 줄 고르기(10-02 사용자 결정).
// 글자 = 글꼴·배치·등장 방식, 분위기 = 색·빛·질감·카메라. 같은 걸 고르면 순수 스타일.
import type { IntroStyleKey } from "./schema";

export type Palette = { bg: string; ink: string; sub: string; accent: string; line: string; glow: string };
export type FontRole = { f: string; w: number; ls: number; ko: string };
export type EnterKind = "mask" | "blur" | "draw";
export type ShapeKind = "doodle" | "block" | "line";

export type StyleTokens = {
  name: { ko: string; en: string };
  color: { scenes: Palette[] };
  type: { display: FontRole; text: FontRole; label: FontRole; scale: number };
  motion: { enter: EnterKind; inDur: number; stagger: number; count: number; pan: number; push: number; blur: number };
  texture: { grain: number; paper: number; vignette: number; glow: number; wobble: number; shapes: ShapeKind };
};

/** 글꼴 이름은 "가족 이름"이다. 실제 파일은 화면 쪽이 불러온다(render.ts는 이름만 쓴다). */
export const INTRO_FONTS = {
  grot: "Bricolage Grotesque",
  ui: "Inter",
  mono: "JetBrains Mono",
  hand: "Caveat",
  handKo: "Gaegu",
  ko: "Gothic A1",
} as const;

export const STYLES: Record<IntroStyleKey, StyleTokens> = {
  hand: {
    name: { ko: "손그림", en: "Hand-drawn" },
    color: { scenes: [{ bg: "#efe5cf", ink: "#2e2a26", sub: "#7a6a4f", accent: "#e0674c", line: "#2e2a26", glow: "#f7efdc" }] },
    type: {
      display: { f: INTRO_FONTS.hand, w: 700, ls: 0, ko: INTRO_FONTS.handKo },
      text: { f: INTRO_FONTS.hand, w: 700, ls: 0, ko: INTRO_FONTS.handKo },
      label: { f: INTRO_FONTS.mono, w: 500, ls: 3, ko: INTRO_FONTS.ko },
      scale: 1.12,
    },
    motion: { enter: "draw", inDur: 0.8, stagger: 0.07, count: 1.4, pan: 0.9, push: 0, blur: 0 },
    texture: { grain: 0, paper: 1, vignette: 0.28, glow: 0, wobble: 1, shapes: "doodle" },
  },
  bignum: {
    name: { ko: "큰 숫자", en: "Big numbers" },
    color: {
      scenes: [
        { bg: "#2430d8", ink: "#fff6e5", sub: "#c3c8fb", accent: "#ff6a4d", line: "#fff6e5", glow: "#3b47e6" },
        { bg: "#ff6a4d", ink: "#141414", sub: "#5c2216", accent: "#fff6e5", line: "#141414", glow: "#ff8366" },
        { bg: "#ffd84a", ink: "#141414", sub: "#6b5600", accent: "#2430d8", line: "#141414", glow: "#ffe27a" },
        { bg: "#141414", ink: "#fff6e5", sub: "#9a958c", accent: "#ffd84a", line: "#fff6e5", glow: "#2a2a2a" },
      ],
    },
    type: {
      display: { f: INTRO_FONTS.grot, w: 800, ls: -6, ko: INTRO_FONTS.ko },
      text: { f: INTRO_FONTS.grot, w: 700, ls: -1.5, ko: INTRO_FONTS.ko },
      label: { f: INTRO_FONTS.mono, w: 500, ls: 3, ko: INTRO_FONTS.ko },
      scale: 1,
    },
    motion: { enter: "mask", inDur: 0.7, stagger: 0.05, count: 0.9, pan: 0, push: 0, blur: 0.4 },
    texture: { grain: 0.02, paper: 0, vignette: 0, glow: 0, wobble: 0, shapes: "block" },
  },
  cinematic: {
    name: { ko: "시네마틱", en: "Cinematic" },
    color: { scenes: [{ bg: "#0c0b0a", ink: "#efe9df", sub: "#8d877c", accent: "#ff6a4d", line: "#efe9df", glow: "#2b231c" }] },
    type: {
      display: { f: INTRO_FONTS.ui, w: 200, ls: -8, ko: INTRO_FONTS.ko },
      text: { f: INTRO_FONTS.ui, w: 300, ls: -1, ko: INTRO_FONTS.ko },
      label: { f: INTRO_FONTS.mono, w: 500, ls: 6, ko: INTRO_FONTS.ko },
      scale: 1,
    },
    // 카메라 이동 1.1초(1.6초는 장면 사이마다 빈 화면이 1.5초씩 남았고, 0.9초는 너무 빨라 끊겨 보였다, 10-02).
    // 입자는 옅게 — 진하면 어두운 바탕에서 지직거리고 영상 압축에서 더 깨진다.
    motion: { enter: "blur", inDur: 1.2, stagger: 0.06, count: 2.0, pan: 1.1, push: 0.045, blur: 1 },
    texture: { grain: 0.028, paper: 0, vignette: 0.55, glow: 1, wobble: 0, shapes: "line" },
  },
};

export type ResolvedStyle = Pick<StyleTokens, "color" | "type" | "motion" | "texture">;

/**
 * 지금 실제로 그리는 스타일(10-02 사용자 결정): 2차 온습도계 결 하나 — 글자 큰 숫자 + 분위기 시네마틱.
 * 9가지 조합을 한꺼번에 덮다가 어느 것도 다듬어지지 않아 품질이 낮았다. 이 하나를 제대로 다듬은 뒤 다듬은
 * 조합만 하나씩 연다. 대본의 style 값은 그대로 저장해 두고(나중에 열 조합을 위해) 그리기만 이걸로 한다.
 */
export const SIGNATURE_STYLE = { text: "bignum", mood: "cinematic" } as const;
export function filmStyle(): ResolvedStyle {
  return resolveStyle(SIGNATURE_STYLE);
}

/** 글자 쪽: 글꼴·등장 / 분위기 쪽: 색·질감·카메라(이동·밀기·흐림). */
export function resolveStyle(sp: { text: IntroStyleKey; mood: IntroStyleKey }): ResolvedStyle {
  const tx = STYLES[sp.text], md = STYLES[sp.mood];
  return {
    type: structuredClone(tx.type),
    motion: {
      enter: tx.motion.enter, inDur: tx.motion.inDur, stagger: tx.motion.stagger, count: tx.motion.count,
      pan: md.motion.pan, push: md.motion.push, blur: md.motion.blur,
    },
    color: structuredClone(md.color),
    texture: structuredClone(md.texture),
  };
}

// ── 색 계산(OKLab — sRGB로 섞으면 어두운 색과 진한 색 사이가 탁해진다) ─────────────────
function hexToRgb(h: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16)) as [number, number, number];
}
const toLin = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const toSrgb = (v: number) => {
  v = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
};
function oklab(h: string): [number, number, number] {
  const [r, g, b] = hexToRgb(h).map(toLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function fromOklab([L, A, B]: number[]): number[] {
  const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3);
  const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3);
  const s = Math.pow(L - 0.0894841775 * A - 1.291485548 * B, 3);
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(toSrgb);
}
export function mixHex(a: string, b: string, w: number): string {
  if (w <= 0) return a;
  if (w >= 1) return b;
  const x = oklab(a), y = oklab(b);
  return "#" + fromOklab(x.map((v, i) => v + (y[i] - v) * w)).map((v) => v.toString(16).padStart(2, "0")).join("");
}
export function luminance(h: string): number {
  const c = hexToRgb(h).map(toLin);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
