// 세그먼트 계기 — 작품마다 그 작품을 띄울 진짜 기계가 하나씩 있다(필름 실험실 G06 v2, 2026-10-08).
//   명령줄 도구 → 주유기: 판매 금액 $200.00, 줄 수 계량기가 한 번 돌고, 비율 창이 남은 몫을 말한다.
//   생활 도구   → 삐삐: 맥의 상태가 호출로 도착한다. 알림이면 백라이트가 켜지고 몸체가 운다.
//   하드웨어   → 그 작품이 실제로 그런 온습도계 LCD.
// 세계의 규칙: 숫자는 7세그먼트, 낱말은 도트 문자 화면(영어 5×7, 한국어는 실제 한국어 도트 화면처럼 16×16 —
// 한글 글꼴을 점 격자에 찍어 문턱으로 자른다), 꺼진 점·세그먼트도 옅게 보인다, 고정 표시는 유리에 인쇄돼 켜진다.
// 움직임: 내용에는 곡선이 없다 — 화면의 잔상만 있다(LED 약 40ms, LCD 약 35ms). 전환은 키 누름이나 확대 컷,
// 낱말은 한 페이지씩 온다(명령은 쳐서), 끝은 전원이 꺼진다.
import type { FlatScene, Genre, GenreWork } from "./types";
import * as K from "./kit";

const W = K.W, H = K.H;

// 기계가 스스로 찍는 글자 — 영상의 언어로.
const LABEL = {
  en: { totalSale: "TOTAL SALE", lines: "LINES", percent: "PERCENT", enter: "ENTER", cancel: "CANCEL", sealTop: "SEALED · ", sample: "SAMPLE", sealA: "figures, not a", sealB: "real sale", read: "READ", select: "SELECT", DRY: "DRY", COMFORT: "COMFORT", WET: "WET", SAMPLE: "SAMPLE", MEASURED: "MEASURED", ch: "CH", maxmin: "MAX/MIN", unitKey: "°C/°F", alert: "ALERT", src: "src ", usd: "USD" },
  ko: { totalSale: "판매 금액", lines: "줄 수", percent: "비율", enter: "확인", cancel: "취소", sealTop: "검정 · ", sample: "예시", sealA: "실제 판매가 아닌", sealB: "예시 수치", read: "읽기", select: "선택", DRY: "건조", COMFORT: "쾌적", WET: "습함", SAMPLE: "예시", MEASURED: "실측", ch: "CH", maxmin: "최고/최저", unitKey: "°C/°F", alert: "경보", src: "출처 ", usd: "USD" },
};
type Lbl = (typeof LABEL)["en"];

// ---- 한글은 두 칸 폭(읽는 시간도 더 든다) ----
const isWide = (c: string) => {
  const n = c.codePointAt(0) || 0;
  return (n >= 0x1100 && n <= 0x115f) || (n >= 0x2e80 && n <= 0xa4cf) || (n >= 0xac00 && n <= 0xd7a3) || (n >= 0xf900 && n <= 0xfaff) || (n >= 0xff00 && n <= 0xff60) || (n >= 0xffe0 && n <= 0xffe6) || n >= 0x1f300;
};
const readLen = (s: string) => Array.from(s).reduce((a, c) => a + (isWide(c) ? 1.7 : 1), 0);
const norm = (s: string) => String(s).replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[—–]/g, "-");

// ---------- 7세그먼트 ----------
const S7: Record<string, string> = {
  0: "abcdef", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc", 5: "afgcd", 6: "afgedc", 7: "abc", 8: "abcdefg", 9: "abcdfg",
  "-": "g", " ": "", A: "abcefg", C: "adef", E: "adefg", F: "aefg", H: "bcefg", L: "def", O: "abcdef", P: "abefg", U: "bcdef", _: "d",
};
type Pt = [number, number];
function geom7(w: number, h: number, t: number, gap: number): Record<string, Pt[]> {
  const P: Record<string, Pt[]> = {};
  const hz = (x1: number, x2: number, y: number): Pt[] => [[x1, y], [x1 + t / 2, y - t / 2], [x2 - t / 2, y - t / 2], [x2, y], [x2 - t / 2, y + t / 2], [x1 + t / 2, y + t / 2]];
  const vt = (y1: number, y2: number, x: number): Pt[] => [[x, y1], [x + t / 2, y1 + t / 2], [x + t / 2, y2 - t / 2], [x, y2], [x - t / 2, y2 - t / 2], [x - t / 2, y1 + t / 2]];
  const m = h / 2;
  P.a = hz(t / 2 + gap, w - t / 2 - gap, t / 2);
  P.g = hz(t / 2 + gap, w - t / 2 - gap, m);
  P.d = hz(t / 2 + gap, w - t / 2 - gap, h - t / 2);
  P.f = vt(t / 2 + gap, m - gap, t / 2);
  P.b = vt(t / 2 + gap, m - gap, w - t / 2);
  P.e = vt(m + gap, h - t / 2 - gap, t / 2);
  P.c = vt(m + gap, h - t / 2 - gap, w - t / 2);
  return P;
}
const poly = (g: CanvasRenderingContext2D, pts: Pt[], ox: number, oy: number, sk: number, h: number) => {
  g.beginPath();
  pts.forEach(([x, y], i) => { const X = ox + x + (h - y) * sk, Y = oy + y; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); });
  g.closePath();
  g.fill();
};
type Cell = { ch: string; dp: boolean };
const cellsOf = (text: string, n: number): Cell[] => {
  const out: Cell[] = [];
  for (const c of String(text)) {
    if (c === "." && out.length && !out[out.length - 1].dp) out[out.length - 1].dp = true;
    else out.push({ ch: c, dp: false });
  }
  while (out.length < n) out.unshift({ ch: " ", dp: false });
  return out.slice(-n);
};

// ---------- 영어 5×7 도트 문자 롬(HD44780식, 내림 획은 아래 두 줄로) ----------
const ROM: Record<string, string> = {
  A: "01110 10001 10001 10001 11111 10001 10001", B: "11110 10001 10001 11110 10001 10001 11110", C: "01110 10001 10000 10000 10000 10001 01110",
  D: "11100 10010 10001 10001 10001 10010 11100", E: "11111 10000 10000 11110 10000 10000 11111", F: "11111 10000 10000 11110 10000 10000 10000",
  G: "01110 10001 10000 10111 10001 10001 01111", H: "10001 10001 10001 11111 10001 10001 10001", I: "01110 00100 00100 00100 00100 00100 01110",
  J: "00111 00010 00010 00010 00010 10010 01100", K: "10001 10010 10100 11000 10100 10010 10001", L: "10000 10000 10000 10000 10000 10000 11111",
  M: "10001 11011 10101 10101 10001 10001 10001", N: "10001 10001 11001 10101 10011 10001 10001", O: "01110 10001 10001 10001 10001 10001 01110",
  P: "11110 10001 10001 11110 10000 10000 10000", Q: "01110 10001 10001 10001 10101 10010 01101", R: "11110 10001 10001 11110 10100 10010 10001",
  S: "01111 10000 10000 01110 00001 00001 11110", T: "11111 00100 00100 00100 00100 00100 00100", U: "10001 10001 10001 10001 10001 10001 01110",
  V: "10001 10001 10001 10001 10001 01010 00100", W: "10001 10001 10001 10101 10101 10101 01010", X: "10001 10001 01010 00100 01010 10001 10001",
  Y: "10001 10001 10001 01010 00100 00100 00100", Z: "11111 00001 00010 00100 01000 10000 11111",
  a: "00000 00000 01110 00001 01111 10001 01111", b: "10000 10000 10110 11001 10001 10001 11110", c: "00000 00000 01110 10000 10000 10001 01110",
  d: "00001 00001 01101 10011 10001 10001 01111", e: "00000 00000 01110 10001 11111 10000 01110", f: "00110 01001 01000 11100 01000 01000 01000",
  h: "10000 10000 10110 11001 10001 10001 10001", i: "00100 00000 01100 00100 00100 00100 01110", k: "10000 10000 10010 10100 11000 10100 10010",
  l: "01100 00100 00100 00100 00100 00100 01110", m: "00000 00000 11010 10101 10101 10001 10001", n: "00000 00000 10110 11001 10001 10001 10001",
  o: "00000 00000 01110 10001 10001 10001 01110", r: "00000 00000 10110 11001 10000 10000 10000", s: "00000 00000 01110 10000 01110 00001 11110",
  t: "01000 01000 11100 01000 01000 01001 00110", u: "00000 00000 10001 10001 10001 10011 01101", v: "00000 00000 10001 10001 10001 01010 00100",
  w: "00000 00000 10001 10001 10101 10101 01010", x: "00000 00000 10001 01010 00100 01010 10001", z: "00000 00000 11111 00010 00100 01000 11111",
  0: "01110 10001 10011 10101 11001 10001 01110", 1: "00100 01100 00100 00100 00100 00100 01110", 2: "01110 10001 00001 00010 00100 01000 11111",
  3: "11111 00010 00100 00010 00001 10001 01110", 4: "00010 00110 01010 10010 11111 00010 00010", 5: "11111 10000 11110 00001 00001 10001 01110",
  6: "00110 01000 10000 11110 10001 10001 01110", 7: "11111 00001 00010 00100 01000 01000 01000", 8: "01110 10001 10001 01110 10001 10001 01110",
  9: "01110 10001 10001 01111 00001 00010 01100",
  " ": "00000 00000 00000 00000 00000 00000 00000", "!": "00100 00100 00100 00100 00000 00000 00100", '"': "01010 01010 01010 00000 00000 00000 00000",
  "#": "01010 01010 11111 01010 11111 01010 01010", $: "00100 01111 10100 01110 00101 11110 00100", "%": "11000 11001 00010 00100 01000 10011 00011",
  "&": "01100 10010 10100 01000 10101 10010 01101", "'": "01100 00100 01000 00000 00000 00000 00000", "(": "00010 00100 01000 01000 01000 00100 00010",
  ")": "01000 00100 00010 00010 00010 00100 01000", "*": "00000 00100 10101 01110 10101 00100 00000", "+": "00000 00100 00100 11111 00100 00100 00000",
  "-": "00000 00000 00000 11111 00000 00000 00000", ".": "00000 00000 00000 00000 00000 01100 01100", "/": "00000 00001 00010 00100 01000 10000 00000",
  ":": "00000 01100 01100 00000 01100 01100 00000", "<": "00010 00100 01000 10000 01000 00100 00010", "=": "00000 00000 11111 00000 11111 00000 00000",
  ">": "01000 00100 00010 00001 00010 00100 01000", "?": "01110 10001 00001 00010 00100 00000 00100", "@": "01110 10001 00001 01101 10101 10101 01110",
  _: "00000 00000 00000 00000 00000 00000 11111", "→": "00000 00100 00010 11111 00010 00100 00000", "✓": "00000 00001 00010 10100 01000 00000 00000",
  "°": "01100 10010 10010 01100 00000 00000 00000", "·": "00000 00000 00000 01100 01100 00000 00000",
};
// 내림 획(g p y …)은 두 줄을 더 쓴다 — 5×9 칸(HD44780의 5×10 방식)이라 g가 9로 읽히지 않는다.
const DESC: Record<string, string> = {
  g: "00000 00000 01111 10001 10001 10001 01111 00001 01110", j: "00010 00000 00110 00010 00010 00010 00010 10010 01100",
  p: "00000 00000 11110 10001 10001 10001 11110 10000 10000", q: "00000 00000 01111 10001 10001 10001 01111 00001 00001",
  y: "00000 00000 10001 10001 10001 10001 01111 00001 01110", ",": "00000 00000 00000 00000 00000 01100 01100 00100 01000",
  ";": "00000 00000 01100 01100 00000 01100 01100 00100 01000",
};
const SCRAMBLE = "▒";

/** 도트 글자 하나: rows×adv 점(마지막 열은 글자 사이 빈칸). */
type Glyph = { adv: number; bits: Uint8Array };

// ---------- 유리에 인쇄된 아이콘 ----------
type IconName = "bell" | "mute" | "env" | "lock" | "drop" | "window" | "check" | "batt" | "pct";
function icon(g: CanvasRenderingContext2D, name: IconName, x: number, y: number, s: number, col: string, fam: string): void {
  g.fillStyle = col; g.strokeStyle = col; g.lineWidth = s * 0.12; g.lineJoin = "round"; g.lineCap = "round";
  g.beginPath();
  if (name === "bell" || name === "mute") {
    g.moveTo(x - s * 0.42, y + s * 0.28);
    g.lineTo(x - s * 0.32, y + s * 0.14); g.lineTo(x - s * 0.3, y - s * 0.12);
    g.arc(x, y - s * 0.12, s * 0.3, Math.PI, 0);
    g.lineTo(x + s * 0.32, y + s * 0.14); g.lineTo(x + s * 0.42, y + s * 0.28); g.closePath(); g.fill();
    g.beginPath(); g.arc(x, y + s * 0.38, s * 0.1, 0, Math.PI * 2); g.fill();
    if (name === "mute") { g.lineWidth = s * 0.1; g.beginPath(); g.moveTo(x - s * 0.48, y - s * 0.5); g.lineTo(x + s * 0.5, y + s * 0.5); g.stroke(); }
  } else if (name === "env") {
    g.rect(x - s * 0.48, y - s * 0.32, s * 0.96, s * 0.64); g.stroke();
    g.beginPath(); g.moveTo(x - s * 0.48, y - s * 0.32); g.lineTo(x, y + s * 0.06); g.lineTo(x + s * 0.48, y - s * 0.32); g.stroke();
  } else if (name === "lock") {
    g.fillRect(x - s * 0.36, y - s * 0.06, s * 0.72, s * 0.52);
    g.beginPath(); g.arc(x, y - s * 0.12, s * 0.24, Math.PI, 0); g.stroke();
  } else if (name === "drop") {
    g.moveTo(x, y - s * 0.5);
    g.bezierCurveTo(x + s * 0.12, y - s * 0.24, x + s * 0.36, y - s * 0.02, x + s * 0.36, y + s * 0.18);
    g.arc(x, y + s * 0.18, s * 0.36, 0, Math.PI);
    g.bezierCurveTo(x - s * 0.36, y - s * 0.02, x - s * 0.12, y - s * 0.24, x, y - s * 0.5); g.fill();
  } else if (name === "window") {
    g.lineWidth = s * 0.08; g.strokeRect(x - s * 0.45, y - s * 0.45, s * 0.9, s * 0.9);
    g.beginPath(); g.moveTo(x, y - s * 0.45); g.lineTo(x, y + s * 0.45); g.moveTo(x - s * 0.45, y); g.lineTo(x + s * 0.45, y); g.stroke();
  } else if (name === "check") {
    g.lineWidth = s * 0.16; g.moveTo(x - s * 0.4, y); g.lineTo(x - s * 0.1, y + s * 0.32); g.lineTo(x + s * 0.45, y - s * 0.36); g.stroke();
  } else if (name === "batt") {
    g.lineWidth = s * 0.08; g.strokeRect(x - s * 0.5, y - s * 0.22, s * 0.9, s * 0.44); g.fillRect(x + s * 0.4, y - s * 0.1, s * 0.1, s * 0.2);
    for (let i = 0; i < 3; i++) g.fillRect(x - s * 0.42 + i * s * 0.27, y - s * 0.14, s * 0.2, s * 0.28);
  } else if (name === "pct") {
    g.font = K.font(s, fam, 600); g.textAlign = "center"; g.fillText("%", x, y + s * 0.35); g.textAlign = "left";
  }
}

/** 제목 "이름 · 한 줄 소개" → 이름. */
function nameOf(t: string): string {
  for (const sep of [" · ", " — ", " | "]) { const i = t.indexOf(sep); if (i > 0) return t.slice(0, i); }
  return t;
}

type Dev = "pump" | "pager" | "lcd";
/** 작품 모양으로 기계를 고른다(낱말이 아니라 장면 구성으로): 명령 출력이 있으면 주유기, %로 읽히는 측정 목록·센서 줄이면 온습도계, 나머지는 삐삐. */
function pickDevice(work: GenreWork): Dev {
  const sc = work.scenes;
  if (sc.some((s) => s.kind === "terminal")) return "pump";
  const pctItems = sc.some((s) => s.kind === "items" && s.items.length > 1 && s.items.every((it) => /^\s*[\d.,]+\s*(%|°[CF]?)\s*$/.test(it.value)));
  const pctHook = sc.some((s) => s.kind === "hook" && /^\s*[\d.,]+\s*(%|°[CF]?)\s*$/.test(s.value));
  const sensor = sc.some((s) => s.kind === "flow" && s.nodes.some((n) => /esp32|arduino|pico|raspberry|sensor|board|센서|보드/i.test(n)));
  if (pctItems || (pctHook && sensor)) return "lcd";
  return "pager";
}

type Win = { x: number; y: number; w: number; h: number; r: number; fill: string };
type SegSpec = { x: number; y: number; h: number; n: number };
type DotSpec = { x: number; y: number; rows: number; cols: number; pitch: number; gap: number; koRows: number };
type Design = {
  body: string; ink: string; dimInk: string; on: string; off: string; rise: number; fall: number; dotShape: "round" | "square";
  wins: Win[]; glass?: { x: number; y: number; w: number; h: number }; glassOff?: string; glassOn?: string;
  seg: Record<string, SegSpec>; dots: Record<string, DotSpec>;
  icons: Partial<Record<IconName, [number, number, number]>>; words: Record<string, [number, number]>;
  keys: [string, number, number, number, number][]; hand: [number, number];
};
function design(dev: Dev, L: Lbl, acc: string): Design {
  if (dev === "pump") return {
    body: "#1a2129", ink: "#d9dee2", dimInk: "#7d8890", on: "#ff4a2e", off: "rgba(255,74,46,0.075)", rise: 0, fall: 0.035, dotShape: "round",
    wins: [{ x: 80, y: 74, w: 920, h: 250, r: 6, fill: "#0d0605" }, { x: 80, y: 384, w: 560, h: 160, r: 6, fill: "#0d0605" }, { x: 670, y: 384, w: 330, h: 160, r: 6, fill: "#0d0605" }, { x: 80, y: 588, w: 1440, h: 238, r: 6, fill: "#0d0605" }],
    seg: { sale: { x: 300, y: 104, h: 190, n: 5 }, lines: { x: 214, y: 406, h: 116, n: 5 }, pct: { x: 700, y: 406, h: 116, n: 3 } },
    dots: { msg: { x: 112, y: 603, rows: 3, cols: 30, pitch: 7.6, gap: 4, koRows: 3 } },
    icons: {}, words: {},
    keys: [[L.enter, 1046, 482, 116, 50], [L.cancel, 1180, 482, 116, 50]], hand: [80, 870],
  };
  if (dev === "pager") return {
    body: "#18191b", ink: "#cfcfca", dimInk: "#6b6c6f", on: "#1d2117", off: "rgba(29,33,23,0.07)", rise: 0.02, fall: 0.035, dotShape: "square",
    wins: [], glass: { x: 270, y: 214, w: 1060, h: 420 }, glassOff: "#8d957e", glassOn: K.mix(acc, "#f1e6a8", 0.42),
    seg: { val: { x: 968, y: 228, h: 100, n: 3 } },
    dots: { msg: { x: 302, y: 352, rows: 4, cols: 24, pitch: 7.0, gap: 6, koRows: 3 }, unit: { x: 1192, y: 252, rows: 1, cols: 3, pitch: 6.2, gap: 0, koRows: 1 } },
    icons: { bell: [322, 272, 48], mute: [392, 272, 48], env: [462, 272, 46], lock: [530, 268, 44], check: [790, 274, 54] },
    words: { SAMPLE: [578, 284] },
    keys: [[L.read, 1070, 92, 190, 40], [L.select, 880, 98, 120, 34]], hand: [196, 864],
  };
  return {
    body: "#d6dad8", ink: "#3b4140", dimInk: "#4a504e", on: "#1b221d", off: "rgba(27,34,29,0.06)", rise: 0.02, fall: 0.035, dotShape: "square",
    wins: [{ x: 150, y: 70, w: 1300, h: 600, r: 26, fill: "#232726" }, { x: 178, y: 98, w: 1244, h: 544, r: 10, fill: "#aab5a6" }],
    seg: { main: { x: 440, y: 132, h: 290, n: 3 }, ch: { x: 270, y: 166, h: 70, n: 1 } },
    dots: { msg: { x: 232, y: 458, rows: 2, cols: 22, pitch: 8.6, gap: 10, koRows: 2 }, unit: { x: 1080, y: 346, rows: 1, cols: 6, pitch: 7.2, gap: 0, koRows: 1 } },
    words: { DRY: [1110, 176], COMFORT: [1110, 214], WET: [1110, 252], SAMPLE: [1262, 176], MEASURED: [1262, 214] },
    icons: { drop: [1300, 262, 34], window: [1352, 262, 40] },
    keys: [[L.ch, 300, 742, 170, 70], [L.maxmin, 520, 742, 170, 70], [L.unitKey, 740, 742, 170, 70], [L.alert, 1100, 742, 170, 70]], hand: [178, 862],
  };
}

const allText = (sc: FlatScene[]): string => sc.map((s) => {
  switch (s.kind) {
    case "hook": return [s.label, s.value, s.line].join(" ");
    case "story": return [s.line, s.line2].join(" ");
    case "items": return [...s.items.map((i) => i.value + " " + i.label), s.line].join(" ");
    case "flow": return ["→", ...s.nodes, s.line].join(" ");
    case "terminal": return [">", s.command, ...s.output, s.line].join(" ");
    case "alert": return [s.title, s.body, s.line, s.line2].join(" ");
    case "stats": return [...s.stats.map((x) => x.value + " " + x.unit + " " + x.label), s.line, s.source || ""].join(" ");
    case "ending": return [s.name, s.line, s.line2].join(" ");
  }
}).join(" ");

type Ev<V> = { at: number; v: V };
type Cam = { s: number; cx: number; cy: number };
type Rect = { x0: number; x1: number; y0: number; y1: number };

export const sevenseg: Genre = {
  id: "sevenseg",
  name: "Seven-segment instrument",
  ko: "세그먼트 계기",
  koIdea: "작품마다 그걸 띄울 진짜 기계 — 주유기·삐삐·온습도계 — 의 세그먼트 숫자와 도트 글자로 보여 주는 영화",
  enIdea: "Each work on the instrument that would really display it — a fuel pump, a pager, a hygrometer — in segments and dot-matrix words",
  family: "A",
  fonts: ["archivoNarrow", "pixelKo"],
  make(work, { seed, fonts }) {
    const LF = fonts.archivoNarrow;
    const KO = work.locale === "ko";
    const L: Lbl = LABEL[work.locale];
    const rng = K.rng(seed);
    const dev = pickDevice(work);
    const ACC = work.accent || "#ff9f0a";
    const D = design(dev, L, ACC);
    const alarmCol = work.alarm || "#ff3b30";
    const sc = work.scenes;
    const title = nameOf(work.title);

    // ---------- 도트 글자 ----------
    // 영어: 5×7 롬(+내림 두 줄) = 9줄, 글자 폭 6점. 한국어: 한국어 도트 화면처럼 16줄, 한글 16점·라틴 8점 —
    // 한글 고정폭 글꼴(pixelKo)을 4배로 찍어 평균 내고 문턱으로 자른다.
    const GR = KO ? 16 : 9;
    const GLY: Record<string, Glyph> = {};
    if (!KO) {
      for (const k in ROM) {
        const rows = (DESC[k] || ROM[k] + " 00000 00000").split(" ");
        const bits = new Uint8Array(9 * 6);
        rows.forEach((r, y) => { for (let x = 0; x < 5; x++) bits[y * 6 + x] = r[x] === "1" ? 1 : 0; });
        GLY[k] = { adv: 6, bits };
      }
      for (const k in DESC) if (!GLY[k]) {
        const bits = new Uint8Array(9 * 6);
        DESC[k].split(" ").forEach((r, y) => { for (let x = 0; x < 5; x++) bits[y * 6 + x] = r[x] === "1" ? 1 : 0; });
        GLY[k] = { adv: 6, bits };
      }
    } else {
      const SS = 4, SZ = 15, TH = 0.42;
      const rc = document.createElement("canvas");
      rc.width = 16 * SS; rc.height = 16 * SS;
      const x = rc.getContext("2d", { willReadFrequently: true })!;
      const fam = fonts.pixelKo || LF;
      x.font = `700 ${SZ * SS}px ${fam}`;
      x.textBaseline = "alphabetic";
      const base = Math.round(x.measureText("한").actualBoundingBoxAscent || SZ * SS * 0.85) + SS;
      const need = new Set<string>(Array.from(norm(allText(sc) + " " + title + " " + Object.values(L).join(" ") + " ?")));
      for (const ch of need) {
        if (ch === " " || ch === SCRAMBLE || !ch.trim()) continue;
        const mw = x.measureText(ch).width;
        const adv = isWide(ch) || mw > 9 * SS ? 16 : 8;
        x.clearRect(0, 0, rc.width, rc.height);
        x.fillStyle = "#000";
        x.fillText(ch, Math.max(0, ((adv - 1) * SS - mw) / 2), base);
        const d = x.getImageData(0, 0, 16 * SS, 16 * SS).data;
        const bits = new Uint8Array(16 * adv);
        for (let gy = 0; gy < 16; gy++) for (let gx = 0; gx < adv - 1; gx++) {
          let s = 0;
          for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) s += d[((gy * SS + j) * 16 * SS + gx * SS + i) * 4 + 3];
          if (s / (SS * SS * 255) >= TH) bits[gy * adv + gx] = 1;
        }
        GLY[ch] = { adv, bits };
      }
      // 작은 기호(% °)는 고정폭 글꼴이 16점에서 뭉개진다 — 영어 롬 글자를 두 배로 키워 쓴다
      for (const ch of ["%", "°"]) {
        const rows = ROM[ch].split(" ");
        const bits = new Uint8Array(16 * 12);
        rows.forEach((r, y) => { for (let x0 = 0; x0 < 5; x0++) if (r[x0] === "1") for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) bits[(y * 2 + j + 1) * 12 + x0 * 2 + i] = 1; });
        GLY[ch] = { adv: 12, bits };
      }
    }
    const SPACE = KO ? 8 : 6;
    const advOf = (ch: string) => (ch === " " ? SPACE : ch === SCRAMBLE ? SPACE : (GLY[ch] || GLY[ch.toUpperCase()] || GLY["?"])?.adv || SPACE);
    const dotsW = (s: string) => Math.max(0, Array.from(s).reduce((a, c) => a + advOf(c), 0) - 1);

    // ---------- 도트 칸(필드) ----------
    type DF = { x: number; y: number; rows: number; pitch: number; stride: number; cap: number; cols: number; boxW: number; boxH: number };
    const DF: Record<string, DF> = {};
    for (const f in D.dots) {
      const d = D.dots[f];
      const boxW = d.cols * 6 * d.pitch, boxH = d.rows * 9 * d.pitch + (d.rows - 1) * d.gap;
      if (!KO) DF[f] = { x: d.x, y: d.y, rows: d.rows, pitch: d.pitch, stride: 9 * d.pitch + d.gap, cap: d.cols * 6 - 1, cols: d.cols * 6, boxW, boxH };
      else {
        const gapK = d.koRows > 1 ? Math.max(8, d.gap) : 0;
        const pitch = (boxH - (d.koRows - 1) * gapK) / (d.koRows * 16);
        const cols = Math.floor(boxW / pitch);
        DF[f] = { x: d.x, y: d.y + (boxH - (d.koRows * 16 * pitch + (d.koRows - 1) * gapK)) / 2, rows: d.koRows, pitch, stride: 16 * pitch + gapK, cap: cols, cols, boxW, boxH };
      }
    }
    const MSG = DF.msg, R = MSG.rows;
    /** 점 폭으로 줄바꿈 — 띄어쓰기에서 끊고, 낱말이 줄보다 길면 글자에서 끊는다. */
    const wrapD = (text: string, cap: number): string[] => {
      const out: string[] = [];
      let cur = "";
      // 가운뎃점(·) 바로 뒤에서도 끊을 수 있다(한국어 나열 "사용량·온도·화면")
      const toks: { w: string; glue: string }[] = [];
      let g0 = "";
      for (const part of norm(text).split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { g0 = " "; continue; }
        part.split(/(?<=·)(?=.)/).forEach((w, i) => { toks.push({ w, glue: i ? "" : g0 }); g0 = ""; });
      }
      for (const tk of toks) {
        let w = tk.w;
        if (cur && dotsW(cur + tk.glue + w) <= cap) { cur += tk.glue + w; continue; }
        if (cur) { out.push(cur); cur = ""; }
        while (dotsW(w) > cap) {
          const ch = Array.from(w);
          let k = ch.length - 1;
          while (k > 1 && dotsW(ch.slice(0, k).join("")) > cap) k--;
          out.push(ch.slice(0, k).join(""));
          w = ch.slice(k).join("");
        }
        cur = w;
      }
      if (cur) out.push(cur);
      return out;
    };
    const wrapM = (text: string) => wrapD(text, MSG.cap);

    // ---------- 시간표 ----------
    const SEG: Record<string, Ev<string>[]> = {}, DOT: Record<string, Ev<string[]>[]> = {}, NUM: Record<string, Ev<number>[]> = {};
    const CAM: Ev<Cam>[] = [{ at: -99, v: { s: 1, cx: 0, cy: 0 } }];
    let T = 0;
    const push = <V>(m: Record<string, Ev<V>[]>, k: string, v: V, def: V, at: number) => { (m[k] = m[k] || [{ at: -99, v: def }]).push({ at, v }); };
    const seg = (f: string, v: string, at = T) => push(SEG, f, v, "", at);
    const dots = (f: string, rows: string[], at = T) => push(DOT, f, rows.map(norm), [] as string[], at);
    const put = (k: string, v: number, at = T) => push(NUM, k, v, 0, at);
    const lit = (nm: string, v = 1, at = T) => put("i:" + nm, v, at);
    const presses: { at: number; k: number }[] = [];
    const press = (k = 0, at = T) => presses.push({ at, k });
    const cam = (s: number, cx = 0, cy = 0) => CAM.push({ at: T, v: { s, cx, cy } });
    const readT = (rows: string[]) => Math.max(0.95, readLen(rows.join(" ")) / 20 + 0.55);
    const pages = (text: string, rows = R): string[][] => {
      const base = wrapM(text);
      const P = Math.ceil(base.length / rows);
      let lines = base;
      // 마지막 페이지에 낱말 하나만 남지 않게 — 페이지가 찰 때까지 줄 폭을 줄인다
      if (base.length % rows && P > 1) for (let m = MSG.cap - SPACE; m >= MSG.cap * 0.55; m -= SPACE) { const w = wrapD(text, m); if (w.length === P * rows) { lines = w; break; } if (w.length > P * rows) break; }
      const out: string[][] = [];
      for (let i = 0; i < lines.length; i += rows) out.push(lines.slice(i, i + rows));
      return out;
    };
    const say = (text: string) => { for (const p of pages(text)) { dots("msg", p); T += readT(p); } };
    const sampleOn = (s: FlatScene) => { if (D.words.SAMPLE) lit("SAMPLE", s.data === "sample" ? 1 : 0); if (D.words.MEASURED) lit("MEASURED", s.data === "measured" ? 1 : 0); };
    const crop = (r: Rect, sMax: number) => { const s = Math.min(sMax, (W * 0.9) / (r.x1 - r.x0), (H * 0.9) / (r.y1 - r.y0)); cam(s, (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2); };
    const msgRect = (nrows: number, wDots: number): Rect => ({ x0: MSG.x - 24, x1: MSG.x + wDots * MSG.pitch + 24, y0: MSG.y - 24, y1: MSG.y + nrows * MSG.stride + 4 });
    const splitVal = (v: string) => {
      const m = String(v).match(/^([^0-9]*)([0-9][0-9.,]*|)(.*)$/);
      if (!m || !m[2]) return { pre: "", num: "", unit: String(v) };
      return { pre: m[1], num: m[2].replace(/,/g, ""), unit: m[3].trim() };
    };
    const starts: number[] = [];

    // ================= 장면 대본 =================
    T = -0.6;
    if (dev === "pump") {
      sc.forEach((s, si) => {
        starts[si] = Math.max(0, T);
        if (s.kind === "hook") {
          const v = splitVal(s.value);
          seg("sale", v.num ? (v.num.includes(".") ? v.num : v.num + ".00") : "");
          dots("msg", wrapM(s.label).slice(0, R));
          crop({ x0: 84, x1: 1000, y0: 40, y1: 326 }, 1.6);
          T = 1.55;
          cam(1);
          say(s.line);
        } else if (s.kind === "story") {
          press(0, T - 0.05); T += 0.1;
          say(s.line);
          if (s.line2) { T += 0.05; say(s.line2); }
        } else if (s.kind === "flow") {
          press(0, T - 0.05); T += 0.1;
          // 주유기의 번호 붙은 안내등이 하나씩 켜진다 — 작품의 흐름 그대로
          s.nodes.forEach((nd, k) => { lit("step" + k, 1); dots("msg", wrapM((k + 1) + " " + nd).slice(0, R)); T += k === s.nodes.length - 1 ? 0.75 : 0.5; });
          say(s.line);
          s.nodes.forEach((_, k) => lit("step" + k, 0));
        } else if (s.kind === "terminal") {
          press(0, T - 0.05); T += 0.1;
          const cmd = "> " + s.command;
          const cc = Array.from(cmd);
          for (let i = 1; i <= cc.length; i++) { dots("msg", wrapM(cc.slice(0, i).join("")).slice(-R)); T += cc[i - 1] === " " ? 0.06 : 0.026 + rng() * 0.024; }
          T += 0.25; press(0, T - 0.05); T += 0.1;
          const cap = wrapM(s.line);
          s.output.forEach((o, k) => {
            const m = o.match(/^([^:]+):\s*(.*)$/);
            const lab = (m ? m[1] : o).replace(/ - /, ": ");
            const val = m ? m[2] : "";
            const pm = val.match(/^([\d,.]+)\s*(?:\((\d+)%\))?\s*(%?)$/);
            const num = pm ? pm[1].replace(/,/g, "") : "";
            const show = [...wrapM(lab).slice(0, 1), ...(k >= 2 && cap.length <= R - 1 ? cap : [])].slice(0, R);
            dots("msg", show);
            if (!pm) { dots("msg", wrapM(o).slice(0, R)); T += 0.85; return; }
            if (pm[3] === "%") { seg("pct", num); seg("lines", ""); lit("pct", 1); T += 0.85; return; }
            if (+num > 500 && !pm[2]) {
              // 주유: 줄 수 계량기가 한 번 돈다(영상에서 세는 숫자는 이것 하나)
              const d = 1.1, steps = Math.round(d * 15);
              for (let i = 0; i <= steps; i++) seg("lines", String(Math.round(+num * (1 - Math.pow(1 - i / steps, 2)))), T + i / 15);
              lit("pct", 0); seg("pct", "", T);
              T += d + 0.35;
              return;
            }
            if (+num < 100 && !pm[2]) { dots("msg", wrapM(lab + ": " + num).slice(0, R)); T += 0.8; return; }
            seg("lines", num);
            if (pm[2]) { seg("pct", pm[2]); lit("pct", 1); crop({ x0: 84, x1: 1000, y0: 34, y1: 556 }, 1.7); T += 1.7; cam(1); }
            else T += 0.85;
          });
          if (cap.length > R - 1) say(s.line); else T += 0.9;
        } else if (s.kind === "stats") {
          press(0, T - 0.05); T += 0.1;
          const cap = wrapM(s.line);
          s.stats.forEach((x, k) => {
            seg("lines", "");
            const v = splitVal(x.value);
            seg("pct", v.num || x.value);
            lit("pct", x.unit === "%" ? 1 : 0);
            dots("msg", [...wrapM(x.unit && x.unit !== "%" ? x.label + " (" + x.unit + ")" : x.label).slice(0, 1), ...(cap.length <= R - 1 ? cap : [])]);
            T += k === 0 ? 1.2 : 0.85;
          });
          if (cap.length > R - 1) say(s.line); else T += 0.7;
        } else if (s.kind === "ending") {
          press(1, T - 0.05); T += 0.1;
          seg("sale", ""); seg("lines", ""); seg("pct", ""); lit("pct", 0);
          const nm = wrapM(s.name).slice(0, R);
          dots("msg", nm);
          crop(msgRect(nm.length, Math.max(SPACE * 12, ...nm.map(dotsW)) + SPACE * 2), 2.4);
          T += 1.3;
          cam(1);
          const rest = [...wrapM(s.line), ...wrapM(s.line2 || "")];
          if (rest.length <= R) { dots("msg", rest); T += readT(rest); } else { say(s.line); if (s.line2) say(s.line2); }
        } else if (s.kind === "items") {
          press(0, T - 0.05); T += 0.1;
          s.items.forEach((x) => { const v = splitVal(x.value); seg("lines", ""); seg("pct", v.num); lit("pct", /%/.test(x.value) ? 1 : 0); dots("msg", wrapM(x.label + (v.num ? "" : " " + x.value)).slice(0, R)); T += 0.8; });
          say(s.line);
        } else if (s.kind === "alert") {
          press(0, T - 0.05); T += 0.1;
          const tb = [...wrapM(s.title), ...wrapM(s.body)];
          if (tb.length <= R) { dots("msg", tb); T += readT(tb); } else { say(s.title); say(s.body); }
          say(s.line); if (s.line2) say(s.line2);
        }
      });
    } else if (dev === "pager") {
      sc.forEach((s, si) => {
        starts[si] = Math.max(0, T);
        sampleOn(s);
        if (si > 0) { press(0, T - 0.05); T += 0.12; }
        lit("env", 1);
        if (s.kind === "story") {
          say(s.line);
          if (s.line2) say(s.line2);
        } else if (s.kind === "hook") {
          const v = splitVal(s.value);
          if (v.num) { seg("val", v.num); dots("unit", [v.unit]); }
          dots("msg", wrapM(s.label).slice(0, R)); T += 1.3;
          say(s.line);
          seg("val", ""); dots("unit", [""]);
        } else if (s.kind === "flow") {
          const enc = s.nodes.findIndex((n) => /encrypt|암호/i.test(n));
          const rows: string[] = [];
          const arrow = "→ ";
          s.nodes.forEach((nd, k) => {
            let row = (k ? arrow : "") + nd;
            if (k === enc) { const n = Math.min(14, Math.floor((MSG.cap - dotsW(arrow)) / SPACE) - 1); row = arrow + SCRAMBLE.repeat(Math.max(4, n)); lit("lock", 1); }
            rows.push(...wrapM(row));
            dots("msg", rows.slice(-R));
            T += k === s.nodes.length - 1 ? 0.8 : 0.55;
          });
          say(s.line);
          lit("lock", 0);
        } else if (s.kind === "alert") {
          // 호출이 온다: 백라이트가 켜지고, 종이 울리고, 몸체가 세 번 떤다
          put("bl", 1); lit("bell", 2); put("buzz", 1);
          const tb = [...wrapM(s.title), ...wrapM(s.body)];
          dots("msg", tb.slice(0, R));
          T += Math.max(2.0, readT(tb) + 0.2);
          put("buzz", 0, T - 0.6);
          lit("bell", 1);
          const ll = wrapM(s.line), l2 = wrapM(s.line2 || "");
          if (ll.length + l2.length <= R) {
            dots("msg", ll); T += readT(ll) * 0.75;
            lit("bell", 0); lit("mute", 1); put("bl", 0);
            dots("msg", [...ll, ...l2]); T += readT(l2) + 0.3;
          } else { say(s.line); lit("bell", 0); lit("mute", 1); put("bl", 0); if (s.line2) say(s.line2); }
          lit("mute", 0);
        } else if (s.kind === "items") {
          const cap = wrapM(s.line);
          s.items.forEach((x, k) => {
            const v = splitVal(x.value);
            lit("check", 0);
            if (x.value.trim() === "✓") { seg("val", ""); dots("unit", [""]); lit("check", 1); }
            else if (v.num) { seg("val", v.num); dots("unit", [v.unit]); }
            else if (Array.from(x.value.toUpperCase()).every((c) => S7[c] !== undefined) && x.value.length <= 3) { seg("val", x.value.toUpperCase()); dots("unit", [""]); }
            else { seg("val", ""); dots("unit", [""]); }
            const lab = v.num || S7[x.value.toUpperCase()[0]] !== undefined || x.value.trim() === "✓" ? x.label : x.label + " " + x.value;
            dots("msg", [...wrapM(lab).slice(0, 1), ...(k >= 1 && cap.length <= R - 1 ? cap : [])]);
            if (k === 0) { crop({ x0: 286, x1: 1330, y0: 214, y1: 430 }, 2.6); T += 1.1; cam(1); }
            else T += 0.7;
          });
          if (cap.length > R - 1) say(s.line); else T += 1.0;
          seg("val", ""); dots("unit", [""]); lit("check", 0);
        } else if (s.kind === "ending") {
          lit("env", 0);
          const nm = wrapM(s.name).slice(0, R);
          dots("msg", nm);
          crop(msgRect(nm.length, Math.max(...nm.map(dotsW)) + SPACE * 2), 2.6);
          T += 1.3;
          cam(1);
          const rest = [...wrapM(s.line), ...wrapM(s.line2 || "")];
          if (rest.length <= R) { dots("msg", rest); T += readT(rest); } else { say(s.line); if (s.line2) say(s.line2); }
        } else if (s.kind === "terminal") {
          dots("msg", wrapM("> " + s.command).slice(0, R)); T += 1.2;
          for (const o of s.output) { dots("msg", wrapM(o).slice(0, R)); T += readT(wrapM(o)) * 0.8; }
          say(s.line);
        } else if (s.kind === "stats") {
          s.stats.forEach((x) => { const v = splitVal(x.value); seg("val", v.num); dots("unit", [x.unit]); dots("msg", wrapM(x.label).slice(0, R)); T += 1.0; });
          seg("val", ""); dots("unit", [""]);
          say(s.line);
        }
      });
    } else {
      // 온습도계 LCD
      const comfort = (v: number) => { lit("WET", v >= 60 ? 1 : 0); lit("COMFORT", v >= 40 && v < 60 ? 1 : 0); lit("DRY", v < 40 ? 1 : 0); };
      const comfortOff = () => { lit("WET", 0); lit("COMFORT", 0); lit("DRY", 0); };
      sc.forEach((s, si) => {
        starts[si] = Math.max(0, T);
        sampleOn(s);
        if (s.kind !== "items" && s.kind !== "hook") comfortOff();
        if (s.kind === "hook") {
          const v = splitVal(s.value);
          seg("main", v.num); dots("unit", [v.unit]); seg("ch", "1");
          if (/%$/.test(s.value)) comfort(parseFloat(s.value));
          if (s.alarm) put("alarm", 2);
          const lab = wrapM(s.label)[0] || "";
          dots("msg", [lab]);
          crop({ x0: 205, x1: 1190, y0: 112, y1: 560 }, 1.8);
          T = 1.45;
          cam(1);
          dots("msg", [lab, ...wrapM(s.line)].slice(0, R));
          T += 1.5;
          put("alarm", 0);
        } else if (s.kind === "items") {
          const cap = wrapM(s.line);
          s.items.forEach((x, k) => {
            press(0, T - 0.06);
            const v = splitVal(x.value);
            seg("main", v.num); dots("unit", [v.unit]); seg("ch", String(k + 1));
            put("alarm", x.alarm ? 2 : 0);
            if (/%$/.test(x.value)) comfort(parseFloat(x.value));
            dots("msg", [...wrapM(x.label).slice(0, 1), ...(k >= 1 && cap.length <= R - 1 ? cap : [])]);
            T += k === 0 ? 0.9 : Math.max(0.55, 0.72 - k * 0.04 + rng() * 0.1);
          });
          put("alarm", 0);
          if (cap.length > R - 1) say(s.line); else T += 1.0;
        } else if (s.kind === "flow") {
          press(0, T - 0.06); T += 0.1;
          seg("main", ""); dots("unit", [""]); seg("ch", "");
          // 연결이 두 줄에 걸쳐 한 칸씩 자란다
          const rows = [""];
          s.nodes.forEach((nd, k) => {
            const piece = (k ? " → " : "") + nd;
            if (dotsW(rows[rows.length - 1] + piece) > MSG.cap) rows.push("→ " + nd); else rows[rows.length - 1] += piece;
            dots("msg", rows.slice(-R));
            T += k === s.nodes.length - 1 ? 0.8 : 0.5;
          });
          say(s.line);
        } else if (s.kind === "alert") {
          put("alarm", 1); lit("drop", 2); lit("window", 1);
          seg("main", ""); dots("unit", [""]);
          const tb = [...wrapM(s.title), ...wrapM(s.body)];
          if (tb.length <= R) { dots("msg", tb); T += Math.max(1.9, readT(tb)); } else { say(s.title); say(s.body); }
          put("alarm", 2); lit("drop", 1);
          const ll = [...wrapM(s.line), ...wrapM(s.line2 || "")];
          if (ll.length <= R) { dots("msg", ll); T += readT(ll) + 0.2; } else { say(s.line); if (s.line2) say(s.line2); }
          put("alarm", 0); lit("drop", 0); lit("window", 0);
        } else if (s.kind === "stats") {
          press(0, T - 0.06); T += 0.1;
          seg("ch", "");
          s.stats.forEach((x, k) => {
            const v = splitVal(x.value);
            seg("main", v.num);
            const u = (v.pre === "$" ? L.usd : "") + x.unit;
            dots("unit", [wrapD(u, DF.unit.cap)[0] || ""]);
            dots("msg", [wrapM(x.label)[0] || "", k === 0 && s.source ? (wrapM(L.src + s.source)[0] || "") : ""].slice(0, R));
            if (k === 0) { crop({ x0: 205, x1: 1420, y0: 112, y1: 650 }, 1.6); T += 1.7; cam(1); } else T += 1.0;
          });
          say(s.line);
        } else if (s.kind === "ending") {
          lit("SAMPLE", 0); lit("MEASURED", 0);
          press(0, T - 0.06); T += 0.1;
          seg("main", ""); dots("unit", [""]); seg("ch", "");
          const nm = wrapM(s.name);
          dots("msg", nm.slice(0, R));
          crop(msgRect(Math.min(nm.length, R), Math.max(...nm.map(dotsW)) + SPACE), 2.2);
          T += Math.max(1.5, readLen(s.name) / 11);
          cam(1);
          const rest = [...wrapM(s.line), ...wrapM(s.line2 || "")];
          if (rest.length <= R) { dots("msg", rest); T += readT(rest) + 0.2; } else { say(s.line); if (s.line2) say(s.line2); }
        } else if (s.kind === "story") {
          say(s.line); if (s.line2) say(s.line2);
        } else if (s.kind === "terminal") {
          dots("msg", wrapM("> " + s.command).slice(0, R)); T += 1.2;
          say(s.line);
        }
      });
    }
    // 마지막 페이지는 넘김 줄이 쳐지는 동안 켜져 있다가 전원이 나간다
    const total0 = T + 1.4;
    const kk = total0 > 29.6 ? 29.4 / total0 : 1;
    const sT = (a: number) => (a < 0 ? a : a * kk);
    for (const m of [SEG, DOT, NUM] as Record<string, Ev<unknown>[]>[]) for (const k in m) for (const e of m[k]) e.at = sT(e.at);
    for (const e of CAM) e.at = sT(e.at);
    for (const p of presses) p.at = sT(p.at);
    for (let i = 0; i < starts.length; i++) starts[i] = sT(starts[i] ?? 0);
    starts[0] = 0;
    const OFF = sT(T + 0.3), HAND = sT(T - 1.0), DUR = sT(total0);
    for (const k in SEG) seg(k, "", OFF);
    for (const k in DOT) dots(k, [], OFF);
    for (const k in NUM) put(k, 0, OFF);

    // ---------- 모양 ----------
    type SG = SegSpec & { w: number; t: number; sk: number; P: Record<string, Pt[]>; pitch: number };
    const GS: Record<string, SG> = {};
    for (const f in D.seg) { const sp = D.seg[f], w = sp.h * 0.52, t = sp.h * 0.13; GS[f] = { ...sp, w, t, sk: 0.075, P: geom7(w, sp.h, t, t * 0.12), pitch: w * 1.32 }; }
    const dotAt = (g: CanvasRenderingContext2D, x: number, y: number, p: number) => {
      if (D.dotShape === "round") { const r = p * 0.4; g.moveTo(x + r, y); g.arc(x, y, r, 0, Math.PI * 2); }
      else g.rect(x - p * 0.43, y - p * 0.43, p * 0.86, p * 0.86);
    };
    const glyphOf = (ch: string): Glyph | null => (ch === " " ? null : GLY[ch] || GLY[ch.toUpperCase()] || GLY["?"] || null);
    const drawRows = (g: CanvasRenderingContext2D, F: DF, rows: string[], fill: string, shadow: string | null) => {
      const passes: [string, number, number][] = shadow ? [[shadow, 3, 4], [fill, 0, 0]] : [[fill, 0, 0]];
      for (const [col, dx, dy] of passes) {
        g.fillStyle = col;
        g.beginPath();
        rows.forEach((row, r) => {
          let cx = 0;
          for (const ch of Array.from(row)) {
            const adv = advOf(ch);
            if (cx + adv - 1 > F.cols) break;
            const gl = ch === SCRAMBLE ? null : glyphOf(ch);
            for (let yy = 0; yy < GR; yy++) for (let xx = 0; xx < adv - 1; xx++) {
              const on = ch === SCRAMBLE ? K.rand(seed, cx + xx, r * 31 + yy) > 0.52 : gl ? gl.bits[yy * gl.adv + xx] === 1 : false;
              if (on) dotAt(g, dx + (cx + xx + 0.5) * F.pitch, dy + r * F.stride + (yy + 0.5) * F.pitch, F.pitch);
            }
            cx += adv;
          }
        });
        g.fill();
      }
    };
    const pageCache = new Map<string, HTMLCanvasElement>();
    const pageCanvas = (f: string, rows: string[]) => {
      const key = f + "|" + rows.join("\n");
      const hit = pageCache.get(key);
      if (hit) return hit;
      const F = DF[f];
      const c = document.createElement("canvas");
      c.width = Math.ceil(F.cols * F.pitch + 8); c.height = Math.ceil(F.rows * F.stride + 8);
      drawRows(c.getContext("2d")!, F, rows, D.on, dev === "pump" ? null : "rgba(0,0,0,0.13)");
      pageCache.set(key, c);
      return c;
    };

    // ---------- 고정 층 ----------
    const mkC = () => { const c = document.createElement("canvas"); c.width = W; c.height = H; return c; };
    const stat = mkC();
    const sg = stat.getContext("2d", { willReadFrequently: true })!;
    const legend = (txt: string, x: number, y: number, size = 24, wgt = 600, color = D.ink, align: CanvasTextAlign = "left", maxW = 0) => {
      let s = size;
      if (maxW) s = K.fitSize(sg, txt, LF, wgt, maxW, size, 12);
      sg.font = K.font(s, LF, wgt); sg.fillStyle = color; sg.textAlign = align; sg.fillText(txt, x, y); sg.textAlign = "left";
    };
    const rrect = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
    const speckle = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a: number) => {
      const im = g.getImageData(x, y, w, h), d = im.data, r = K.rng(seed + 7);
      for (let i = 0; i < d.length; i += 4) { const v = (r() - 0.5) * a; d[i] += v; d[i + 1] += v; d[i + 2] += v; }
      g.putImageData(im, x, y);
    };
    const bgc = mkC();
    { const bx = bgc.getContext("2d", { willReadFrequently: true })!; bx.fillStyle = D.body; bx.fillRect(0, 0, W, H); speckle(bx, 0, 0, W, H, dev === "lcd" ? 9 : 7); }
    sg.drawImage(bgc, 0, 0);
    const unlitCells = (g: CanvasRenderingContext2D, f: string) => {
      const G = GS[f];
      g.fillStyle = D.off;
      for (let i = 0; i < G.n; i++) { const ox = G.x + i * G.pitch; for (const id in G.P) poly(g, G.P[id], ox, G.y, G.sk, G.h); const r = G.t * 0.55; g.beginPath(); g.arc(ox + G.w + G.t * 0.55, G.y + G.h - r, r, 0, Math.PI * 2); g.fill(); }
    };
    const unlitDots = (g: CanvasRenderingContext2D, f: string) => {
      const F = DF[f];
      g.fillStyle = D.off; g.beginPath();
      for (let r = 0; r < F.rows; r++) for (let c = 0; c < F.cols; c++) {
        if (!KO && c % 6 === 5) continue; // 영어: 5점 칸 사이 빈 줄
        for (let yy = 0; yy < GR; yy++) dotAt(g, F.x + (c + 0.5) * F.pitch, F.y + r * F.stride + (yy + 0.5) * F.pitch, F.pitch);
      }
      g.fill();
    };
    const offIcon = D.off.replace(/[\d.]+\)$/, dev === "pager" ? "0.10)" : "0.09)");
    const keyRects = D.keys.map(([lab, x, y, w, h], i) => ({ lab, x, y, w, h, i }));
    const lamps: { k: number; x: number; y: number }[] = [];
    if (dev === "pump") {
      for (const wd of D.wins) { rrect(sg, wd.x, wd.y, wd.w, wd.h, wd.r); sg.fillStyle = wd.fill; sg.fill(); }
      legend(L.totalSale, 84, 60, 26, 600, D.ink);
      legend("$", 120, 268, 150, 500, "#3a2420");
      legend(L.lines, 84, 370, 24, 600, D.ink);
      legend(L.percent, 674, 370, 24, 600, D.ink);
      // 상표 스티커 + 번호 붙은 안내등 = 작품의 흐름
      legend(title, 1046, 132, 76, 600, "#f0f2f3", "left", 474);
      sg.fillStyle = "#3a4651"; sg.fillRect(1046, 156, 474, 3);
      const flow = sc.find((s) => s.kind === "flow");
      (flow && flow.kind === "flow" ? flow.nodes : []).slice(0, 4).forEach((nd, k) => {
        const y = 206 + k * 58;
        lamps.push({ k, x: 1066, y: y - 9 });
        sg.fillStyle = "#2a1512"; sg.beginPath(); sg.arc(1066, y - 9, 11, 0, Math.PI * 2); sg.fill();
        legend(String(k + 1), 1092, y, 28, 600, "#f0f2f3");
        legend(nd, 1120, y, 28, 500, D.ink, "left", 1520 - 1120);
      });
      for (const kr of keyRects) legend(kr.lab, kr.x + kr.w / 2, kr.y - 12, 20, 600, D.dimInk, "center");
      unlitCells(sg, "sale"); unlitCells(sg, "lines"); unlitCells(sg, "pct");
      icon(sg, "pct", 940, 476, 96, offIcon, LF);
      unlitDots(sg, "msg");
    } else if (dev === "pager") {
      sg.fillStyle = "#0b0b0c"; rrect(sg, 150, 112, 1300, 690, 120); sg.fill();
      sg.strokeStyle = "#2a2c30"; sg.lineWidth = 3; rrect(sg, 152, 114, 1296, 686, 118); sg.stroke();
      sg.fillStyle = "#050505"; rrect(sg, 240, 186, 1120, 476, 34); sg.fill();
      for (const kr of keyRects) legend(kr.lab, kr.x + kr.w / 2, 158, 22, 600, D.dimInk, "center");
      legend(title, 248, 736, 46, 600, "#c9c9c4", "left", 820);
      for (let i = 0; i < 9; i++) { sg.fillStyle = "#050505"; rrect(sg, 1130 + i * 24, 690, 10, 64, 5); sg.fill(); }
    } else {
      for (const wd of D.wins) { rrect(sg, wd.x, wd.y, wd.w, wd.h, wd.r); sg.fillStyle = wd.fill; sg.fill(); }
      speckle(sg, 178, 98, 1244, 544, 7);
      legend(title, 1450, 46, 26, 600, "#4a504e", "right", 900);
      legend(L.ch, 196, 210, 30, 600, "#1b221d");
      for (const kr of keyRects) legend(kr.lab, kr.x + kr.w / 2, kr.y - 16, 24, 600, D.ink, "center");
      unlitCells(sg, "main"); unlitCells(sg, "ch");
      unlitDots(sg, "msg"); unlitDots(sg, "unit");
      for (const nm in D.words) legend(L[nm as keyof Lbl], D.words[nm][0], D.words[nm][1], 26, 600, offIcon);
      for (const nm of Object.keys(D.icons) as IconName[]) { const ic = D.icons[nm]!; icon(sg, nm, ic[0], ic[1], ic[2], offIcon, LF); }
    }
    // 삐삐의 유리는 따로 — 백라이트가 색을 바꾼다
    let glassStat: HTMLCanvasElement | null = null;
    if (dev === "pager") {
      glassStat = document.createElement("canvas"); glassStat.width = D.glass!.w; glassStat.height = D.glass!.h;
      const gg = glassStat.getContext("2d")!;
      gg.translate(-D.glass!.x, -D.glass!.y);
      unlitCells(gg, "val"); unlitDots(gg, "msg"); unlitDots(gg, "unit");
      for (const nm in D.words) { gg.font = K.font(26, LF, 600); gg.fillStyle = offIcon; gg.fillText(L[nm as keyof Lbl], D.words[nm][0], D.words[nm][1]); }
      for (const nm of Object.keys(D.icons) as IconName[]) { const ic = D.icons[nm]!; icon(gg, nm, ic[0], ic[1], ic[2], offIcon, LF); }
      icon(gg, "batt", 706, 272, 40, D.on, LF);
    }
    // 주유기 유리의 예시 봉인(계량 검정 스티커처럼, 하지만 정직하게)
    let seal: HTMLCanvasElement | null = null;
    if (dev === "pump" && sc.some((s) => s.data === "sample")) {
      seal = document.createElement("canvas"); seal.width = 260; seal.height = 260;
      const x = seal.getContext("2d", { willReadFrequently: true })!;
      x.translate(130, 130); x.rotate(-0.16);
      x.fillStyle = "#e9e4cf"; x.beginPath(); x.arc(0, 0, 112, 0, Math.PI * 2); x.fill();
      x.strokeStyle = "#1f3f6e"; x.lineWidth = 5; x.beginPath(); x.arc(0, 0, 100, 0, Math.PI * 2); x.stroke();
      x.lineWidth = 2; x.beginPath(); x.arc(0, 0, 90, 0, Math.PI * 2); x.stroke();
      x.fillStyle = "#1f3f6e"; x.textAlign = "center";
      x.font = K.font(K.fitSize(x, L.sample, LF, 600, 160, 54, 20), LF, 600); x.fillText(L.sample, 0, 10);
      x.font = K.font(K.fitSize(x, L.sealA, LF, 600, 150, 22, 12), LF, 600); x.fillText(L.sealA, 0, 44);
      x.font = K.font(22, LF, 600); x.fillText(L.sealB, 0, 68);
      x.font = K.font(K.fitSize(x, L.sealTop + title, LF, 600, 150, 20, 11), LF, 600); x.fillText(L.sealTop + title, 0, -48);
      x.setTransform(1, 0, 0, 1, 0, 0);
      const im = x.getImageData(0, 0, 260, 260), d = im.data, r = K.rng(seed + 31);
      for (let i = 0; i < d.length; i += 4) { const v = (r() - 0.5) * 18 + K.noise(((i / 4) % 260) * 0.03, 4) * 8; d[i] += v; d[i + 1] += v; d[i + 2] += v; }
      x.putImageData(im, 0, 0);
    }
    // 읽어 들인 캔버스는 느려지니 한 번 옮겨 둔다
    const fresh = (src: HTMLCanvasElement) => { const c2 = document.createElement("canvas"); c2.width = src.width; c2.height = src.height; c2.getContext("2d")!.drawImage(src, 0, 0); return c2; };
    const statF = fresh(stat), sealF = seal ? fresh(seal) : null;
    // 페이지 그림은 미리 다 만든다(재생 중에 멈칫하지 않게)
    for (const k in DOT) for (const e of DOT[k]) if (e.v.length) pageCanvas(k, e.v);

    // ---------- 재생 ----------
    const at = <V>(a: Ev<V>[] | undefined, t: number, def: V) => {
      const arr = a || [{ at: -99, v: def }];
      let i = 0;
      for (let j = 0; j < arr.length; j++) if (arr[j].at <= t) i = j; else break;
      return { cur: arr[i], prev: i > 0 ? arr[i - 1] : null, dt: t - arr[i].at };
    };
    const lvl = (onNow: boolean, onPrev: boolean, dt: number) => {
      if (onNow) return onPrev || D.rise === 0 ? 1 : 1 - Math.exp(-dt / D.rise);
      if (onPrev) return Math.exp(-dt / D.fall);
      return 0;
    };
    const segsFor = (cell: Cell | undefined) => { if (!cell) return ""; const c = cell.ch.toUpperCase(); return (S7[c] !== undefined ? S7[c] : "") + (cell.dp ? "p" : ""); };
    const shadowed = dev !== "pump";
    const drawSeg = (g: CanvasRenderingContext2D, f: string, t: number) => {
      const G = GS[f], { cur, prev, dt } = at(SEG[f], t, "");
      const cc = cellsOf(cur.v, G.n), pc = prev && dt < 0.6 ? cellsOf(prev.v, G.n) : null;
      for (let i = 0; i < G.n; i++) {
        const sn = segsFor(cc[i]), sp = pc ? segsFor(pc[i]) : "";
        if (!sn && !sp) continue;
        const ox = G.x + i * G.pitch;
        for (const id of new Set([...sn, ...sp])) {
          const a = lvl(sn.includes(id), sp.includes(id), dt);
          if (a < 0.02) continue;
          const passes: [string, number, number][] = shadowed ? [["rgba(0,0,0,0.12)", 4, 5], [D.on, 0, 0]] : [[D.on, 0, 0]];
          for (const [col, dx, dy] of passes) {
            g.globalAlpha = a; g.fillStyle = col;
            if (id === "p") { const r = G.t * 0.55; g.beginPath(); g.arc(ox + dx + G.w + G.t * 0.55, G.y + dy + G.h - r, r, 0, Math.PI * 2); g.fill(); }
            else poly(g, G.P[id], ox + dx, G.y + dy, G.sk, G.h);
          }
        }
      }
      g.globalAlpha = 1;
    };
    const drawDots = (g: CanvasRenderingContext2D, f: string, t: number) => {
      const F = DF[f], { cur, prev, dt } = at(DOT[f], t, [] as string[]);
      if (prev && prev.v.length && dt < 0.6) { const a = lvl(false, true, dt); if (a > 0.02) { g.globalAlpha = a; g.drawImage(pageCanvas(f, prev.v), F.x, F.y); } }
      if (cur.v.length) { g.globalAlpha = lvl(true, !!prev && prev.v.join() === cur.v.join(), dt); g.drawImage(pageCanvas(f, cur.v), F.x, F.y); }
      g.globalAlpha = 1;
    };
    const litLevel = (nm: string, t: number) => {
      const { cur, prev, dt } = at(NUM["i:" + nm], t, 0);
      let a = lvl(!!cur.v, !!prev && !!prev.v, dt);
      if (cur.v === 2) a *= Math.floor(dt * 2.6) % 2 === 0 ? 1 : 0.12;
      return a;
    };
    const keyDip = (i: number, t: number) => {
      let dip = 0;
      for (const p of presses) { if (p.k !== i) continue; const dt = t - p.at; if (dt >= 0 && dt < 0.5) dip = Math.max(dip, dt < 0.05 ? dt / 0.05 : 1 - K.ease.spring(dt - 0.05, 0.28, 0.25)); }
      return dip;
    };

    return {
      duration: DUR,
      starts,
      render(g, t) {
        let c = at(CAM, t, { s: 1, cx: 0, cy: 0 }).cur.v;
        if (c.s === 1 && dev === "pager") c = { s: 1.13, cx: 800, cy: 452 };
        g.fillStyle = D.body; g.fillRect(0, 0, W, H);
        g.save();
        if (c.s !== 1) {
          const cx = K.clamp(c.cx, W / (2 * c.s), W - W / (2 * c.s)), cy = K.clamp(c.cy, H / (2 * c.s), H - H / (2 * c.s));
          g.translate(W / 2, H / 2); g.scale(c.s, c.s); g.translate(-cx, -cy);
        }
        if (dev === "pager") {
          // 호출이 오면 짧게 세 번 떤다(꾸밈이 아니라 내용)
          const bz = at(NUM.buzz, t, 0);
          let sx = 0;
          if (bz.cur.v) { const ph = bz.dt % 0.62; if (ph < 0.3 && bz.dt < 1.8) sx = Math.sin(bz.dt * Math.PI * 2 * 26) * 5 * (1 - (ph / 0.3) * 0.4); }
          g.translate(sx, 0);
          g.drawImage(statF, 0, 0);
          for (const kr of keyRects) {
            const y = kr.y + keyDip(kr.i, t) * 8;
            g.fillStyle = kr.i === 0 ? K.mix(ACC, "#000000", 0.3) : "#1d1e20";
            g.beginPath(); g.roundRect(kr.x, y + 8, kr.w, kr.h, 18); g.fill();
            g.fillStyle = kr.i === 0 ? ACC : "#2b2c2f";
            g.beginPath(); g.roundRect(kr.x, y, kr.w, kr.h, 18); g.fill();
          }
          // 키 아랫부분은 몸체 윗변 뒤로 들어간다 — 그 띠만 다시 덮는다
          g.drawImage(statF, 840, 112, 460, 44, 840, 112, 460, 44);
          const bl = at(NUM.bl, t, 0);
          const blA = bl.cur.v ? K.clamp(bl.dt / 0.06) : bl.prev && bl.prev.v ? 1 - K.clamp(bl.dt / 0.12) : 0;
          const G0 = D.glass!;
          g.fillStyle = blA > 0 ? K.mix(D.glassOff!, D.glassOn!, blA) : D.glassOff!;
          g.beginPath(); g.roundRect(G0.x, G0.y, G0.w, G0.h, 12); g.fill();
          if (glassStat) g.drawImage(glassStat, G0.x, G0.y);
        } else g.drawImage(statF, 0, 0);
        for (const f in GS) drawSeg(g, f, t);
        for (const f in DF) drawDots(g, f, t);
        for (const nm of Object.keys(D.icons) as IconName[]) {
          const a = litLevel(nm, t);
          if (a < 0.02) continue;
          const ic = D.icons[nm]!;
          g.globalAlpha = a;
          if (shadowed) icon(g, nm, ic[0] + 3, ic[1] + 4, ic[2], "rgba(0,0,0,0.13)", LF);
          icon(g, nm, ic[0], ic[1], ic[2], D.on, LF);
          g.globalAlpha = 1;
        }
        for (const nm in D.words) {
          const a = litLevel(nm, t);
          if (a < 0.02) continue;
          g.globalAlpha = a; g.font = K.font(26, LF, 600); g.fillStyle = D.on; g.fillText(L[nm as keyof Lbl], D.words[nm][0], D.words[nm][1]); g.globalAlpha = 1;
        }
        if (dev === "pump") {
          const a = litLevel("pct", t);
          if (a > 0.02) { g.globalAlpha = a; icon(g, "pct", 940, 476, 96, D.on, LF); g.globalAlpha = 1; }
          for (const lp of lamps) { const a2 = litLevel("step" + lp.k, t); if (a2 < 0.02) continue; g.globalAlpha = a2; g.fillStyle = D.on; g.beginPath(); g.arc(lp.x, lp.y, 11, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
          if (sealF) g.drawImage(sealF, 1318, 380, 196, 196);
        }
        if (dev !== "pager") for (const kr of keyRects) {
          const dip = keyDip(kr.i, t);
          const y = kr.y + dip * 5;
          const lcdK = dev === "lcd";
          g.fillStyle = lcdK ? "#a9aeac" : "#050607";
          g.beginPath(); g.roundRect(kr.x, kr.y + 7, kr.w, kr.h, 10); g.fill();
          const accentKey = lcdK && kr.i === 3;
          g.fillStyle = accentKey ? ACC : lcdK ? "#eceeed" : kr.i === 0 ? "#3a4450" : "#2a3038";
          g.beginPath(); g.roundRect(kr.x, y, kr.w, kr.h - dip * 2, 10); g.fill();
        }
        if (dev === "lcd") {
          const al = at(NUM.alarm, t, 0);
          const on = al.cur.v === 1 ? (Math.floor(al.dt * 2.6) % 2 === 0 ? 1 : 0) : al.cur.v === 2 ? 1 : 0;
          g.fillStyle = on ? alarmCol : "#8f2a30";
          g.beginPath(); g.arc(1330, 776, 11, 0, Math.PI * 2); g.fill();
        }
        g.restore();
        if (t >= HAND) K.handoff(g, K.clamp((t - HAND) / (DUR - HAND)), { ink: dev === "pager" ? "#9a9a96" : D.ink, family: LF, size: 28, x: D.hand[0], y: D.hand[1], handle: work.handle });
      },
    };
  },
};
