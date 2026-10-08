// 그리드닉 — 모눈 위에서 칸(모듈)을 하나씩 채워 글자를 짓고, 칸 하나를 골라 그 안으로 파고들면 다음 장면이 된다
// (필름 실험실 G13 → 2차 수정 gridnik-v2, 2026-10-08). 세계의 규칙: 20px 바탕 모눈, 글자는 모듈(온 칸 + 45° 반 칸)로만 있다,
// 글자는 읽는 순서대로 칸칸이 지어진다(24fps 계단). 전환 = 칸 고르기(안내선·모서리 표시·나머지가 물러남) → 1.7초 감속 밀고 들어가기,
// 다음 장면은 이미 그 칸 안에 살고 있다. 한글은 모노 글꼴의 한글 대체 글꼴을 12px로 1비트 래스터해 같은 모듈로 짓는다.
import type { FlatScene, Genre, GenreWork } from "./types";
import * as K from "./kit";

const W = K.W, H = K.H, U = 20;

// ---------- the modular alphabet (5×7 + 1 descender row) ----------
// '#' full module · chamfer halves: '1' top-left cut, '2' top-right cut, '3' bottom-right cut, '4' bottom-left cut.
const GL: Record<string, string[]> = {
  A: ["1###2", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####2", "#...#", "#...#", "####.", "#...#", "#...#", "####3"],
  C: ["1####", "#....", "#....", "#....", "#....", "#....", "4####"],
  D: ["####2", "#...#", "#...#", "#...#", "#...#", "#...#", "####3"],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: ["1####", "#....", "#....", "#..##", "#...#", "#...#", "4###3"],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["#", "#", "#", "#", "#", "#", "#"],
  J: ["....#", "....#", "....#", "....#", "....#", "#...#", "4###3"],
  K: ["#..13", "#.13.", "#13..", "##...", "#42..", "#.42.", "#..42"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["1###2", "#.#.#", "#.#.#", "#.#.#", "#.#.#", "#.#.#", "#.#.#"],
  N: ["#2..#", "#42.#", "#.42#", "#..4#", "#...#", "#...#", "#...#"],
  O: ["1###2", "#...#", "#...#", "#...#", "#...#", "#...#", "4###3"],
  P: ["####2", "#...#", "#...#", "####3", "#....", "#....", "#...."],
  Q: ["1###2", "#...#", "#...#", "#...#", "#.42#", "#..4#", "4###2"],
  R: ["####2", "#...#", "#...#", "####3", "#.42.", "#..42", "#...#"],
  S: ["1####", "#....", "#....", "4###2", "....#", "....#", "####3"],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", "4###3"],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", "42.13", ".4#3."],
  W: ["#.#.#", "#.#.#", "#.#.#", "#.#.#", "#.#.#", "#.#.#", "4###3"],
  X: ["#...#", "42.13", ".4#3.", "..#..", ".1#2.", "13.42", "#...#"],
  Y: ["#...#", "#...#", "#...#", "4###3", "..#..", "..#..", "..#.."],
  Z: ["#####", "...13", "..13.", ".13..", "13...", "#....", "#####"],
  0: ["1###2", "#...#", "#..1#", "#.13#", "#13.#", "#3..#", "4###3"],
  1: ["1#", ".#", ".#", ".#", ".#", ".#", ".#"],
  2: ["1###2", "....#", "....#", "1###3", "#....", "#....", "#####"],
  3: ["####2", "....#", "....#", ".###.", "....#", "....#", "####3"],
  4: ["#..#.", "#..#.", "#..#.", "#####", "...#.", "...#.", "...#."],
  5: ["#####", "#....", "#....", "####2", "....#", "....#", "####3"],
  6: ["1####", "#....", "#....", "####2", "#...#", "#...#", "4###3"],
  7: ["#####", "....#", "...13", "..13.", "..#..", "..#..", "..#.."],
  8: ["1###2", "#...#", "#...#", "#####", "#...#", "#...#", "4###3"],
  9: ["1###2", "#...#", "#...#", "4####", "....#", "....#", "####3"],
  ".": [".", ".", ".", ".", ".", ".", "#"],
  ",": [".", ".", ".", ".", ".", ".", "#", "3"],
  ":": [".", ".", "#", ".", ".", ".", "#"],
  ";": [".", ".", "#", ".", ".", ".", "#", "3"],
  "'": ["#", "#", ".", ".", ".", ".", "."],
  "’": ["#", "#", ".", ".", ".", ".", "."],
  '"': ["#.#", "#.#", "...", "...", "...", "...", "..."],
  "-": ["...", "...", "...", "###", "...", "...", "..."],
  "—": ["....", "....", "....", "####", "....", "....", "...."],
  "–": ["....", "....", "....", "####", "....", "....", "...."],
  "+": ["...", "...", ".#.", "###", ".#.", "...", "..."],
  "&": ["...", "...", ".#.", "###", ".#.", "...", "..."],
  "·": [".", ".", ".", "#", ".", ".", "."],
  "!": ["#", "#", "#", "#", "#", ".", "#"],
  "?": ["1###2", "....#", "....#", "..##3", "..#..", ".....", "..#.."],
  "%": ["##..#", "##.13", "..13.", ".13..", "13.##", "#..##", "....."],
  $: ["..#..", "1####", "#....", "4###2", "....#", "####3", "..#.."],
  "°": ["1#2", "#.#", "4#3", "...", "...", "...", "..."],
  "/": ["...1", "..13", "..#.", ".13.", ".#..", "13..", "3..."],
  "(": ["1#", "#.", "#.", "#.", "#.", "#.", "4#"],
  ")": ["#2", ".#", ".#", ".#", ".#", ".#", "#3"],
  "→": [".....", ".....", "...2.", "#####", "...3.", ".....", "....."],
  "✓": [".....", "....#", "...##", "#.##.", "###..", ".#...", "....."],
  "@": ["1###2", "#...#", "#.#.#", "#.#.#", "#.###", "#....", "4####"],
  "=": ["...", "...", "###", "...", "###", "...", "..."],
  "*": ["...", "#.#", ".#.", "#.#", "...", "...", "..."],
  "#": [".#.#.", "#####", ".#.#.", "#####", ".#.#.", ".....", "....."],
};

const SPACE = 3; // word space in modules (plus 1 letter gap each side → reads as ~4)

// 틀이 스스로 그리는 표시 — 영상의 언어로.
const LABEL = {
  en: { sample: "SAMPLE DATA", src: "SRC ", sampleAlert: "sample alert", alert: "alert" },
  ko: { sample: "예시 자료", src: "출처 ", sampleAlert: "예시 알림", alert: "알림" },
};

// ---- 한글은 두 칸 폭(읽는 시간도 더 든다) ----
const isWide = (c: string) => {
  const n = c.codePointAt(0) || 0;
  return (n >= 0x1100 && n <= 0x115f) || (n >= 0x2e80 && n <= 0xa4cf) || (n >= 0xac00 && n <= 0xd7a3) || (n >= 0xf900 && n <= 0xfaff) || (n >= 0xff00 && n <= 0xff60) || (n >= 0xffe0 && n <= 0xffe6) || n >= 0x1f300;
};
const readLen = (s: string) => Array.from(s).reduce((a, c) => a + (isWide(c) ? 1.7 : 1), 0);

/** 장면 하나를 느슨하게 읽는 모양(종류마다 칸이 다르다). */
type Loose = {
  kind: FlatScene["kind"]; label?: string; value?: string; line?: string; line2?: string; title?: string; body?: string; command?: string; name?: string;
  source?: string; data?: "sample" | "measured"; alarm?: boolean; nodes?: string[]; output?: string[];
  items?: { value: string; label: string; alarm?: boolean }[]; stats?: { value: string; unit: string; label: string }[];
};

/** cells: [x, y, module type, build order] in module units. */
type Cell = [number, number, string, number];
type TextSet = { cells: Cell[]; w: number; h: number; lines: number; lh: number };
type Glyph = { w: number; pts: [number, number, string][] };
type Style = "square" | "dot" | "round";

// ---------- module drawing ----------
function cellPath(g: CanvasRenderingContext2D, x: number, y: number, m: number, t: string, style: Style, inset: number) {
  const a = x + inset, b = y + inset, s = m - inset * 2;
  if (style === "dot") {
    let cx = a + s / 2, cy = b + s / 2, r = s * 0.5;
    if (t !== "#") {
      r = s * 0.3;
      const o = s * 0.14;
      if (t === "1") { cx += o; cy += o; } else if (t === "2") { cx -= o; cy += o; } else if (t === "3") { cx -= o; cy -= o; } else { cx += o; cy -= o; }
    }
    g.moveTo(cx + r, cy);
    g.arc(cx, cy, r, 0, Math.PI * 2);
    return;
  }
  if (t === "#") {
    if (style === "round" && s > 8) {
      const r = s * 0.22;
      g.moveTo(a + r, b); g.arcTo(a + s, b, a + s, b + s, r); g.arcTo(a + s, b + s, a, b + s, r); g.arcTo(a, b + s, a, b, r); g.arcTo(a, b, a + s, b, r);
    } else g.rect(a, b, s, s);
    return;
  }
  const x0 = a, y0 = b, x1 = a + s, y1 = b + s;
  if (t === "1") { g.moveTo(x0, y1); g.lineTo(x1, y1); g.lineTo(x1, y0); }
  else if (t === "2") { g.moveTo(x0, y0); g.lineTo(x0, y1); g.lineTo(x1, y1); }
  else if (t === "3") { g.moveTo(x0, y0); g.lineTo(x1, y0); g.lineTo(x0, y1); }
  else { g.moveTo(x0, y0); g.lineTo(x1, y0); g.lineTo(x1, y1); }
  g.closePath();
}

function sceneText(s: Loose): string {
  return [s.label, s.value, s.line, s.line2, s.title, s.body, s.command, s.name].filter(Boolean).join(" ");
}
function chars(s: Loose): number {
  let n = readLen(sceneText(s));
  if (s.items) n += readLen(s.items.map((i) => i.value + i.label).join(" ")) * 0.7;
  if (s.nodes) n += readLen(s.nodes.join(" ")) * 0.8;
  if (s.output) n += readLen(s.output.join(" ")) * 0.6;
  if (s.stats) n += readLen(s.stats.map((i) => i.value + i.unit + i.label).join(" ")) * 0.7;
  return n;
}

/** 작품의 모양에서 판을 고른다: 터미널이 있으면 모눈종이, 이야기로 여는 작품은 점판, 경고 훅은 둥근 칸. */
function pickStyle(work: GenreWork, seed: number): Style {
  const kinds = work.scenes.map((s) => s.kind);
  if (kinds.includes("terminal")) return "square";
  if (kinds[0] !== "hook") return "dot";
  if (work.scenes.some((s) => s.kind === "hook" && s.alarm)) return "round";
  return (["square", "dot", "round"] as const)[seed % 3];
}

const lum = (h: string) => K.oklch(h)[0];
// the dive: the cell is picked and lit (SETUP), then the camera pushes into it (PUSH, log-space, decelerating).
// The next shot's clock starts at OVER of the push, so its first modules are already being laid inside the cell.
const SETUP = 0.66, PUSH = 1.7, OVER = 0.3;
const pushE = K.ease.bezier(0.42, 0, 0.12, 1);

type Pal = { key: string; bg: string; ink: string; acc: string; alarm: string };
type Block = { T: TextSet; m: number; x: number; y: number; role: string; t0: number; dur: number; solid?: boolean; order: "read" | "scan" };
type Extra = { kind: "sample" | "source"; txt?: string; x: number; y: number; at: number; right: boolean };
type Dive = { x: number; y: number; m: number; block?: Block; slab?: boolean; inset: number; shape: Style; s: number; cx: number; cy: number; end: number; Fx: number; Fy: number };
type Slab = { x: number; y: number; w: number; h: number; t0: number; dur: number };
type Lay = { bl: Block[]; extra: Extra | null; v: number; zoom: Block | null; nodes?: Block[]; horizontal?: boolean; slab?: Slab; dive?: Dive; lastEnd: number };
type Shot = { s: Loose; i: number; st: Pal; next: Pal | null; nextShot: Shot | null; L: Lay; hold: number; at: number; setupAt: number; pushAt: number; pushEnd: number; end: number };

export const gridnik: Genre = {
  id: "gridnik",
  name: "Gridnik modules",
  ko: "그리드닉",
  koIdea: "모눈 위에서 칸을 하나씩 채워 글자를 짓고, 칸 하나로 파고들어 다음 장면이 되는 영화",
  enIdea: "Letters are built cell by cell on a grid; the camera picks one cell and dives into it, and the next scene lives inside",
  family: "B",
  fonts: ["martianMono"],
  make(work, { seed, fonts }) {
    const MONO = fonts.martianMono;
    const T = LABEL[work.locale];
    const mk = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };

    // ---------- glyphs: the modular alphabet, plus any other letter rasterised onto the same grid ----------
    // Hangul (and anything the alphabet lacks) is drawn once with the mono face's Korean fallback at RPX px,
    // thresholded to 1 bit — each lit pixel becomes one module, so Korean is built from the same cells.
    const RPX = 14;
    const rc = mk(64, 40).getContext("2d", { willReadFrequently: true })!;
    const rfont = K.font(RPX, MONO, 400); // regular weight: one-module strokes, so dense syllables stay open
    const BL = 26; // baseline row in the raster canvas
    const inkRows = (s: string): [number, number] => {
      rc.clearRect(0, 0, 64, 40); rc.font = rfont; rc.fillStyle = "#000"; rc.textBaseline = "alphabetic";
      let top = 99, bot = -1;
      for (const ch of Array.from(s)) {
        rc.clearRect(0, 0, 64, 40); rc.fillText(ch, 4, BL);
        const d = rc.getImageData(0, 0, 64, 40).data;
        for (let y = 0; y < 40; y++) for (let x = 0; x < 64; x++) if (d[(y * 64 + x) * 4 + 3] > 110) { top = Math.min(top, y); bot = Math.max(bot, y); }
      }
      return [top, bot];
    };
    const [rTop0, rBot] = inkRows("한글맥를봄읽좋쓸");
    const rTop = Math.min(rTop0, BL - 7);
    const KH = rBot - rTop + 1; // rows of a tall (raster) line box
    const PAD = BL - 7 - rTop; // Latin cap rows sit this far down inside a tall line box, on the same baseline
    const rCache = new Map<string, Glyph>();
    const raster = (ch: string): Glyph => {
      const hit = rCache.get(ch);
      if (hit) return hit;
      rc.clearRect(0, 0, 64, 40); rc.font = rfont; rc.fillStyle = "#000"; rc.textBaseline = "alphabetic";
      rc.fillText(ch, 4, BL);
      const adv = Math.max(3, Math.round(rc.measureText(ch).width));
      const d = rc.getImageData(0, 0, 64, 40).data;
      const pts: [number, number, string][] = [];
      for (let x = 0; x < Math.min(60, adv + 2); x++) for (let y = rTop; y <= rBot; y++) if (d[(y * 64 + x + 4) * 4 + 3] > 110) pts.push([x, y - rTop, "#"]);
      const gl: Glyph = { w: Math.max(1, adv - 1), pts };
      rCache.set(ch, gl);
      return gl;
    };
    const glCache = new Map<string, Glyph>();
    const glyph = (raw: string): Glyph => {
      const ch = raw.toUpperCase();
      const g0 = GL[ch];
      if (g0) {
        let gl = glCache.get(ch);
        if (!gl) {
          const pts: [number, number, string][] = [];
          // column-major inside a glyph: the letter is drawn stroke by stroke, left to right
          for (let cx = 0; cx < g0[0].length; cx++) for (let cy = 0; cy < g0.length; cy++) { const c = g0[cy][cx]; if (c && c !== ".") pts.push([cx, cy, c]); }
          gl = { w: g0[0].length, pts };
          glCache.set(ch, gl);
        }
        return gl;
      }
      return raster(raw);
    };
    const isTall = (str: string) => Array.from(str).some((ch) => ch.trim() && !GL[ch.toUpperCase()]);
    const wordW = (w: string) => Array.from(w).reduce((a, ch) => a + glyph(ch).w + 1, 0) - 1;
    /** lay text out in module units — wraps at maxW modules (on spaces; a word longer than a line breaks between letters). */
    function setText(str: string, maxW = 1e9, lineGap = 3): TextSet {
      const tall = isTall(str);
      const lh = tall ? KH : 7, yoff = tall ? PAD : 0;
      const words: string[] = [];
      for (const w of String(str).split(/\s+/).filter(Boolean)) {
        if (wordW(w) <= maxW) { words.push(w); continue; }
        let cur = "";
        for (const ch of Array.from(w)) { if (cur && wordW(cur + ch) > maxW) { words.push(cur); cur = ch; } else cur += ch; }
        if (cur) words.push(cur);
      }
      const lines: string[][] = [];
      let cur: string[] = [], cw = 0;
      for (const w of words) {
        const ww = wordW(w);
        const add = cur.length ? cw + SPACE + 1 + ww : ww;
        if (add > maxW && cur.length) { lines.push(cur); cur = [w]; cw = ww; } else { cur.push(w); cw = add; }
      }
      if (cur.length) lines.push(cur);
      const cells: Cell[] = [];
      let maxX = 0, ord = 0;
      lines.forEach((ln, li) => {
        let x = 0;
        const y0 = li * (lh + lineGap);
        ln.forEach((w, wi) => {
          if (wi) x += SPACE + 1;
          for (const ch of Array.from(w)) {
            const gl = glyph(ch);
            const fromGL = !!GL[ch.toUpperCase()];
            for (const [px, py, t] of gl.pts) cells.push([x + px, y0 + py + (fromGL ? yoff : 0), t, ord++]);
            x += gl.w + 1;
          }
        });
        maxX = Math.max(maxX, x - 1);
      });
      return { cells, w: maxX, h: lines.length * (lh + lineGap) - lineGap, lines: lines.length, lh };
    }

    // ---------- three sheets of the same system ----------
    const style = pickStyle(work, seed);
    const SHEET = {
      square: { paper: "#f3f4f6", ink: "#101012", grid: "lines" }, // graph paper
      dot: { paper: "#eef0f2", ink: "#0b0c0e", grid: "dots" }, // pegboard
      round: { paper: "#e6ecef", ink: "#13212c", grid: "cross" }, // cutting mat, blue-black ink
    }[style];
    const acc = work.accent || "#2236ff";
    const paper = SHEET.paper, ink = SHEET.ink;
    const alarm = work.alarm || acc;
    const accInk = lum(acc) < 0.62 ? paper : ink;
    const ST: Record<string, Pal> = {
      P: { key: "P", bg: paper, ink, acc, alarm },
      K: { key: "K", bg: ink, ink: paper, acc: lum(acc) < 0.6 ? K.mix(acc, paper, 0.42) : acc, alarm },
      A: { key: "A", bg: acc, ink: accInk, acc: accInk === paper ? ink : paper, alarm: accInk },
    };
    const gapF = style === "square" ? 0.1 : style === "round" ? 0.08 : 0.06;
    const scenes: Loose[] = work.scenes;
    const shots: Shot[] = scenes.map((s, i) => ({ s, i, st: ST.P, next: null, nextShot: null, L: { bl: [], extra: null, v: 0, zoom: null, lastEnd: 0 }, hold: 0, at: 0, setupAt: 0, pushAt: 0, pushEnd: 0, end: 0 }));
    // ground chain: each next ground is a colour that exists as modules in the current shot
    let cur = style === "dot" ? "K" : "P";
    shots.forEach((sh, k) => {
      sh.st = ST[cur];
      const opts = ["P", "K", "A"].filter((x) => x !== cur);
      cur = opts[K.hash(work.id + "z" + k) % 2];
      if (k + 1 === shots.length - 1 && cur === "A") cur = opts.find((x) => x !== "A") || "P";
    });
    shots.forEach((sh, k) => { sh.nextShot = shots[k + 1] || null; sh.next = sh.nextShot ? sh.nextShot.st : null; });

    // ---------- block helpers ----------
    const B = (str: string, m: number, x: number, y: number, role: string, t0: number, dur: number, o: { maxW?: number; gap?: number; right?: boolean; bottom?: boolean; solid?: boolean; order?: "read" | "scan" } = {}): Block => {
      const maxW = o.maxW ? Math.floor(o.maxW / m) : 1e9;
      const Tt = setText(str, maxW, o.gap == null ? 3 : o.gap);
      const bx = Math.round(x / U) * U, by = Math.round(y / U) * U;
      return { T: Tt, m, x: o.right ? Math.round((x - Tt.w * m) / U) * U : bx, y: o.bottom ? Math.round((y - Tt.h * m) / U) * U : by, role, t0, dur: dur || 0.5, solid: o.solid, order: o.order || "read" };
    };
    const hOf = (str: string, m: number, maxW: number) => setText(str, Math.floor(maxW / m)).h * m;
    const bh = (b: Block) => b.T.h * b.m;

    // ---------- per-shot layout ----------
    function layout(sh: Shot, k: number): Lay {
      const s = sh.s, bl: Block[] = [];
      const v = K.hash(work.id + ":" + s.kind + k) % 2;
      const L: Lay = { bl, extra: null, v, zoom: null, lastEnd: 0 };
      const X0 = 3 * U;
      const fitM = (str: string, maxW: number, maxM: number, minM = 6) => {
        const w = Math.max(1, setText(str).w);
        const m = Math.floor(maxW / w / 2) * 2;
        return K.clamp(m, minM, maxM);
      };
      if (s.kind === "hook") {
        const lab = B(s.label || "", 6, X0, 3 * U, "ink", 0, 0.4, { solid: true });
        bl.push(lab);
        const m = fitM(s.value || "", W - 6 * U, 70, 20);
        const vb = B(s.value || "", m, v ? W - 3 * U : X0, H - 4 * U, s.alarm ? "alarm" : "acc", 0.25, 0.9, { bottom: true, right: !!v });
        bl.push(vb);
        bl.push(B(s.line || "", 8, X0, Math.max(7 * U, lab.y + bh(lab) + 2 * U), "ink", 1.0, 0.55, { solid: true, maxW: W - 6 * U }));
        if (s.data === "sample") L.extra = { kind: "sample", x: v ? X0 : W - 3 * U, y: H - 3 * U - U, at: 1.4, right: !v };
        L.zoom = vb;
      } else if (s.kind === "story") {
        const m = 12;
        const a = B(s.line || "", m, X0, 4 * U, "ink", 0.05, 1.0, { solid: false, maxW: W - 6 * U });
        bl.push(a);
        const y2 = a.y + bh(a) + 4 * U;
        bl.push(B(s.line2 || "", 6, v ? X0 + 20 * U : X0, y2, "acc", 1.35, 0.6, { solid: true, maxW: W - 8 * U - (v ? 20 * U : 0) }));
        L.zoom = a;
      } else if (s.kind === "flow") {
        const nodes = s.nodes || [];
        const n = nodes.length;
        const longest = Math.max(1, ...nodes.map((nd) => setText(nd).w));
        const sumW = Math.max(1, nodes.reduce((a, nd) => a + setText(nd).w, 0));
        const horizontal = sumW * 8 + (n - 1) * 8 * U < W - 6 * U;
        L.horizontal = horizontal;
        const lineH = hOf(s.line || "", 6, W - 6 * U);
        const pitch = Math.floor((H - 9 * U - lineH) / Math.max(1, n) / U) * U;
        const rowsMax = Math.max(7, ...nodes.map((nd) => setText(nd).h));
        const nm = horizontal ? K.clamp(Math.floor((W - 6 * U - (n - 1) * 8 * U) / sumW / 2) * 2, 6, 16) : K.clamp(Math.min(Math.floor((W - 12 * U) / longest / 2) * 2, Math.floor((pitch - U) / rowsMax)), 6, 12);
        const ds = [0.15, 0.62, 1.0, 1.32, 1.58, 1.8];
        L.nodes = nodes.map((nd, i) => {
          let x: number, y: number;
          if (horizontal) {
            const prev = nodes.slice(0, i).reduce((a, q) => a + setText(q).w * nm + 8 * U, 0);
            x = X0 + prev; y = (v ? 12 : 16) * U;
          } else {
            x = 9 * U + (i % 2) * (v ? 18 : 6) * U; y = 4 * U + i * pitch;
          }
          const b = B(nd, nm, x, y, "ink", ds[i] ?? 1.8, 0.45, {});
          bl.push(b);
          return b;
        });
        bl.push(B(s.line || "", 6, X0, H - 4 * U - lineH, "acc", (ds[n - 1] ?? 1.8) + 0.4, 0.5, { solid: true, maxW: W - 6 * U }));
        L.zoom = L.nodes[n - 1] || null;
      } else if (s.kind === "terminal") {
        const m = 6;
        const cmd = B("$ " + (s.command || ""), m, X0, 3 * U, "acc", 0, 0.55, { solid: true });
        bl.push(cmd);
        const ds = [0.75, 0.95, 1.1, 1.25, 1.37, 1.47, 1.55];
        let y = cmd.y + bh(cmd) + 2 * U;
        (s.output || []).forEach((o, i) => {
          const ob = B(o, m, X0, y, "ink", ds[i] || 1.6, 0.22, { solid: true, order: "scan", maxW: W - 6 * U });
          bl.push(ob);
          y += Math.max(3 * U, bh(ob) + U);
        });
        const pm = ((s.output || []).join(" ").match(/\((\d+%)\)/) || [])[1];
        if (pm) {
          const hm = fitM(pm, 9 * U * 3, 28, 12);
          const hb = B(pm, hm, W - 3 * U, H - 9 * U, "acc", 1.9, 0.8, { right: true, bottom: true });
          bl.push(hb);
          L.zoom = hb;
        }
        const heroX = L.zoom ? L.zoom.x : W;
        const ln = B(s.line || "", 6, X0, H - 3 * U, "ink", 2.4, 0.5, { solid: true, maxW: Math.min(52 * U, heroX - X0 - 3 * U), bottom: true });
        bl.push(ln);
        if (s.data === "sample") L.extra = { kind: "sample", x: W - 3 * U, y: 3 * U, at: 2.6, right: true };
        if (!L.zoom) L.zoom = cmd;
      } else if (s.kind === "stats") {
        const [a, ...rest] = s.stats || [];
        const hm = Math.min(fitM(a.value, 34 * U, 52, 16), Math.floor((H - 17 * U) / 7 / 2) * 2);
        const ha = B(a.value, hm, X0, H - 6 * U, "acc", 0.1, 0.8, { bottom: true });
        bl.push(ha);
        const ux = ha.x + ha.T.w * hm + U * 2;
        const cx0 = Math.max(W * 0.6, ux + 8 * U);
        const unitT = setText(a.unit);
        const um = K.clamp(Math.min(Math.round((hm * 0.42) / 2) * 2, Math.floor((cx0 - 2 * U - ux) / Math.max(1, unitT.w) / 2) * 2, Math.floor((0.5 * 7 * hm) / Math.max(7, unitT.h) / 2) * 2), 6, 30);
        bl.push(B(a.unit, um, ux, ha.y + bh(ha) - unitT.h * um, "acc", 0.75, 0.3, {}));
        const lab = B(a.label, 6, X0, 0, "ink", 0.85, 0.35, { solid: true });
        lab.y = Math.round((ha.y - 2 * U - bh(lab)) / U) * U;
        bl.push(lab);
        rest.forEach((b, i) => {
          const y = 9 * U + i * 15 * U;
          const vb = B(b.value, 14, cx0, y, "ink", 1.1 + i * 0.32, 0.45, {});
          bl.push(vb);
          const ub = B(b.unit, 8, vb.x + vb.T.w * 14 + U, 0, "ink", 1.35 + i * 0.32, 0.2, { solid: true });
          ub.y = vb.y + bh(vb) - bh(ub);
          bl.push(ub);
          bl.push(B(b.label, 6, cx0, vb.y + bh(vb) + 2 * U, "ink", 1.4 + i * 0.3, 0.3, { solid: true, maxW: W - cx0 - 3 * U }));
        });
        bl.push(B(s.line || "", 6, X0, 3 * U, "ink", 2.0, 0.5, { solid: true, maxW: W - 6 * U }));
        if (s.data === "sample") L.extra = { kind: "sample", x: W - 3 * U, y: H - 5 * U, at: 2.2, right: true };
        if (s.data === "measured" && s.source) L.extra = { kind: "source", txt: T.src + s.source, x: W - 3 * U, y: H - 5 * U, at: 2.2, right: true };
        L.zoom = ha;
      } else if (s.kind === "items") {
        const items = s.items || [];
        const n = items.length;
        const lh = hOf(s.line || "", 6, W - 6 * U);
        bl.push(B(s.line || "", 6, X0, 3 * U, "ink", 0, 0.5, { solid: true, maxW: W - 6 * U }));
        const perRow = n > 3 ? Math.ceil(n / 2) : n;
        const pw = Math.floor((W - 6 * U) / perRow / U) * U;
        const ds = [0.45, 0.7, 0.9, 1.06, 1.18, 1.27, 1.34, 1.4];
        let vmAll = Math.min(...items.map((it) => K.clamp(Math.floor((pw - 3 * U) / Math.max(5, setText(it.value).w) / 2) * 2, 6, 14)));
        const top0 = Math.ceil((3 * U + lh + 3 * U) / U) * U;
        const rowsN = Math.ceil(n / perRow);
        const lm = items.some((it) => isTall(it.label)) ? 5 : 6; // Korean labels: one module size down, so they stay on one line
        const labH = Math.max(...items.map((it) => hOf(it.label, lm, pw - 2 * U)));
        const valRows = Math.max(...items.map((it) => setText(it.value).h));
        // every row must fit above the bottom margin (Korean labels can wrap to two lines)
        while (vmAll > 6 && top0 + rowsN * (valRows * vmAll + labH + 5 * U) > H - 2 * U) vmAll -= 2;
        const valH = valRows * vmAll;
        const rowH = Math.max(Math.min(13 * U, Math.floor((H - 2 * U - top0) / rowsN / U) * U), Math.ceil((valH + labH + 5 * U) / U) * U);
        const panels = items.map((it, i) => {
          const row = Math.floor(i / perRow), col = i % perRow;
          const px = X0 + col * pw + (row && v ? Math.floor(pw / 2 / U) * U : 0);
          const top = top0 + row * rowH;
          const vb = B(it.value, vmAll, px + U, top + 2 * U, it.alarm ? "alarm" : "ink", ds[i] ?? 1.4, 0.4, {});
          bl.push(vb);
          bl.push(B(it.label, lm, px + U, top + 2 * U + valH + 2 * U, "ink", (ds[i] ?? 1.4) + 0.25, 0.3, { solid: true, maxW: pw - 2 * U }));
          return { alarm: it.alarm, vb };
        });
        if (s.data === "sample") L.extra = { kind: "sample", x: W - 3 * U, y: H - 5 * U, at: 1.6, right: true };
        const al = panels.find((p) => p.alarm);
        L.zoom = al ? al.vb : panels[Math.min(1, n - 1)].vb;
      } else if (s.kind === "alert") {
        // the notification is a slab of modules built on the grid; the title is knocked out of it
        const titleT = setText(s.title || "");
        const tm = K.clamp(Math.floor((W - 14 * U) / Math.max(1, titleT.w) / 2) * 2, 6, 12);
        const tw = titleT.w * tm;
        const tag = B(s.data === "sample" ? T.sampleAlert : T.alert, 5, 0, 0, "knock", 0.5, 0.25, { solid: true });
        const slab: Slab = { x: 3 * U, y: 4 * U, w: Math.ceil((Math.max(tw, tag.T.w * 5) + 6 * U) / U) * U, h: Math.ceil((titleT.h * tm + bh(tag) + 6 * U) / U) * U, t0: 0, dur: 0.6 };
        L.slab = slab;
        tag.x = slab.x + 2 * U; tag.y = slab.y + 2 * U;
        bl.push(tag);
        bl.push(B(s.title || "", tm, slab.x + 3 * U, slab.y + slab.h - 2 * U, "knock", 0.55, 0.55, { bottom: true }));
        const by = slab.y + slab.h + 3 * U;
        const lx = v ? X0 : 30 * U, lw = W - 3 * U - lx;
        const l2 = B(s.line2 || "", 6, lx, H - 3 * U, "acc", 2.2, 0.4, { solid: true, maxW: lw, bottom: true });
        const l1 = B(s.line || "", 6, lx, l2.y - U, "ink", 1.8, 0.4, { solid: true, maxW: lw, bottom: true });
        let bb = B(s.body || "", 8, X0, by, "ink", 1.2, 0.45, { solid: true, maxW: W - 6 * U });
        if (bb.y + bh(bb) > l1.y - 2 * U) bb = B(s.body || "", 6, X0, by, "ink", 1.2, 0.45, { solid: true, maxW: W - 6 * U });
        bl.push(bb, l1, l2);
        L.zoom = null; // dive into a module of the slab itself
      } else if (s.kind === "ending") {
        const name = s.name || "";
        const linesH = hOf(s.line || "", 6, 60 * U) + hOf(s.line2 || "", 6, 60 * U) + U;
        const nm = Math.min(fitM(name, W - 6 * U, 34, 10), Math.max(10, Math.floor((H - 6 * U - linesH - 3 * U - 12 * U) / Math.max(7, setText(name).h) / 2) * 2));
        let nb: Block;
        if (setText(name).w * nm < W * 0.5 && name.includes(" ")) nb = B(name, nm, X0, 9 * U, "ink", 0.05, 1.0, {});
        else {
          const words = name.split(" ");
          const widest = Math.max(1, ...words.map((w) => setText(w).w));
          const m2 = words.length > 1 ? K.clamp(Math.floor((W - 6 * U) / widest / 2) * 2, 8, 22) : nm;
          const useStack = words.length > 1 && m2 > nm * 1.4;
          nb = useStack ? B(name, m2, X0, 5 * U, "ink", 0.05, 1.1, { maxW: widest * m2 + 1, gap: 2 }) : B(name, nm, X0, 12 * U, "ink", 0.05, 1.0, {});
        }
        bl.push(nb);
        const ly = nb.y + bh(nb) + 3 * U;
        const right = ly > H - 13 * U;
        const l1 = B(s.line || "", 6, right ? 46 * U : X0, right ? 4 * U : ly, "acc", 1.2, 0.45, { solid: true, maxW: right ? 31 * U : 60 * U });
        bl.push(l1);
        bl.push(B(s.line2 || "", 6, l1.x, l1.y + bh(l1) + U, "ink", 1.6, 0.45, { solid: true, maxW: right ? 31 * U : 60 * U }));
        L.zoom = null;
      }
      // the cell to dive into: a full module of the zoom block, away from its edges
      const mkDive = (d: Omit<Dive, "s" | "cx" | "cy" | "end" | "Fx" | "Fy">): Dive => {
        const s0 = d.m - 2 * d.inset;
        const cx = d.x + d.m / 2, cy = d.y + d.m / 2;
        const end = d.shape === "dot" ? (1.012 * Math.hypot(W, H)) / s0 : d.shape === "round" ? (1.05 * W) / s0 : (1.012 * W) / s0;
        return { ...d, s: s0, cx, cy, end, Fx: (W / 2 - end * cx) / (1 - end), Fy: (H / 2 - end * cy) / (1 - end) };
      };
      if (sh.next && L.zoom) {
        const zb = L.zoom;
        const cells = zb.T.cells.filter((c) => c[2] === "#");
        const c = cells[Math.floor(cells.length * (0.45 + 0.3 * K.rand(seed, k, 3)))] || cells[0];
        if (c) {
          const solid = !!zb.solid || zb.m <= 6;
          L.dive = mkDive({ x: zb.x + c[0] * zb.m, y: zb.y + c[1] * zb.m, m: zb.m, block: zb, inset: solid ? 0 : Math.max(1, zb.m * gapF * 0.5), shape: solid ? "square" : style });
        }
      } else if (sh.next && L.slab) {
        L.dive = mkDive({ x: L.slab.x + L.slab.w - U * 2, y: L.slab.y + U, m: U, slab: true, inset: 0, shape: "square" });
      }
      L.lastEnd = Math.max(...bl.map((b) => b.t0 + b.dur), L.slab ? L.slab.t0 + L.slab.dur : 0, L.extra ? L.extra.at + 0.3 : 0);
      return L;
    }
    shots.forEach((sh, k) => { sh.L = layout(sh, k); });

    // ---------- timeline ----------
    const KF: Record<string, number> = { hook: 1.15, story: 1.0, flow: 1.0, terminal: 1.1, items: 1.0, alert: 0.95, stats: 1.0, ending: 0.9 };
    const ideal = shots.map((sh) => K.clamp(Math.max(sh.L.lastEnd + 1.2, (0.8 + chars(sh.s) / 19) * (KF[sh.s.kind] || 1)), sh.i === 0 ? 3.4 : 2.6, 6.2));
    const nonEnd = shots.filter((sh) => sh.next);
    const last = shots[shots.length - 1];
    const endHold = Math.max(2.9, last.L.lastEnd + 0.9);
    const budget = 28.6 + 0.7 - nonEnd.length * (SETUP + PUSH * OVER) - (endHold + 2.4);
    const sumI = nonEnd.reduce((a, sh) => a + ideal[sh.i], 0) || 1;
    const fct = Math.min(1, budget / sumI);
    shots.forEach((sh) => { sh.hold = sh.next ? Math.max(sh.L.lastEnd + 0.8, ideal[sh.i] * fct) : endHold + 2.4; });
    if (nonEnd.length) {
      const longest = nonEnd.reduce((a, sh) => (sh.hold > a.hold ? sh : a), nonEnd[0]);
      if (longest.hold < 4) longest.hold = 4; // at least one long hold
    }
    let at = -0.7; // in medias res: the first shot is already 0.7 s into its build at t = 0
    shots.forEach((sh) => {
      sh.at = at;
      if (sh.next) {
        sh.setupAt = at + sh.hold; sh.pushAt = sh.setupAt + SETUP; sh.pushEnd = sh.pushAt + PUSH;
        at = sh.pushAt + PUSH * OVER;
      } else sh.end = at + sh.hold;
    });
    const duration = last.end;
    // a scene "starts" for the review window once its cell is most of the frame
    const starts = shots.map((sh, i) => (i === 0 ? 0 : Math.max(0, shots[i - 1].pushAt + PUSH * 0.6)));

    const LEAN = 0.016;
    const sigmaOf = (sh: Shot, t: number) => {
      const dv = sh.L.dive;
      if (!dv || !sh.next) return 1;
      const lean = 1 + LEAN * K.ease.outCubic(K.seg(t, sh.at + 0.6, sh.pushAt - sh.at - 0.6));
      if (t < sh.pushAt) return lean;
      const p = pushE(K.seg(t, sh.pushAt, PUSH));
      return Math.exp(Math.log(1 + LEAN) + (Math.log(dv.end) - Math.log(1 + LEAN)) * p);
    };

    const colOf = (st: Pal, role: string) => (role === "ink" ? st.ink : role === "acc" ? st.acc : role === "alarm" ? st.alarm : role === "knock" ? st.bg : st.ink);

    function drawBlock(g: CanvasRenderingContext2D, b: Block, st: Pal, lt: number, cellOverride: string | null) {
      const N = b.T.cells.length;
      if (!N) return;
      const lt12 = K.step(lt, 24);
      if (lt12 < b.t0) return;
      const shown = b.order === "scan" ? N : Math.floor(K.clamp((lt12 - b.t0) / b.dur) * N);
      const m = b.m;
      const solid = !!b.solid || m <= 6;
      const inset = solid ? 0 : Math.max(1, m * gapF * 0.5);
      const stl: Style = solid ? "square" : style;
      g.fillStyle = cellOverride || colOf(st, b.role);
      g.beginPath();
      if (b.order === "scan") {
        const lim = b.T.w * K.clamp((lt12 - b.t0) / b.dur);
        for (const c of b.T.cells) if (c[0] <= lim) cellPath(g, b.x + c[0] * m, b.y + c[1] * m, m, c[2], stl, inset);
      } else {
        for (let i = 0; i < shown; i++) { const c = b.T.cells[i]; cellPath(g, b.x + c[0] * m, b.y + c[1] * m, m, c[2], stl, inset); }
      }
      g.fill();
      // the build head: the module being placed shows in the other colour for one step
      if (shown > 0 && shown < N && b.order !== "scan" && !solid) {
        const c = b.T.cells[shown - 1];
        g.fillStyle = b.role === "acc" ? st.ink : st.acc;
        g.beginPath(); cellPath(g, b.x + c[0] * m, b.y + c[1] * m, m, "#", stl, inset); g.fill();
      }
    }

    // visible world rect under the current transform (so a 200× zoom only draws the grid it can see)
    function viewRect(g: CanvasRenderingContext2D, pad: number[]): [number, number, number, number] {
      const inv = g.getTransform().inverse();
      const a = inv.transformPoint({ x: 0, y: 0 }), b = inv.transformPoint({ x: g.canvas.width, y: g.canvas.height });
      return [Math.max(-pad[0], Math.min(a.x, b.x)), Math.max(-pad[1], Math.min(a.y, b.y)), Math.min(W + pad[0], Math.max(a.x, b.x)), Math.min(H + pad[1], Math.max(a.y, b.y))];
    }

    // the base grid, in this sheet's own material: graph lines · pegboard dots · cutting-mat crosses
    function drawGrid(g: CanvasRenderingContext2D, st: Pal, sc: number, pad: number[]) {
      // a grid finer than ~5 screen px is not seen as lines but as a grey wash: let it fade out instead
      const vis = K.clamp((U * sc - 4) / 8);
      if (vis <= 0) return;
      g.save();
      g.globalAlpha = vis;
      const [x0, y0, x1, y1] = viewRect(g, pad);
      const ix0 = Math.floor(x0 / U) * U, iy0 = Math.floor(y0 / U) * U;
      const tens = () => {
        g.beginPath();
        for (let x = Math.floor(x0 / (10 * U)) * 10 * U; x <= x1; x += 10 * U) { g.moveTo(x, y0); g.lineTo(x, y1); }
        for (let y = Math.floor(y0 / (10 * U)) * 10 * U; y <= y1; y += 10 * U) { g.moveTo(x0, y); g.lineTo(x1, y); }
        g.stroke();
      };
      if (SHEET.grid === "lines") {
        g.strokeStyle = K.mix(st.bg, st.ink, 0.1);
        g.lineWidth = 1 / sc;
        g.beginPath();
        for (let x = ix0; x <= x1; x += U) { g.moveTo(x, y0); g.lineTo(x, y1); }
        for (let y = iy0; y <= y1; y += U) { g.moveTo(x0, y); g.lineTo(x1, y); }
        g.stroke();
        g.strokeStyle = K.mix(st.bg, st.ink, 0.17); // every 10th line a touch heavier, like real graph paper
        tens();
      } else if (SHEET.grid === "dots") {
        g.fillStyle = K.mix(st.bg, st.ink, 0.24);
        const d = 2.6 / sc;
        g.beginPath();
        for (let x = ix0; x <= x1; x += U) for (let y = iy0; y <= y1; y += U) g.rect(x - d / 2, y - d / 2, d, d);
        g.fill();
      } else {
        const S2 = 2 * U;
        g.fillStyle = K.mix(st.bg, st.ink, 0.2);
        const a = 5 / sc, w = 1.2 / sc;
        g.beginPath();
        for (let x = Math.floor(x0 / S2) * S2; x <= x1; x += S2) for (let y = Math.floor(y0 / S2) * S2; y <= y1; y += S2) { g.rect(x - a, y - w / 2, a * 2, w); g.rect(x - w / 2, y - a, w, a * 2); }
        g.fill();
        g.strokeStyle = K.mix(st.bg, st.ink, 0.13); g.lineWidth = 1 / sc;
        tens();
      }
      g.restore();
    }

    function smallMark(g: CanvasRenderingContext2D, st: Pal, ex: Extra | null, lt: number) {
      if (!ex || lt < ex.at) return;
      const txt = ex.kind === "sample" ? T.sample : ex.txt || "";
      g.font = K.font(26, MONO, 500);
      const tw = g.measureText(txt).width;
      const x = ex.right ? ex.x - tw - 2 * U : ex.x;
      const y = ex.y;
      const p = K.clamp((K.step(lt, 24) - ex.at) / 0.25);
      g.strokeStyle = st.ink; g.lineWidth = 2;
      const bw = Math.ceil((tw + 2 * U) / U) * U;
      g.strokeRect(x - U + 0.5, y - 0.5, bw * p, 2 * U);
      if (p >= 1) { g.fillStyle = st.ink; g.textBaseline = "middle"; g.fillText(txt, x, y + U + 1); g.textBaseline = "alphabetic"; }
    }

    // one shot drawn in its own world coordinates. sc = on-screen scale (for hairlines); pad = how far past
    // the frame the ground must reach (a nested shot is seen through a cell that is bigger than 16:9)
    function scene(g: CanvasRenderingContext2D, sh: Shot, lt: number, sc: number, pad: number[]) {
      const st = sh.st, L = sh.L;
      g.fillStyle = st.bg;
      g.fillRect(-pad[0], -pad[1], W + 2 * pad[0], H + 2 * pad[1]);
      drawGrid(g, st, sc, pad);
      if (lt < -0.05) return;
      const slabCol = st.alarm === st.bg ? st.ink : st.alarm;
      if (L.slab) {
        const sl = L.slab;
        const rows = sl.h / U, cols = sl.w / U;
        const n = Math.floor(K.clamp((K.step(lt, 24) - sl.t0) / sl.dur) * rows * cols);
        g.fillStyle = slabCol;
        g.beginPath();
        for (let i = 0; i < n; i++) { const cx = i % cols, cy = Math.floor(i / cols); g.rect(sl.x + cx * U, sl.y + cy * U, U, U); }
        g.fill();
      }
      for (const b of L.bl) drawBlock(g, b, st, lt, b.role === "knock" ? (st.bg === slabCol ? st.ink : st.bg) : null);
      if (L.horizontal != null) flowWires(g, sh, lt);
      smallMark(g, st, L.extra, lt);
      if (sh.s.kind === "ending") {
        const hp = K.seg(lt, sh.hold - 2.4, 2.4);
        if (hp > 0) K.handoff(g, hp, { ink: st.ink, family: MONO, size: 26, x: 3 * U, y: H - 3 * U, handle: work.handle });
      }
    }

    // wires between flow nodes: modules lighting along grid lines, then a packet walking them
    function flowWires(g: CanvasRenderingContext2D, sh: Shot, lt: number) {
      const L = sh.L, st = sh.st, ns = L.nodes || [];
      g.fillStyle = st.acc;
      for (let i = 0; i < ns.length - 1; i++) {
        const a = ns[i], b = ns[i + 1];
        const t0 = b.t0 - 0.36;
        const lt12 = K.step(lt, 24);
        if (lt12 < t0) continue;
        const pts: [number, number][] = [];
        const midA = a.y + Math.round(bh(a) / 2 / U) * U - U, midB = b.y + Math.round(bh(b) / 2 / U) * U - U;
        if (L.horizontal) {
          for (let x = a.x + a.T.w * a.m + U; x < b.x - U; x += U) pts.push([x, midA]);
        } else {
          const x0 = 6 * U;
          for (let x = a.x - 2 * U; x >= x0; x -= U) pts.push([x, midA]);
          for (let y = midA + U; y <= midB; y += U) pts.push([x0, y]);
          for (let x = x0 + U; x <= b.x - 2 * U; x += U) pts.push([x, midB]);
        }
        const n = Math.floor(K.clamp((lt12 - t0) / 0.34) * pts.length);
        g.beginPath();
        for (let q = 0; q < n; q++) g.rect(pts[q][0] + 5, pts[q][1] + 5, U - 10, U - 10);
        g.fill();
        // the packet: one full module walks the wire at 6 modules/s once it is laid (calm, not a strobe)
        if (n === pts.length && pts.length) {
          const q = Math.floor(((lt12 - t0 - 0.34) * 6) % pts.length);
          g.fillRect(pts[q][0], pts[q][1], U, U);
        }
      }
    }

    // pick & light: guides run out from the cell's edges, the rest of the sheet steps back, the cell takes
    // the next ground's colour, corner marks close in. Then the push.
    function diveMarks(g: CanvasRenderingContext2D, sh: Shot, t: number, sigma: number) {
      const dv = sh.L.dive, st = sh.st, nx = sh.next;
      if (!dv || !nx) return;
      const u = t - sh.setupAt;
      if (u < 0) return;
      const u24 = K.step(u, 24);
      const pp = t > sh.pushAt ? K.seg(t, sh.pushAt, PUSH) : 0;
      const x0 = dv.x + dv.inset, y0 = dv.y + dv.inset, s = dv.s;
      // 1 · the sheet steps back (flat veil of its own ground, no blur)
      const veil = 0.58 * K.ease.outCubic(K.seg(u, 0.12, 0.4));
      if (veil > 0) { g.fillStyle = K.rgba(st.bg, veil); g.fillRect(-W * 2, -H * 2, W * 5, H * 5); }
      // 2 · guides along the cell's four edges, laid out from the cell in 24 fps steps
      const q = K.ease.outCubic(K.seg(u24, 0, 0.38));
      const ga = 1 - K.seg(pp, 0.55, 0.3);
      if (q > 0 && ga > 0) {
        g.fillStyle = K.rgba(nx.bg, ga);
        const lw = 2 / sigma, ext = 2400;
        g.beginPath();
        for (const xx of [x0, x0 + s]) g.rect(xx - lw / 2, y0 - ext * q, lw, s + 2 * ext * q);
        for (const yy of [y0, y0 + s]) g.rect(x0 - ext * q, yy - lw / 2, s + 2 * ext * q, lw);
        g.fill();
      }
      // 3 · the cell itself takes the next shot's ground
      if (u24 >= 0.2) { g.fillStyle = nx.bg; g.beginPath(); cellPath(g, dv.x, dv.y, dv.m, "#", dv.shape, dv.inset); g.fill(); }
      // 4 · corner marks close in on the cell
      if (u24 >= 0.26) {
        const k = K.ease.outCubic(K.seg(u24, 0.26, 0.24));
        const o = s * (0.75 - 0.5 * k) + 3 / sigma, arm = s * 0.38, th = Math.max(2.5 / sigma, s * 0.07);
        g.fillStyle = K.rgba(st.ink, 1 - K.seg(pp, 0.4, 0.3));
        const cx = x0 + s / 2, cy = y0 + s / 2, h = s / 2 + o;
        g.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const px = cx + sx * h, py = cy + sy * h;
          g.rect(Math.min(px, px - sx * arm), py - (sy > 0 ? th : 0), arm, th);
          g.rect(px - (sx > 0 ? th : 0), Math.min(py, py - sy * arm), th, arm);
        }
        g.fill();
      }
    }

    const PAD0 = [0, 0], PADN = [150, 500];
    return {
      duration,
      starts,
      render(g, t) {
        let k = shots.length - 1;
        for (let i = 0; i < shots.length; i++) { const sh = shots[i]; if (!sh.next || t < sh.pushEnd) { k = i; break; } }
        const sh = shots[k];
        const lt = t - sh.at;
        const dv = sh.L.dive;
        if (!dv || !sh.nextShot) { scene(g, sh, lt, 1, PAD0); return; }
        const sigma = sigmaOf(sh, t);
        g.save();
        g.translate(dv.Fx, dv.Fy); g.scale(sigma, sigma); g.translate(-dv.Fx, -dv.Fy);
        scene(g, sh, lt, sigma, PAD0);
        diveMarks(g, sh, t, sigma);
        if (t > sh.pushAt) {
          // the next shot already lives inside the cell
          g.save();
          g.beginPath(); cellPath(g, dv.x, dv.y, dv.m, "#", dv.shape, dv.inset); g.clip();
          g.translate(dv.cx, dv.cy); g.scale(1 / dv.end, 1 / dv.end); g.translate(-W / 2, -H / 2);
          scene(g, sh.nextShot, t - sh.nextShot.at, sigma / dv.end, PADN);
          g.restore();
        }
        g.restore();
      },
    };
  },
};
