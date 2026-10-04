// 영수증 — 가게 영수증 프린터가 작품을 한 줄씩 덜컥덜컥 찍어 내고, 끝에 찢어 준다(필름 실험실 G18, 2026-10-04).
// 세계의 규칙: 1비트 인쇄 헤드(576·384점), 종이는 슬롯에서 위로 자란다, 줄은 덜컥이는 줄바꿈으로 나온다,
// 검정·빨강 두 색 감열지, 강조색은 고무도장이나 형광펜으로만, 끝은 찢기.
import type { FlatScene, Genre, GenreWork } from "./types";
import * as K from "./kit";

const PAPER = "#f5f6f3";
const INK = [38, 39, 44];
const RED = [196, 34, 44];

type Mk = (w: number, h: number) => HTMLCanvasElement;
type Style = "bill" | "log" | "tickets";

// 정직 표시 — 영상의 언어로 쓴다.
const LABEL = {
  en: { sample: "SAMPLE", sampleValues: "sample values", sampleData: "sample data", sampleFigures: "sample figures", src: "src: ", pct: "in %", pctSample: "in %, sample readings" },
  ko: { sample: "예시", sampleValues: "예시 값", sampleData: "예시 자료", sampleFigures: "예시 수치", src: "출처: ", pct: "단위 %", pctSample: "단위 %, 예시 값" },
};

// ---- 한글은 두 칸 폭(읽는 시간도 더 든다) ----
const isWide = (c: string) => {
  const n = c.codePointAt(0) || 0;
  return (n >= 0x1100 && n <= 0x115f) || (n >= 0x2e80 && n <= 0xa4cf) || (n >= 0xac00 && n <= 0xd7a3) || (n >= 0xf900 && n <= 0xfaff) || (n >= 0xff00 && n <= 0xff60) || (n >= 0xffe0 && n <= 0xffe6) || n >= 0x1f300;
};
const readLen = (s: string) => Array.from(s).reduce((a, c) => a + (isWide(c) ? 1.7 : 1), 0);

// ---- Code 128-B (실제 부호화; 기호마다 11모듈) ----
const C128 = ("212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232").split(" ");
function code128(text: string): number[] {
  const codes = [104];
  for (const ch of text) codes.push(Math.max(0, Math.min(94, ch.charCodeAt(0) - 32)));
  let sum = 104;
  for (let i = 1; i < codes.length; i++) sum += codes[i] * i;
  codes.push(sum % 103);
  return (codes.map((c) => C128[c]).join("") + "2331112").split("").map(Number);
}

/** 제목 "이름 · 한 줄 소개" → 이름과 소개. */
function splitTitle(t: string): { name: string; pitch: string } {
  for (const sep of [" · ", " — ", " | "]) {
    const i = t.indexOf(sep);
    if (i > 0) return { name: t.slice(0, i).trim(), pitch: t.slice(i + sep.length).trim() };
  }
  return { name: t.trim(), pitch: "" };
}

// ---------------- 종이(인쇄 헤드 점 단위의 1비트 그림) ----------------
type Ent = {
  kind: "text" | "lr" | "gap" | "node" | "bar" | "barcode";
  y0: number; y1: number; sx: number; sy: number;
  s?: string; l?: string; r?: string; leader?: string;
  w?: number; align?: "l" | "c" | "r"; indent?: number;
  red?: boolean; inv?: boolean; head?: boolean; hero?: boolean; rule?: boolean; hiTarget?: boolean;
  last?: boolean; fill?: boolean;
  label?: string; val?: string; frac?: number; mods?: number[];
  ticketStart?: number; ticketEnd?: number; handoff?: boolean;
  tx0?: number; tx1?: number;
};
type Opt = Partial<Omit<Ent, "kind" | "y0" | "y1">> & { nowrap?: boolean };

class Paper {
  e: Ent[] = [];
  y = 18;
  adv: number;
  cols: number;
  lh: number;
  H = 0;
  canvas: HTMLCanvasElement | null = null;
  private mc: CanvasRenderingContext2D;
  constructor(private mk: Mk, public W: number, public F: number, public m: number, public fam: string) {
    this.mc = mk(8, 8).getContext("2d")!;
    this.mc.font = K.font(F, fam, 500);
    this.adv = this.mc.measureText("M").width;
    this.cols = Math.floor((W - 2 * m) / this.adv);
    this.lh = Math.round(F * 1.34);
  }
  /** 실제 인쇄 폭(px) — 한글은 고정폭 글꼴의 한 칸보다 넓다. */
  px(s: string, w = 500): number { this.mc.font = K.font(this.F, this.fam, w); return this.mc.measureText(s).width; }
  /** 차지하는 칸 수(올림). */
  colsOf(s: string, w = 500): number { return Math.ceil(this.px(s, w) / this.adv - 0.01); }
  /** 칸 수 안으로 자른다. */
  fitCols(s: string, cols: number, w = 500, tail = ""): string {
    if (this.colsOf(s, w) <= cols) return s;
    const ch = Array.from(s);
    while (ch.length && this.colsOf(ch.join("") + tail, w) > cols) ch.pop();
    return ch.join("") + tail;
  }
  /** 칸 단위 줄바꿈 — 띄어쓰기로 끊고, 한 낱말이 줄보다 길면 글자로 끊는다. */
  wrapCols(text: string, cols: number, w = 500): string[] {
    const maxW = cols * this.adv + 0.5;
    const out: string[] = [];
    let cur = "";
    for (let word of String(text).split(/\s+/)) {
      if (!word) continue;
      const nx = cur ? cur + " " + word : word;
      if (this.px(nx, w) > maxW && cur) { out.push(cur); cur = ""; }
      else if (cur) { cur = nx; continue; }
      while (this.px(word, w) > maxW) {
        const ch = Array.from(word);
        let k = ch.length - 1;
        while (k > 1 && this.px(ch.slice(0, k).join(""), w) > maxW) k--;
        out.push(ch.slice(0, k).join(""));
        word = ch.slice(k).join("");
      }
      cur = word;
    }
    if (cur) out.push(cur);
    return out;
  }
  push(en: Omit<Ent, "y0" | "y1">, h: number): Ent {
    const full = { ...en, y0: this.y, y1: this.y + h } as Ent;
    this.y += h;
    this.e.push(full);
    return full;
  }
  text(s: string, o: Opt = {}): Ent[] {
    const sx = o.sx || 1, sy = o.sy || sx;
    const lines = o.nowrap ? [s] : this.wrapCols(s, Math.floor(this.cols / sx) - (o.indent || 0), o.w || 500);
    return lines.map((ln) => this.push({ kind: "text", ...o, s: ln, sx, sy }, this.lh * sy + (o.inv ? 8 : 0)));
  }
  /** 왼쪽 글 ······ 오른쪽 값. */
  lr(l: string, r: string, o: Opt = {}): Ent {
    const sx = o.sx || 1, sy = o.sy || sx, w = o.w || 500;
    const cols = Math.floor(this.cols / sx);
    const room = cols - this.colsOf(r, w) - 2;
    if (this.colsOf(l, w) > room) l = this.fitCols(l, room, w, ".");
    return this.push({ kind: "lr", ...o, l, r, leader: o.leader || ".", sx, sy }, this.lh * sy);
  }
  rule(ch = "-", o: Opt = {}): Ent { return this.push({ kind: "text", ...o, s: ch.repeat(this.cols), sx: 1, sy: 1, rule: true }, this.lh); }
  gap(h: number, o: Opt = {}): Ent { return this.push({ kind: "gap", ...o, sx: 1, sy: 1 }, h); }
  node(s: string, o: Opt = {}): Ent { return this.push({ kind: "node", ...o, s, sx: 1, sy: 1 }, this.lh + (o.last ? 0 : Math.round(this.lh * 0.7))); }
  bar(label: string, val: string, frac: number, o: Opt = {}): Ent { return this.push({ kind: "bar", ...o, label, val, frac, sx: 1, sy: 1 }, this.lh + 6); }
  barcode(text: string, o: Opt = {}): Ent { return this.push({ kind: "barcode", ...o, mods: code128(text), sx: 1, sy: 1 }, 92); }

  render(seed: number): HTMLCanvasElement {
    const W = this.W, H = Math.ceil(this.y + 40), F = this.F, m = this.m, fam = this.fam;
    const c = this.mk(W, H), x = c.getContext("2d")!;
    x.textBaseline = "alphabetic";
    for (const en of this.e) {
      const col = en.red ? "#ff0000" : "#000000";
      x.fillStyle = col; x.strokeStyle = col;
      if (en.kind === "text" || en.kind === "lr") {
        const h = en.y1 - en.y0;
        if (en.inv) { x.fillRect(m - 6, en.y0 + 2, W - 2 * m + 12, h - 4); x.globalCompositeOperation = "destination-out"; }
        x.save();
        x.font = K.font(F, fam, en.w || 500);
        const s = en.s || "";
        const tw = en.kind === "lr" ? Math.floor(this.cols / en.sx) * this.adv * en.sx : x.measureText(s).width * en.sx;
        const ind = (en.indent || 0) * this.adv;
        let px = m + ind;
        if (en.align === "c") px = (W - tw) / 2;
        if (en.align === "r") px = W - m - tw;
        en.tx0 = px; en.tx1 = px + tw;
        x.translate(px, en.y0 + (en.inv ? 4 : 0) + this.lh * en.sy * 0.76);
        x.scale(en.sx, en.sy);
        // 강조 인쇄 = 두 번 찍기
        const strike = (str: string, at: number) => { x.fillText(str, at, 0); if ((en.w || 500) >= 700) x.fillText(str, at + 0.6 / en.sx, 0); };
        if (en.rule) {
          // 점선은 글자가 아니라 점으로 찍는다
          x.restore(); x.save();
          const yy = Math.round(en.y0 + this.lh * 0.5);
          if (s[0] === "=") { x.fillRect(m, yy - 3, W - 2 * m, 2); x.fillRect(m, yy + 3, W - 2 * m, 2); }
          else for (let i = m; i < W - m; i += 9) x.fillRect(i, yy, 5, 2);
        } else if (en.kind === "lr") {
          // 고정폭 칸 위에: 왼쪽 글, 오른쪽 끝에 맞춘 값, 그 사이 리더 점
          const cols = Math.floor(this.cols / en.sx);
          const l = en.l || "", r = en.r || "";
          const lw = x.measureText(l).width, rw = x.measureText(r).width;
          if (l) strike(l, 0);
          strike(r, cols * this.adv - rw);
          if (en.leader !== " ") {
            const a = Math.ceil(lw / this.adv - 0.01) + 1, b = cols - Math.ceil(rw / this.adv - 0.01) - 1;
            if (b > a) strike((en.leader || ".").repeat(b - a), a * this.adv);
          }
        } else strike(s, 0);
        x.restore();
        x.globalCompositeOperation = "source-over";
      } else if (en.kind === "node") {
        const cy = en.y0 + this.lh * 0.5, cx = m + 12;
        x.lineWidth = 3;
        x.beginPath(); x.arc(cx, cy, 7, 0, Math.PI * 2);
        if (en.fill) x.fill(); else x.stroke();
        if (!en.last) x.fillRect(cx - 1.5, cy + 9, 3, en.y1 - cy + this.lh * 0.5 - 18);
        x.font = K.font(F, fam, en.w || 500);
        const s = en.s || "", room = W - m - (m + 34), sw = x.measureText(s).width;
        // 너무 긴 이름은 좁은 글자 모드처럼 가로로 줄인다
        x.save(); x.translate(m + 34, en.y0 + this.lh * 0.76); if (sw > room) x.scale(room / sw, 1); x.fillText(s, 0, 0); x.restore();
      } else if (en.kind === "bar") {
        x.font = K.font(F, fam, en.w || 500);
        const by = en.y0 + this.lh * 0.76;
        x.fillText(this.fitCols(en.label || "", 12, en.w || 500), m, by);
        const vx = m + this.adv * 12;
        const val = en.val || "";
        x.fillText(val, vx + Math.max(0, this.adv * 4 - x.measureText(val).width), by);
        const bx = vx + this.adv * 5, bw = W - m - bx;
        const full = Math.round(bw * (en.frac || 0));
        // 막대 = 꽉 찬 덩어리 + 10%마다 1점 눈금(프린터 그래픽처럼)
        x.fillRect(bx, en.y0 + 6, full, this.lh - 10);
        x.globalCompositeOperation = "destination-out";
        for (let k = 1; k < 10; k++) x.fillRect(bx + Math.round((bw * k) / 10), en.y0 + 6, 1, this.lh - 10);
        x.globalCompositeOperation = "source-over";
        for (let k = 0; k <= 10; k++) x.fillRect(bx + Math.round((bw * k) / 10), en.y0 + this.lh - 3, 1, 4);
      } else if (en.kind === "barcode") {
        const mods = en.mods || [];
        const total = mods.reduce((a, b) => a + b, 0);
        const mw = Math.max(1, Math.floor((W - 2 * m) / total));
        let bx = Math.round((W - total * mw) / 2), bar = true;
        for (const mo of mods) { if (bar) x.fillRect(bx, en.y0 + 6, mo * mw, 70); bx += mo * mw; bar = !bar; }
      }
    }
    // 1비트 문턱 + 인쇄 농도: 느린 얼룩, 점 반점, 약한 발열 소자 하나
    const im = x.getImageData(0, 0, W, H), d = im.data;
    const gw = 24, gh = Math.ceil(H / 24) + 2, grid = new Float32Array((gw + 2) * gh);
    const r = K.rng(seed);
    for (let i = 0; i < grid.length; i++) grid[i] = r();
    const weak = [Math.floor(m + r() * (W - 2 * m)), Math.floor(m + r() * (W - 2 * m))];
    for (let yy = 0; yy < H; yy++) {
      const gy = yy / 24, iy = Math.floor(gy), fy = gy - iy;
      for (let xx = 0; xx < W; xx++) {
        const k = (yy * W + xx) * 4, a = d[k + 3];
        if (a < 120) { d[k + 3] = 0; continue; }
        const gx = (xx / W) * gw, ix = Math.floor(gx), fx = gx - ix;
        const v00 = grid[iy * (gw + 2) + ix], v10 = grid[iy * (gw + 2) + ix + 1], v01 = grid[(iy + 1) * (gw + 2) + ix], v11 = grid[(iy + 1) * (gw + 2) + ix + 1];
        const lowf = v00 + (v10 - v00) * fx + (v01 - v00) * fy + (v00 - v10 - v01 + v11) * fx * fy;
        let dens = 0.74 + 0.22 * lowf + (r() - 0.5) * 0.12;
        if (Math.abs(xx - weak[0]) < 2) dens *= 0.28;
        if (Math.abs(xx - weak[1]) < 1) dens *= 0.6;
        const red = d[k] > 128 && d[k + 1] < 100;
        const ink = red ? RED : INK;
        d[k] = ink[0]; d[k + 1] = ink[1]; d[k + 2] = ink[2];
        d[k + 3] = Math.round(255 * K.clamp(dens, 0.12, 1));
      }
    }
    x.putImageData(im, 0, 0);
    this.canvas = c; this.H = H;
    return c;
  }
}

// ---------------- 작품별 내용 ----------------
const readHold = (chars: number, min = 1.2) => Math.max(min, chars / 17 + 0.45);
const sceneText = (s: FlatScene): string => {
  switch (s.kind) {
    case "hook": return [s.label, s.value, s.line].join(" ");
    case "story": return [s.line, s.line2].join(" ");
    case "alert": return [s.title, s.body, s.line, s.line2].join(" ");
    case "terminal": return [s.command, s.line].join(" ");
    case "ending": return [s.line, s.line2, s.name].join(" ");
    default: return s.line;
  }
};
const unitJoin = (value: string, unit: string) => value + (unit === "%" ? "%" : unit ? (isWide(Array.from(unit)[0]) ? "" : " ") + unit : "");

type Mark = { si: number; from: number; to: number; key: number };

function fill(p: Paper, work: GenreWork, style: Style): Mark[] {
  const T = LABEL[work.locale];
  const marks: Mark[] = [];
  const S = (si: number, fn: () => number | undefined) => { const from = p.e.length; const key = fn(); marks.push({ si, from, to: p.e.length, key: key === undefined ? p.e.length - 1 : key }); };
  const { name, pitch } = splitTitle(work.title);
  // 머리말(영상 시작 전에 이미 찍혀 있다 — 첫 화면은 첫 장면)
  const head = () => {
    p.gap(10);
    p.text(name, { align: "c", sx: 2, sy: 2, w: 700, head: true });
    if (style !== "tickets" && pitch) p.text(pitch, { align: "c", head: true });
    p.text("@" + work.handle, { align: "c", head: true });
    p.rule("-", { head: true });
  };
  if (style !== "tickets") head();
  work.scenes.forEach((s, si) => {
    if (style === "tickets") {
      // 장면마다 한 장의 표: 표마다 머리 띠
      p.gap(26, { ticketStart: si });
      if (s.data === "sample") p.lr(name, T.sample, { w: 700, leader: " " }); else p.text(name, { w: 700 });
      if (s.data === "sample") p.text(T.sampleValues, { align: "l" });
      p.rule("-");
    }
    S(si, () => {
      let key: number | undefined;
      if (s.kind === "hook") {
        p.text(s.label, { w: 500 });
        const hero = p.text(s.value, { sx: 4, sy: 4, w: 700, align: style === "log" ? "l" : "r", red: !!s.alarm, hero: true })[0];
        p.text(s.line, { w: 700 });
        key = p.e.indexOf(hero);
      } else if (s.kind === "story") {
        p.gap(6);
        p.text(s.line, { w: 700 });
        p.gap(4);
        key = p.e.length - 1;
        p.text(s.line2, { align: "l" });
      } else if (s.kind === "flow") {
        s.nodes.forEach((n, i) => p.node(n, { last: i === s.nodes.length - 1, fill: i === s.nodes.length - 1, w: i === s.nodes.length - 1 ? 700 : 500 }));
        p.gap(6);
        p.text(s.line, {});
        key = p.e.length - 1;
      } else if (s.kind === "terminal") {
        p.text("$ " + s.command, { w: 700, inv: true });
        for (const o of s.output) {
          const mm = o.match(/^(.*?):\s*(.*)$/);
          const k = /surviv|\(\d+%\)/i.test(o);
          if (mm) p.lr(mm[1], mm[2], { w: k ? 700 : 500 }); else p.text(o, {});
          if (k) key = p.e.length - 1;
        }
        p.text(s.line, { w: 500 });
      } else if (s.kind === "stats") {
        let first: Ent | null = null;
        s.stats.forEach((st, i) => {
          const v = unitJoin(st.value, st.unit).replace(" /", "/");
          if (i === 0) { p.text(st.label, {}); first = p.lr("", v, { sx: 2, sy: 2, w: 700, leader: " " }); }
          else p.lr(st.label, v, {});
        });
        if (s.source) p.text(T.src + s.source, { align: "r" });
        if (style === "bill") p.rule("=");
        p.text(s.line, { w: 700 });
        if (first) key = p.e.indexOf(first);
      } else if (s.kind === "items") {
        if (style === "log") {
          const pct = s.items.every((it) => /%\s*$/.test(it.value));
          s.items.forEach((it) => { p.bar(it.label, it.value, (parseFloat(it.value) || 0) / 100, { red: !!it.alarm, w: it.alarm ? 700 : 500 }); });
          if (pct) p.text(s.data === "sample" ? T.pctSample : T.pct, { align: "l" });
          else if (s.data === "sample") p.text(T.sampleValues, { align: "l" });
        } else s.items.forEach((it) => p.lr(it.label, it.value === "✓" ? "OK" : it.value, {}));
        p.text(s.line, { w: 700 });
        key = p.e.length - 1;
      } else if (s.kind === "alert") {
        p.text("! " + s.title, { inv: true, red: true, w: 700 });
        key = p.e.length - 1;
        p.text(s.body, { w: 700, sx: 1, sy: 2, hiTarget: true });
        p.gap(6);
        p.text(s.line + " " + (s.line2 || ""), {});
      } else if (s.kind === "ending") {
        p.gap(8);
        p.text(s.line, { w: 700 });
        p.text(s.line2, {});
        p.gap(10);
        const nm = p.text(s.name, { align: "c", sx: 2, sy: 2, w: 700 })[0];
        key = p.e.indexOf(nm);
        if (style !== "tickets") { p.gap(8); p.barcode("@" + work.handle); }
      }
      return key;
    });
    if (style !== "tickets" && si < work.scenes.length - 1) p.rule(s.kind === "terminal" ? "=" : "-");
    if (style === "tickets") p.gap(30, { ticketEnd: si });
  });
  p.gap(style === "tickets" ? 30 : 56, { handoff: true });
  return marks;
}

/** 작품 모양으로 영수증 종류를 고른다 — %로 읽히는 목록은 기록지(막대), 명령 출력은 계산서, 갈고리 없이 시작하면 표 묶음. */
function pickStyle(work: GenreWork, seed: number): Style {
  const kinds = work.scenes.map((s) => s.kind);
  const pctItems = work.scenes.some((s) => s.kind === "items" && s.items.length > 0 && s.items.every((it) => /^\s*[\d.,]+\s*%\s*$/.test(it.value)));
  if (pctItems) return "log";
  if (kinds.includes("terminal")) return "bill";
  if (!kinds.includes("hook")) return "tickets";
  return (["bill", "tickets", "log"] as const)[seed % 3];
}

type Overlay =
  | { kind: "stamp"; at: number; row: number; x: number; rot: number; sc: number; sub: string }
  | { kind: "hi"; at: number; r0: number; r1: number; x0: number; x1: number; seed: number };
type Ticket = { si: number; r0: number; r1: number; cut: number; px: number; py: number; rot: number; stay?: boolean };

export const receipt: Genre = {
  id: "receipt",
  name: "Thermal receipt",
  ko: "영수증",
  koIdea: "가게 영수증 프린터가 한 줄씩 덜컥덜컥 찍어 내고, 끝에 찢어 주는 영화",
  enIdea: "A shop's receipt printer feeds the work out line by line, then tears it off",
  family: "B",
  fonts: ["redhatMono"],
  make(work, { seed, fonts }) {
    const FAM = fonts.redhatMono;
    const T = LABEL[work.locale];
    const mk: Mk = (w, h) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
    const style = pickStyle(work, seed);
    const R = K.rng(seed);
    const cfg = {
      bill: { W: 576, F: 22, s: 1.62, ground: "#1f2328", body: "#17181b", lid: "#26282c", rot: -2.2, x: -70, slotY: 300, z: 1 },
      log: { W: 576, F: 21, s: 1.5, ground: "#4b5862", body: "#e7e8e4", lid: "#d3d5d0", rot: 2.6, x: 170, slotY: 330, z: 1 },
      tickets: { W: 384, F: 21, s: 1.46, ground: "#121314", body: "#1d1e21", lid: "#2a2c30", rot: -1.2, x: -300, slotY: 300, z: 1.12 },
    }[style];
    const p = new Paper(mk, cfg.W, cfg.F, 18, FAM);
    const marks = fill(p, work, style);
    const paper = p.render(seed);
    const S = cfg.s;

    // 강조색 정책: 도장(앱 색이 없으면 보라 스탬프 잉크) 또는 형광펜(앱 색 그대로)
    const stampInk = "#4a3f9f";
    const hiInk = work.accent || null;

    // ---- 인쇄 일정: P(t) = 슬롯 밖으로 나온 줄 수 ----
    const segs: { t0: number; t1: number; r0: number; r1: number }[] = [];
    let Tm = 0, Rr = 0;
    const feed = (to: number, dur: number) => { segs.push({ t0: Tm, t1: Tm + dur, r0: Rr, r1: to }); Tm += dur; Rr = to; };
    const sceneAt: number[] = [], keyAt: (number | undefined)[] = [], ticketCut: number[] = [];
    let preroll = 0;
    const ents = p.e;
    const markOf = (i: number) => marks.find((q) => i >= q.from && i < q.to);
    const sceneHold = (sc: FlatScene) => {
      let h = readHold(readLen(sceneText(sc)));
      if (sc.kind === "terminal") h = Math.max(h, 3.4);
      if (sc.kind === "stats") h = Math.max(h, 2.6);
      if (sc.kind === "items") h = Math.max(h, 2.4);
      if (sc.kind === "flow") h = Math.min(h, 2.2);
      return Math.min(h, style === "tickets" ? 3.0 : 4.2);
    };
    let curScene = -1;
    for (let i = 0; i < ents.length; i++) {
      const en = ents[i];
      const mq = markOf(i);
      if (mq && mq.si !== curScene) { curScene = mq.si; sceneAt[curScene] = Tm; }
      const rows = en.y1 - en.y0;
      // 줄바꿈 덜컥: 한 줄이 2~5프레임에 나가고, 헤드는 다음 데이터를 기다린다
      const big = en.sy >= 2;
      const sp = (big ? 520 : 900) * (0.8 + R() * 0.45);
      if (en.kind === "gap" && en.handoff) { feed(en.y1, 0.38); continue; }
      if (en.kind === "gap" && en.ticketEnd !== undefined) { feed(en.y1, 0.12); ticketCut[en.ticketEnd] = Tm; Tm += 0.42; continue; }
      if (R() < 0.09 && rows > 20) { const mid = en.y0 + Math.round(rows * (0.3 + R() * 0.4)); feed(mid, (mid - en.y0) / sp); Tm += 0.12 + R() * 0.18; feed(en.y1, (en.y1 - mid) / sp); }
      else feed(en.y1, rows / sp);
      const pause = en.kind === "gap" ? 0.02 : big ? 0.16 + R() * 0.1 : 0.05 + R() * 0.07;
      Tm += pause;
      if (en.head) continue;
      if (mq && i === mq.key) { keyAt[mq.si] = Tm; if (mq.si === 0) preroll = Tm + 0.05; }
      if (mq && i === mq.to - 1) {
        Tm += sceneHold(work.scenes[mq.si]) * (mq.si === 0 ? 0.85 : 1);
        if (style === "tickets") Tm -= 0.25;
      }
    }
    // 첫 화면: 첫 장면이 이미 찍혀 있다
    const t0 = Math.max(0, preroll);
    for (const sg of segs) { sg.t0 -= t0; sg.t1 -= t0; }
    for (let i = 0; i < sceneAt.length; i++) { sceneAt[i] -= t0; const ka = keyAt[i]; if (ka !== undefined) keyAt[i] = ka - t0; }
    for (let i = 0; i < ticketCut.length; i++) if (ticketCut[i] !== undefined) ticketCut[i] -= t0;
    const printEnd = Tm - t0;
    const handoffStart = printEnd + 0.15;
    const duration = handoffStart + 2.4;
    const tearAt = handoffStart + 0.95;
    const starts = work.scenes.map((_, i) => Math.max(0, sceneAt[i] ?? 0));

    const P = (t: number) => {
      if (t <= segs[0].t0) return segs[0].r0;
      for (const sg of segs) {
        if (t < sg.t0) return sg.r0;
        if (t <= sg.t1) { const k = (t - sg.t0) / Math.max(1e-6, sg.t1 - sg.t0); return sg.r0 + Math.floor((k * (sg.r1 - sg.r0)) / 3) * 3; }
      }
      return segs[segs.length - 1].r1;
    };
    const printing = (t: number) => segs.some((sg) => t >= sg.t0 && t < sg.t1);

    // 종이에 붙는 덧칠: 예시 도장(계산서), 형광펜(앱 색), 표 묶음은 없음
    const overlays: Overlay[] = [];
    const firstSample = work.scenes.findIndex((s) => s.data === "sample");
    if (style === "bill" && firstSample >= 0) {
      const mq = marks.find((q) => q.si === firstSample)!;
      const en = ents[mq.key];
      // 도장은 큰 숫자 왼쪽 빈 종이에 찍힌다
      overlays.push({ kind: "stamp", at: (keyAt[firstSample] ?? sceneAt[firstSample]) + 0.7, row: (en.y0 + en.y1) / 2 + 4, x: 40 + R() * 30, rot: -0.12 + R() * 0.05, sc: 0.78, sub: T.sampleData });
      const mk2 = marks.find((q) => q.si === work.scenes.findIndex((s) => s.kind === "stats"));
      if (mk2) overlays.push({ kind: "stamp", at: (keyAt[mk2.si] ?? sceneAt[mk2.si]) + 0.5, row: (ents[mk2.key].y0 + ents[mk2.key].y1) / 2, x: 30 + R() * 40, rot: 0.07 + R() * 0.05, sc: 0.56, sub: T.sampleFigures });
    }
    if (hiInk) {
      work.scenes.forEach((s, si) => {
        if (s.kind !== "alert") return;
        const mq = marks.find((q) => q.si === si)!;
        for (let i = mq.from; i < mq.to; i++) {
          const en = ents[i];
          if (!en.hiTarget) continue;
          overlays.push({ kind: "hi", at: (keyAt[si] ?? sceneAt[si]) + 0.55 + (i - mq.from) * 0.05, r0: en.y0 + 10, r1: en.y1 - 6, x0: (en.tx0 ?? 0) - 8, x1: (en.tx1 ?? 0) + 10, seed: si * 7 + i });
        }
      });
    }

    // 표 묶음: 표마다 자리
    const tickets: Ticket[] = [];
    if (style === "tickets") {
      let start = 0;
      ents.forEach((en) => {
        if (en.ticketStart !== undefined) start = en.y0;
        if (en.ticketEnd !== undefined) tickets.push({ si: en.ticketEnd, r0: start, r1: en.y1, cut: ticketCut[en.ticketEnd], px: 0, py: 0, rot: 0 });
      });
      tickets.forEach((tk, i) => {
        tk.px = 610 + (R() - 0.5) * 50; tk.py = -310 + (R() - 0.5) * 40;
        tk.rot = (R() - 0.5) * 0.2 + (i % 2 ? 0.05 : -0.05);
      });
      // 마지막 표(끝 장면)는 프린터에 남는다 — 영상이 거기서 멎는다
      tickets[tickets.length - 1].stay = true;
    }

    // 고무도장: 두 줄 테두리 + 글자, 고르지 않은 잉크(미리 한 번 그린다)
    const stampCache: Record<string, HTMLCanvasElement> = {};
    for (const ov of overlays) {
      if (ov.kind !== "stamp" || stampCache[ov.sub]) continue;
      const c = mk(420, 170), x = c.getContext("2d")!;
      x.strokeStyle = x.fillStyle = stampInk;
      x.lineWidth = 7; x.beginPath(); x.roundRect(10, 10, 400, 150, 18); x.stroke();
      x.lineWidth = 2.5; x.beginPath(); x.roundRect(24, 24, 372, 122, 10); x.stroke();
      x.textAlign = "center";
      x.font = K.font(K.fitSize(x, T.sample, FAM, 700, 350, 84), FAM, 700); x.fillText(T.sample, 210, 104);
      // 한글 대체 글꼴은 획이 가늘다 — 도장 글씨답게 한 번 더 두껍게
      if (Array.from(T.sample).some(isWide)) { x.lineWidth = 3.5; x.strokeText(T.sample, 210, 104); }
      x.font = K.font(K.fitSize(x, ov.sub, FAM, 700, 350, 30), FAM, 700); x.fillText(ov.sub, 210, 140);
      const im = x.getImageData(0, 0, 420, 170), d = im.data, r = K.rng(seed + 77);
      for (let i = 0; i < d.length; i += 4) {
        const px = (i / 4) % 420, py = Math.floor(i / 4 / 420);
        const n = K.noise(px * 0.02 + py * 0.013, 5) * 0.5 + K.noise(py * 0.05, 8) * 0.3;
        d[i + 3] = d[i + 3] * K.clamp(0.7 + n + (r() - 0.5) * 0.45);
      }
      x.putImageData(im, 0, 0);
      stampCache[ov.sub] = c;
    }
    const drawStamp = (g: CanvasRenderingContext2D, sub: string) => { const c = stampCache[sub]; if (c) g.drawImage(c, -210, -85, 420, 170); };

    // ---- 그리기 도구 ----
    const zig = (g: CanvasRenderingContext2D, x0: number, x1: number, y: number, dir: number, amp = 7, stp = 14) => {
      for (let x = x0; x <= x1 + 0.1; x += stp) {
        g.lineTo(x, y);
        if (x + stp / 2 <= x1) g.lineTo(x + stp / 2, y + dir * amp);
      }
    };
    const W = cfg.W, HW = (W * S) / 2;
    // 프린터 좌표의 종이 띠: 줄 [r0,r1], 아래 끝이 y=yb(화면 단위)
    const drawStrip = (g: CanvasRenderingContext2D, r0: number, r1: number, yb: number, topEdge: string, botEdge: string, t: number) => {
      const yt = yb - (r1 - r0) * S;
      // 흐림 없이 겹친 채움으로 만든 그림자
      g.fillStyle = "rgba(0,0,0,0.12)";
      for (let k = 1; k <= 3; k++) g.fillRect(-HW + 5 * k, yt + 7 * k, W * S, yb - yt);
      g.beginPath();
      g.moveTo(-HW, yb);
      if (topEdge === "zig") { g.lineTo(-HW, yt + 7); zig(g, -HW, HW, yt + 7, -1); g.lineTo(HW, yt + 7); }
      else { g.lineTo(-HW, yt); g.lineTo(HW, yt); }
      if (botEdge === "zig") { g.lineTo(HW, yb - 7); for (let x = HW; x >= -HW - 0.1; x -= 14) { g.lineTo(x, yb - 7); if (x - 7 >= -HW) g.lineTo(x - 7, yb); } }
      else g.lineTo(HW, yb);
      g.closePath();
      g.fillStyle = PAPER; g.fill();
      g.save(); g.clip();
      const a = Math.max(r0, Math.floor(r0)), b = Math.min(p.H, Math.ceil(r1));
      if (b > a) g.drawImage(paper, 0, a, W, b - a, -HW, yb - (r1 - a) * S, W * S, (b - a) * S);
      // 덧칠(종이 좌표)
      for (const ov of overlays) {
        if (t < ov.at) continue;
        const row = ov.kind === "hi" ? ov.r0 : ov.row;
        if (row < r0 - 200 || row > r1 + 200) continue;
        const toY = (rr: number) => yb - (r1 - rr) * S;
        if (ov.kind === "hi" && hiInk) {
          const k = K.ease.outCubic(K.seg(t, ov.at, 0.42));
          const x0 = -HW + ov.x0 * S, x1 = x0 + (ov.x1 - ov.x0) * S * k;
          if (x1 - x0 < 2) continue;
          g.save(); g.globalCompositeOperation = "multiply"; g.fillStyle = K.rgba(hiInk, 0.5);
          g.beginPath();
          const yA = toY(ov.r0), yB = toY(ov.r1);
          const n = 18;
          for (let i = 0; i <= n; i++) { const xx = x0 + ((x1 - x0) * i) / n; g.lineTo(xx, yA + K.noise(i * 0.7, ov.seed + 3) * 3 - 2); }
          for (let i = n; i >= 0; i--) { const xx = x0 + ((x1 - x0) * i) / n; g.lineTo(xx, yB + K.noise(i * 0.7, ov.seed + 9) * 3 + 2); }
          g.closePath(); g.fill();
          // 펜이 닿고 떨어진 끝은 겹쳐서 진하다
          g.fillStyle = K.rgba(hiInk, 0.22); g.fillRect(x0, yA - 2, 10, yB - yA + 4); if (k > 0.98) g.fillRect(x1 - 9, yA - 2, 9, yB - yA + 4);
          g.restore();
        } else if (ov.kind === "stamp") {
          const k = K.seg(t, ov.at, 0.14);
          const sc = 1 + (1 - K.ease.outQuart(k)) * 0.22;
          g.save();
          g.translate(-HW + ov.x * S + 170 * ov.sc, toY(ov.row));
          g.rotate(ov.rot); g.scale(sc * ov.sc, sc * ov.sc);
          g.globalAlpha = K.clamp(k * 3) * 0.86;
          g.globalCompositeOperation = "multiply";
          drawStamp(g, ov.sub);
          g.restore();
        }
      }
      g.restore();
    };
    const drawPrinter = (g: CanvasRenderingContext2D, t: number) => {
      const bw = HW + 74;
      g.fillStyle = "rgba(0,0,0,0.18)";
      for (let k = 1; k <= 3; k++) g.fillRect(-bw + 6 * k, 6 * k, bw * 2, 700);
      g.fillStyle = cfg.body; g.fillRect(-bw, 0, bw * 2, 700);
      g.fillStyle = cfg.lid; g.fillRect(-bw, 0, bw * 2, 16);
      g.fillStyle = "#08090a"; g.fillRect(-HW - 10, -2, W * S + 20, 7);
      // 톱니 절단 날
      g.fillStyle = style === "log" ? "#9da1a4" : "#7d8186";
      g.beginPath(); g.moveTo(-HW - 14, 6);
      for (let x = -HW - 14; x < HW + 14; x += 9) { g.lineTo(x + 4.5, -3); g.lineTo(x + 9, 6); }
      g.lineTo(HW + 14, 12); g.lineTo(-HW - 14, 12); g.closePath(); g.fill();
      // 급지 단추 + 상태 창
      g.fillStyle = style === "log" ? "#c4c7c2" : "#303236";
      g.beginPath(); g.roundRect(bw - 120, 60, 72, 30, 6); g.fill();
      g.fillStyle = printing(t) ? "#3c9a5f" : (style === "log" ? "#9fb8a4" : "#2b4a36");
      g.fillRect(bw - 160, 70, 14, 10);
    };
    const pullEase = K.ease.bezier(0.3, 0, 0.1, 1);
    const holdEase = K.ease.bezier(0.2, 0, 0, 1);

    return {
      duration,
      starts,
      render(g, t) {
        g.fillStyle = cfg.ground; g.fillRect(0, 0, K.W, K.H);
        const P_ = P(t);
        // 카메라: 고정, 멈춤에서만 이유 있는 밀어 넣기; 인쇄 중엔 프린터 떨림
        let hold = 0;
        const sc = work.scenes;
        for (let i = 0; i < sc.length; i++) {
          const ka = keyAt[i];
          if (ka !== undefined && t > ka) hold = holdEase(K.seg(t, ka, 2.6)) * (i % 2 ? 0.05 : 0.035) * (sceneAt[i + 1] !== undefined && t > sceneAt[i + 1] ? 0 : 1);
        }
        const shake = printing(t) ? K.noise(t * 40, 11) * 0.8 : 0;
        const ho = K.seg(t, handoffStart - 0.4, 2.2);
        const pull = pullEase(ho);
        const z = cfg.z * (1 + hold) * (1 - (style === "tickets" ? 0.0 : 0.16) * pull);
        g.save();
        g.translate(800 + cfg.x * 0.12, 450 + shake);
        g.scale(z, z);
        g.rotate((cfg.rot * Math.PI) / 180);
        g.translate(cfg.x, cfg.slotY - (style === "tickets" ? 0 : pull * 80) - 60 * hold * 6);
        // ---- 떨어진 표 더미(지금 나오는 띠 아래) ----
        if (style === "tickets") {
          for (const tk of tickets) {
            if (tk.stay || t < tk.cut) continue;
            const k = K.seg(t, tk.cut + 0.05, 0.62);
            const e = K.ease.outCubic(k);
            const len = (tk.r1 - tk.r0) * S;
            const fromX = 0, fromY = -len / 2, toX = tk.px, toY = tk.py;
            const midX = (fromX + toX) / 2, midY = Math.min(fromY, toY) - 150;
            const x = (1 - e) * (1 - e) * fromX + 2 * (1 - e) * e * midX + e * e * toX;
            const y = (1 - e) * (1 - e) * fromY + 2 * (1 - e) * e * midY + e * e * toY;
            const lag = K.ease.spring(Math.max(0, t - tk.cut - 0.12), 0.7, 0.25);
            const lift = Math.sin(Math.PI * K.clamp(k)) * 18;
            g.save();
            g.translate(x, y);
            g.rotate(tk.rot * lag + (1 - lag) * 0.12 * Math.sin(k * Math.PI));
            g.fillStyle = "rgba(0,0,0,0.25)";
            g.fillRect(-HW + 8 + lift, -len / 2 + 10 + lift, W * S, len);
            drawStrip(g, tk.r0, tk.r1, len / 2, "flat", "flat", t);
            g.restore();
          }
        }
        // ---- 슬롯에서 나오는 띠 ----
        let r0 = 0, top = "zig", bot = "flat";
        if (style === "tickets") {
          // 자른 뒤 다음 표가 아직 안 나왔으면 프린터 입술만
          top = "flat";
          const prevCut = tickets.filter((tk) => !tk.stay && t >= tk.cut).length;
          r0 = prevCut ? tickets[prevCut - 1].r1 : 0;
        }
        const vis = (cfg.slotY + 450) / (S * z) + 60;
        let lift = 0, tilt = 0;
        if (style !== "tickets" && t > tearAt) {
          const k = t - tearAt;
          lift = K.ease.spring(k, 0.75, 0.18) * 46;
          tilt = K.ease.spring(Math.max(0, k - 0.05), 0.9, 0.22) * (style === "log" ? -0.022 : 0.018);
          bot = "zig";
        }
        g.save();
        if (lift) { g.translate(0, -lift); g.rotate(tilt); }
        const rr0 = Math.max(r0, P_ - vis);
        if (P_ > r0 + 1) drawStrip(g, rr0 > r0 ? rr0 : r0, P_, 0, rr0 > r0 ? "flat" : top, bot, t);
        // 넘김 줄 — 종이 끝 빈 자리에 찍힌다
        const hp = K.seg(t, handoffStart, 2.4);
        if (hp > 0) {
          const hy = -(P_ - (p.H - 40 - (style === "tickets" ? 30 : 56))) * S + 30 * S * 0.25;
          K.handoff(g, hp, { ink: "rgb(" + INK.join(",") + ")", family: FAM, size: Math.round(cfg.F * S * 0.92), x: -HW + 18 * S, y: hy + 6, handle: work.handle });
        }
        g.restore();
        drawPrinter(g, t);
        g.restore();
        K.grain(g, t, 0.05, seed, 12, "overlay");
      },
    };
  },
};
