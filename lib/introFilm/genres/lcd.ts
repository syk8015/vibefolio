// 휴대용 LCD — 160×144 네 농도 점 화면 안에서 작품이 작은 게임처럼 돈다(필름 실험실 G05, 2026-10-04).
// 세계의 규칙: 농도는 딱 네 가지, 15fps로 갱신, 액정이 느려 앞 프레임이 남는다(잔상). 화면 둘레 유리엔
// 켜고 끄기만 되는 고정 아이콘이 인쇄돼 있다. 글자는 게임 대화 상자에 한 프레임 두 글자씩, 끝나면 ▶.
// 장면은 게임기식으로 넘어간다: 팔레트가 가장 진한 농도까지 내려갔다 돌아온다.
// 한글은 점 글꼴이 없으니 만들 때 대체 글꼴을 이 화면의 실제 크기(12점)로 찍어 문턱으로 자른다 — 매끈한 글자가 아니라 진짜 LCD 점.
import type { FlatScene, Genre, GenreWork } from "./types";
import * as K from "./kit";

// ---------- 5×7 점 글꼴(직접 그림) ----------
const FONT: Record<string, string> = {
  A: "01110 10001 10001 11111 10001 10001 10001", B: "11110 10001 10001 11110 10001 10001 11110", C: "01110 10001 10000 10000 10000 10001 01110",
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
  g: "01111 10001 10001 10001 01111 00001 01110", h: "10000 10000 10110 11001 10001 10001 10001", i: "00100 00000 01100 00100 00100 00100 01110",
  j: "00010 00000 00110 00010 00010 00010 10010 01100", k: "10000 10000 10010 10100 11000 10100 10010", l: "01100 00100 00100 00100 00100 00100 01110",
  m: "00000 00000 11010 10101 10101 10001 10001", n: "00000 00000 10110 11001 10001 10001 10001", o: "00000 00000 01110 10001 10001 10001 01110",
  p: "11110 10001 10001 10001 11110 10000 10000", q: "01111 10001 10001 10001 01111 00001 00001", r: "00000 00000 10110 11001 10000 10000 10000",
  s: "00000 00000 01110 10000 01110 00001 11110", t: "01000 01000 11100 01000 01000 01001 00110", u: "00000 00000 10001 10001 10001 10011 01101",
  v: "00000 00000 10001 10001 10001 01010 00100", w: "00000 00000 10001 10001 10101 10101 01010", x: "00000 00000 10001 01010 00100 01010 10001",
  y: "10001 10001 10001 10001 01111 00001 01110", z: "00000 00000 11111 00010 00100 01000 11111",
  0: "01110 10001 10011 10101 11001 10001 01110", 1: "00100 01100 00100 00100 00100 00100 01110", 2: "01110 10001 00001 00010 00100 01000 11111",
  3: "11111 00010 00100 00010 00001 10001 01110", 4: "00010 00110 01010 10010 11111 00010 00010", 5: "11111 10000 11110 00001 00001 10001 01110",
  6: "00110 01000 10000 11110 10001 10001 01110", 7: "11111 00001 00010 00100 01000 01000 01000", 8: "01110 10001 10001 01110 10001 10001 01110",
  9: "01110 10001 10001 01111 00001 00010 01100",
  ".": "00000 00000 00000 00000 00000 01100 01100", ",": "00000 00000 00000 00000 01100 00100 01000", ":": "00000 01100 01100 00000 01100 01100 00000",
  ";": "00000 01100 01100 00000 01100 00100 01000", "!": "00100 00100 00100 00100 00100 00000 00100", "?": "01110 10001 00001 00010 00100 00000 00100",
  "'": "01100 00100 01000 00000 00000 00000 00000", '"': "01010 01010 01010 00000 00000 00000 00000", "-": "00000 00000 00000 11111 00000 00000 00000",
  "/": "00000 00001 00010 00100 01000 10000 00000", "%": "11000 11001 00010 00100 01000 10011 00011", $: "00100 01111 10100 01110 00101 11110 00100",
  "&": "01100 10010 10100 01000 10101 10010 01101", "(": "00010 00100 01000 01000 01000 00100 00010", ")": "01000 00100 00010 00010 00010 00100 01000",
  "+": "00000 00100 00100 11111 00100 00100 00000", "°": "01100 10010 10010 01100 00000 00000 00000", "→": "00000 00100 00010 11111 00010 00100 00000",
  "✓": "00000 00001 00001 00010 10100 01000 00000", "·": "00000 00000 00000 01100 01100 00000 00000", "#": "01010 01010 11111 01010 11111 01010 01010",
  "@": "01110 10001 10111 10101 10111 10000 01110", ">": "01000 00100 00010 00001 00010 00100 01000", "<": "00010 00100 01000 10000 01000 00100 00010",
  "=": "00000 00000 11111 00000 11111 00000 00000", _: "00000 00000 00000 00000 00000 00000 11111", "▶": "10000 11000 11100 11110 11100 11000 10000",
};
type Glyph = { rows: number[]; w: number; adv: number; dy: number; tall: boolean };
const GL: Record<string, Glyph> = {};
// 아래로 내려가는 글자는 두 줄 낮게 앉는다(이들의 칸은 5×9)
const DROP: Record<string, number> = { g: 2, p: 2, q: 2, y: 2 };
for (const k in FONT) GL[k] = { rows: FONT[k].split(" ").map((r) => parseInt(r, 2)), w: 5, adv: 6, dy: DROP[k] || 0, tall: false };
const clean = (s: string) => String(s).replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

const isWide = (c: string) => {
  const n = c.codePointAt(0) || 0;
  return (n >= 0x1100 && n <= 0x115f) || (n >= 0x2e80 && n <= 0xa4cf) || (n >= 0xac00 && n <= 0xd7a3) || (n >= 0xf900 && n <= 0xfaff) || (n >= 0xff00 && n <= 0xff60) || (n >= 0xffe0 && n <= 0xffe6) || n >= 0x1f300;
};

// 정직 표시 등 화면 속 낱말 — 영상의 언어로.
const WORDS = {
  en: { sample: "SAMPLE", used: "USED", kept: "KEPT", src: "src " },
  ko: { sample: "예시", used: "사용", kept: "남음", src: "출처 " },
};

const PW = 160, PH = 144;
type Sprite = string[];

// ---------- 점 화면과 그리기 동사 ----------
type Buf = {
  b: Uint8Array;
  shake(dx: number, dy: number): void;
  clear(s?: number): void;
  px(x: number, y: number, s: number): void;
  rect(x: number, y: number, w: number, h: number, s: number): void;
  box(x: number, y: number, w: number, h: number, s: number): void;
  dots(x: number, y: number, w: number, s: number, gap?: number): void;
  dither(x: number, y: number, w: number, h: number, s: number, d: number): void;
  text(str: string, x: number, y: number, s: number, sc?: number, max?: number): number;
  sprite(rows: Sprite, x: number, y: number): void;
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function makeBuf(glyph: (ch: string) => Glyph | null): Buf {
  const b = new Uint8Array(PW * PH);
  let ox = 0, oy = 0;
  const B: Buf = {
    b,
    shake(dx, dy) { ox = dx; oy = dy; },
    clear(s = 0) { b.fill(s); },
    px(x, y, s) { x = (x + ox) | 0; y = (y + oy) | 0; if (x >= 0 && y >= 0 && x < PW && y < PH) b[y * PW + x] = s; },
    rect(x, y, w, h, s) {
      const x0 = Math.max(0, (x + ox) | 0), y0 = Math.max(0, (y + oy) | 0), x1 = Math.min(PW, (x + ox + w) | 0), y1 = Math.min(PH, (y + oy + h) | 0);
      for (let j = y0; j < y1; j++) b.fill(s, j * PW + x0, j * PW + Math.max(x0, x1));
    },
    box(x, y, w, h, s) { for (let i = 0; i < w; i++) { B.px(x + i, y, s); B.px(x + i, y + h - 1, s); } for (let j = 0; j < h; j++) { B.px(x, y + j, s); B.px(x + w - 1, y + j, s); } },
    dots(x, y, w, s, gap = 2) { for (let i = 0; i < w; i += gap) B.px(x + i, y, s); },
    dither(x, y, w, h, s, d) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const th = BAYER[((j + y) & 3) * 4 + ((i + x) & 3)] / 16; if (d > th) B.px(x + i, y + j, s); } },
    text(str, x, y, s, sc = 1, max = 999) {
      let cx = x;
      for (const ch of Array.from(clean(str)).slice(0, max)) {
        const g = glyph(ch);
        if (g) {
          for (let r = 0; r < g.rows.length; r++) for (let c = 0; c < g.w; c++) if (g.rows[r] & (1 << (g.w - 1 - c))) {
            if (sc === 1) B.px(cx + c, y + r + g.dy, s); else B.rect(cx + c * sc, y + (r + g.dy) * sc, sc, sc, s);
          }
          cx += g.adv * sc;
        } else cx += 6 * sc;
      }
      return cx;
    },
    sprite(rows, x, y) {
      rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const ch = row[i]; if (ch === ".") continue; B.px(x + i, y + j, +ch); } });
    },
  };
  return B;
}

// ---------- 그림 조각('.' = 빈칸, 숫자 = 농도) ----------
const SPR: Record<string, Sprite> = {
  mac: ["3333333333333333", "3222222222222223", "3211111111111123", "3211111111111123", "3211111111111123", "3211111111111123", "3211111111111123", "3211111111111123", "3222222222222223", "3333333333333333", "......3333......", "....33333333....", "..333333333333.."],
  phone: [".33333333.", "3222222223", "3211111123", "3211111123", "3211111123", "3211111123", "3211111123", "3211111123", "3211111123", "3211111123", "3222222223", "3222332223", ".33333333."],
  lock: ["...3333...", "..3....3..", "..3....3..", "..3....3..", "3333333333", "3222222223", "3222332223", "3222332223", "3222222223", "3333333333"],
  env: ["33333333333", "32222222223", "33222222233", "32322222323", "32233333223", "32222222223", "33333333333"],
  walk1: ["..3333..", "..3223..", "..3333..", "...33...", ".333333.", "3.3333.3", "..3333..", "..3..3..", ".33..3..", ".3...33."],
  walk2: ["..3333..", "..3223..", "..3333..", "...33...", ".333333.", "3.3333.3", "..3333..", "..3..3..", "..3.33..", "..33.3.."],
  sensor: ["33333", "31113", "31313", "31113", "33333"],
  coin: ["..3333..", ".322223.", "32233223", "32322223", "32233223", "32222323", ".322223.", "..3333.."],
  shower: ["33333333....", "......33....", "......33....", "....333333..", "...32222223.", "...33333333."],
  cloud: ["....3333....", "..33222233..", ".3222222223.", "322222222223", "333333333333"],
  chip: [".3.3.3.3.", "333333333", ".3222223.", "33211123.", ".3211123.", "33222223.", "333333333", ".3.3.3.3."],
  house: [".....33.....", "...332233...", ".3322222233.", "322222222223", ".3222222223.", ".3222332223.", ".3222332223.", ".3333333333."],
};

// ---------- 유리에 인쇄된 아이콘(벡터, 켜짐/꺼짐) ----------
type G2 = CanvasRenderingContext2D;
const ICON: Record<string, (g: G2) => void> = {
  terminal: (g) => { g.strokeRect(3, 6, 30, 24); g.beginPath(); g.moveTo(9, 13); g.lineTo(14, 18); g.lineTo(9, 23); g.moveTo(17, 24); g.lineTo(26, 24); g.stroke(); },
  coin: (g) => { g.beginPath(); g.arc(18, 18, 13, 0, 7); g.stroke(); g.beginPath(); g.moveTo(18, 9); g.lineTo(18, 27); g.moveTo(23, 13); g.lineTo(14, 13); g.lineTo(14, 18); g.lineTo(22, 18); g.lineTo(22, 23); g.lineTo(13, 23); g.stroke(); },
  chart: (g) => { g.fillRect(5, 20, 6, 11); g.fillRect(15, 12, 6, 19); g.fillRect(25, 6, 6, 25); },
  trash: (g) => { g.strokeRect(9, 11, 18, 20); g.beginPath(); g.moveTo(5, 9); g.lineTo(31, 9); g.moveTo(14, 9); g.lineTo(14, 5); g.lineTo(22, 5); g.lineTo(22, 9); g.moveTo(15, 15); g.lineTo(15, 27); g.moveTo(21, 15); g.lineTo(21, 27); g.stroke(); },
  chat: (g) => { g.beginPath(); g.moveTo(4, 6); g.lineTo(32, 6); g.lineTo(32, 24); g.lineTo(15, 24); g.lineTo(8, 31); g.lineTo(9, 24); g.lineTo(4, 24); g.closePath(); g.stroke(); },
  check: (g) => { g.beginPath(); g.moveTo(5, 18); g.lineTo(14, 27); g.lineTo(31, 8); g.stroke(); },
  mac: (g) => { g.strokeRect(4, 5, 28, 19); g.beginPath(); g.moveTo(18, 24); g.lineTo(18, 29); g.moveTo(10, 31); g.lineTo(26, 31); g.stroke(); },
  lock: (g) => { g.strokeRect(7, 16, 22, 15); g.beginPath(); g.moveTo(11, 16); g.lineTo(11, 10); g.arc(18, 10, 7, Math.PI, 0); g.lineTo(25, 16); g.stroke(); },
  phone: (g) => { g.strokeRect(10, 3, 16, 30); g.beginPath(); g.moveTo(15, 28); g.lineTo(21, 28); g.stroke(); },
  bell: (g) => { g.beginPath(); g.moveTo(7, 26); g.lineTo(29, 26); g.lineTo(26, 21); g.lineTo(26, 13); g.arc(18, 13, 8, 0, Math.PI, true); g.lineTo(10, 21); g.closePath(); g.stroke(); g.beginPath(); g.arc(18, 29, 3, 0, 7); g.fill(); },
  sun: (g) => { g.beginPath(); g.arc(18, 18, 6, 0, 7); g.stroke(); for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; g.beginPath(); g.moveTo(18 + Math.cos(a) * 10, 18 + Math.sin(a) * 10); g.lineTo(18 + Math.cos(a) * 15, 18 + Math.sin(a) * 15); g.stroke(); } },
  thermo: (g) => { g.beginPath(); g.moveTo(15, 22); g.lineTo(15, 7); g.arc(18, 7, 3, Math.PI, 0); g.lineTo(21, 22); g.stroke(); g.beginPath(); g.arc(18, 26, 6, 0, 7); g.fill(); },
  display: (g) => { g.strokeRect(4, 6, 28, 19); g.beginPath(); g.moveTo(6, 30); g.lineTo(30, 3); g.stroke(); },
  drop: (g) => { g.beginPath(); g.moveTo(18, 4); g.bezierCurveTo(22, 12, 28, 17, 28, 23); g.arc(18, 23, 10, 0, Math.PI); g.bezierCurveTo(8, 17, 14, 12, 18, 4); g.stroke(); },
  house: (g) => { g.beginPath(); g.moveTo(4, 17); g.lineTo(18, 5); g.lineTo(32, 17); g.moveTo(8, 14); g.lineTo(8, 31); g.lineTo(28, 31); g.lineTo(28, 14); g.stroke(); g.strokeRect(15, 21, 6, 10); },
  window: (g) => { g.strokeRect(5, 5, 26, 26); g.beginPath(); g.moveTo(18, 5); g.lineTo(18, 31); g.moveTo(5, 18); g.lineTo(31, 18); g.stroke(); },
  wifi: (g) => { for (const r of [6, 12, 18]) { g.beginPath(); g.arc(18, 30, r, Math.PI * 1.22, Math.PI * 1.78); g.stroke(); } g.beginPath(); g.arc(18, 30, 2.5, 0, 7); g.fill(); },
  cloud: (g) => { g.beginPath(); g.moveTo(9, 27); g.arc(10, 21, 6, Math.PI / 2, Math.PI * 1.5); g.arc(18, 14, 8, Math.PI, 0); g.arc(26, 21, 6, -Math.PI / 2, Math.PI / 2); g.closePath(); g.stroke(); },
};

type LookName = "rpg" | "pet" | "scroller";
type Look = { name: LookName; backlit: boolean; shades: string[]; shell: string; bezel: string; glassOn: number; rot: number; sx: number; icons: string[] };
// 각 기기가 제 방식으로 그릴 줄 아는 장면 종류 — 작품의 장면을 가장 많이 품는 기기를 고른다
const HANDLES: Record<LookName, FlatScene["kind"][]> = {
  rpg: ["hook", "story", "flow", "terminal", "stats", "ending"],
  pet: ["story", "flow", "alert", "items", "ending"],
  scroller: ["hook", "items", "flow", "alert", "stats", "ending"],
};
function pickLook(work: GenreWork, seed: number): LookName {
  const order: LookName[] = ["rpg", "pet", "scroller"];
  const rot = order.slice(seed % 3).concat(order.slice(0, seed % 3));
  let best = rot[0], bs = -1;
  for (const n of rot) { const s = work.scenes.filter((x) => HANDLES[n].includes(x.kind)).length; if (s > bs) { bs = s; best = n; } }
  return best;
}
function lookFor(name: LookName, work: GenreWork): Look {
  // 네 농도는 앱의 색상(없으면 이 틀의 색)으로 만든다
  const ramp = (h: number, ls: number[], cs: number[], hs = [0, 0, 0, 0]) => ls.map((L, i) => K.fromOklch(L, cs[i], h + hs[i]));
  if (name === "pet") {
    const h = work.accent ? K.oklch(work.accent)[2] : 60;
    return { name, backlit: true, shades: ramp(h, [0.2, 0.42, 0.66, 0.88], [0.035, 0.09, 0.15, 0.12], [-18, -8, 0, 8]), shell: "#d4d6d9", bezel: "#34363b", glassOn: 0.9, rot: -0.026, sx: 905, icons: ["mac", "lock", "phone", "bell", "sun", "thermo", "display", "check"] };
  }
  if (name === "scroller") {
    return { name, backlit: false, shades: ramp(250, [0.9, 0.7, 0.47, 0.25], [0.02, 0.035, 0.05, 0.05]), shell: work.accent ? K.mix(work.accent, "#7a3f00", 0.12) : "#d9761a", bezel: "#2a2c30", glassOn: 0.92, rot: 0.018, sx: 850, icons: ["drop", "thermo", "house", "window", "wifi", "cloud", "phone", "bell"] };
  }
  return { name, backlit: false, shades: ramp(122, [0.86, 0.66, 0.45, 0.24], [0.06, 0.07, 0.06, 0.045], [6, 2, -6, -12]), shell: "#2b2c30", bezel: "#17181b", glassOn: 0.9, rot: 0, sx: 800, icons: ["terminal", "coin", "chart", "trash", "chat", "check"] };
}

const sceneText = (sc: FlatScene): string => {
  switch (sc.kind) {
    case "hook": return [sc.label, sc.value, sc.line].join(". ");
    case "story": return [sc.line, sc.line2].join(". ");
    case "items": return [...sc.items.map((i) => i.value + " " + i.label), sc.line].join(". ");
    case "flow": return [...sc.nodes, sc.line].join(". ");
    case "terminal": return [sc.command, ...sc.output, sc.line].join(". ");
    case "alert": return [sc.title, sc.body, sc.line, sc.line2].join(". ");
    case "stats": return [...sc.stats.map((s) => s.value + s.unit + " " + s.label), sc.line].join(". ");
    case "ending": return [sc.name, sc.line, sc.line2].join(". ");
  }
};
const allText = (work: GenreWork) => work.title + " " + work.scenes.map(sceneText).join(" ");

type Scene = { sc: FlatScene; len: number; at: number; draw: (B: Buf, u: number) => void; lit: string[] };

export const lcd: Genre = {
  id: "lcd",
  name: "Handheld LCD",
  ko: "휴대용 LCD",
  koIdea: "160×144 네 가지 농도 화면 안에서 작품이 작은 게임처럼 돌아간다",
  enIdea: "The work plays like a tiny game on a 160×144, four-shade handheld screen",
  family: "A",
  fonts: ["chakraPetch", "pixelKo"],
  make(work, { seed, fonts }) {
    const look = pickLook(work, seed);
    const LK = lookFor(look, work);
    const WD = WORDS[work.locale];
    const W = K.W, H = K.H;
    const FAM = fonts.chakraPetch;
    const FPS = 15;
    const rnd = (i: number, j = 0) => K.rand(seed, i, j);

    // ---------- 점 글꼴에 없는 글자(한글 등): 실제 크기 12점으로 찍어 4×4 평균 뒤 문턱으로 자른다 ----------
    const RG: Record<string, Glyph> = {};
    {
      const SS = 4, SZ = 12, TH = 0.38;
      const rc = document.createElement("canvas");
      rc.width = 16 * SS; rc.height = 16 * SS;
      const x = rc.getContext("2d", { willReadFrequently: true })!;
      const fam = fonts.pixelKo || FAM;
      x.font = `400 ${SZ * SS}px ${fam}`;
      x.textBaseline = "alphabetic";
      // 기준 글자의 윗선을 0행에 맞춘다
      const ref = x.measureText("한");
      const base = Math.round(ref.actualBoundingBoxAscent || SZ * SS * 0.85);
      const need = new Set<string>();
      for (const ch of Array.from(clean(allText(work) + Object.values(WD).join(" ")))) if (ch.trim() && !GL[ch] && !GL[ch.toUpperCase()]) need.add(ch);
      for (const ch of need) {
        const wide = isWide(ch) || x.measureText(ch).width > SZ * SS * 0.75;
        const cw = wide ? 12 : 6, gw = cw - 1;
        x.clearRect(0, 0, rc.width, rc.height);
        x.fillStyle = "#000";
        const mw = x.measureText(ch).width;
        x.fillText(ch, Math.max(0, (cw * SS - mw) / 2), base);
        const d = x.getImageData(0, 0, gw * SS, 12 * SS).data;
        const rows: number[] = [];
        for (let gy = 0; gy < 12; gy++) {
          let row = 0;
          for (let gx = 0; gx < gw; gx++) {
            let s = 0;
            for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) s += d[((gy * SS + j) * gw * SS + gx * SS + i) * 4 + 3];
            if (s / (SS * SS * 255) >= TH) row |= 1 << (gw - 1 - gx);
          }
          rows.push(row);
        }
        RG[ch] = { rows, w: gw, adv: cw, dy: -2, tall: true };
      }
    }
    const glyph = (ch: string): Glyph | null => (ch === " " ? null : GL[ch] || GL[ch.toUpperCase()] || RG[ch] || null);
    /** 글자 폭(점). */
    const tw = (s: string, sc = 1) => Array.from(clean(s)).reduce((a, ch) => a + (glyph(ch)?.adv || 6), 0) * sc - sc;
    /** 대체 글꼴로 찍은 글자가 있는 줄은 더 높다(12점). */
    const tall = (s: string) => Array.from(clean(s)).some((ch) => !!RG[ch]);
    const lead = (s: string, base: number, sc = 1) => (tall(s) ? Math.max(base, 13 * sc) : base);
    /** n칸(6점) 안에서 띄어쓰기로 줄바꿈 — 낱말이 줄보다 길면 글자로 끊는다. */
    const wrapC = (str: string, n: number) => {
      const maxW = n * 6 - 1;
      const out: string[] = [];
      let cur = "";
      for (let w of clean(str).split(/\s+/)) {
        if (!w) continue;
        if (!cur) { /* 새 줄 */ } else if (tw(cur + " " + w) <= maxW) { cur += " " + w; continue; } else { out.push(cur); cur = ""; }
        while (tw(w) > maxW) {
          const ch = Array.from(w);
          let k = ch.length - 1;
          while (k > 1 && tw(ch.slice(0, k).join("")) > maxW) k--;
          out.push(ch.slice(0, k).join(""));
          w = ch.slice(k).join("");
        }
        cur = w;
      }
      if (cur) out.push(cur);
      return out;
    };
    /** 줄 수는 그대로, 줄 길이는 고르게. */
    const wrapBal = (str: string, n: number) => {
      const base = wrapC(str, n);
      if (base.length < 2) return base;
      let best = base, score = 1e9;
      for (let m = n; m >= Math.floor(n * 0.5); m--) {
        const w = wrapC(str, m);
        if (w.length !== base.length) break;
        const ls = w.map((x) => tw(x)), sc = Math.max(...ls) - Math.min(...ls);
        if (sc < score) { score = sc; best = w; }
      }
      return best;
    };

    // 한국어 대화 상자는 줄 길이를 고르게(낱말 하나만 떨어지는 줄을 막는다)
    const wrapT = work.locale === "ko" ? wrapBal : wrapC;

    // ---------- 장면: 160×144 위에 draw(B, u), u = 장면 안 시간 ----------
    const scenes: Scene[] = [];
    const typed = (u: number, t0: number, cps = 30) => Math.max(0, Math.floor((u - t0) * cps));
    const textbox = (B: Buf, lines: string[], u: number, t0: number, o: { y?: number; h?: number; cps?: number } = {}) => {
      // 게임 대화 상자: 두 줄 테두리, 프레임마다 두 글자, 다 치면 ▶. 넘치면 쪽을 넘긴다.
      const y = o.y != null ? o.y : 104, h = o.h || 38, cps = o.cps || 30;
      if (u < t0) return;
      // 쪽 나누기: 상자 안에 들어가는 만큼
      const pages: string[][] = [];
      let pg: string[] = [], yy = 7;
      for (const ln of lines) {
        const bottom = yy + (tall(ln) ? 10 : 7);
        if (pg.length && bottom > h - 2) { pages.push(pg); pg = []; yy = 7; }
        pg.push(ln); yy += lead(ln, 10);
      }
      if (pg.length) pages.push(pg);
      let start = t0, pi = 0;
      for (; pi < pages.length - 1; pi++) {
        const n = pages[pi].join("").length;
        const end = start + n / cps + 0.6 + n / 16;
        if (u < end) break;
        start = end;
      }
      const page = pages[pi];
      B.rect(2, y, 156, h, 0); B.box(2, y, 156, h, 3); B.box(4, y + 2, 152, h - 4, 2);
      let n = typed(u, start, cps);
      const total = page.join("").length;
      let ly = y + 7;
      page.forEach((ln) => { const k = Math.max(0, Math.min(ln.length, n)); n -= ln.length; B.text(ln, 9, ly, 3, 1, k); ly += lead(ln, 10); });
      if (typed(u, start, cps) >= total && u > start) { const bob = Math.floor(u * 4) % 2; B.text("▶", 144, y + h - 11 + bob, 3); }
    };
    const wrapText = (B: Buf, str: string, x: number, y: number, n: number, s: number, u: number, t0: number, cps = 40, ld = 10) => {
      const lines = wrapC(str, n);
      let k = typed(u, t0, cps), yy = y;
      lines.forEach((ln) => { B.text(ln, x, yy, s, 1, Math.max(0, k)); k -= ln.length; yy += lead(ln, ld); });
      return yy;
    };
    const bar = (B: Buf, x: number, y: number, w: number, h: number, p: number, s = 3) => { B.box(x, y, w, h, s); B.rect(x + 2, y + 2, Math.round((w - 4) * K.clamp(p)), h - 4, s); };
    const S = (sc: FlatScene, len: number, draw: (B: Buf, u: number) => void, lit: string[] = []) => scenes.push({ sc, len, at: 0, draw, lit });

    // 지도 위 길: 장소 n곳을 주인공이 차례로 걷는다(RPG식 흐름 — 다른 기기에서도 노드가 3개가 아닐 때 쓴다)
    const mapFlow = (sc: Extract<FlatScene, { kind: "flow" }>, lit: string[], x0 = 8) => S(sc, 5.4, (B, u) => {
      B.clear(0);
      wrapText(B, sc.line, x0, 6, 24, 3, u, 0.05);
      const n = sc.nodes.length, gap = n > 1 ? Math.min(40, Math.floor(128 / (n - 1))) : 40;
      const pts = sc.nodes.map((_, i) => [14 + i * gap, i % 2 ? 66 : 82]);
      for (let i = 0; i < pts.length - 1; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[i + 1]; for (let q = 0; q <= 1; q += 0.04) B.px(Math.round(x1 + (x2 - x1) * q) + 4, Math.round(y1 + (y2 - y1) * q) + 4, 2); }
      const step = Math.min(n - 1, Math.max(0, Math.floor((u - 0.7) / 1.0)));
      pts.forEach(([x, y], i) => { B.rect(x, y, 9, 9, i <= step ? 3 : 0); B.box(x, y, 9, 9, 3); });
      const a = pts[step], b2 = pts[Math.min(step + 1, n - 1)];
      const walking = u > 0.7 && step < n - 1 && (u - 0.7) % 1.0 > 0.55;
      const wq = walking ? ((u - 0.7) % 1.0 - 0.55) / 0.45 : 0;
      const hx = Math.round(a[0] + (b2[0] - a[0]) * wq), hy = Math.round(a[1] + (b2[1] - a[1]) * wq) - 12;
      B.sprite(Math.floor(u * 8) % 2 && walking ? SPR.walk2 : SPR.walk1, hx, hy);
      textbox(B, wrapT(`${step + 1}. ${sc.nodes[step]}`, 23), u - 0.7 - step * 1.0, 0.05, { cps: 40 });
    }, lit);

    if (look === "rpg") buildRPG(); else if (look === "pet") buildPet(); else buildScroller();

    // ----- RPG 상태 화면 게임 -----
    function buildRPG() {
      for (const sc of work.scenes) {
        if (sc.kind === "hook") S(sc, 4.6, (B, u) => {
          B.clear(0);
          wrapText(B, sc.label, 8, 8, 24, 2, u, -1, 999);
          // 값이 떨어져 내려와 한 번 튕기고 앉는다
          const d = Math.min(1, Math.max(0, (u + 0.4) / 0.25));
          const yy = Math.round(-30 + d * 62) + (u > -0.15 && u < 0.05 ? 2 : 0);
          B.sprite(SPR.coin, 8, yy + 9);
          B.text(sc.value, 22, yy, 3, 4);
          B.dots(8, 66, 144, 1, 2);
          textbox(B, wrapT(sc.line, 23), u, 0.25);
        }, ["coin"]);
        else if (sc.kind === "story") S(sc, 5.0, (B, u) => {
          B.clear(0);
          const yb = wrapText(B, sc.line, 8, 8, 24, 3, u, 0.05);
          const y1 = Math.max(38, yb + 2);
          B.text(WD.used, 8, y1 + 2, 2); bar(B, 40, y1, 112, 10, (u - 0.6) / 0.9);
          B.text(WD.kept, 8, y1 + 20, 2); bar(B, 40, y1 + 18, 112, 10, 0.02);
          if (u > 1.6) B.text("0", 146, y1 + 32, 3);
          textbox(B, wrapT(sc.line2, 23), u, 1.9);
        }, ["chat", "trash"]);
        else if (sc.kind === "flow") mapFlow(sc, ["terminal", "chart"]);
        else if (sc.kind === "terminal") S(sc, 6.0, (B, u) => {
          B.clear(0);
          const cmd = wrapC("> " + sc.command, 25);
          let n = typed(u, 0.1, 24), y = 4;
          cmd.forEach((ln) => { B.text(ln, 4, y, 3, 1, Math.max(0, n)); n -= ln.length; y += lead(ln, 9); });
          const t1 = 0.1 + sc.command.length / 24 + 0.2;
          y += 5;
          sc.output.forEach((o, i) => {
            if (u < t1 + [0, 0.18, 0.43, 0.6, 0.82, 0.97, 1.1][Math.min(i, 6)]) return;
            const kx = o.lastIndexOf(":");
            const lab = kx > 0 ? o.slice(0, kx) : o, val = kx > 0 ? o.slice(kx + 1).trim() : "";
            const hot = /surviv|\(\d+%\)/i.test(o);
            const labL = tw(lab) + tw(val) + 7 <= 25 * 6 - 1 ? [clean(lab)] : wrapC(lab, 25 - Math.ceil((tw(val) + 1) / 6) - 1);
            const lh = labL.map((l) => lead(l + val, 9));
            const rowsH = lh.reduce((a, b) => a + b, 0);
            if (hot) B.rect(0, y - 2, 160, rowsH + 2, 3);
            let yy = y;
            labL.forEach((ln, j) => { B.text(ln, 4, yy, hot ? 0 : 2); if (j < labL.length - 1) yy += lh[j]; });
            if (val) B.text(val, 157 - tw(val), yy, hot ? 0 : 3);
            y += rowsH + 1;
          });
          textbox(B, wrapT(sc.line, 23), u, t1 + 1.6, { y: 107, h: 36 });
        }, ["terminal"]);
        else if (sc.kind === "stats") S(sc, 5.6, (B, u) => {
          B.clear(0);
          // 계기 셋이 차례로 선다
          sc.stats.forEach((st, i) => {
            const t0 = 0.15 + i * [0, 0.7, 1.15][Math.min(i, 2)];
            if (u < t0) return;
            const y = 6 + i * 31;
            B.text(st.label, 8, y, 2);
            const p = K.clamp((u - t0) / 0.4);
            bar(B, 8, y + 11, 96, 9, ((parseFloat(st.value) || 0) / 100) * p);
            B.text(st.value + st.unit, 152 - tw(st.value + st.unit, 2), y + 9, 3, 2);
          });
          textbox(B, wrapT(sc.line, 23), u, 2.0, { y: 104 });
        }, ["chart", "check", "trash"]);
        else if (sc.kind === "ending") S(sc, 4.8, (B, u) => {
          B.clear(0);
          B.box(4, 6, 152, 40, 3); B.box(6, 8, 148, 36, 2);
          B.text(sc.name, 14, 19, 3, tw(sc.name, 2) <= 136 ? 2 : 1, typed(u, 0.1, 22));
          const yb = wrapText(B, sc.line, 8, 56, 24, 3, u, 0.8);
          wrapText(B, sc.line2, 8, Math.max(84, yb + 4), 24, 2, u, 1.8);
        }, ["check"]);
        else generic(sc);
      }
    }

    // ----- 늘 켜 둔 작은 감시 화면(백라이트) -----
    function buildPet() {
      const mac = (B: Buf, x: number, y: number, u: number, busy = true) => {
        B.sprite(SPR.mac, x, y);
        if (busy) for (let r = 0; r < 4; r++) { const w = 3 + Math.floor(rnd(Math.floor(u * FPS) + r, 3) * 8); B.rect(x + 3, y + 3 + r * 2, w, 1, 3); }
      };
      // 흐름의 첫 노드가 시간(5시간·5-hour…)이면 "창이 끝나고 새로 열리는" 막대 장면
      const timeOf = (s: string) => s.match(/(\d+)\s*[-\s]?\s*(hours?|hrs?|h\b|시간|minutes?|min|분)/i);
      for (const sc of work.scenes) {
        if (sc.kind === "story") S(sc, 5.2, (B, u) => {
          B.clear(0);
          wrapText(B, sc.line, 6, 5, 25, 3, u, -1, 999);
          mac(B, 22, 48, u);
          B.rect(10, 62, 52, 1, 2);
          // 주인이 화면 밖으로 걸어 나간다
          const wx = Math.round(70 + Math.max(0, u - 0.6) * 38);
          if (wx < 165) B.sprite(Math.floor(u * 8) % 2 ? SPR.walk2 : SPR.walk1, wx, 52);
          if (u > 1.9) { B.box(42, 34, 13, 12, 3); B.text("?", 46, 36, 3); B.px(46, 46, 3); }
          textbox(B, wrapT(sc.line2, 23), u, 2.0, { y: 104 });
        }, ["mac"]);
        else if (sc.kind === "flow" && timeOf(sc.nodes[0] || "")) {
          const m = timeOf(sc.nodes[0])!;
          const unit = /분|min/i.test(m[2]) ? "m" : "h";
          const lab = m[1] + unit;
          const n1 = sc.nodes[1] || "";
          const q = n1.match(/["“”'‘’「](.+?)["“”'‘’」]/);
          const ascii = n1.match(/[A-Za-z]+/g);
          const say = '"' + (q ? q[1] : ascii ? ascii[ascii.length - 1] : n1) + '"';
          S(sc, 5.4, (B, u) => {
            B.clear(0);
            const yb = wrapText(B, sc.line, 6, 5, 25, 3, u, 0.05, 50);
            // 시간 창: 차고, 끝나고, 인사 한마디, 새 창이 시작
            const y0 = Math.max(48, yb + 4);
            const p1 = K.clamp((u - 0.6) / 1.3);
            B.text(lab, 6, y0 + 2, 2);
            bar(B, 22, y0, 132, 11, p1);
            if (u > 1.9) { const sw = tw(say), bw = Math.max(40, sw + 17); B.rect(80 - bw / 2, y0 + 16, bw, 16, 3); B.text(say, 80 - sw / 2, y0 + 20, 0); B.px(70, y0 + 32, 3); B.px(71, y0 + 33, 3); }
            if (u > 2.4) { B.text(lab, 6, y0 + 40, 2); bar(B, 22, y0 + 38, 132, 11, K.clamp((u - 2.4) / 4)); }
            const msg = u < 1.9 ? sc.nodes[0] : u < 2.4 ? sc.nodes[1] : sc.nodes[2] || sc.nodes[1];
            B.rect(0, 130, 160, 14, 2); B.text(msg, 6, 134, 0);
          }, ["sun"]);
        } else if (sc.kind === "flow" && sc.nodes.length === 3) {
          // 끝 문장: 줄표 뒤가 있으면 그것, 없으면 마지막 몇 낱말(한국어는 서술어가 끝에 온다)
          const dash = sc.line.split(/\s[—–-]\s|:\s/);
          const words = sc.line.split(/\s+/);
          let tail = dash.length > 1 ? dash[dash.length - 1] : words.slice(-Math.min(3, Math.ceil(words.length / 2))).join(" ");
          tail = tail.charAt(0).toUpperCase() + tail.slice(1);
          if (!/[.!?。]$/.test(tail)) tail += ".";
          const tailLines = wrapBal(tail, 23);
          S(sc, 5.2, (B, u) => {
            B.clear(0);
            wrapText(B, sc.line, 6, 5, 25, 3, u, 0.05);
            mac(B, 6, 54, u);
            B.sprite(SPR.lock, 74, 57);
            B.sprite(SPR.phone, 140, 54);
            // 봉한 편지가 건너간다: 그냥 → 잠김 → 도착
            const q = K.clamp((u - 1.0) / 2.0);
            const ex = Math.round(22 + q * 112);
            if (q > 0 && q < 1) { B.sprite(SPR.env, ex, 46); if (q > 0.45) B.rect(ex + 4, 49, 3, 3, 3); }
            const names = sc.nodes;
            B.text(names[0], 6, 74, 2); B.text(names[1], 79 - tw(names[1]) / 2, 84, q > 0.45 ? 3 : 2); B.text(names[2], 154 - tw(names[2]), 74, q >= 1 ? 3 : 2);
            if (q >= 1) textbox(B, tailLines, u, 3.1, { y: 104 });
          }, ["mac", "lock", "phone"]);
        } else if (sc.kind === "flow") mapFlow(sc, ["sun"], 6);
        else if (sc.kind === "alert") S(sc, 5.4, (B, u) => {
          B.clear(0);
          const ring = u > 0.3 && u < 1.6;
          const sx = ring ? (Math.floor(u * FPS) % 2 ? 1 : -1) : 0;
          B.sprite(SPR.phone, 12 + sx, 30);
          if (ring) { B.text("!", 26, 18, 3); for (const r of [3, 6]) { B.px(24 + r, 40 - r, 2); B.px(24 + r, 48 + r, 2); } }
          // 알림 카드
          const tl = wrapC(sc.title, 19), bl = wrapC(sc.body, 19);
          const tH = tl.reduce((a, l) => a + lead(l, 10), 0), bH = bl.reduce((a, l) => a + lead(l, 10), 0);
          B.rect(34, 24, 122, 8 + tH + bH, 3);
          let nt = typed(u, 0.4, 30), yy = 28;
          tl.forEach((ln) => { B.text(ln, 40, yy, 0, 1, Math.max(0, nt)); nt -= ln.length; yy += lead(ln, 10) + (tl.length === 1 ? 2 : 0); });
          let nb = typed(u, 0.8, 30);
          bl.forEach((ln) => { B.text(ln, 40, yy, 1, 1, Math.max(0, nb)); nb -= ln.length; yy += lead(ln, 10); });
          textbox(B, [...wrapT(sc.line, 23), ...wrapT(sc.line2, 23)], u, 1.5, { y: 98, h: 44, cps: 34 });
        }, ["bell", "phone"]);
        else if (sc.kind === "items") S(sc, 5.6, (B, u) => {
          B.clear(0);
          const yb = wrapText(B, sc.line, 6, 4, 25, 3, u, 0.05, 50);
          const top = Math.max(40, yb + 6);
          const pitch = Math.min(19, Math.floor((140 - top) / Math.max(1, sc.items.length)));
          const cur = Math.min(sc.items.length - 1, Math.max(0, Math.floor((u - 1.0) / 0.55)));
          sc.items.forEach((it, i) => {
            if (u < 0.6 + [0, 0.13, 0.22, 0.28, 0.33, 0.37][Math.min(i, 5)]) return;
            const y = top + i * pitch;
            if (i === cur) B.rect(2, y - 3, 156, 13 + (tall(it.label) ? 2 : 0), 2);
            B.text(i === cur ? "▶" : " ", 5, y, 3);
            B.text(it.label, 14, y, i === cur ? 3 : 2);
            B.text(it.value, 155 - tw(it.value), y, 3);
          });
        }, ["thermo", "display", "check", "sun"]);
        else if (sc.kind === "ending") S(sc, 4.8, (B, u) => {
          B.clear(0);
          mac(B, 8, 8, u, false);
          B.sprite(SPR.phone, 30, 8);
          B.text(sc.name, 6, 30, 3, tw(sc.name, 2) <= 148 ? 2 : 1, typed(u, 0.1, 20));
          const yb = wrapText(B, sc.line, 6, 62, 25, 3, u, 0.8);
          wrapText(B, sc.line2, 6, Math.max(94, yb + 6), 25, 2, u, 1.8);
        }, ["check"]);
        else generic(sc);
      }
    }

    // ----- 집 안을 옆으로 지나가는 게임 -----
    function buildScroller() {
      const tiles = (B: Buf, x0: number, y0: number, w: number, h: number, s: number) => { for (let y = y0; y < y0 + h; y += 6) B.dots(x0, y, w, s, 1); for (let x = x0; x < x0 + w; x += 6) for (let y = y0; y < y0 + h; y++) B.px(x, y, s); };
      for (const sc of work.scenes) {
        if (sc.kind === "hook") S(sc, 4.4, (B, u) => {
          B.clear(0);
          tiles(B, 0, 0, 160, 100, 1);
          B.rect(0, 100, 160, 44, 1);
          B.sprite(SPR.shower, 120, 6);
          // 물방울은 15fps로 떨어진다
          for (let i = 0; i < 9; i++) { const x = 124 + (i % 3) * 3 + (i > 4 ? 2 : 0), y = 14 + ((Math.floor(u * FPS) * 3 + i * 11) % 80); B.px(x, y, 2); B.px(x, y + 1, 2); }
          B.sprite(SPR.sensor, 104, 52);
          const lt = tall(sc.label);
          B.rect(6, lt ? 4 : 6, Math.max(100, tw(sc.label) + 6), lt ? 15 : 12, 0); B.text(sc.label, 9, 9, 3);
          B.rect(6, 22, 104, 34, 0); B.text(sc.value, 10, 25, 3, 4);
          textbox(B, wrapT(sc.line, 23), u, 0.2, { y: 104 });
        }, ["drop", "house"]);
        else if (sc.kind === "items") {
          const head = wrapC(sc.line, 25).slice(0, 2);
          const headH = head.reduce((a, l) => a + lead(l, 9), 0);
          const barH = Math.max(22, 4 + headH);
          const top = barH + 2;
          S(sc, 6.0, (B, u) => {
            B.clear(0);
            // 방이 나란히 다섯; 카메라는 방에 머물다 다음 방으로 미끄러진다(초당 15번, 정수 점 단위)
            const RW = 120, n = sc.items.length;
            const per = 1.0, mv = 0.2;
            const z = Math.max(0, u - 0.7), sg = Math.floor(z / per), fz = K.clamp((z - sg * per) / mv);
            const stop = (i: number) => Math.min(RW * n - 160, Math.max(0, i * RW - 20));
            const cam = Math.round(sg >= n - 1 ? stop(n - 1) : stop(sg) + (stop(sg + 1) - stop(sg)) * fz);
            const ground = 112;
            sc.items.forEach((it, i) => {
              const x = i * RW - cam;
              if (x > 160 || x + RW < 0) return;
              B.rect(x, top, RW, ground - top, i % 2 ? 0 : 1);
              B.box(x, top, RW, ground - top, 3);
              B.sprite(SPR.sensor, x + 12, top + 26);
              B.text(it.label, x + 12, top + 8, 3);
              B.text(it.value, x + 12, top + 38, 3, 2);
              if (it.alarm) for (let d = 0; d < 6; d++) { const yy = top + 48 + ((Math.floor(u * FPS) * 2 + d * 9) % 34); B.px(x + 70 + d * 7, yy, 2); B.px(x + 70 + d * 7, yy + 1, 2); }
              if (i === n - 1) B.sprite(SPR.cloud, x + 70, top + 50);
            });
            B.rect(0, ground, 160, 32, 3);
            const moving = fz > 0 && fz < 1 && sg < n - 1;
            B.sprite(moving && Math.floor(u * 8) % 2 ? SPR.walk2 : SPR.walk1, 40, ground - 10);
            B.rect(0, 0, 160, barH, 3);
            { let nn = typed(u, 0.05, 40), yy = 3 + (tall(head[0] || "") ? 2 : 0); head.forEach((ln) => { B.text(ln, 4, yy, 0, 1, Math.max(0, nn)); nn -= ln.length; yy += lead(ln, 9); }); }
            if (sc.data === "sample") B.text(WD.sample, 155 - tw(WD.sample), 122, 0);
          }, ["house", "drop", "thermo"]);
        } else if (sc.kind === "flow") S(sc, 5.0, (B, u) => {
          B.clear(0);
          wrapText(B, sc.line, 6, 5, 25, 3, u, 0.05);
          const spr = [SPR.sensor, SPR.chip, SPR.cloud, SPR.phone];
          const n = sc.nodes.length, gap = n > 1 ? Math.min(40, Math.floor(120 / (n - 1))) : 40;
          const xs = sc.nodes.map((_, i) => 8 + i * gap);
          const step = Math.min(n - 1, Math.max(0, Math.floor((u - 0.7) / 0.8)));
          const alt = sc.nodes.some(tall) ? 13 : 10;
          sc.nodes.forEach((nd, i) => {
            const s2 = spr[i % 4];
            B.sprite(s2, xs[i] + 6, 60 - s2.length);
            const tx = Math.max(1, Math.min(160 - tw(nd), xs[i] + 10 - Math.min(10, tw(nd) / 2 - 6)));
            B.text(nd, tx, i % 2 ? 66 + alt : 66, i <= step ? 3 : 1);
            if (i < n - 1) B.text("→", xs[i] + 28, 54, 2);
          });
          // 주인공이 상자에서 상자로 뛴다(짧은 포물선, 끊어서)
          const q = K.clamp(((u - 0.7) % 0.8) / 0.35);
          const hop = step < n - 1 && u > 0.7 ? q : 0;
          const hx = Math.round(xs[step] + 8 + hop * gap), hy = Math.round(88 - Math.sin(hop * Math.PI) * 12) + (alt - 10);
          B.rect(0, 98 + (alt - 10), 160, 2, 3);
          B.sprite(SPR.walk1, hx, hy);
        }, ["wifi", "cloud", "phone"]);
        else if (sc.kind === "alert") S(sc, 5.4, (B, u) => {
          B.clear(0);
          const sh = u > 0.5 && u < 0.8 ? (Math.floor(u * FPS) % 2 ? 2 : -2) : 0;
          B.shake(sh, 0);
          // 창문 하나, 크게; 유리에 김이 서린다(규칙 디더, 시간이 갈수록 촘촘히)
          B.rect(4, 22, 26, 70, 1); B.box(4, 22, 26, 70, 3); B.box(5, 23, 24, 68, 3);
          B.rect(16, 23, 2, 68, 3); B.rect(5, 56, 24, 2, 3);
          B.dither(6, 24, 22, 66, 2, K.clamp((u - 0.2) / 2.4) * 0.85);
          for (let d = 0; d < 4; d++) { const yy = 60 + ((Math.floor(u * FPS) + d * 7) % 28); if (u > 1.4) B.px(8 + d * 5, yy, 3); }
          const tl = wrapC(sc.title, 19), bl = wrapC(sc.body, 19);
          const all = [...tl, ...bl];
          B.rect(34, 24, 122, 8 + all.reduce((a, l) => a + lead(l, 10), 0), 3);
          let nt = typed(u, 0.4, 30), yy = 28 + (tall(tl[0] || "") ? 2 : 0);
          tl.forEach((ln) => { B.text(ln, 38, yy, 0, 1, Math.max(0, nt)); nt -= ln.length; yy += lead(ln, 10); });
          let nb = typed(u, 0.9, 30);
          bl.forEach((ln) => { B.text(ln, 38, yy, 1, 1, Math.max(0, nb)); nb -= ln.length; yy += lead(ln, 10); });
          B.shake(0, 0);
          textbox(B, wrapT(sc.line + " " + sc.line2, 23), u, 1.6, { y: 98, h: 44 });
        }, ["window", "bell", "drop"]);
        else if (sc.kind === "stats") S(sc, 5.4, (B, u) => {
          B.clear(0);
          const yb = wrapText(B, sc.line, 6, 6, 25, 3, u, 0.05);
          const y0 = Math.max(30, yb + 6);
          const pitch = Math.min(sc.stats.some((x) => tall(x.label + x.unit)) ? 31 : 28, Math.floor((128 - y0) / Math.max(1, sc.stats.length)));
          sc.stats.forEach((st, i) => {
            const t0 = 0.6 + i * [0, 0.55, 0.95][Math.min(i, 2)];
            if (u < t0) return;
            const flash = u - t0 < 1 / FPS;
            const y = y0 + i * pitch;
            if (flash) B.rect(2, y - 3, 156, 26, 3);
            B.text(st.label, 6, y, flash ? 0 : 2);
            B.text(st.value, 6, y + 9, flash ? 0 : 3, 2);
            B.text(st.unit, 8 + tw(st.value, 2) + 2, y + 16, flash ? 0 : 3);
          });
          if (sc.source) B.text(WD.src + sc.source, 6, 132, 2, 1, typed(u, 2.2, 40));
        }, ["bell", "cloud"]);
        else if (sc.kind === "ending") S(sc, 4.8, (B, u) => {
          B.clear(0);
          B.sprite(SPR.house, 8, 10);
          const nm = wrapC(sc.name, 11);
          let n = typed(u, 0.1, 22), yy = 8 + (tall(nm[0] || "") ? 4 : 0);
          nm.forEach((ln) => { B.text(ln, 26, yy, 3, 2, Math.max(0, n)); n -= ln.length; yy += lead(ln, 17, 2); });
          wrapText(B, sc.line + " " + sc.line2, 6, yy + 14 - (tall(nm[0] || "") ? 4 : 0), 25, 2, u, 1.2);
        }, ["house"]);
        else generic(sc);
      }
    }

    function generic(sc: FlatScene) {
      const txt = sceneText(sc);
      S(sc, 3 + txt.length / 25, (B, u) => { B.clear(0); wrapText(B, txt, 6, 6, 25, 3, u, 0.05); }, []);
    }

    // ---------- 시간 ----------
    const sum = scenes.reduce((s, x) => s + x.len, 0);
    const cap = look === "pet" ? 29 : look === "rpg" ? 28 : 26.5;
    const kk = Math.min(1, cap / sum);
    let at = -0.6; // 첫 장면은 0프레임에 이미 돌고 있다
    scenes.forEach((x) => { x.len *= kk; x.at = at; at += x.len; });
    scenes[scenes.length - 1].len += 1.0;
    const duration = at + 1.0;
    const FADE = 4 / FPS;
    const starts = scenes.map((x) => Math.max(0, x.at));

    // ---------- 팔레트 내리기(장면 넘김) ----------
    const fadeAt = (t: number) => {
      let sc = scenes[0];
      for (const x of scenes) if (t >= x.at) sc = x;
      const u = t - sc.at, i = scenes.indexOf(sc);
      let k = 0;
      if (i > 0 && u < FADE) k = 3 - Math.floor((u / FADE) * 4);
      if (i < scenes.length - 1 && sc.len - u < FADE) k = Math.floor(((FADE - (sc.len - u)) / FADE) * 4) + 1;
      return { sc, u, k: Math.max(0, Math.min(3, k)) };
    };

    // ---------- 점 버퍼 → 그림 ----------
    const Bcur = makeBuf(glyph), Bprev = makeBuf(glyph);
    const dot = document.createElement("canvas");
    dot.width = PW; dot.height = PH;
    const dg = dot.getContext("2d")!;
    const img = dg.createImageData(PW, PH);
    const shadowC = document.createElement("canvas");
    shadowC.width = PW; shadowC.height = PH;
    const sg = shadowC.getContext("2d")!;
    const simg = sg.createImageData(PW, PH);
    const pal = LK.shades.map(K.rgb);
    const fill = (B: Buf, tq: number) => {
      const { sc, u, k } = fadeAt(tq);
      B.clear(0);
      B.shake(0, 0);
      sc.draw(B, u);
      if (k) { if (LK.backlit) for (let i = 0; i < B.b.length; i++) B.b[i] = Math.max(0, B.b[i] - k); else for (let i = 0; i < B.b.length; i++) B.b[i] = Math.min(3, B.b[i] + k); }
      return sc;
    };

    // ---------- 기기(한 번 그려 둔다): 껍데기, 베젤, 유리, 인쇄 글씨 ----------
    const PITCH = 5;
    const MW = PW * PITCH, MH = PH * PITCH; // 800 × 720
    const glassPad = { l: 54, r: 54, t: 44, b: 44 };
    const GX = LK.sx - MW / 2 - glassPad.l, GY = (H - MH) / 2 - glassPad.t + 4;
    const GW = MW + glassPad.l + glassPad.r, GH = MH + glassPad.t + glassPad.b;
    const MX = GX + glassPad.l, MY = GY + glassPad.t;
    const dev = document.createElement("canvas");
    dev.width = W; dev.height = H;
    const v = dev.getContext("2d")!;
    v.fillStyle = LK.shell; v.fillRect(0, 0, W, H);
    {
      // 성형 플라스틱: 고운 씨앗 반점, 그라데이션 없음
      const im = v.getImageData(0, 0, W, H);
      const r = K.rng(seed + 5);
      for (let i = 0; i < im.data.length; i += 4) { const n = (r() - 0.5) * 7; im.data[i] += n; im.data[i + 1] += n; im.data[i + 2] += n; }
      v.putImageData(im, 0, 0);
    }
    {
      // 프레임에 잘린 조작부: 한쪽엔 십자 키, 다른 쪽엔 단추 둘
      const dark = K.mix(LK.shell, "#000000", 0.32), hi = K.mix(LK.shell, "#ffffff", 0.16), well = K.mix(LK.shell, "#000000", 0.12);
      const lw = GX - 34, rw = W - (GX + GW + 34);
      const padSide = lw >= rw ? "L" : "R";
      const cxP = padSide === "L" ? lw * 0.42 : GX + GW + 34 + rw * 0.55, cyP = H * 0.62;
      v.fillStyle = well; v.beginPath(); v.arc(cxP, cyP, 92, 0, 7); v.fill();
      v.fillStyle = dark; v.beginPath(); v.roundRect(cxP - 76, cyP - 25, 152, 50, 8); v.roundRect(cxP - 25, cyP - 76, 50, 152, 8); v.fill();
      v.fillStyle = hi; v.fillRect(cxP - 74, cyP - 25, 50, 2); v.fillRect(cxP - 23, cyP - 76, 46, 2);
      const otherW = padSide === "L" ? rw : lw;
      if (otherW > 150) {
        const bx = padSide === "L" ? GX + GW + 34 + otherW * 0.5 : otherW * 0.5;
        for (const [dx, dy] of [[34, -30], [-34, 30]]) { v.fillStyle = well; v.beginPath(); v.arc(bx + dx, H * 0.6 + dy, 44, 0, 7); v.fill(); v.fillStyle = dark; v.beginPath(); v.arc(bx + dx, H * 0.6 + dy, 34, 0, 7); v.fill(); v.fillStyle = hi; v.beginPath(); v.arc(bx + dx, H * 0.6 + dy, 34, Math.PI * 1.1, Math.PI * 1.5); v.lineWidth = 3; v.strokeStyle = hi; v.stroke(); }
        v.strokeStyle = well; v.lineWidth = 7; v.lineCap = "round";
        for (let k = 0; k < 5; k++) { const sx = bx - 40 + k * 22; v.beginPath(); v.moveTo(sx, H - 70); v.lineTo(sx + 30, H - 130); v.stroke(); }
      }
    }
    v.fillStyle = LK.bezel;
    v.beginPath(); v.roundRect(GX - 34, GY - 34, GW + 68, GH + 68, [26, 26, 70, 26]); v.fill();
    v.fillStyle = LK.shades[0]; v.fillRect(GX, GY, GW, GH);
    // 베젤 인쇄: 작품 이름(제목의 · 앞)
    v.fillStyle = "#8d9097";
    v.font = K.font(19, FAM, 600); v.textBaseline = "alphabetic";
    v.fillText(work.title.split(/ · | — | \| /)[0], GX - 10, GY + GH + 24);

    // 유리 아이콘 자리: 화면 왼쪽·오른쪽
    const iconPos = LK.icons.map((name, i) => {
      const half = Math.ceil(LK.icons.length / 2);
      const left = i < half;
      const j = left ? i : i - half;
      const n = left ? half : LK.icons.length - half;
      return { name, x: left ? GX + 9 : GX + GW - 45, y: GY + 60 + (j * (GH - 160)) / Math.max(1, n - 1) };
    });
    const segInk = LK.shades[3];
    const drawIcons = (g: G2, lit: string[], sampleOn: boolean) => {
      g.save();
      g.lineWidth = 3.4; g.lineCap = "round"; g.lineJoin = "round";
      for (const ic of iconPos) {
        const on = lit.includes(ic.name);
        g.globalAlpha = on ? LK.glassOn : 0.1;
        g.strokeStyle = segInk; g.fillStyle = segInk;
        g.save(); g.translate(ic.x, ic.y); ICON[ic.name](g); g.restore();
      }
      // 유리에 인쇄된 표시 낱말: 숫자가 예시일 때 켜진다
      g.globalAlpha = sampleOn ? LK.glassOn : 0.1;
      g.fillStyle = segInk; g.font = K.font(22, FAM, 600); g.textAlign = "right";
      g.fillText(WD.sample, GX + GW - 12, GY + 30);
      g.restore();
    };

    return {
      duration,
      starts,
      render(g, t) {
        g.drawImage(dev, 0, 0);
        const tq = K.step(t, FPS);
        const cur = fill(Bcur, tq);
        fill(Bprev, tq - 1 / FPS);
        // 느린 액정: 앞 프레임이 ~30% 남는다
        const d = img.data, sd = simg.data;
        for (let i = 0; i < PW * PH; i++) {
          const s = Bcur.b[i] * 0.7 + Bprev.b[i] * 0.3;
          const a = Math.floor(s), f = s - a, b2 = Math.min(3, a + 1);
          const ca = pal[a], cb = pal[b2];
          const o = i * 4;
          d[o] = ca[0] + (cb[0] - ca[0]) * f; d[o + 1] = ca[1] + (cb[1] - ca[1]) * f; d[o + 2] = ca[2] + (cb[2] - ca[2]) * f;
          d[o + 3] = LK.backlit ? 255 : s < 0.05 ? 0 : 255;
          sd[o] = sd[o + 1] = sd[o + 2] = 0; sd[o + 3] = LK.backlit ? 0 : Math.min(255, s * 30);
        }
        dg.putImageData(img, 0, 0);
        g.save();
        if (LK.rot) { g.translate(W / 2, H / 2); g.rotate(LK.rot); g.translate(-W / 2, -H / 2); }
        if (LK.rot) g.drawImage(dev, 0, 0);
        g.imageSmoothingEnabled = false;
        if (!LK.backlit) { sg.putImageData(simg, 0, 0); g.drawImage(shadowC, MX + 3, MY + 3, MW, MH); }
        g.drawImage(dot, MX, MY, MW, MH);
        g.imageSmoothingEnabled = true;
        // 점 사이 틈
        g.fillStyle = LK.backlit ? "rgba(0,0,0,0.35)" : K.rgba(LK.shades[0], 0.55);
        for (let x = 0; x <= PW; x++) g.fillRect(MX + x * PITCH - 0.5, MY, 1, MH);
        for (let y = 0; y <= PH; y++) g.fillRect(MX, MY + y * PITCH - 0.5, MW, 1);
        drawIcons(g, cur.lit, cur.sc.data === "sample");
        g.restore();
        const hp = K.seg(t, duration - 2.4, 2.4);
        if (hp > 0) {
          // 껍데기에 인쇄 — 화면 양옆 중 자리가 넓은 쪽
          const leftRoom = GX - 34, rightX = GX + GW + 34;
          const right = W - rightX > leftRoom;
          K.handoff(g, hp, { ink: look === "scroller" ? "#3a1d05" : look === "pet" ? "#3a3c41" : "#a9acb3", family: FAM, size: 22, x: right ? W - 28 : 28, y: H - 40, align: right ? "right" : "left", handle: work.handle });
        }
      },
    };
  },
};
