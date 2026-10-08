// 자판기 — 작품을 자판기로 판다(필름 실험실 2라운드, 2026-10-08).
// 세계의 규칙: 기계는 기계가 하는 일만 한다 — 점 화면은 칸 단위로 글자를 찍고, 램프는 데워지듯 켜지고,
// 버튼은 눌리고, 코일은 한 바퀴(12fps 모터 걸음) 돌고, 물건은 중력으로 떨어진다. 카메라는 기계 앞에 선 사람의 눈.
// 장면의 자리: 갈고리 = 큰 진열 칸과 그 가격 표시 · 이야기 = 기계에 테이프로 붙인 손글씨 쪽지 · 흐름 = "이용 방법" 판
// (단계 램프가 차례로) 또는 상품 줄의 선택 램프 · 항목 = 상품 한 줄(값은 칸마다 가격 표시) · 터미널 = 점 화면의 점검 모드 ·
// 경고 = 램프 문구(품절처럼) + 점 화면 · 수치 = 한 번 사기(번호 입력 → 코일 → 낙하 → 뒷면 성분표) · 끝 = 간판이 켜지고 기계 전체로.
// 예시 자료 = 견본 상품의 "견본" 스티커 · 점 화면의 (예시) · 성분표 각주.
// 점 글꼴(Tiny5)에 없는 글자(한글 등)는 만들 때 대체 글꼴을 점 칸 크기로 찍어 문턱으로 자른다 — 매끈한 글자가 아니라 진짜 점.
import type { FlatScene, Genre, GenreWork } from "./types";
import * as K from "./kit";

type Mk = (w: number, h: number) => HTMLCanvasElement;
type Rect = { x: number; y: number; w: number; h: number };
type Style = "snack" | "drink" | "parts";
type Sc<K2 extends FlatScene["kind"]> = Extract<FlatScene, { kind: K2 }>;

const LABEL = {
  en: { sample: "SAMPLE", exact: "EXACT CHANGE", soldOut: "SOLD OUT", how: "How it works", push: "PUSH", facts: "Facts", sampleFig: "* Sample figures.", source: "Source: ", service: "SERVICE", serviceSample: "SERVICE - sample data", sampleRow: "(sample)", free: "FREE" },
  ko: { sample: "견본", exact: "잔돈 없음", soldOut: "품절", how: "이용 방법", push: "미세요", facts: "성분표", sampleFig: "* 예시 수치입니다.", source: "출처: ", service: "점검 모드", serviceSample: "점검 모드 - 예시", sampleRow: "(예시)", free: "무료" },
};

const isWide = (c: string) => {
  const n = c.codePointAt(0) || 0;
  return (n >= 0x1100 && n <= 0x115f) || (n >= 0x2e80 && n <= 0xa4cf) || (n >= 0xac00 && n <= 0xd7a3) || (n >= 0xf900 && n <= 0xfaff) || (n >= 0xff00 && n <= 0xff60) || (n >= 0xffe0 && n <= 0xffe6) || n >= 0x1f300;
};
const readLen = (s: string) => Array.from(s).reduce((a, c) => a + (isWide(c) ? 1.7 : 1), 0);
const readHold = (chars: number, min = 1.2) => Math.max(min, chars / 17 + 0.45);
const clean = (s: string) => String(s ?? "").replace(/[—–]/g, "-").replace(/→/g, ">").replace(/·/g, "-").replace(/✓/g, "OK").replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
const MOVE = K.ease.bezier(0.34, 0, 0.12, 1); // 카메라: 빨리 떠나 길게 내려앉는다(대칭 곡선 금지)

/** 제목 "이름 · 한 줄 소개" → 이름. */
function nameOf(t: string): string {
  for (const sep of [" · ", " — ", " | "]) { const i = t.indexOf(sep); if (i > 0) return t.slice(0, i).trim(); }
  return t.trim();
}

// ---------- 점 화면 래스터 ----------
const DOT = 8; // 미리 그린 줄 캔버스의 점 하나 = 8px
type Line = { text: string; w: number; rows: number; bits: Uint8Array; xs: number[] };

// ---------- 기계 배치(기계 단위) ----------
type Layout = {
  M: { w: number; h: number }; sign: Rect; slogan: Rect; glass: Rect; rows: number; cols: number; pack: "bag" | "can" | "box"; coil: boolean;
  panel?: Rect; display: Rect; lamps: Rect; keypad: Rect | null; coin: Rect; bill: Rect; placard: Rect; note?: Rect & { rot: number }; tray: Rect; kick: Rect; dispCols: number;
};
const LAYOUT: Record<Style, () => Layout> = {
  snack: () => ({
    M: { w: 1300, h: 1900 }, sign: { x: 40, y: 30, w: 1220, h: 124 }, slogan: { x: 40, y: 160, w: 1220, h: 52 },
    glass: { x: 50, y: 228, w: 860, h: 1160 }, rows: 4, cols: 5, pack: "bag", coil: true,
    panel: { x: 930, y: 228, w: 340, h: 1160 }, display: { x: 952, y: 252, w: 296, h: 112 }, lamps: { x: 952, y: 378, w: 296, h: 42 },
    keypad: { x: 985, y: 446, w: 230, h: 290 }, coin: { x: 985, y: 760, w: 230, h: 60 }, bill: { x: 985, y: 836, w: 230, h: 96 },
    placard: { x: 952, y: 962, w: 296, h: 400 }, tray: { x: 90, y: 1440, w: 780, h: 240 }, kick: { x: 30, y: 1736, w: 1240, h: 140 }, dispCols: 130,
  }),
  drink: () => ({
    M: { w: 1300, h: 1900 }, sign: { x: 40, y: 30, w: 1220, h: 118 }, slogan: { x: 40, y: 152, w: 1220, h: 48 },
    glass: { x: 50, y: 214, w: 1200, h: 790 }, rows: 2, cols: 5, pack: "can", coil: false,
    display: { x: 880, y: 1036, w: 330, h: 112 }, lamps: { x: 880, y: 1160, w: 330, h: 42 }, keypad: null,
    coin: { x: 920, y: 1226, w: 250, h: 60 }, bill: { x: 920, y: 1300, w: 250, h: 92 }, placard: { x: 80, y: 1036, w: 470, h: 360 },
    note: { x: 590, y: 1046, w: 250, h: 270, rot: 0.04 }, tray: { x: 200, y: 1460, w: 900, h: 230 }, kick: { x: 30, y: 1736, w: 1240, h: 140 }, dispCols: 150,
  }),
  parts: () => ({
    M: { w: 1150, h: 2000 }, sign: { x: 40, y: 30, w: 1070, h: 120 }, slogan: { x: 40, y: 156, w: 1070, h: 50 },
    glass: { x: 50, y: 222, w: 1050, h: 920 }, rows: 3, cols: 5, pack: "box", coil: true,
    display: { x: 70, y: 1172, w: 420, h: 116 }, lamps: { x: 70, y: 1300, w: 420, h: 42 }, keypad: { x: 560, y: 1166, w: 300, h: 222 },
    coin: { x: 900, y: 1172, w: 190, h: 66 }, bill: { x: 900, y: 1256, w: 190, h: 112 }, placard: { x: 70, y: 1418, w: 420, h: 330 },
    tray: { x: 540, y: 1440, w: 550, h: 270 }, kick: { x: 30, y: 1840, w: 1090, h: 130 }, dispCols: 190,
  }),
};

/** 작품 모양으로 기계를 고른다 — 명령 출력이 있으면 과자 자판기, %로 읽히는 항목·갈고리면 부품 자판기, 갈고리 없이 시작하면 음료 자판기. */
function pickStyle(work: GenreWork, seed: number): Style {
  const kinds = work.scenes.map((s) => s.kind);
  if (kinds.includes("terminal")) return "snack";
  const pct = work.scenes.some((s) => s.kind === "items" && s.items.length > 0 && s.items.every((it) => /^\s*[\d.,]+\s*%\s*$/.test(it.value)));
  if (pct && kinds.includes("hook")) return "parts";
  if (!kinds.includes("hook")) return "drink";
  return (["snack", "drink", "parts"] as const)[seed % 3];
}

type Prod = {
  kind: "hero" | "stat" | "item" | "node" | "out" | "name";
  label: string; tag: string; col: string; tagline?: string; alarm?: boolean; sample?: boolean; statIdx?: number;
  fs?: number; lines?: string[]; tfs?: number; tlines?: string[]; tagL?: Line;
};
type Cell = { r: number; c: number; span: number; prod: Prod; id: number; code: string; tilt: number; coil: number };
type Row = { key: string; talk: string | null; flow: Sc<"flow"> | null; cells: Cell[] };
type DRow = { im: { L: Line; c: HTMLCanvasElement }; inv: boolean; y: number; t0: number; dur: number; x: number };
type Vend = { ce: Cell; t0: number; t1: number; tf: number; tl: number; face: { kind: "facts"; s: Sc<"stats"> } | { kind: "front"; s: Sc<"ending"> } };
type Cam = { t0: number; t1: number; r: Rect; to?: { x: number; y: number; z: number }; from?: { x: number; y: number; z: number } };

export const vending: Genre = {
  id: "vending",
  name: "Vending machine",
  ko: "자판기",
  koIdea: "작품을 자판기로 판다 — 칸마다 기능이 진열되고, 번호를 누르면 코일이 한 바퀴 돌아 툭 떨어지는 영화",
  enIdea: "The work is sold from a vending machine — features in the slots, a code keyed in, the coil turns and the item drops",
  family: "D",
  fonts: ["tiny5", "libreFranklin", "permanentMarker", "pixelKo"],
  make(work, { seed, fonts }) {
    const LED = fonts.tiny5, LAB = fonts.libreFranklin, MARK = fonts.permanentMarker, PIX = fonts.pixelKo || fonts.tiny5;
    const L_ = LABEL[work.locale];
    const KO = work.locale === "ko";
    const mk: Mk = (w, h) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
    const R = K.rng(seed);
    const style = pickStyle(work, seed);
    const Lo = LAYOUT[style]();
    const { M, glass } = Lo;
    const S = work.scenes;
    const mx = mk(8, 8).getContext("2d")!;
    const title = nameOf(work.title);

    // ---------- 점 글꼴 래스터: Tiny5(8px 설계 격자, 80px에서 한 점 = 10px) + 없는 글자는 대체 글꼴을 점 칸 크기로 ----------
    // 한 줄의 점 행: 영어 9행(기준선 6), 한국어 13행(한글 12행, 라틴 글자는 기준선 10에 앉는다)
    const LROWS = KO ? 13 : 9, BASE = KO ? 10 : 6;
    const RX = mk(1200, 140).getContext("2d", { willReadFrequently: true })!;
    const glyphCache = new Map<string, { w: number; cols: Uint8Array[] }>();
    const tinyHas = (ch: string) => { const n = ch.codePointAt(0) || 0; return n >= 0x20 && n <= 0x7e; };
    const glyph = (ch: string) => {
      const hit = glyphCache.get(ch);
      if (hit) return hit;
      let out: { w: number; cols: Uint8Array[] };
      if (ch === " ") out = { w: 3, cols: [new Uint8Array(LROWS), new Uint8Array(LROWS), new Uint8Array(LROWS)] };
      else if (tinyHas(ch)) {
        RX.clearRect(0, 0, 1200, 140);
        RX.font = K.font(80, LED, 400); RX.fillStyle = "#fff"; RX.textBaseline = "alphabetic";
        RX.fillText(ch, 0, 60);
        const w = Math.max(1, Math.round(RX.measureText(ch).width / 10));
        const d = RX.getImageData(0, 0, w * 10, 90).data;
        const cols: Uint8Array[] = [];
        for (let c = 0; c < w; c++) {
          const col = new Uint8Array(LROWS);
          for (let r = 0; r < 9; r++) { const rr2 = r + (BASE - 6); if (rr2 >= 0 && rr2 < LROWS) col[rr2] = d[((r * 10 + 5) * w * 10 + c * 10 + 5) * 4 + 3] > 128 ? 1 : 0; }
          cols.push(col);
        }
        out = { w, cols };
      } else {
        // 대체 글꼴을 실제 점 크기로(4배 찍어 4×4 평균 → 문턱)
        const SS = 4, CH = LROWS - 1, wide = isWide(ch);
        const gw = wide ? CH - 1 : Math.ceil(CH * 0.55);
        RX.clearRect(0, 0, 1200, 140);
        RX.font = K.font(CH * SS * (wide ? 0.98 : 0.9), PIX, 400); RX.fillStyle = "#fff"; RX.textBaseline = "alphabetic";
        const mw = RX.measureText(ch).width;
        RX.fillText(ch, Math.max(0, (gw * SS - mw) / 2), CH * SS * 0.86);
        const d = RX.getImageData(0, 0, gw * SS, LROWS * SS).data;
        const cols: Uint8Array[] = [];
        for (let gx = 0; gx < gw; gx++) {
          const col = new Uint8Array(LROWS);
          for (let gy = 0; gy < CH; gy++) {
            let s = 0;
            for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) s += d[((gy * SS + j) * gw * SS + gx * SS + i) * 4 + 3];
            col[gy] = s / (SS * SS * 255) >= 0.3 ? 1 : 0;
          }
          cols.push(col);
        }
        cols.push(new Uint8Array(LROWS)); // 글자 사이 한 점
        out = { w: gw + 1, cols };
      }
      glyphCache.set(ch, out);
      return out;
    };
    const dotsW = (s: string) => Array.from(clean(s)).reduce((a, ch) => a + glyph(ch).w, 0);
    const rasterLine = (text0: string): Line => {
      const text = clean(text0);
      const chars = Array.from(text);
      const xs = [0];
      const colsAll: Uint8Array[] = [];
      for (const ch of chars) { const gph = glyph(ch); for (const c of gph.cols) colsAll.push(c); xs.push(colsAll.length); }
      const w = Math.max(1, Math.min(320, colsAll.length));
      const bits = new Uint8Array(w * LROWS);
      for (let c = 0; c < w; c++) for (let r = 0; r < LROWS; r++) bits[r * w + c] = colsAll[c] ? colsAll[c][r] : 0;
      return { text: chars.join(""), w, rows: LROWS, bits, xs: xs.map((v) => Math.min(v, w)) };
    };
    // 큰 가격 표시: 보통 고딕을 점 격자에 찍는다(cap = capDots)
    const BX = mk(3000, 400).getContext("2d", { willReadFrequently: true })!;
    const rasterBig = (text0: string, capDots: number): Line => {
      const text = clean(text0);
      const fs = (capDots / 0.72) * 10, rowsN = Math.ceil(capDots * 1.36) + 1;
      BX.clearRect(0, 0, 3000, 400);
      BX.font = K.font(fs, LAB, 700); BX.fillStyle = "#fff"; BX.textBaseline = "alphabetic";
      BX.fillText(text, 10, (capDots + 1) * 10);
      const w = Math.min(290, Math.ceil(BX.measureText(text).width / 10) + 2);
      const d = BX.getImageData(0, 0, w * 10, rowsN * 10).data;
      const bits = new Uint8Array(w * rowsN);
      for (let r = 0; r < rowsN; r++) for (let c = 0; c < w; c++) bits[r * w + c] = d[((r * 10 + 5) * w * 10 + c * 10 + 5) * 4 + 3] > 110 ? 1 : 0;
      return { text, w, bits, xs: [0, w], rows: rowsN };
    };
    /** 점 폭 안에서 띄어쓰기로 줄바꿈 — 낱말이 줄보다 길면 글자로 끊는다. */
    const wrapDots = (text: string, max: number) => {
      const out: string[] = [];
      let cur = "";
      for (let w of clean(text).split(/\s+/)) {
        if (!w) continue;
        const nx = cur ? cur + " " + w : w;
        if (dotsW(nx) <= max) { cur = nx; continue; }
        if (cur) { out.push(cur); cur = ""; }
        while (dotsW(w) > max) {
          const ch = Array.from(w);
          let k = ch.length - 1;
          while (k > 1 && dotsW(ch.slice(0, k).join("")) > max) k--;
          out.push(ch.slice(0, k).join(""));
          w = ch.slice(k).join("");
        }
        cur = w;
      }
      if (cur) out.push(cur);
      return out;
    };
    // 켜진 점 캔버스(inv = 열쇠 줄: 점선 밑줄)
    const lineCanvas = (L: Line, lit: string, inv: boolean, fw: number) => {
      const Wd = inv ? fw - 2 : L.w, Ht = L.rows;
      const c = mk(Wd * DOT, Ht * DOT), x = c.getContext("2d")!;
      x.fillStyle = lit;
      x.beginPath();
      for (let r = 0; r < Ht; r++) for (let cc = 0; cc < Wd; cc++) {
        let on = cc < L.w && L.bits[r * L.w + cc] === 1;
        if (inv && r === Ht - 1) on = cc % 2 === 0;
        if (!on) continue;
        x.moveTo(cc * DOT + DOT / 2 + DOT * 0.46, r * DOT + DOT / 2);
        x.arc(cc * DOT + DOT / 2, r * DOT + DOT / 2, DOT * 0.46, 0, Math.PI * 2);
      }
      x.fill();
      return c;
    };
    /** 낱말 단위 줄바꿈(캔버스 글꼴) — 한 낱말이 줄보다 길면 글자로 끊는다. */
    const wrapW = (text: string, font: string, maxW: number) => {
      mx.font = font;
      const out: string[] = [];
      for (const ln0 of K.wrap(mx, text, maxW)) {
        let ln = ln0;
        while (mx.measureText(ln).width > maxW && Array.from(ln).length > 1) {
          const ch = Array.from(ln);
          let k = ch.length - 1;
          while (k > 1 && mx.measureText(ch.slice(0, k).join("")).width > maxW) k--;
          out.push(ch.slice(0, k).join(""));
          ln = ch.slice(k).join("");
        }
        out.push(ln);
      }
      return out;
    };

    // ---------- 색(작품의 대표색에서) ----------
    const acc = work.accent, alarm = work.alarm || "#ff4b3e";
    const A_ = acc || "#4a3f9f";
    const pal = {
      snack: { cab: "#22252b", cabHi: "#2e323a", cabLo: "#17191d", inside: "#0f1114", wall: "#2a302e", floor: "#1b1f1e", led: "#6cf0c4", ledOff: "rgba(108,240,196,0.075)", brand: "#4a3f9f", signInk: "#f1f2f4", band: "#4a3f9f", talkInk: "#f1f2f4", lampOn: "#6cf0c4", trim: "#3a3e47" },
      drink: { cab: A_, cabHi: K.mix(A_, "#ffffff", 0.22), cabLo: K.mix(A_, "#000000", 0.28), inside: "#eef0f2", wall: "#121925", floor: "#0b0f16", led: "#ff5a3c", ledOff: "rgba(255,90,60,0.085)", brand: "#1c2738", signInk: "#1c2738", band: "#1c2738", talkInk: "#ffffff", lampOn: "#ff5a3c", trim: "#f5f5f3" },
      parts: { cab: "#e6e9ea", cabHi: "#f4f5f5", cabLo: "#c4c9cc", inside: "#2a3035", wall: "#737b7f", floor: "#4b5256", led: "#ffa51c", ledOff: "rgba(255,165,28,0.09)", brand: A_, signInk: "#ffffff", band: A_, talkInk: "#ffffff", lampOn: "#ffa51c", trim: A_ },
    }[style];
    const H0 = acc ? K.oklch(acc)[2] : 285;
    const packCols = {
      snack: ["#1f6f5c", "#c9cdd3", "#e8eaed", "#2b2e35", "#7b2d3b"],
      drink: ["#1c2738", "#f4f5f6", "#1c2738", "#d8dde3", K.fromOklch(0.55, 0.12, H0 + 180)],
      parts: ["#24282b", "#f3f4f4", "#24282b", "#f3f4f4", "#24282b"],
    }[style];

    // ---------- 유리 안 상품 ----------
    const cols = Lo.cols, rows = Lo.rows;
    const slotW = glass.w / cols;
    const TAG = style === "drink" ? 52 : 44, talkH = style === "drink" ? 38 : 34;
    const ending = S.find((s): s is Sc<"ending"> => s.kind === "ending");
    const freeish = ending ? /free|\$0|무료/i.test([ending.line, ending.line2].join(" ")) : false;
    const nameProd = (): Prod => ({ kind: "name", label: title, tag: style === "drink" && freeish ? L_.free : "", col: pal.brand });
    const unitOf = (st: { value: string; unit: string }) => st.value + (st.unit === "%" ? "%" : st.unit ? (st.unit[0] === "/" || isWide(st.unit[0]) ? st.unit : " " + st.unit) : "");
    const hook = S.find((s): s is Sc<"hook"> => s.kind === "hook");
    const stats = S.find((s): s is Sc<"stats"> => s.kind === "stats");
    const items = S.find((s): s is Sc<"items"> => s.kind === "items");
    const flows = S.filter((s): s is Sc<"flow"> => s.kind === "flow");
    const term = S.find((s): s is Sc<"terminal"> => s.kind === "terminal");
    const story = S.find((s): s is Sc<"story"> => s.kind === "story");
    type RowDef = { key: string; talk?: string; flow?: Sc<"flow">; cells: { span?: number; prod: Prod }[] };
    const rowDefs: RowDef[] = [];
    if (hook) {
      const cells: RowDef["cells"] = [{ span: 2, prod: { kind: "hero", label: hook.label, tagline: hook.line, tag: hook.value, alarm: !!hook.alarm, sample: hook.data === "sample", col: hook.alarm ? alarm : packCols[3] } }];
      if (stats) stats.stats.slice(0, cols - 2).forEach((st, i) => cells.push({ prod: { kind: "stat", label: st.label, tag: unitOf(st), sample: stats.data === "sample", col: packCols[i % 3], statIdx: i } }));
      rowDefs.push({ cells, key: "hook" });
    }
    if (items) rowDefs.push({ key: "items", talk: items.line, cells: items.items.slice(0, cols).map((it, i) => ({ prod: { kind: "item" as const, label: it.label, tag: it.value === "✓" ? "OK" : it.value, alarm: !!it.alarm, sample: items.data === "sample", col: it.alarm ? alarm : packCols[i % packCols.length] } })) });
    flows.slice(1).forEach((f) => rowDefs.push({ key: "flow", flow: f, talk: f.line, cells: f.nodes.slice(0, cols).map((n, i) => ({ prod: { kind: "node" as const, label: n, tag: "", col: packCols[(i + 1) % packCols.length] } })) }));
    if (stats && !hook) rowDefs.push({ key: "stats", cells: stats.stats.slice(0, cols).map((st, i) => ({ prod: { kind: "stat" as const, label: st.label, tag: unitOf(st), sample: stats.data === "sample", col: packCols[i % 3], statIdx: i } })) });
    if (term) rowDefs.push({ key: "term", cells: term.output.slice(0, cols).map((o, i) => { const m = o.match(/^(.*?):\s*(.*)$/); return { prod: { kind: "out" as const, label: m ? m[1] : o, tag: m ? m[2].replace(/\s*\(.*\)/, "") : "", col: i % 2 ? packCols[1] : packCols[3] } }; }) });
    if (flows[0]) rowDefs.push({ key: "nodes", cells: flows[0].nodes.slice(0, cols).map((n) => ({ prod: { kind: "node" as const, label: n, tag: "", col: packCols[2] } })) });
    while (rowDefs.length < rows) rowDefs.push({ key: "name", cells: [] });
    rowDefs.length = rows;
    let cid = 0;
    const grid: Row[] = rowDefs.map((rd, r) => {
      const cells: Cell[] = [];
      let c = 0;
      const add = (span: number, prod: Prod) => { cells.push({ r, c, span, prod, id: cid++, code: String.fromCharCode(65 + r) + (c + 1), tilt: (R() - 0.5) * 0.05, coil: R() * Math.PI * 2 }); c += span; };
      for (const ce of rd.cells) { if (c + (ce.span || 1) > cols) break; add(ce.span || 1, ce.prod); }
      while (c < cols) add(1, nameProd());
      return { key: rd.key, talk: rd.talk || null, flow: rd.flow || null, cells };
    });
    const allCells = grid.flatMap((g) => g.cells);
    // 갈고리 줄은 더 높다: 큰 상품 + 큰 가격 표시
    const heroRow = grid.findIndex((g) => g.key === "hook");
    const wts = grid.map((_, r) => (r === heroRow ? 1.42 : 1));
    const rowHs = wts.map((w) => ((glass.h - 40) * w) / wts.reduce((a, b) => a + b, 0));
    const tagHs = grid.map((g, r) => (r === heroRow ? 104 : g.key === "items" ? TAG + 18 : TAG));
    const rowTop = (r: number) => glass.y + 40 + rowHs.slice(0, r).reduce((a, b) => a + b, 0);
    const cellRect = (ce: Cell): Rect => ({ x: glass.x + ce.c * slotW, y: rowTop(ce.r), w: slotW * ce.span, h: rowHs[ce.r] });
    const shelfY = (r: number) => rowTop(r) + rowHs[r] - tagHs[r] - talkH;
    const packSize = (ce: Cell) => {
      const room = rowHs[ce.r] - tagHs[ce.r] - talkH;
      if (Lo.pack === "bag") return { w: slotW * ce.span * (ce.span > 1 ? 0.88 : 0.8), h: room * 0.84 };
      if (Lo.pack === "can") return { w: slotW * 0.58, h: room * 0.84 };
      return { w: slotW * ce.span * (ce.span > 1 ? 0.88 : 0.8), h: room * 0.7 };
    };
    allCells.forEach((ce) => {
      const p = ce.prod, sz = packSize(ce);
      const inner = Lo.pack === "box" ? sz.w * 0.62 - 20 : sz.w * 0.84 - 8;
      const big = p.kind === "hero";
      let fs = big ? (Lo.pack === "box" ? 30 : 25) : p.kind === "name" ? (Lo.pack === "can" ? 20 : 22) : Lo.pack === "can" ? 18 : 17;
      if (p.kind === "name") fs = Math.min(fs, K.fitSize(mx, p.label, LAB, 900, inner, fs, 9));
      const maxL = big ? 2 : 3;
      // 낱말이 칸보다 길면(글자로 끊기 전에) 먼저 글자를 줄인다
      const longest = (f: number) => { mx.font = K.font(f, LAB, 800); return Math.max(...p.label.split(/\s+/).map((w) => mx.measureText(w).width)); };
      while (fs > 11 && longest(fs) > inner) fs -= 1;
      let lines = wrapW(p.label, K.font(fs, LAB, 800), inner);
      while (lines.length > maxL && fs > 10) { fs -= 1; lines = wrapW(p.label, K.font(fs, LAB, 800), inner); }
      p.fs = fs; p.lines = lines;
      if (p.tagline) { p.tfs = big ? 17 : 14; p.tlines = wrapW(p.tagline, K.font(p.tfs, LAB, 600), inner); }
      if (p.tag) p.tagL = big ? rasterBig(p.tag, 15) : p.kind === "item" && Array.from(p.tag).length <= 5 ? rasterBig(p.tag, 9) : rasterLine(p.tag);
    });
    // 견본 스티커는 장면마다 한 번(영상이 보는 그 상품에만)
    allCells.forEach((ce) => { if (ce.prod.sample && !(ce.prod.kind === "hero" || ce.prod.kind === "item" || (ce.prod.kind === "stat" && ce.prod.statIdx === 0))) ce.prod.sample = false; });

    // ---------- 점 화면 ----------
    const DW = Lo.dispCols, DROWS = KO ? 3 : 4, DH = DROWS * LROWS + 1;
    const dpitch = Math.min((Lo.display.w - 24) / DW, (Lo.display.h - 18) / DH);
    const dox = Lo.display.x + (Lo.display.w - DW * dpitch) / 2, doy = Lo.display.y + (Lo.display.h - DH * dpitch) / 2;
    const lcCache = new Map<string, { L: Line; c: HTMLCanvasElement }>();
    const lc = (text: string, inv: boolean, colr: string) => {
      const k = text + "|" + inv + "|" + colr;
      let v = lcCache.get(k);
      if (!v) { const L = rasterLine(text); v = { L, c: lineCanvas(L, colr, inv, DW - 2) }; lcCache.set(k, v); }
      return v;
    };
    const dstates: { t: number; rows: DRow[] }[] = [];
    const dState = (t: number, rowsArr: DRow[]) => dstates.push({ t, rows: rowsArr });
    const CPS = KO ? 20 : 30;
    const mkRow = (text: string, y: number, t0: number, o: { cps?: number; inv?: boolean; col?: string } = {}): DRow => {
      const im = lc(text, !!o.inv, o.col || pal.led);
      return { im, inv: !!o.inv, y, t0, dur: o.inv ? 0 : Array.from(clean(text)).length / ((o.cps || CPS) * (KO && /[가-힣]/.test(text) ? 0.66 : 1)), x: 1 };
    };
    dState(-99, [mkRow(wrapDots(title, DW - 4)[0] || "", 1, -99)]);

    // ---------- 시간표 ----------
    let T = 0;
    const cams: Cam[] = [];
    let camKey = "";
    const camTo = (r: Rect, d = 0.95, key = "") => { cams.push({ t0: T, t1: T + d, r }); T += d; camKey = key; };
    const camSet = (r: Rect, key = "") => { cams.push({ t0: T, t1: T, r }); camKey = key; };
    const keyPress: { t: number; key: string }[] = [];
    const lamps: { alert?: number } = {};
    const stepOn: number[] = [];
    const selOn: Record<number, number> = {};
    const vends: Vend[] = [];
    const shakes: number[] = [];
    let signT = 1e9, handoffStart = 0;
    let slogan: Sc<"ending"> | null = null;
    const starts: number[] = [];
    const pad = (r: Rect, p: number): Rect => ({ x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p });
    const union = (...rs: Rect[]): Rect => { const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y)), x1 = Math.max(...rs.map((r) => r.x + r.w)), y1 = Math.max(...rs.map((r) => r.y + r.h)); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
    const go = (r: Rect, d: number, key: string) => (cams.length ? camTo(r, d, key) : camSet(r, key));

    // 쪽지 자리: 이름만 진열된 줄이 있으면 그 위, 없으면 유리 아래쪽
    let note: Rect & { rot: number } = Lo.note ? { ...Lo.note } : (() => {
      const nr = grid.findIndex((g, i) => g.key === "name" && i > 0);
      const r = nr >= 0 ? nr : rows - 1;
      return { x: glass.x + glass.w - 330, y: rowTop(r) + 18, w: 300, h: Math.min(rowHs[r] - 30, 270), rot: -0.045 };
    })();
    let nf1 = 34, nf2 = 24, nl1: string[] = [], nl2: string[] = [];
    if (story) {
      nl1 = wrapW(story.line, K.font(nf1, MARK, 400), note.w - 44);
      while (nl1.length > 3 && nf1 > 22) { nf1 -= 2; nl1 = wrapW(story.line, K.font(nf1, MARK, 400), note.w - 44); }
      nf2 = Math.round(nf1 * 0.74);
      nl2 = wrapW(story.line2, K.font(nf2, MARK, 400), note.w - 44);
      const need = 40 + nl1.length * nf1 * 1.15 + 12 + nl2.length * nf2 * 1.2 + 26;
      note = { ...note, h: Math.max(note.h * 0.7, Math.min(note.h + 80, need)) };
    }

    const dispR = pad(union(Lo.display, Lo.lamps), 26);
    const lyingRect = (): Rect => {
      const last = vends[vends.length - 1];
      const sz = last ? packSize(last.ce) : { w: 140, h: 180 };
      const lw = Math.max(sz.h, sz.w) * (Lo.pack === "can" ? 1.6 : Lo.pack === "box" ? 1.5 : 1.25), lh = Lo.pack === "can" ? lw * 0.42 : Math.min(sz.w, sz.h) * (Lo.pack === "box" ? 1.6 : 1.1);
      const f = Math.min(1, (Lo.tray.h - 40) / lh, (Lo.tray.w - 60) / lw);
      return { x: Lo.tray.x + Lo.tray.w * 0.5 - (lw * f) / 2, y: Lo.tray.y + Lo.tray.h - 22 - lh * f, w: lw * f, h: lh * f };
    };
    const vend = (ce: Cell, face: Vend["face"]) => {
      // 1) 주문: 점 화면에 번호(보고 있다면) 2) 그 칸을 본다 3) 코일 한 바퀴 4) 낙하 — 카메라가 따라 내려간다 5) 덮개가 밀려 열린다
      if (Lo.keypad) {
        const kp = T + (camKey === "display" ? 0.1 : -0.5);
        keyPress.push({ t: kp, key: ce.code[0] }, { t: kp + 0.3, key: ce.code[1] });
        dState(kp, [mkRow(ce.code + "  " + (ce.prod.tag || ""), 1, kp, { cps: 12 }), ...wrapDots(ce.prod.label, DW - 4).slice(0, DROWS - 1).map((ln, i) => mkRow(ln, 1 + (i + 1) * LROWS, kp + 0.5, { cps: 40 }))]);
        if (camKey === "display") T = kp + 0.75;
      }
      const cr = cellRect(ce);
      camTo(pad({ x: cr.x, y: cr.y - 20, w: cr.w, h: cr.h + (style === "drink" ? talkH : 0) }, 70), 0.9, "slot");
      if (!Lo.keypad) selOn[ce.id] = T + 0.1;
      const t0 = T + (Lo.keypad ? 0.15 : 0.45), turn = Lo.coil ? 0.92 : 0.25;
      const tf = t0 + turn, fallD = Lo.coil ? 0.46 : 0.32, tl = tf + fallD;
      vends.push({ ce, t0, t1: tf, tf, tl, face });
      shakes.push(tl);
      T = tf - 0.06;
      camTo(pad(lyingRect(), 26), 1.15, "lying");
    };
    const whole = pad({ x: 0, y: 0, w: M.w, h: M.h + 60 }, 30);
    const lenOf = (...ss: (string | undefined)[]) => readLen(ss.filter(Boolean).join(""));

    S.forEach((s) => {
      starts.push(T);
      if (s.kind === "hook") {
        const hc = allCells.find((c) => c.prod.kind === "hero")!;
        const hr = cellRect(hc);
        go(pad({ x: hr.x, y: hr.y, w: hr.w, h: hr.h - talkH }, 26), 0.95, "hero");
        T += Math.max(2.7, readHold(lenOf(s.label, s.value, s.line)) * 0.6);
      } else if (s.kind === "story") {
        go(pad(note, 70), 1.0, "note");
        T += Math.min(2.6, Math.max(2.2, readHold(lenOf(s.line, s.line2)) * 0.6));
      } else if (s.kind === "flow" && s === flows[0]) {
        go(pad(Lo.placard, 30), 1.0, "placard");
        let tt = T + 0.1;
        s.nodes.forEach((n, i) => { stepOn[i] = tt; tt += 0.26 + Math.min(0.26, readLen(n) / 70); });
        T = tt + Math.max(0.8, readHold(readLen(s.line)) * 0.32);
      } else if (s.kind === "flow" || s.kind === "items") {
        const gi = grid.findIndex((g) => (s.kind === "items" ? g.key === "items" : g.flow === s));
        const g = grid[gi];
        const n = Math.min(cols, s.kind === "items" ? s.items.length : s.nodes.length);
        const rowR = { x: glass.x, y: rowTop(gi) - (style === "drink" ? 2 : 10), w: glass.w, h: rowHs[gi] + (style === "drink" ? 6 : 18) };
        const fz = Math.min(2.0, 1600 / (rowR.w + 60), 900 / (rowR.h + 60));
        if (fz >= 1.4) {
          go(pad(rowR, 30), 1.0, "row");
          let tt = T + 0.1;
          for (let i = 0; i < n; i++) { selOn[g.cells[i].id] = tt; tt += s.kind === "flow" ? 0.4 + readLen(g.cells[i].prod.label) / 50 : 0.16 + (i % 2) * 0.07; }
          T = Math.max(tt + 0.6, T + readHold(readLen(s.line)) * 0.75);
        } else {
          // 눈보다 넓은 줄: 왼쪽에서 시작해 오른쪽으로 훑고, 램프가 따라 켜진다
          const vw = 1600 / 1.8;
          const a = { x: rowR.x - 30, y: 0, w: vw, h: vw * 0.5625 };
          a.y = rowR.y + rowR.h / 2 - a.h / 2;
          const b = { ...a, x: rowR.x + rowR.w + 30 - vw };
          go(a, 1.0, "row");
          const panD = Math.max(2.4, readHold(readLen(s.line)) * 0.7);
          const p0 = T;
          camTo(b, panD, "row");
          for (let i = 0; i < n; i++) { const ce = g.cells[i]; const fx = (ce.c + 0.5) / cols; selOn[ce.id] = p0 + K.clamp((fx - 0.2) / 0.75) * panD * 0.8 + (s.kind === "flow" ? i * 0.05 : 0); }
          T += 0.4;
        }
      } else if (s.kind === "terminal") {
        go(dispR, 0.95, "display");
        let tt = T - 0.4;
        const hist: DRow[] = [];
        const push = (text: string, o: { cps?: number; gap?: number; inv?: boolean } = {}) => {
          const row = mkRow(text, 0, tt, o);
          hist.push(row);
          dState(tt, hist.slice(-DROWS).map((rw, i) => ({ ...rw, y: 1 + i * LROWS })));
          tt += row.dur + (o.gap || 0.08);
        };
        push(s.data === "sample" ? L_.serviceSample : L_.service, { cps: 80, gap: 0.15 });
        wrapDots("> " + s.command, DW - 4).forEach((ln, i) => push((i ? "  " : "") + ln, { cps: 42, gap: 0.06 }));
        tt += 0.12;
        for (const o of s.output) {
          const m = o.match(/^(.*?):\s*(.*)$/);
          const key = /survived|살아남/i.test(o);
          let line = clean(o);
          if (m && dotsW(m[1] + "  " + m[2]) <= DW - 4) {
            line = m[1];
            while (dotsW(line + " " + m[2]) < DW - 4) line += " ";
            line += m[2];
          }
          if (dotsW(line) > DW - 4) { const ws = wrapDots(line, DW - 4); ws.forEach((ln, j) => push(ln, { cps: 90, gap: j === ws.length - 1 && key ? 0.55 : 0.04, inv: key })); }
          else push(line, { cps: 90, gap: key ? 0.55 : 0.13, inv: key });
        }
        tt += 0.15;
        wrapDots(s.line, DW - 4).forEach((ln) => push(ln, { cps: 48, gap: 0.05 }));
        T = tt + (KO ? 1.1 : 0.85);
      } else if (s.kind === "alert") {
        go(dispR, 0.95, "display");
        lamps.alert = T + 0.2;
        let tt = T + 0.55;
        const rowsA: DRow[] = [];
        const room = DROWS - (s.data === "sample" && !KO ? 1 : 0);
        const rowsT = [...wrapDots(s.body, DW - 4), ...wrapDots(s.line, DW - 4), ...wrapDots(s.line2 || "", DW - 4)].filter(Boolean);
        // 한국어는 세 줄 화면이라 두 쪽으로 나눠 친다
        const pages: string[][] = [];
        for (let i = 0; i < rowsT.length; i += room) pages.push(rowsT.slice(i, i + room));
        pages.forEach((pg, pi) => {
          const cur: DRow[] = [];
          pg.forEach((ln, i) => { const rw = mkRow(ln, 1 + i * LROWS, tt, { cps: 34 }); cur.push(rw); rowsA.push(rw); dState(tt, cur.slice()); tt += rw.dur + (i === 0 && pi === 0 ? 0.35 : 0.1); });
          if (pi === pages.length - 1 && s.data === "sample") {
            const y = Math.min(pg.length, DROWS - 1);
            const rw = mkRow(L_.sampleRow, 1 + y * LROWS, tt, { cps: 40 });
            if (y < pg.length) cur[y] = rw; else cur.push(rw);
            dState(tt, cur.slice()); tt += rw.dur;
          }
          if (pi < pages.length - 1) tt += Math.max(1.0, readHold(lenOf(...pg)) * 0.55);
        });
        T = tt + 1.3;
      } else if (s.kind === "stats") {
        const ce = allCells.find((c) => c.prod.kind === "stat" && c.prod.statIdx === 0) || allCells[0];
        vend(ce, { kind: "facts", s });
        T += Math.min(3.2, Math.max(2.7, readHold(lenOf(...s.stats.map((x) => x.label + x.value), s.line)) * 0.45));
      } else if (s.kind === "ending") {
        if (!vends.length) {
          const ce = [...allCells].reverse().find((c) => c.prod.kind === "name") || allCells[allCells.length - 1];
          vend(ce, { kind: "front", s });
          T += Math.max(2.2, readHold(lenOf(s.line, s.line2)) * 0.62);
          signT = T + 0.45;
          camTo(whole, 1.7, "whole");
          handoffStart = T - 0.7;
        } else {
          slogan = s;
          camTo(pad({ x: 0, y: 0, w: M.w, h: Lo.slogan.y + Lo.slogan.h + rowHs[0] * 0.75 }, 20), 1.0, "top");
          signT = T - 0.5;
          T += Math.min(2.3, Math.max(1.9, readHold(lenOf(s.line, s.line2)) * 0.5));
          camTo(whole, 1.3, "whole");
          handoffStart = T - 0.85;
        }
      }
    });
    if (!handoffStart) { signT = T; camTo(whole, 1.5, "whole"); handoffStart = T - 0.7; }
    const duration = handoffStart + 2.4;

    // 카메라: 움직임마다 앞 머무름이 끝난 자리에서 출발한다
    const toCam = (r: Rect) => { const z = Math.min(1600 / r.w, 900 / r.h); return { x: r.x + r.w / 2, y: r.y + r.h / 2, z }; };
    const drift = (dt: number) => 1 + 0.028 * K.ease.outCubic(K.clamp(dt / 4));
    cams.forEach((c, i) => {
      c.to = toCam(c.r);
      if (i === 0) c.from = c.to;
      else { const p = cams[i - 1]; c.from = { ...p.to!, z: p.to!.z * drift(c.t0 - p.t1) }; }
    });
    const camAt = (t: number) => {
      let c = cams[0];
      for (const q of cams) if (t >= q.t0) c = q;
      const from = c.from!, to = c.to!;
      if (t < c.t1) {
        const k = MOVE(K.seg(t, c.t0, c.t1 - c.t0));
        return { x: K.lerp(from.x, to.x, k), y: K.lerp(from.y, to.y, k), z: Math.exp(K.lerp(Math.log(from.z), Math.log(to.z), k)) };
      }
      return { ...to, z: to.z * drift(t - c.t1) };
    };

    // ---------- 미리 그리기 ----------
    const unlitTile = mk(DOT, DOT);
    { const x = unlitTile.getContext("2d")!; x.fillStyle = pal.ledOff; x.beginPath(); x.arc(DOT / 2, DOT / 2, DOT * 0.4, 0, Math.PI * 2); x.fill(); }
    let unlitPat: CanvasPattern | null = null, patCtx: CanvasRenderingContext2D | null = null;
    const tagCanvases = new Map<string, HTMLCanvasElement>();
    const tagCanvas = (p: Prod, colr: string) => { const k = p.tag + colr + p.kind; let c = tagCanvases.get(k); if (!c) { c = lineCanvas(p.tagL!, colr, false, 0); tagCanvases.set(k, c); } return c; };
    const paperTex = mk(256, 256);
    { const x = paperTex.getContext("2d")!, r = K.rng(seed + 5); for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(0,0,0,${0.02 + r() * 0.03})`; x.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1); } }
    const kbKeys = [["A", "B", "C", "D"], ["1", "2", "3", "4"], ["5", "6", "7", "8"], ["9", "0", "*", "#"]];

    // ---------- 그리기 ----------
    const rr = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
    const txt = (g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, w: number | string = 700, col = "#111", align: CanvasTextAlign = "left", fam = LAB) => { g.font = K.font(size, fam, w); g.fillStyle = col; g.textAlign = align; g.fillText(s, x, y); };

    function drawPack(g: CanvasRenderingContext2D, ce: Cell, cx: number, by: number, sc = 1, rot = 0) {
      const p = ce.prod, sz = packSize(ce);
      const w = sz.w * sc, h = sz.h * sc;
      const x0 = cx - w / 2, top = by - h;
      g.save();
      if (rot) { g.translate(cx, by - h / 2); g.rotate(rot); g.translate(-cx, -(by - h / 2)); }
      g.fillStyle = "rgba(0,0,0,0.22)";
      g.fillRect(x0 + 6, top + 8, w, h - 4);
      const light = K.oklch(p.col)[0] > 0.7;
      const ink = light ? "#16181c" : "#f4f5f6";
      const big = p.kind === "hero";
      const fs = p.fs || 17, tfs = p.tfs || 14;
      const writeLines = (lx: number, ly: number, align: CanvasTextAlign, col: string) => {
        let y = ly;
        (p.lines || []).forEach((ln) => { y += fs * 1.08 * sc; txt(g, ln, lx, y, fs * sc, 800, col, align); });
        if (p.tlines) { y += 8 * sc; p.tlines.forEach((ln) => { y += tfs * 1.18 * sc; txt(g, ln, lx, y, tfs * sc, 600, col, align); }); }
      };
      if (Lo.pack === "bag") {
        const cr = 9 * sc;
        g.beginPath();
        g.moveTo(x0, top + cr);
        for (let x = x0; x < x0 + w - 0.1; x += 8 * sc) { g.lineTo(x + 4 * sc, top); g.lineTo(Math.min(x0 + w, x + 8 * sc), top + cr); }
        g.quadraticCurveTo(x0 + w + 5 * sc, top + h / 2, x0 + w, by - cr);
        for (let x = x0 + w; x > x0 + 0.1; x -= 8 * sc) { g.lineTo(x - 4 * sc, by); g.lineTo(Math.max(x0, x - 8 * sc), by - cr); }
        g.quadraticCurveTo(x0 - 5 * sc, top + h / 2, x0, top + cr);
        g.fillStyle = p.col; g.fill();
        g.fillStyle = "rgba(0,0,0,0.16)"; g.fillRect(x0, top + cr, w, 5 * sc); g.fillRect(x0, by - cr - 5 * sc, w, 5 * sc);
        if (p.kind === "name") {
          const ly = top + h * 0.22;
          g.fillStyle = "#f1f2f4"; g.fillRect(x0 + 8 * sc, ly, w - 16 * sc, h * 0.3);
          txt(g, p.label, cx, ly + h * 0.15 + fs * sc * 0.36, fs * sc, 900, pal.brand, "center");
        } else {
          const bh = (big ? 30 : 22) * sc;
          g.fillStyle = pal.brand; g.fillRect(x0 + 4 * sc, top + cr + 8 * sc, w - 8 * sc, bh);
          txt(g, title, x0 + 14 * sc, top + cr + 8 * sc + bh * 0.7, (big ? 17 : 12) * sc, 800, "#f1f2f4");
          writeLines(x0 + 14 * sc, top + cr + 12 * sc + bh, "left", ink);
        }
        g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(x0 + w * 0.9, top + cr + 4, w * 0.04, h - 2 * cr - 8);
      } else if (Lo.pack === "can") {
        const ry = w * 0.14;
        g.fillStyle = p.col;
        g.beginPath(); g.moveTo(x0, top + ry * 2); g.lineTo(x0, by - ry); g.ellipse(cx, by - ry, w / 2, ry, 0, Math.PI, 0, true); g.lineTo(x0 + w, top + ry * 2);
        g.quadraticCurveTo(x0 + w, top + ry, x0 + w * 0.82, top + ry * 0.8); g.lineTo(x0 + w * 0.18, top + ry * 0.8); g.quadraticCurveTo(x0, top + ry, x0, top + ry * 2); g.fill();
        g.fillStyle = "#c9ced4"; g.beginPath(); g.ellipse(cx, top + ry * 0.8, w * 0.34, ry * 0.55, 0, 0, Math.PI * 2); g.fill();
        const bandC = p.kind === "name" ? acc || pal.brand : K.oklch(p.col)[0] > 0.6 ? pal.brand : pal.cab;
        g.fillStyle = bandC; g.fillRect(x0, top + h * 0.16, w, h * 0.12);
        g.font = K.font(13 * sc, LAB, 800);
        txt(g, title, cx, top + h * 0.16 + h * 0.085, Math.min(13, K.fitSize(mx, title, LAB, 800, w - 10, 13, 8)) * sc, 800, "#ffffff", "center");
        writeLines(cx, top + h * 0.34, "center", ink);
        g.fillStyle = "rgba(255,255,255,0.13)"; g.fillRect(x0 + w * 0.1, top + ry * 1.6, w * 0.07, h - ry * 2.6);
      } else {
        // 부품 상자: 기판이 보이는 창
        g.fillStyle = p.col; g.fillRect(x0, top, w, h);
        g.fillStyle = "rgba(0,0,0,0.14)"; g.fillRect(x0, top, w, 7 * sc);
        const lw = big ? w * 0.6 : w * 0.62;
        const lab = { x: x0 + 8 * sc, y: top + 14 * sc, w: lw, h: h - 28 * sc };
        const win = { x: lab.x + lw + 8 * sc, y: top + 14 * sc, w: w - lw - 24 * sc, h: h - 28 * sc };
        g.fillStyle = "#1d5e43"; g.fillRect(win.x, win.y, win.w, win.h);
        g.fillStyle = "#101214"; g.fillRect(win.x + win.w * 0.25, win.y + win.h * 0.3, win.w * 0.5, win.h * 0.32);
        g.fillStyle = "#c9a54a"; for (let k = 0; k < 5; k++) g.fillRect(win.x + win.w * 0.12 + k * win.w * 0.17, win.y + win.h - 9 * sc, 3.5 * sc, 3.5 * sc);
        g.fillStyle = "rgba(255,255,255,0.16)"; g.fillRect(win.x + 3, win.y + 2, win.w * 0.16, win.h - 4);
        g.fillStyle = p.alarm ? alarm : p.kind === "name" ? pal.brand : light ? "#24282b" : pal.brand; g.fillRect(lab.x, lab.y, lab.w, lab.h);
        writeLines(lab.x + 10 * sc, lab.y - 2 * sc, "left", "#ffffff");
      }
      if (p.sample) {
        const r0 = (big ? 30 : 22) * sc;
        const sx = x0 + w - r0 * 0.7, sy = Lo.pack === "can" ? top + h * 0.72 : top + r0 * 0.9;
        g.fillStyle = "#ffffff"; g.beginPath(); g.arc(sx, sy, r0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = "#d22a2a"; g.lineWidth = 2.5 * sc; g.beginPath(); g.arc(sx, sy, r0 - 4 * sc, 0, Math.PI * 2); g.stroke();
        txt(g, L_.sample, sx, sy + r0 * (KO ? 0.16 : 0.12), r0 * (KO ? 0.46 : 0.3), 800, "#d22a2a", "center");
      }
      g.restore();
    }

    function drawCoil(g: CanvasRenderingContext2D, cx: number, cy: number, rw: number, ang: number, front: boolean) {
      // 끝에서 본 나선(조금 위에서): 뒤로 물러나는 고리들. 앞쪽 반만 상품 위에 그린다
      const ph = (ang / (Math.PI * 2)) % 1;
      for (let k = 3; k >= 0; k--) {
        const d = k - ph;
        if (d < -0.05) continue;
        const yy = cy - d * 9, sx = rw * (1 - d * 0.05), sy = rw * 0.26 * (1 - d * 0.05);
        g.strokeStyle = front ? (d < 0.6 ? "#cfd3d8" : "#9aa0a8") : "#5b6068";
        g.lineWidth = front ? Math.max(2, 5.5 - d * 1.1) : 3;
        g.beginPath();
        if (front) g.ellipse(cx, yy, sx, sy, 0, 0, Math.PI); else g.ellipse(cx, yy, sx, sy, 0, Math.PI, Math.PI * 2);
        g.stroke();
      }
      if (front) {
        const ex = cx + Math.cos(ang) * rw, ey = cy + Math.sin(ang) * rw * 0.26;
        g.strokeStyle = "#e3e6ea"; g.lineWidth = 5; g.lineCap = "round";
        g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex + Math.cos(ang + 1.2) * 16, ey + Math.sin(ang + 1.2) * 6 + 8); g.stroke();
        g.lineCap = "butt";
      }
    }

    function drawDisplay(g: CanvasRenderingContext2D, t: number) {
      const dsp = Lo.display;
      rr(g, dsp.x - 8, dsp.y - 8, dsp.w + 16, dsp.h + 16, 10); g.fillStyle = pal.cabLo; g.fill();
      g.fillStyle = "#060707"; g.fillRect(dsp.x, dsp.y, dsp.w, dsp.h);
      if (patCtx !== g) { unlitPat = g.createPattern(unlitTile, "repeat"); patCtx = g; }
      g.save();
      g.translate(dox, doy); g.scale(dpitch / DOT, dpitch / DOT);
      if (unlitPat) { g.fillStyle = unlitPat; g.fillRect(0, 0, DW * DOT, DH * DOT); }
      let st = dstates[0];
      for (const q of dstates) if (q.t <= t) st = q;
      for (const row of st.rows) {
        const k = row.dur ? K.clamp((t - row.t0) / row.dur) : t >= row.t0 ? 1 : 0;
        if (k <= 0) continue;
        const L = row.im.L;
        const n = Math.floor(k * (L.xs.length - 1) + 1e-6);
        const cw = row.inv ? Math.max(L.xs[n], k >= 1 ? row.im.c.width / DOT : 0) : L.xs[n];
        if (cw <= 0) continue;
        g.drawImage(row.im.c, 0, 0, cw * DOT, row.im.c.height, row.x * DOT, row.y * DOT, cw * DOT, row.im.c.height);
      }
      g.restore();
      g.fillStyle = "rgba(255,255,255,0.035)";
      g.beginPath(); g.moveTo(dsp.x + dsp.w * 0.55, dsp.y); g.lineTo(dsp.x + dsp.w * 0.72, dsp.y); g.lineTo(dsp.x + dsp.w * 0.5, dsp.y + dsp.h); g.lineTo(dsp.x + dsp.w * 0.33, dsp.y + dsp.h); g.fill();
    }

    const lampK = (t: number, at: number | undefined) => (at === undefined ? 0 : K.clamp((t - at) / 0.16));
    const alertS = S.find((s): s is Sc<"alert"> => s.kind === "alert");
    const legend = alertS ? (KO ? clean(alertS.title) : clean(alertS.title).toUpperCase()) : L_.soldOut;
    function drawLamps(g: CanvasRenderingContext2D, t: number) {
      const Lm = Lo.lamps;
      const lfs = (s: string, w: number) => Math.min(KO ? 19 : 16, K.fitSize(mx, s, LAB, 800, w - 16, KO ? 19 : 16, 9));
      mx.font = K.font(17, LAB, 800);
      const lw2 = Math.min(Lm.w * 0.66, mx.measureText(legend).width + 40);
      const parts = [{ x: Lm.x, w: Lm.w - lw2 - 10, legend: L_.exact, on: 0, col: alarm }, { x: Lm.x + Lm.w - lw2, w: lw2, legend, on: lampK(t, lamps.alert), col: alarm }];
      for (const p of parts) {
        rr(g, p.x, Lm.y, p.w, Lm.h, 6); g.fillStyle = "#0b0c0d"; g.fill();
        if (p.on > 0) { g.globalAlpha = p.on; rr(g, p.x + 3, Lm.y + 3, p.w - 6, Lm.h - 6, 4); g.fillStyle = p.col; g.fill(); g.globalAlpha = 1; }
        const f = lfs(p.legend, p.w);
        txt(g, p.legend, p.x + p.w / 2, Lm.y + Lm.h / 2 + f * 0.36, f, 800, p.on > 0.5 ? "#1a0b0a" : "rgba(255,255,255,0.22)", "center");
      }
    }

    function drawKeypad(g: CanvasRenderingContext2D, t: number) {
      const Kp = Lo.keypad; if (!Kp) return;
      rr(g, Kp.x - 10, Kp.y - 10, Kp.w + 20, Kp.h + 20, 10); g.fillStyle = pal.cabLo; g.fill();
      const kw = (Kp.w - 3 * 12) / 4, kh = (Kp.h - 3 * 12) / 4;
      const keyBase = style === "parts" ? "#d9dcde" : "#3a3f47";
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        const key = kbKeys[r][c];
        const x = Kp.x + c * (kw + 12), y = Kp.y + r * (kh + 12);
        let pr = 0;
        for (const kp of keyPress) if (kp.key === key && t >= kp.t && t < kp.t + 0.22) pr = 1 - K.seg(t, kp.t + 0.08, 0.14);
        g.fillStyle = "#08090a"; rr(g, x, y + 5, kw, kh, 7); g.fill();
        g.fillStyle = pr > 0 ? K.mix(keyBase, pal.led, 0.55 * pr) : keyBase;
        rr(g, x, y + pr * 4, kw, kh - 2, 7); g.fill();
        txt(g, key, x + kw / 2, y + pr * 4 + kh / 2 + 8, 24, 700, style === "parts" ? "#2a2e31" : "#e7e9ec", "center");
      }
    }

    // 이용 방법 판(첫 흐름) — 글 배치는 한 번만
    const f0 = flows[0];
    const placardLay = f0 ? f0.nodes.map((nd) => { const fs = f0.nodes.length > 3 ? 20 : 23; return { fs, lines: wrapW(nd, K.font(fs, LAB, 700), Lo.placard.w - 90).slice(0, 2) }; }) : [];
    const placardLine = f0 ? wrapW(f0.line, K.font(16, LAB, 500), Lo.placard.w - 40).slice(0, 3) : [];
    function drawPlacard(g: CanvasRenderingContext2D, t: number) {
      const P = Lo.placard;
      g.fillStyle = "#f4f5f4"; g.fillRect(P.x, P.y, P.w, P.h);
      g.strokeStyle = "rgba(0,0,0,0.25)"; g.lineWidth = 2; g.strokeRect(P.x + 1, P.y + 1, P.w - 2, P.h - 2);
      g.fillStyle = "#9aa0a6"; [[10, 10], [P.w - 10, 10], [10, P.h - 10], [P.w - 10, P.h - 10]].forEach(([a, b]) => { g.beginPath(); g.arc(P.x + a, P.y + b, 4.5, 0, Math.PI * 2); g.fill(); });
      if (!f0) { txt(g, title, P.x + 24, P.y + 50, 26, 900, pal.brand); return; }
      g.fillStyle = pal.brand; g.fillRect(P.x + 14, P.y + 14, P.w - 28, 44);
      txt(g, L_.how, P.x + 28, P.y + 45, 22, 800, "#ffffff");
      const n = f0.nodes.length;
      const top = P.y + 84, bottom = P.y + P.h - 72;
      const gap = (bottom - top) / n;
      placardLay.forEach((lay, i) => {
        const cy = top + gap * i + gap * 0.42;
        const k = lampK(t, stepOn[i]);
        if (i < n - 1) { g.fillStyle = k > 0.5 && stepOn[i + 1] !== undefined && t > stepOn[i + 1] ? pal.brand : "#b9bec4"; for (let y = cy + 22; y < cy + gap - 22; y += 9) g.fillRect(P.x + 41, y, 4, 5); }
        g.fillStyle = "#16181b"; g.beginPath(); g.arc(P.x + 43, cy, 19, 0, Math.PI * 2); g.fill();
        if (k > 0) { g.globalAlpha = k; g.fillStyle = pal.lampOn; g.beginPath(); g.arc(P.x + 43, cy, 16, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
        txt(g, String(i + 1), P.x + 43, cy + 7, 19, 800, k > 0.5 ? "#101113" : "#8a9097", "center");
        lay.lines.forEach((ln, j) => txt(g, ln, P.x + 76, cy + 7 + (j - (lay.lines.length - 1) / 2) * lay.fs * 1.15, lay.fs, k > 0.5 ? 800 : 600, k > 0.5 ? "#101113" : "#5d636a"));
      });
      placardLine.forEach((ln, j) => txt(g, ln, P.x + 20, P.y + P.h - 54 + j * 19 - (placardLine.length - 2) * 10, 16, 500, "#33373c"));
    }

    function drawNote(g: CanvasRenderingContext2D) {
      if (!story) return;
      g.save();
      g.translate(note.x + note.w / 2, note.y + note.h / 2); g.rotate(note.rot);
      g.translate(-note.w / 2, -note.h / 2);
      g.fillStyle = "rgba(0,0,0,0.28)"; g.fillRect(5, 7, note.w, note.h);
      g.fillStyle = "#f6f7f5"; g.fillRect(0, 0, note.w, note.h);
      g.drawImage(paperTex, 0, 0, note.w, note.h);
      g.fillStyle = "rgba(225,228,224,0.72)";
      g.save(); g.translate(18, -6); g.rotate(-0.5); g.fillRect(-26, -10, 64, 24); g.restore();
      g.save(); g.translate(note.w - 18, -6); g.rotate(0.45); g.fillRect(-38, -10, 64, 24); g.restore();
      let y = 22 + nf1;
      nl1.forEach((ln) => { txt(g, ln, 22, y, nf1, KO ? 700 : 400, "#16171a", "left", MARK); y += nf1 * 1.15; });
      y += 10;
      const c2 = style === "drink" ? "#c2410c" : style === "parts" ? "#1d4ed8" : "#2a50b8";
      nl2.forEach((ln) => { txt(g, ln, 22, y + nf2 * 0.2, nf2, KO ? 700 : 400, c2, "left", MARK); y += nf2 * 1.2; });
      g.restore();
    }

    function drawFacts(g: CanvasRenderingContext2D, r: Rect, s: Sc<"stats">) {
      // 뒷면이 위로 떨어진다: 성분표가 수치를 싣는다(영양 정보 표의 글자 짜임)
      const { x, y, w, h } = r;
      g.fillStyle = "#fbfbfa"; g.fillRect(x, y, w, h);
      g.strokeStyle = "#111"; g.lineWidth = Math.max(1.2, h * 0.012); g.strokeRect(x + h * 0.03, y + h * 0.03, w - h * 0.06, h - h * 0.06);
      const px = x + h * 0.07, pw = w - h * 0.14;
      let yy = y + h * 0.16;
      txt(g, L_.facts, px, yy, h * 0.12, 900, "#111");
      txt(g, title, px + pw, yy, Math.min(h * 0.045, K.fitSize(mx, title, LAB, 600, pw * 0.4, h * 0.045, 4)), 600, "#111", "right");
      yy += h * 0.03; g.fillStyle = "#111"; g.fillRect(px, yy, pw, h * 0.035); yy += h * 0.035;
      s.stats.forEach((st, i) => {
        const v = unitOf(st);
        if (i === 0) {
          yy += h * 0.115;
          txt(g, st.label, px, yy, Math.min(h * 0.062, K.fitSize(mx, st.label, LAB, 800, pw * 0.55, h * 0.062, 4)), 800, "#111");
          txt(g, v, px + pw, yy + h * 0.012, h * 0.115, 900, "#111", "right");
          yy += h * 0.035; g.fillRect(px, yy, pw, h * 0.018); yy += h * 0.018;
        } else {
          yy += h * 0.075;
          txt(g, st.label, px, yy, Math.min(h * 0.052, K.fitSize(mx, st.label, LAB, 500, pw * 0.7, h * 0.052, 4)), 500, "#111");
          txt(g, v, px + pw, yy, h * 0.052, 800, "#111", "right");
          yy += h * 0.022; g.fillRect(px, yy, pw, Math.max(1, h * 0.005));
        }
      });
      yy += h * 0.012; g.fillRect(px, yy, pw, h * 0.03); yy += h * 0.03;
      wrapW(s.line, K.font(h * 0.047, LAB, 800), pw).slice(0, 2).forEach((ln) => { yy += h * 0.06; txt(g, ln, px, yy, h * 0.047, 800, "#111"); });
      const foot = [s.data === "sample" ? L_.sampleFig : "", s.source ? L_.source + s.source : ""].filter(Boolean).join("  ");
      if (foot) txt(g, foot, px, y + h - h * 0.065, Math.min(h * 0.036, K.fitSize(mx, foot, LAB, 500, pw, h * 0.036, 3)), 500, "#111");
    }
    function drawFront(g: CanvasRenderingContext2D, r: Rect, s: Sc<"ending">, ce: Cell) {
      // 받는 곳에 누운 캔/봉지: 작품 이름 + 끝 두 줄이 상품 문구
      const { x, y, w, h } = r;
      const nm = s.name || title;
      if (style === "drink") {
        g.fillStyle = "#c9ced4"; g.beginPath(); g.ellipse(x + w - h * 0.12, y + h / 2, h * 0.14, h / 2, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#f4f5f6"; g.fillRect(x + h * 0.1, y, w - h * 0.22, h);
        g.beginPath(); g.ellipse(x + h * 0.1, y + h / 2, h * 0.14, h / 2, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = acc || pal.brand; g.fillRect(x + h * 0.2, y + h * 0.1, w - h * 0.5, h * 0.3);
        const tw = w - h * 0.7;
        txt(g, nm, x + h * 0.3, y + h * 0.33, Math.min(h * 0.19, K.fitSize(mx, nm, LAB, 900, tw, h * 0.19, 6)), 900, "#ffffff");
        txt(g, s.line, x + h * 0.3, y + h * 0.58, Math.min(h * 0.085, K.fitSize(mx, s.line, LAB, 800, tw, h * 0.085, 4)), 800, "#1c2738");
        txt(g, s.line2, x + h * 0.3, y + h * 0.75, Math.min(h * 0.07, K.fitSize(mx, s.line2, LAB, 600, tw, h * 0.07, 4)), 600, "#1c2738");
        g.fillStyle = "rgba(255,255,255,0.4)"; g.fillRect(x + h * 0.2, y + h * 0.82, w - h * 0.5, h * 0.05);
      } else {
        g.fillStyle = ce.prod.col; g.fillRect(x, y, w, h);
        const tw = w * 0.88;
        txt(g, nm, x + w * 0.06, y + h * 0.4, Math.min(h * 0.2, K.fitSize(mx, nm, LAB, 900, tw, h * 0.2, 6)), 900, "#f1f2f4");
        txt(g, s.line, x + w * 0.06, y + h * 0.62, Math.min(h * 0.08, K.fitSize(mx, s.line, LAB, 700, tw, h * 0.08, 4)), 700, "#f1f2f4");
        txt(g, s.line2, x + w * 0.06, y + h * 0.78, Math.min(h * 0.07, K.fitSize(mx, s.line2, LAB, 500, tw, h * 0.07, 4)), 500, "#f1f2f4");
      }
    }
    function drawLying(g: CanvasRenderingContext2D, v: Vend, t: number) {
      const r = lyingRect();
      const k = K.ease.spring(t - v.tl, 0.42, 0.3);
      g.save();
      g.translate(0, (1 - k) * -10);
      g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(r.x + 8, r.y + 10, r.w, r.h);
      if (Lo.pack === "bag" && v.face.kind === "facts") {
        g.fillStyle = v.ce.prod.col; g.fillRect(r.x - r.h * 0.12, r.y - r.h * 0.04, r.w + r.h * 0.24, r.h * 1.08);
        g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(r.x - r.h * 0.12, r.y - r.h * 0.04, r.h * 0.06, r.h * 1.08); g.fillRect(r.x + r.w + r.h * 0.06, r.y - r.h * 0.04, r.h * 0.06, r.h * 1.08);
      }
      if (v.face.kind === "facts") drawFacts(g, r, v.face.s); else drawFront(g, r, v.face.s, v.ce);
      g.restore();
    }

    function drawTray(g: CanvasRenderingContext2D, t: number) {
      const Tr = Lo.tray;
      rr(g, Tr.x - 16, Tr.y - 16, Tr.w + 32, Tr.h + 32, 14); g.fillStyle = pal.cabLo; g.fill();
      g.fillStyle = "#08090a"; g.fillRect(Tr.x, Tr.y, Tr.w, Tr.h);
      g.save(); g.beginPath(); g.rect(Tr.x, Tr.y, Tr.w, Tr.h); g.clip();
      for (const v of vends) if (t >= v.tl) drawLying(g, v, t);
      for (const v of vends) if (t >= v.tf && t < v.tl && style === "drink") {
        const k = K.ease.inQuad(K.seg(t, v.tf, v.tl - v.tf));
        const r = lyingRect();
        g.fillStyle = "#f4f5f6"; g.fillRect(r.x, Tr.y - r.h + (r.y - Tr.y + r.h) * k, r.w, r.h);
      }
      let open = 0;
      for (const v of vends) if (t > v.tl + 0.12) open = Math.max(open, K.ease.outCubic(K.seg(t, v.tl + 0.12, 0.6)));
      const fh = Tr.h * (1 - open * 0.86);
      g.fillStyle = `rgba(20,22,26,${0.8 - open * 0.2})`; g.fillRect(Tr.x, Tr.y, Tr.w, fh);
      g.fillStyle = "rgba(255,255,255,0.05)"; g.fillRect(Tr.x, Tr.y + fh - 6, Tr.w, 6);
      if (open < 0.4) txt(g, L_.push, Tr.x + Tr.w / 2, Tr.y + fh * 0.5 + 10, 30, 800, "rgba(255,255,255,0.35)", "center");
      g.restore();
    }

    const signName = ending?.name || title;
    function drawSign(g: CanvasRenderingContext2D, t: number) {
      const sg = Lo.sign;
      const on = K.clamp((t - signT) / 0.35);
      const dip = t > signT + 0.12 && t < signT + 0.2 ? 0.55 : 1; // 형광등이 한 번 걸린다
      const lit = on * dip;
      const base = style === "drink" ? "#fbfbf9" : pal.brand;
      g.fillStyle = K.mix(K.mix(base, "#000000", 0.55), base, lit);
      g.fillRect(sg.x, sg.y, sg.w, sg.h);
      g.strokeStyle = pal.cabLo; g.lineWidth = 8; g.strokeRect(sg.x, sg.y, sg.w, sg.h);
      const fs = K.fitSize(g, signName, LAB, 900, sg.w - 120, sg.h * 0.62, 20);
      txt(g, signName, sg.x + 56, sg.y + sg.h / 2 + fs * 0.36, fs, 900, K.mix(K.mix(pal.signInk, "#000000", 0.5), pal.signInk, lit));
      const sl = Lo.slogan;
      g.fillStyle = pal.cabLo; g.fillRect(sl.x, sl.y, sl.w, sl.h);
      if (slogan) {
        const s2 = slogan.line + "  " + slogan.line2;
        const fs2 = K.fitSize(g, s2, LAB, 700, sl.w - 112, 30, 12);
        txt(g, slogan.line, sl.x + 56, sl.y + sl.h / 2 + fs2 * 0.36, fs2, 700, K.mix("#777777", style === "parts" ? "#ffffff" : "#f1f2f4", lit));
        g.font = K.font(fs2, LAB, 700);
        const w1 = g.measureText(slogan.line + "  ").width;
        txt(g, slogan.line2, sl.x + 56 + w1, sl.y + sl.h / 2 + fs2 * 0.36, fs2, 500, K.mix("#666666", style === "parts" ? "#ffffff" : "#c9cdd3", lit));
      }
    }

    const talkFs = grid.map((row) => (row.talk ? Math.min(style === "drink" ? 21 : 22, K.fitSize(mx, row.talk, LAB, 700, glass.w - 40, style === "drink" ? 21 : 22, 11)) : 0));
    function drawTags(g: CanvasRenderingContext2D, t: number, row: Row, r: number) {
      const ty = shelfY(r), tagH = tagHs[r];
      g.fillStyle = "#15171a"; g.fillRect(glass.x, ty, glass.w, tagH);
      for (const ce of row.cells) {
        const x = glass.x + ce.c * slotW, w = slotW * ce.span;
        const p = ce.prod;
        const sel = selOn[ce.id];
        const sk = lampK(t, sel);
        g.fillStyle = "#2a2d31"; g.beginPath(); g.arc(x + 18, ty + tagH / 2, 8, 0, Math.PI * 2); g.fill();
        if (sk > 0 || p.alarm) { g.globalAlpha = p.alarm ? 1 : sk; g.fillStyle = p.alarm ? alarm : pal.lampOn; g.beginPath(); g.arc(x + 18, ty + tagH / 2, 6.5, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
        txt(g, ce.code, x + 32, ty + tagH / 2 + 7, p.kind === "hero" ? 26 : 19, 800, "#e8eaed");
        if (p.tagL) {
          const cnv = tagCanvas(p, p.alarm ? alarm : pal.led);
          let pitch = p.kind === "hero" ? 3.6 : 2.45;
          let ww = (cnv.width / DOT) * pitch, hh = (cnv.height / DOT) * pitch;
          const room = w - 70, roomH = tagH - 14;
          const f = Math.min(1, room / ww, roomH / hh);
          pitch *= f; ww *= f; hh *= f;
          const wx = x + w - ww - 14, wy = ty + (tagH - hh) / 2 + 1;
          g.fillStyle = "#050606"; g.fillRect(wx - 10, ty + 6, ww + 20, tagH - 12);
          g.drawImage(cnv, wx, wy, ww, hh);
        }
        if (style === "drink") {
          const bx = x + w / 2 - 34, by = ty + tagH + 4;
          const pr = sel !== undefined && t >= sel && t < sel + 0.25 ? 3 : 0;
          g.fillStyle = "#0d0e10"; rr(g, bx, by + 2, 68, talkH - 8, 6); g.fill();
          g.fillStyle = sk > 0 ? K.mix("#d5d9de", pal.led, 0.6) : "#d5d9de"; rr(g, bx, by + pr, 68, talkH - 10, 6); g.fill();
        }
      }
      const yy = ty + tagH;
      if (style !== "drink") {
        g.fillStyle = row.talk ? pal.band : K.mix(pal.inside, "#000000", 0.25); g.fillRect(glass.x, yy, glass.w, talkH);
        if (row.talk) txt(g, row.talk, glass.x + 20, yy + talkH / 2 + talkFs[r] * 0.36, talkFs[r], 700, pal.talkInk);
      } else if (row.talk) {
        g.fillStyle = pal.band; g.fillRect(glass.x, rowTop(r) + 6, glass.w, 34);
        txt(g, row.talk, glass.x + 20, rowTop(r) + 23 + talkFs[r] * 0.36, talkFs[r], 700, "#ffffff");
      }
    }

    function drawGlass(g: CanvasRenderingContext2D, t: number) {
      g.fillStyle = pal.inside; g.fillRect(glass.x, glass.y, glass.w, glass.h);
      g.fillStyle = pal.band; g.fillRect(glass.x, glass.y, glass.w, 34);
      grid.forEach((row, r) => {
        const by = shelfY(r) - 6;
        if (style === "drink") { g.fillStyle = "#d9dde2"; g.fillRect(glass.x, by - 4, glass.w, 10); }
        for (const ce of row.cells) {
          const cr = cellRect(ce);
          const cx = cr.x + cr.w / 2;
          const sz = packSize(ce);
          const v = vends.find((q) => q.ce === ce);
          const coilY = by - 10, rw = slotW * 0.42;
          let ang = ce.coil;
          if (v && t >= v.t0) ang += Math.PI * 2 * K.clamp(K.step(t - v.t0, 12) / (v.t1 - v.t0));
          const coilXs = ce.span > 1 ? [cr.x + slotW / 2, cr.x + slotW * 1.5] : [cx];
          if (Lo.coil) coilXs.forEach((x) => drawCoil(g, x, coilY, rw, ang, false));
          if (v && t >= v.t0 && Lo.coil) {
            // 뒤 상품이 앞으로 기어 나오고, 앞 상품은 밀려 나가 떨어진다
            const k = K.clamp(K.step(t - v.t0, 12) / (v.t1 - v.t0));
            drawPack(g, ce, cx, by - 6 + 6 * k, 0.9 + 0.1 * k);
            g.fillStyle = `rgba(0,0,0,${0.35 * (1 - k)})`; g.fillRect(cx - sz.w / 2, by - sz.h, sz.w, sz.h);
            if (t < v.tf) drawPack(g, ce, cx, by + 12 * k, 1 + 0.08 * k, ce.tilt);
          } else drawPack(g, ce, cx, by, 1, ce.tilt);
          if (Lo.coil) coilXs.forEach((x) => drawCoil(g, x, coilY, rw, ang, true));
        }
        drawTags(g, t, row, r);
      });
      g.save(); g.beginPath(); g.rect(glass.x, glass.y, glass.w, glass.h); g.clip();
      for (const v of vends) if (Lo.coil && t >= v.tf && t < v.tl) {
        const cr = cellRect(v.ce), cx = cr.x + cr.w / 2, by0 = shelfY(v.ce.r) + 6;
        const k = (t - v.tf) / (v.tl - v.tf);
        const fallTo = glass.y + glass.h + 200;
        drawPack(g, v.ce, cx + k * 14, by0 + (fallTo - by0) * k * k, 1.08, v.ce.tilt + k * 0.9);
      }
      g.restore();
      g.fillStyle = "rgba(255,255,255,0.045)";
      g.beginPath(); g.moveTo(glass.x + glass.w * 0.18, glass.y); g.lineTo(glass.x + glass.w * 0.34, glass.y); g.lineTo(glass.x + glass.w * 0.02, glass.y + glass.h); g.lineTo(glass.x, glass.y + glass.h); g.lineTo(glass.x, glass.y + glass.h * 0.55); g.fill();
      g.fillStyle = "rgba(255,255,255,0.03)";
      g.beginPath(); g.moveTo(glass.x + glass.w * 0.62, glass.y); g.lineTo(glass.x + glass.w * 0.68, glass.y); g.lineTo(glass.x + glass.w * 0.4, glass.y + glass.h); g.lineTo(glass.x + glass.w * 0.34, glass.y + glass.h); g.fill();
      g.strokeStyle = pal.trim; g.lineWidth = 12; g.strokeRect(glass.x - 6, glass.y - 6, glass.w + 12, glass.h + 12);
    }

    function drawMoney(g: CanvasRenderingContext2D) {
      const C = Lo.coin, B = Lo.bill;
      rr(g, C.x, C.y, C.w, C.h, 8); g.fillStyle = pal.cabLo; g.fill();
      g.fillStyle = "#0a0b0c"; g.fillRect(C.x + 24, C.y + C.h / 2 - 16, 10, 32);
      g.fillStyle = "#a7adb4"; g.beginPath(); g.arc(C.x + C.w - 40, C.y + C.h / 2, 18, 0, Math.PI * 2); g.fill();
      rr(g, B.x, B.y, B.w, B.h, 8); g.fillStyle = pal.cabLo; g.fill();
      g.fillStyle = "#0a0b0c"; g.fillRect(B.x + 26, B.y + B.h / 2 - 6, B.w - 52, 12);
      g.fillStyle = "#3d8f5f"; g.fillRect(B.x + 26, B.y + 16, 22, 8);
    }

    return {
      duration,
      starts: starts.map((s) => Math.max(0, s)),
      render(g, t) {
        const c = camAt(t);
        let sh = 0;
        for (const s_ of shakes) if (t >= s_ && t < s_ + 0.3) sh += Math.sin((t - s_) * 70) * (1 - (t - s_) / 0.3) * 5;
        g.fillStyle = pal.wall; g.fillRect(0, 0, K.W, K.H);
        g.save();
        g.translate(K.W / 2, K.H / 2 + sh);
        g.scale(c.z, c.z);
        g.translate(-c.x, -c.y);
        g.fillStyle = pal.floor; g.fillRect(-4000, M.h, 9000, 3000);
        g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(-20, M.h - 6, M.w + 60, 26);
        g.fillStyle = pal.cabLo; g.fillRect(14, 10, M.w, M.h - 4);
        g.fillStyle = pal.cab; g.fillRect(0, 0, M.w, M.h);
        g.fillStyle = pal.cabHi; g.fillRect(0, 0, 10, M.h);
        if (style === "parts") { g.fillStyle = A_; g.fillRect(0, M.h - 230, M.w, 26); }
        if (Lo.panel) { g.fillStyle = pal.cabHi; g.fillRect(Lo.panel.x, Lo.panel.y, Lo.panel.w, Lo.panel.h); g.fillStyle = pal.cabLo; g.fillRect(Lo.panel.x, Lo.panel.y, 4, Lo.panel.h); }
        drawSign(g, t);
        drawGlass(g, t);
        drawDisplay(g, t);
        drawLamps(g, t);
        drawKeypad(g, t);
        drawMoney(g);
        drawPlacard(g, t);
        drawTray(g, t);
        drawNote(g);
        // 걸레받이: 통풍 구멍 + 넘김 줄(운영자 스티커처럼)
        const Kp = Lo.kick;
        g.fillStyle = pal.cabLo; g.fillRect(Kp.x, Kp.y, Kp.w, Kp.h);
        g.fillStyle = "rgba(0,0,0,0.35)"; for (let x = Kp.x + 40; x < Kp.x + Kp.w * 0.42; x += 26) g.fillRect(x, Kp.y + 34, 12, Kp.h - 68);
        const hp = K.seg(t, handoffStart, 2.4);
        if (hp > 0) K.handoff(g, hp, { ink: style === "parts" ? "#2a2f33" : "#e9ebee", family: LAB, size: 46, x: Kp.x + Kp.w * 0.47, y: Kp.y + Kp.h / 2 + 20, handle: work.handle });
        g.restore();
        K.grain(g, t, 0.04, seed, 12, "overlay");
      },
    };
  },
};
