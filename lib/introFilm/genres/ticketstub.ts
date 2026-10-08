// 입장권 — 작품이 오늘 밤의 상영작이 된다(필름 실험실 2차, 2026-10-08). 미리 인쇄된 두루마리 표(색 판지에 두 색 오프셋:
// 기요셰 무늬·테두리·극장 이름·빨간 일련번호·절취선)를 매표소에서 장면마다 한 장씩 당겨 내고, 표마다 활판으로 작품을 찍는다.
// 압인기가 내려오면(그림자가 다가오고) 판이 종이에 박히고, 들린다.
// 세계의 규칙: 작품마다 극장 하나(영화관 두 칸 표 · 검은 판지 공연 표 · 낮 공연 두루마리 표), 미리 찍힌 무늬는 모든 표가 같고
// 바뀌는 건 압인과 번호뿐, 잉크 셋(압인·극장 색·빨간 번호), 확인은 검표 펀치, 예시 자료는 바늘 구멍으로 뚫은 글자,
// 끝은 검표원이 마지막 표를 찢는 것.
// 움직임 문법: 곡선 = 손(종이 장력으로 살짝 넘쳤다 돌아오는 당김, 떨어지는 조각엔 중력) · 끊기 = 연속, 압인은 0.13초 그림자 뒤 즉시 ·
// 전환 = 띠를 한 장만큼 당김 · 글자 등장 = 덩어리별 압인.
import type { FlatScene, Genre, GenreWork } from "./types";
import * as K from "./kit";

const LABEL = {
  en: {
    admit: "Admit one", keepStub: "Keep this stub", keepHalf: "Keep this half", nowShowing: "Now showing",
    programme: "Programme", secondHalf: "Second half", presented: "Presented by", seating: "Seating", source: "Source: ",
    sample: "SAMPLE", cinema: "Picture house", concert: "Live", matinee: "Matinee",
  },
  ko: {
    admit: "1인 입장", keepStub: "보관용", keepHalf: "이쪽은 보관하세요", nowShowing: "상영 중",
    programme: "상영 순서", secondHalf: "2부", presented: "제공", seating: "좌석", source: "출처: ",
    sample: "예시", cinema: "극장", concert: "공연", matinee: "낮 공연",
  },
};

const isWide = (c: string) => {
  const n = c.codePointAt(0) || 0;
  return (n >= 0x1100 && n <= 0x115f) || (n >= 0x2e80 && n <= 0xa4cf) || (n >= 0xac00 && n <= 0xd7a3) || (n >= 0xf900 && n <= 0xfaff) || (n >= 0xff00 && n <= 0xff60) || (n >= 0xffe0 && n <= 0xffe6);
};
const hasWide = (s: string) => Array.from(s).some(isWide);
const readLen = (s: string) => Array.from(s).reduce((a, c) => a + (isWide(c) ? 1.7 : 1), 0);
const readHold = (chars: number, min = 1.1) => Math.max(min, chars / 17 + 0.45);
const clean = (s: unknown) => String(s == null ? "" : s).replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

function nameOf(t: string): string {
  for (const sep of [" · ", " — ", " | "]) { const i = t.indexOf(sep); if (i > 0) return t.slice(0, i).trim(); }
  return t.trim();
}

type Venue = "cinema" | "concert" | "matinee";
function pickVenue(work: GenreWork, seed: number): Venue {
  const kinds = work.scenes.map((s) => s.kind);
  const pctItems = work.scenes.some((s) => s.kind === "items" && s.items.length > 0 && s.items.every((it) => /^\s*[\d.,]+\s*%\s*$/.test(it.value)));
  if (pctItems) return "matinee";
  if (kinds.includes("terminal")) return "cinema";
  if (!kinds.includes("hook")) return "concert";
  return (["cinema", "concert", "matinee"] as const)[seed % 3];
}

type Item =
  | { t: "text"; s: string; size: number; fam: string; w: number; x: number; y: number; ink: string; align?: CanvasTextAlign; rot?: number }
  | { t: "box"; x: number; y: number; w: number; h: number; ink: string }
  | { t: "leader"; x0: number; x1: number; y: number; ink: string }
  | { t: "band"; cx: number; cy: number; w: number; h: number; rot: number; ink: string; s: string; size: number };
type Block = { c: HTMLCanvasElement; x: number; y: number; w: number; h: number };
type Keep = { x0: number; x1: number; hand: { x: number; y: number; size: number; rot?: number } };
type Ticket = {
  kind: FlatScene["kind"]; blocks: Item[][]; read: number; made: Block[];
  punch?: { x: number; y: number } | null; perf?: { x: number; y: number } | null;
  overprint?: number; rowsStagger?: boolean; keep?: Keep; holdStart: number; holdEnd: number;
};
type Imp = { ti: number; si: number; blk: Block; heavy: boolean };
type Pull = { t0: number; t1: number; a: number; b: number };

export const ticketstub: Genre = {
  id: "ticketstub",
  name: "Ticket stub",
  ko: "입장권",
  koIdea: "작품이 오늘 밤의 상영작이 되어, 매표소에서 뜯어 낸 입장권마다 활판으로 한 장면씩 찍히고 끝에 검표원이 표를 찢어 주는 영화",
  enIdea: "The work is tonight's feature: each scene is letterpressed onto a ticket pulled off the roll, and the usher tears the last one",
  family: "B",
  fonts: ["leagueGothic", "zillaSlab"],
  make(work, { seed, fonts }) {
    const GOTH = fonts.leagueGothic, SLAB = fonts.zillaSlab;
    const L = LABEL[work.locale];
    const KO = work.locale === "ko";
    const RES = 1.25;
    const mk = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
    const MC = mk(8, 8).getContext("2d")!;
    const F = (size: number, fam: string, w = 400) => K.font(size, fam, w);
    const meas = (s: string, font: string) => { MC.font = font; return MC.measureText(s).width; };
    /** 띄어쓰기로 끊고, 한 낱말이 줄보다 길면 글자로 끊는다. */
    const wrap = (s: string, font: string, maxW: number): string[] => {
      MC.font = font;
      const out: string[] = [];
      let cur = "";
      for (let word of clean(s).split(/\s+/)) {
        if (!word) continue;
        const nx = cur ? cur + " " + word : word;
        if (MC.measureText(nx).width <= maxW) { cur = nx; continue; }
        if (cur) { out.push(cur); cur = ""; }
        while (MC.measureText(word).width > maxW && word.length > 1) {
          const ch = Array.from(word);
          let k = ch.length - 1;
          while (k > 1 && MC.measureText(ch.slice(0, k).join("")).width > maxW) k--;
          out.push(ch.slice(0, k).join(""));
          word = ch.slice(k).join("");
        }
        cur = word;
      }
      if (cur) out.push(cur);
      return out;
    };
    const R = K.rng(seed);
    const title = nameOf(work.title);
    const ALARM = work.alarm || "#c41d2e";
    const venue = pickVenue(work, seed);
    const v = {
      cinema: { noun: L.cinema, TW: 1080, TH: 480, stubW: 290, stock: "#d2e0e9", ground: "#1b2026", ink: "#16181d", spot: work.accent || "#a3172d", tilt: -2.2, punch: "star" },
      concert: { noun: L.concert, TW: 1060, TH: 500, stubW: 270, stock: "#151517", ground: "#5b6067", ink: "#eceee9", spot: work.accent || "#ff9f0a", tilt: 1.6, punch: "circle" },
      matinee: { noun: L.matinee, TW: 1000, TH: 440, stubW: 0, stock: "#d3e4ce", ground: "#28363d", ink: "#17191c", spot: work.accent || "#f18600", tilt: -1.2, punch: "diamond" },
    }[venue];
    const { TW, TH } = v;
    const RED = venue === "concert" ? "#ff453a" : "#c41d2e";
    const N = work.scenes.length;
    const serial0 = 4100 + Math.floor(R() * 800);
    const dark = K.oklch(v.stock)[0] < 0.4;

    const CR = venue === "cinema" ? { x0: v.stubW + 46, y0: 106, x1: TW - 42, y1: TH - 36 }
      : venue === "concert" ? { x0: 92, y0: 112, x1: TW - v.stubW - 36, y1: TH - 34 }
      : { x0: 142, y0: 76, x1: TW - 142, y1: TH - 30 };
    const CW = CR.x1 - CR.x0, CH = CR.y1 - CR.y0;
    const fitG = (s: string, maxW: number, maxS: number, minS = 40) => { let z = maxS; while (z > minS && meas(clean(s), F(z, GOTH)) > maxW) z -= 4; return z; };
    const fitSlab = (s: string, maxW: number, maxS: number, w: number, minS = 14) => { let z = maxS; while (z > minS && meas(s, F(z, SLAB, w)) > maxW) z -= 1; return z; };

    // ---------- 미리 인쇄된 두루마리(번호 말고는 모든 표가 같다) ----------
    const guill = (() => {
      const c = mk(TW * RES, TH * RES), x = c.getContext("2d")!;
      x.scale(RES, RES);
      x.strokeStyle = K.rgba(v.spot, dark ? 0.5 : 0.55); x.lineWidth = 0.7;
      const band = venue === "cinema" ? { x0: v.stubW + 26, x1: TW - 26, y: 52, a: 22 } : venue === "concert" ? { x0: 90, x1: TW - v.stubW - 30, y: TH - 18, a: 8 } : { x0: 140, x1: TW - 140, y: TH - 16, a: 7 };
      for (let k = 0; k < 14; k++) {
        x.beginPath();
        for (let xx = band.x0; xx <= band.x1; xx += 3) {
          const u = (xx - band.x0) * 0.045;
          const yy = band.y + Math.sin(u + k * 0.45) * band.a * Math.sin(u * 0.21 + k * 0.9);
          if (xx === band.x0) x.moveTo(xx, yy); else x.lineTo(xx, yy);
        }
        x.stroke();
      }
      const ro = venue === "cinema" ? { cx: v.stubW / 2, cy: TH / 2 + 16, r: 96 } : venue === "concert" ? { cx: TW - v.stubW / 2, cy: TH / 2 + 40, r: 88 } : { cx: TW / 2, cy: TH / 2 + 10, r: 150 };
      x.strokeStyle = K.rgba(v.spot, venue === "matinee" ? 0.13 : dark ? 0.32 : 0.3);
      for (let k = 0; k < 18; k++) {
        x.beginPath();
        for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.02) {
          const rr = ro.r * (0.62 + 0.3 * Math.sin(7 * a + (k * Math.PI) / 9) * Math.cos(3 * a - k * 0.2) + 0.08 * Math.sin(14 * a));
          const px = ro.cx + Math.cos(a) * rr, py = ro.cy + Math.sin(a) * rr;
          if (a === 0) x.moveTo(px, py); else x.lineTo(px, py);
        }
        x.stroke();
      }
      return c;
    })();
    const holes = (x: CanvasRenderingContext2D, px: number) => { x.save(); x.globalCompositeOperation = "destination-out"; for (let yy = 8; yy < TH; yy += 12) { x.beginPath(); x.arc(px, yy, 2.7, 0, Math.PI * 2); x.fill(); } x.restore(); };
    /** 한글은 세로로 세워 쌓는다(돌려 눕히지 않는다). */
    const vertical = (x: CanvasRenderingContext2D, s: string, cx: number, cy: number, size: number, dir: 1 | -1) => {
      if (!hasWide(s)) { x.save(); x.translate(cx, cy); x.rotate((dir * Math.PI) / 2); x.textAlign = "center"; x.fillText(s, 0, size * 0.36); x.restore(); return; }
      // 띄어쓰기는 반 칸만 비운다
      const ch = Array.from(s), step = size * 0.98;
      const ys: number[] = [];
      let acc = 0;
      for (const c of ch) { ys.push(acc); acc += c === " " ? step * 0.45 : step; }
      const total = acc - step;
      x.textAlign = "center";
      ch.forEach((c, i) => { if (c !== " ") x.fillText(c, cx, cy - total / 2 + ys[i] + size * 0.36); });
      x.textAlign = "left";
    };
    const plate = (() => {
      const c = mk(TW * RES, TH * RES), x = c.getContext("2d")!;
      x.scale(RES, RES);
      x.fillStyle = v.stock; x.fillRect(0, 0, TW, TH);
      const r = K.rng(seed + 17);
      for (let i = 0; i < 520; i++) {
        x.strokeStyle = dark ? `rgba(255,255,255,${0.025 + r() * 0.03})` : `rgba(0,0,0,${0.025 + r() * 0.03})`;
        x.lineWidth = 0.6;
        const px = r() * TW, py = r() * TH, a = r() * Math.PI, l = 3 + r() * 9;
        x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
      }
      x.drawImage(guill, 0, 0, TW, TH);
      x.textBaseline = "alphabetic";
      if (venue === "cinema") {
        const m0 = v.stubW;
        x.strokeStyle = v.spot; x.lineWidth = 2.2; x.strokeRect(m0 + 14, 12, TW - m0 - 28, TH - 24);
        x.lineWidth = 0.9; x.strokeRect(m0 + 20, 18, TW - m0 - 40, TH - 36);
        const admitW = meas(L.admit, F(42, GOTH));
        const nounW = meas(v.noun, F(21, SLAB, 500));
        const ts = fitG(title, TW - m0 - 88 - admitW - nounW - 50, 58, 30);
        x.fillStyle = v.ink; x.font = F(ts, GOTH); x.fillText(title, m0 + 44, 74);
        const tw = meas(title, F(ts, GOTH));
        x.fillStyle = v.spot; x.font = F(21, SLAB, 500); x.fillText(v.noun, m0 + 54 + tw, 72);
        x.textAlign = "right"; x.font = F(42, GOTH); x.fillText(L.admit, TW - 44, 72);
        x.textAlign = "left";
        x.fillStyle = v.ink; x.font = F(19, SLAB, 500); x.fillText(L.keepStub, 26, 44);
        x.fillStyle = v.spot; x.font = F(30, GOTH); x.fillText(v.noun, 26, 82);
        holes(x, m0);
      } else if (venue === "concert") {
        const m1 = TW - v.stubW;
        // 홀로그램 박: 은색 바탕에 가는 회절 줄
        x.fillStyle = "#b9bec4"; x.fillRect(30, 14, 34, TH - 28);
        const hues = ["#d8c6ec", "#c4e6dc", "#efe2bf", "#c6d6f2"];
        for (let yy = 14, k = 0; yy < TH - 14; yy += 5, k++) { x.fillStyle = K.rgba(hues[k % 4], 0.8); x.fillRect(30, yy, 34, 2); }
        const tag = v.noun + " · " + L.admit;
        const tagW = meas(tag, F(20, SLAB, 500));
        const ts = fitG(title, m1 - 128 - tagW - 30, 64, 30);
        x.fillStyle = v.spot; x.font = F(ts, GOTH); x.fillText(title, 92, 82);
        x.fillStyle = v.ink; x.font = F(20, SLAB, 500); x.textAlign = "right"; x.fillText(tag, m1 - 36, 78);
        x.textAlign = "left"; x.fillStyle = v.spot; x.fillRect(92, 96, m1 - 128, 2.4);
        x.fillStyle = v.ink; x.font = F(19, SLAB, 500); x.fillText(L.keepStub, m1 + 28, 46);
        x.fillStyle = v.spot; x.font = F(fitG(tag, v.stubW - 50, 32, 18), GOTH); x.fillText(tag, m1 + 28, 86);
        holes(x, m1);
      } else {
        x.strokeStyle = v.spot; x.lineWidth = 2; x.beginPath(); x.moveTo(118, 14); x.lineTo(118, TH - 14); x.moveTo(TW - 118, 14); x.lineTo(TW - 118, TH - 14); x.stroke();
        x.lineWidth = 0.8; x.beginPath(); x.moveTo(124, 14); x.lineTo(124, TH - 14); x.moveTo(TW - 124, 14); x.lineTo(TW - 124, TH - 14); x.stroke();
        x.fillStyle = v.spot;
        const vs = hasWide(L.admit) ? 64 : 76;
        x.font = F(vs, GOTH);
        vertical(x, L.admit, 70, TH / 2, vs, -1);
        vertical(x, L.admit, TW - 70, TH / 2, vs, 1);
        const ts = fitSlab(title, TW - 284 - 200 - meas(v.noun, F(20, SLAB, 500)), 22, 700);
        x.fillStyle = v.ink; x.font = F(ts, SLAB, 700); x.fillText(title, 142, 44);
        const tw = meas(title, F(ts, SLAB, 700));
        x.fillStyle = v.spot; x.font = F(20, SLAB, 500); x.fillText(v.noun, 152 + tw, 44);
        x.fillStyle = v.spot; x.fillRect(142, 56, TW - 284, 1.6);
      }
      return c;
    })();
    const serialTxt = (i: number) => "No " + String(serial0 + i).padStart(6, "0");
    const SERIALS: [number, number, number, CanvasTextAlign][] = venue === "cinema" ? [[TW - 44, TH - 26, 26, "right"], [26, TH - 26, 28, "left"]]
      : venue === "concert" ? [[TW - v.stubW + 28, TH - 26, 28, "left"]] : [[TW - 142, 46, 28, "right"]];
    const drawBase = (g: CanvasRenderingContext2D, i: number) => {
      g.drawImage(plate, 0, 0, TW, TH);
      g.fillStyle = RED;
      g.textBaseline = "alphabetic";
      for (const [x0, y0, sz, al] of SERIALS) { g.font = F(sz, GOTH); g.textAlign = al; g.fillText(serialTxt(i), x0, y0 + (K.rand(seed, i, sz) - 0.5) * 2); }
      g.textAlign = "left";
      if (i > 0) { g.fillStyle = v.ground; for (let yy = 8; yy < TH; yy += 12) { g.beginPath(); g.arc(3, yy, 2.7, 0, Math.PI * 2); g.fill(); } }
    };

    // ---------- 압인(활판 덩어리) ----------
    const bbox = (it: Item) => {
      if (it.t === "text") {
        const wd = meas(it.s, F(it.size, it.fam, it.w));
        if (it.rot) return { x0: it.x - it.size, y0: it.y - wd, x1: it.x + it.size * 0.4, y1: it.y + 4 };
        const x0 = it.align === "right" ? it.x - wd : it.align === "center" ? it.x - wd / 2 : it.x;
        return { x0, y0: it.y - it.size * 0.95, x1: x0 + wd, y1: it.y + it.size * 0.32 };
      }
      if (it.t === "leader") return { x0: it.x0, y0: it.y - 4, x1: it.x1, y1: it.y + 4 };
      if (it.t === "band") { const r = Math.hypot(it.w, it.h) / 2 + 4; return { x0: it.cx - r, y0: it.cy - r * 0.5, x1: it.cx + r, y1: it.cy + r * 0.5 }; }
      return { x0: it.x - 2, y0: it.y - 2, x1: it.x + it.w + 2, y1: it.y + it.h + 2 };
    };
    const drawItem = (x: CanvasRenderingContext2D, it: Item) => {
      x.fillStyle = x.strokeStyle = it.ink;
      if (it.t === "text") {
        x.font = F(it.size, it.fam, it.w);
        x.textAlign = it.align || "left";
        if (it.rot) { x.save(); x.translate(it.x, it.y); x.rotate(it.rot); x.fillText(it.s, 0, 0); x.restore(); }
        else x.fillText(it.s, it.x, it.y);
        x.textAlign = "left";
      } else if (it.t === "box") { x.lineWidth = 2; x.strokeRect(it.x, it.y, it.w, it.h); }
      else if (it.t === "leader") { for (let xx = it.x0; xx < it.x1; xx += 9) { x.beginPath(); x.arc(xx, it.y, 1.5, 0, Math.PI * 2); x.fill(); } }
      else {
        x.save(); x.translate(it.cx, it.cy); x.rotate(it.rot);
        x.fillRect(-it.w / 2, -it.h / 2, it.w, it.h);
        x.globalCompositeOperation = "destination-out";
        x.font = F(it.size, GOTH); x.textAlign = "center"; x.fillText(it.s, 0, it.size * 0.36);
        x.restore();
      }
    };
    const makeBlock = (items: Item[], sd: number): Block => {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const it of items) { const b = bbox(it); x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); }
      x0 -= 6; y0 -= 6; x1 += 6; y1 += 6;
      const w = x1 - x0, h = y1 - y0;
      const c = mk(w * RES, h * RES), x = c.getContext("2d", { willReadFrequently: true })!;
      x.scale(RES, RES); x.translate(-x0, -y0); x.textBaseline = "alphabetic";
      for (const it of items) drawItem(x, it);
      // 활판: 잉크 사이로 종이 결이 비치고, 판이 눌린 가장자리는 잉크가 더 진하다
      const im = x.getImageData(0, 0, c.width, c.height), d = im.data, r = K.rng(sd), W = c.width;
      const GS = 26, gw = Math.ceil(W / GS) + 2, gh = Math.ceil(c.height / GS) + 2, grid = new Float32Array(gw * gh);
      for (let i = 0; i < grid.length; i++) grid[i] = r();
      const mottle = (px: number, py: number) => { const gx = px / GS, gy = py / GS, ix = gx | 0, iy = gy | 0, fx = gx - ix, fy = gy - iy, o = iy * gw + ix; const a = grid[o], b = grid[o + 1], c2 = grid[o + gw], d2 = grid[o + gw + 1]; return a + (b - a) * fx + (c2 - a) * fy + (a - b - c2 + d2) * fx * fy; };
      const a0 = new Uint8ClampedArray(d.length / 4);
      for (let i = 0; i < a0.length; i++) a0[i] = d[i * 4 + 3];
      for (let i = 0; i < a0.length; i++) {
        if (!a0[i]) continue;
        const px = i % W, py = (i / W) | 0;
        const edge = px > 2 && py > 2 && px < W - 3 && (!a0[i - 3] || !a0[i + 3] || !a0[i - 3 * W] || !a0[i + 3 * W]);
        let k = 0.74 + 0.24 * mottle(px, py) + (r() - 0.5) * 0.1;
        if (r() < 0.012) k *= 0.55;
        if (edge) k = Math.min(1, k + 0.16);
        d[i * 4 + 3] = a0[i] * K.clamp(k, 0.2, 1);
      }
      x.putImageData(im, 0, 0);
      // 박힘: 눌린 자리 위·왼쪽 안쪽에 옅은 그림자
      const out = mk(c.width, c.height), o = out.getContext("2d")!;
      o.globalAlpha = dark ? 0.5 : 0.1; o.filter = "brightness(0)"; o.drawImage(c, -0.8 * RES, -1 * RES);
      o.filter = "none"; o.globalAlpha = 1; o.drawImage(c, 0, 0);
      return { c: out, x: x0, y: y0, w, h };
    };

    // ---------- 장면 → 표 내용 ----------
    const T_ = (s: string, size: number, fam: string, w: number, x: number, y: number, ink: string, o: { align?: CanvasTextAlign; rot?: number } = {}): Item => ({ t: "text", s: clean(s), size, fam, w, x, y, ink, ...o });
    const LH = KO ? 1.12 : 1; // 한글 줄은 조금 더 띄운다
    const lay = {
      hook(s: Extract<FlatScene, { kind: "hook" }>): Partial<Ticket> {
        const out: Item[][] = [];
        out.push([T_(s.label, 30, SLAB, 700, CR.x0, CR.y0 + 28, v.ink)]);
        const room = CH - 30 - 64;
        const size = fitG(s.value, CW * 0.72, Math.min(250, room / 0.82), 80);
        const base = CR.y0 + 40 + size * 0.8;
        out.push([T_(s.value, size, GOTH, 400, CR.x0 - 4, base, s.alarm ? ALARM : v.ink)]);
        const lines = wrap(s.line, F(28, SLAB, 700), CW * 0.95);
        out.push(lines.map((ln, i) => T_(ln, 28, SLAB, 700, CR.x0, CR.y1 - (lines.length - 1 - i) * 34 * LH - 6, v.ink)));
        return { blocks: out, read: readLen(s.label + s.value + s.line), perf: s.data === "sample" ? { x: CR.x1 - 230, y: CR.y0 + 8 } : null };
      },
      story(s: Extract<FlatScene, { kind: "story" }>): Partial<Ticket> {
        const items = [T_(L.nowShowing, 24, SLAB, 500, CR.x0, CR.y0 + 22, v.spot)];
        const lead = KO ? 1.08 : 0.92;
        let size = 104, lines: string[] = [];
        for (; size >= 50; size -= 6) { lines = wrap(s.line, F(size, GOTH), CW); if (lines.length * size * lead <= CH - 110) break; }
        lines.forEach((ln, i) => items.push(T_(ln, size, GOTH, 400, CR.x0 - 2, CR.y0 + 34 + size * 0.8 + i * size * lead, v.ink)));
        const l2 = wrap(s.line2, F(28, SLAB, 500), CW);
        const yb = CR.y0 + 34 + size * 0.8 + (lines.length - 1) * size * lead + 46;
        return { blocks: [items, l2.map((ln, i) => T_(ln, 28, SLAB, 500, CR.x0, yb + i * 34 * LH, v.ink))], read: readLen(s.line + s.line2) };
      },
      flow(s: Extract<FlatScene, { kind: "flow" }>, nth: number): Partial<Ticket> {
        const out: Item[][] = [[T_(nth ? L.secondHalf : L.programme, 24, SLAB, 500, CR.x0, CR.y0 + 22, v.spot)]];
        const n = s.nodes.length;
        const lineL = wrap(s.line, F(24, SLAB, 500), CW);
        const rowH = Math.min(62, (CH - 40 - lineL.length * 30 * LH - 18) / n);
        s.nodes.forEach((nd, i) => {
          const y = CR.y0 + 40 + (i + 0.8) * rowH;
          const last = i === n - 1;
          const fw = last ? 700 : 500;
          const fs = fitSlab(clean(nd), CW - 120, Math.min(last ? 40 : 34, rowH * 0.62), fw);
          const its = [T_(ROMAN[i] || String(i + 1), Math.min(46, rowH * 0.8), GOTH, 400, CR.x0, y + 2, v.spot), T_(nd, fs, SLAB, fw, CR.x0 + 74, y, v.ink)];
          const wd = meas(clean(nd), F(fs, SLAB, fw));
          if (!last && CR.x0 + 74 + wd + 30 < CR.x1 - 10) its.push({ t: "leader", x0: CR.x0 + 74 + wd + 18, x1: CR.x1 - 10, y: y - fs * 0.25, ink: K.rgba(v.spot, 0.9) });
          out.push(its);
        });
        out.push(lineL.map((ln, i) => T_(ln, 24, SLAB, 500, CR.x0, CR.y1 - (lineL.length - 1 - i) * 30 * LH - 4, v.ink)));
        return { blocks: out, read: readLen(s.nodes.join(" ") + s.line) * 0.85, rowsStagger: true };
      },
      terminal(s: Extract<FlatScene, { kind: "terminal" }>): Partial<Ticket> {
        const cs = fitSlab(clean(s.command), CW, 30, 700);
        const head = [T_(L.presented, 22, SLAB, 500, CR.x0, CR.y0 + 20, v.spot), T_(s.command, cs, SLAB, 700, CR.x0, CR.y0 + 58, v.ink)];
        const rows: Item[] = [];
        const rh = Math.min(38, (CH - 120) / Math.max(1, s.output.length));
        s.output.forEach((o, i) => {
          const y = CR.y0 + 100 + i * rh;
          const m = clean(o).match(/^(.*?):\s*(.*)$/);
          const key = /survived|살아남/i.test(o);
          if (m) {
            const w1 = meas(m[1], F(26, SLAB, key ? 700 : 500)), w2 = meas(m[2], F(26, SLAB, 700));
            rows.push(T_(m[1], 26, SLAB, key ? 700 : 500, CR.x0, y, v.ink), T_(m[2], 26, SLAB, 700, CR.x1, y, v.ink, { align: "right" }));
            if (CR.x0 + w1 + 24 < CR.x1 - w2 - 10) rows.push({ t: "leader", x0: CR.x0 + w1 + 14, x1: CR.x1 - w2 - 10, y: y - 6, ink: K.rgba(v.spot, 0.85) });
          } else rows.push(T_(o, fitSlab(clean(o), CW, 26, 500), SLAB, 500, CR.x0, y, v.ink));
        });
        const foot = [T_(s.line, fitSlab(clean(s.line), CW, 26, 700), SLAB, 700, CR.x0, CR.y1 - 4, v.ink)];
        return { blocks: [head, rows, foot], read: readLen(s.command + s.output.join(" ") + s.line) * 0.7, perf: s.data === "sample" ? { x: CR.x1 - 230, y: CR.y0 - 2 } : null };
      },
      items(s: Extract<FlatScene, { kind: "items" }>): Partial<Ticket> {
        const n = s.items.length, bw = CW / n, bh = Math.min(170, CH - 96), by = CR.y0 + 38;
        const items = [T_(L.seating, 24, SLAB, 500, CR.x0, CR.y0 + 22, v.spot)];
        let punch: { x: number; y: number } | null = null;
        s.items.forEach((it, i) => {
          const bx = CR.x0 + i * bw;
          items.push({ t: "box", x: bx + 4, y: by, w: bw - 8, h: bh, ink: K.rgba(v.spot, 0.95) });
          wrap(it.label, F(21, SLAB, 700), bw - 30).slice(0, 2).forEach((ln, r) => items.push(T_(ln, 21, SLAB, 700, bx + 16, by + 30 + r * 24 * LH, v.ink)));
          const val = it.value === "✓" ? "OK" : clean(it.value);
          const vs = fitG(val, (bw - 34) * 0.72, 84, 30);
          items.push(T_(val, vs, GOTH, 400, bx + 15, by + bh - 16, it.alarm ? ALARM : v.ink));
          if (!punch && (it.alarm || it.value === "✓")) punch = { x: bx + bw - 27, y: by + bh - 30 };
        });
        const ll = wrap(s.line, F(26, SLAB, 700), CW);
        const foot = ll.map((ln, i) => T_(ln, 26, SLAB, 700, CR.x0, by + bh + 40 + i * 32 * LH, v.ink));
        return { blocks: [items, foot], punch, read: readLen(s.items.map((it) => it.label + it.value).join(" ") + s.line) * 0.6, perf: s.data === "sample" ? { x: CR.x1 - 230, y: CR.y0 - 6 } : null };
      },
      stats(s: Extract<FlatScene, { kind: "stats" }>): Partial<Ticket> {
        const n = s.stats.length, bw = CW / n, bh = Math.min(190, CH - 100), by = CR.y0 + 8;
        const blocks: Item[][] = [];
        s.stats.forEach((st, i) => {
          const bx = CR.x0 + i * bw;
          const unit = st.unit === "%" ? "%" : st.unit || "";
          const its: Item[] = [{ t: "box", x: bx + 4, y: by, w: bw - 8, h: bh, ink: K.rgba(v.spot, 0.95) }];
          wrap(st.label, F(21, SLAB, 700), bw - 30).slice(0, 2).forEach((ln, r) => its.push(T_(ln, 21, SLAB, 700, bx + 16, by + 30 + r * 24 * LH, v.ink)));
          const vs = fitG(st.value, (bw - 40) * (unit.length > 1 ? 0.55 : 0.72), 130, 50);
          its.push(T_(st.value, vs, GOTH, 400, bx + 15, by + bh - 16, v.ink));
          if (unit) its.push(T_(unit, Math.round(vs * (unit === "%" ? 0.62 : hasWide(unit) ? 0.34 : 0.4)), GOTH, 400, bx + 22 + meas(clean(st.value), F(vs, GOTH)), by + bh - 16, v.ink));
          if (i === 0) blocks.push(its); else { if (blocks.length < 2) blocks.push([]); blocks[1].push(...its); }
        });
        const foot: Item[] = [];
        let fy = by + bh + 36;
        if (s.source) { foot.push(T_(L.source + s.source, 19, SLAB, 500, CR.x0 + 4, fy, v.spot)); fy += 32; }
        wrap(s.line, F(26, SLAB, 700), CW).forEach((ln, i) => foot.push(T_(ln, 26, SLAB, 700, CR.x0 + 4, fy + i * 32 * LH, v.ink)));
        blocks.push(foot);
        return { blocks, read: readLen(s.stats.map((st) => st.label + st.value).join(" ") + s.line) * 0.7, perf: s.data === "sample" ? { x: CR.x0 + CW * 0.55, y: CR.y1 - 40 } : null };
      },
      alert(s: Extract<FlatScene, { kind: "alert" }>): Partial<Ticket> {
        const bodyTop = CR.y0 + 92;
        const lead = KO ? 1.05 : 0.9;
        let size = 120, lines: string[] = [];
        for (; size >= 48; size -= 6) { lines = wrap(s.body, F(size, GOTH), CW); if (lines.length <= 2 && lines.length * size * lead <= CH - 92 - 74) break; }
        const body = lines.map((ln, i) => T_(ln, size, GOTH, 400, CR.x0 - 2, bodyTop + size * 0.8 + i * size * lead, v.ink));
        const yl = bodyTop + size * 0.8 + (lines.length - 1) * size * lead + 40;
        const ls = [T_(s.line, 28, SLAB, 700, CR.x0, yl, v.ink)];
        if (s.line2) ls.push(T_(s.line2, 26, SLAB, 500, CR.x0, yl + 33 * LH, v.ink));
        const ts = clean(s.title);
        const bsz = Math.min(58, fitG(ts, CW - 60, 58, 30));
        const bwid = Math.min(CW + 60, meas(ts, F(bsz, GOTH)) + 120);
        const band: Item[] = [{ t: "band", cx: CR.x0 + bwid / 2 - 20, cy: CR.y0 + 36, w: bwid, h: 78, rot: -0.05, ink: ALARM, s: ts, size: bsz }];
        return { blocks: [body, ls, band], overprint: 2, read: readLen(s.title + s.body + s.line + (s.line2 || "")), perf: s.data === "sample" ? { x: CR.x1 - 230, y: CR.y1 - 40 } : null };
      },
      ending(s: Extract<FlatScene, { kind: "ending" }>): Partial<Ticket> {
        const blocks: Item[][] = [];
        let keep: Keep;
        const nm = clean(s.name);
        if (venue === "cinema") {
          // 이름은 꼬리표를 따라 찍힌다(가져가는 쪽) · 인사는 본권에
          if (hasWide(nm) && Array.from(nm).length <= 8) {
            const ch = Array.from(nm), sz = Math.min(96, (TH - 170) / ch.length / 0.98, v.stubW - 120);
            blocks.push(ch.map((c, i) => T_(c, sz, GOTH, 400, v.stubW / 2 - 14, 120 + sz * 0.8 + i * sz * 0.98, v.ink, { align: "center" })).filter((it) => it.t === "text" && it.s !== " "));
          } else {
            const sz = Math.min(150, fitG(nm, TH - 150, 160, 50));
            blocks.push([T_(nm, sz, GOTH, 400, v.stubW / 2 + sz * 0.3, TH - 64, v.ink, { rot: -Math.PI / 2 })]);
          }
          const s1 = fitSlab(clean(s.line), CW * 2, KO ? 48 : 58, 700, 30);
          const l1 = wrap(s.line, F(s1, SLAB, 700), CW), l2 = wrap(s.line2, F(34, SLAB, 500), CW);
          const its: Item[] = [];
          l1.forEach((ln, i) => its.push(T_(ln, s1, SLAB, 700, CR.x0, CR.y0 + 76 + i * s1 * 1.14 * LH, v.ink)));
          l2.forEach((ln, i) => its.push(T_(ln, 34, SLAB, 500, CR.x0, CR.y0 + 96 + l1.length * s1 * 1.14 * LH + i * 40 * LH, v.ink)));
          blocks.push(its);
          keep = { x0: 0, x1: v.stubW, hand: { x: v.stubW - 30, y: TH - 64, size: 19, rot: -Math.PI / 2 } };
        } else if (venue === "concert") {
          const m1 = TW - v.stubW;
          const sz = fitG(nm, v.stubW - 56, 90, 30);
          blocks.push([T_(nm, sz, GOTH, 400, m1 + 28, 190, v.ink)]);
          const l1 = wrap(s.line, F(44, SLAB, 700), CW), l2 = wrap(s.line2, F(30, SLAB, 500), CW);
          const its: Item[] = [];
          l1.forEach((ln, i) => its.push(T_(ln, 44, SLAB, 700, CR.x0, CR.y0 + 70 + i * 52 * LH, v.ink)));
          l2.forEach((ln, i) => its.push(T_(ln, 30, SLAB, 500, CR.x0, CR.y0 + 84 + l1.length * 52 * LH + i * 36 * LH, v.ink)));
          blocks.push(its);
          keep = { x0: m1, x1: TW, hand: { x: m1 + 28, y: 250, size: 17 } };
        } else {
          const half = TW * 0.6 - CR.x0 - 24;
          const sz = fitG(nm, half, 96, 40);
          const nl = wrap(nm, F(sz, GOTH), half);
          blocks.push(nl.map((ln, i) => T_(ln, sz, GOTH, 400, CR.x0 - 2, CR.y0 + 14 + sz * 0.8 + i * sz * 0.9, v.ink)));
          const yl = CR.y0 + 14 + sz * 0.8 + (nl.length - 1) * sz * 0.9 + 46;
          const its: Item[] = [];
          wrap(s.line, F(30, SLAB, 700), half).forEach((ln, i) => its.push(T_(ln, 30, SLAB, 700, CR.x0, yl + i * 36 * LH, v.ink)));
          const y2 = yl + its.length * 36 * LH;
          wrap(s.line2, F(28, SLAB, 500), half).forEach((ln, i) => its.push(T_(ln, 28, SLAB, 500, CR.x0, y2 + i * 34 * LH, v.ink)));
          its.push(T_(L.keepHalf, fitSlab(L.keepHalf, TW * 0.4 - 160, 22, 500), SLAB, 500, TW * 0.6 + 40, CR.y1 - 8, v.spot));
          blocks.push(its);
          keep = { x0: 0, x1: TW * 0.6, hand: { x: CR.x0, y: CR.y1 - 8, size: 20 } };
        }
        return { blocks, keep, read: readLen(s.line + s.line2 + s.name) * 0.8 };
      },
    };
    const layOut = (s: FlatScene, nth: number): Partial<Ticket> => {
      switch (s.kind) {
        case "hook": return lay.hook(s);
        case "story": return lay.story(s);
        case "flow": return lay.flow(s, nth);
        case "terminal": return lay.terminal(s);
        case "items": return lay.items(s);
        case "stats": return lay.stats(s);
        case "alert": return lay.alert(s);
        case "ending": return lay.ending(s);
      }
    };
    const tickets: Ticket[] = [];
    let flowN = 0;
    work.scenes.forEach((s, si) => {
      const Lt = layOut(s, s.kind === "flow" ? flowN++ : 0);
      const blocks = (Lt.blocks || []).filter((b) => b.length);
      tickets.push({ ...Lt, kind: s.kind, blocks, read: Lt.read || 10, made: blocks.map((b, k) => makeBlock(b, seed + si * 31 + k)), holdStart: 0, holdEnd: 0 });
    });

    // ---------- 시간표 ----------
    const pulls: Pull[] = [];
    const imps: Imp[] = [];
    const punches: { ti: number; si: number; x: number; y: number }[] = [];
    const perfs: { ti: number; si: number; x: number; y: number }[] = [];
    const sceneAt: number[] = [];
    let T = 0, tStart = 0;
    const centerOf = (i: number) => i * TW + TW / 2;
    let cur = centerOf(0);
    tickets.forEach((tk, si) => {
      sceneAt[si] = T;
      if (si > 0) {
        const a = cur, b = centerOf(si);
        const two = R() < 0.45;
        const dur = 0.9 + R() * 0.2;
        if (two) {
          const mid = a + (b - a) * (0.55 + R() * 0.12);
          pulls.push({ t0: T, t1: T + dur * 0.5, a, b: mid });
          const a2 = K.lerp(a, mid, K.ease.spring(dur * 0.5 + 0.12, dur * 0.5 * 1.15, 0.16));
          pulls.push({ t0: T + dur * 0.5 + 0.12, t1: T + dur + 0.12, a: a2, b });
          T += dur + 0.12;
        } else { pulls.push({ t0: T, t1: T + dur, a, b }); T += dur; }
        cur = b;
        T += 0.12;
      }
      let t = T + (si === 0 ? 0 : 0.2);
      tk.made.forEach((blk, k) => {
        t += k === 0 ? 0.15 : 0.3 + Math.min(0.42, Math.sqrt(blk.w * blk.h) / 1400) + R() * 0.1;
        if (tk.rowsStagger && k > 0 && k < tk.made.length - 1) t -= 0.12;
        const heavy = tk.overprint === k;
        if (heavy) t += 0.35;
        imps.push({ ti: t, si, blk, heavy });
        if (si === 0 && k === tk.made.length - 1) tStart = t - 0.25;
      });
      if (tk.punch) { t += 0.55; punches.push({ ti: t, si, ...tk.punch }); }
      if (tk.perf) { t += 0.5; perfs.push({ ti: t, si, ...tk.perf }); }
      let hold = Math.max(1.0, readHold(tk.read) - (t - T) * 0.9 - 0.3);
      if (tk.kind === "terminal") hold = Math.max(hold, 2.2);
      if (tk.kind === "hook") hold = Math.max(hold, 1.8);
      hold = Math.min(hold, tk.kind === "ending" ? 1.1 : tk.kind === "terminal" ? 2.4 : KO ? 2.3 : 1.9);
      tk.holdStart = t; tk.holdEnd = t + hold;
      T = t + hold;
    });
    const tRip = T;
    const keep: Keep = tickets[N - 1].keep || { x0: 0, x1: TW, hand: { x: CR.x0, y: CR.y1 - 8, size: 20 } };
    const tHand = tRip + 1.0;
    for (const p of pulls) { p.t0 -= tStart; p.t1 -= tStart; }
    for (const m of imps) m.ti -= tStart;
    for (const m of punches) m.ti -= tStart;
    for (const m of perfs) m.ti -= tStart;
    for (const tk of tickets) { tk.holdStart -= tStart; tk.holdEnd -= tStart; }
    const RIP = tRip - tStart, HAND = tHand - tStart;
    const duration = HAND + 2.5;
    const starts = work.scenes.map((_, i) => Math.max(0, (sceneAt[i] ?? 0) - tStart));

    // 바늘 구멍 SAMPLE/예시 무늬(표 좌표의 구멍 중심, 열 순서로 뚫린다)
    const perfPat = (() => {
      const word = L.sample, wide = hasWide(word);
      const rows = wide ? 13 : 7, k = 8, size = (rows * k) / 0.72;
      const c = mk(size * Array.from(word).length * 1.2, size * 1.25), x = c.getContext("2d", { willReadFrequently: true })!;
      x.font = wide ? F(size, GOTH) : F(size, SLAB, 700); x.textBaseline = "alphabetic"; x.fillStyle = "#000";
      const w = Math.ceil(x.measureText(word).width), base = Math.ceil(size * (wide ? 0.95 : 0.82));
      x.fillText(word, 0, base);
      const d = x.getImageData(0, 0, c.width, c.height).data, pts: number[] = [];
      for (let j = 0; j * k < c.height - k; j++) for (let i = 0; i * k < w; i++) {
        let s = 0;
        for (let yy = 0; yy < k; yy++) for (let xx = 0; xx < k; xx++) s += d[((j * k + yy) * c.width + i * k + xx) * 4 + 3];
        if (s / (k * k * 255) > 0.42) pts.push(i, j);
      }
      return { p: wide ? 3.1 : 4.6, r: wide ? 1.25 : 1.55, cols: Math.ceil(w / k), raw: pts };
    })();

    // ---------- 시간 → 상태 ----------
    const stripX = (t: number) => {
      let x = centerOf(0);
      for (const p of pulls) {
        if (t < p.t0) break;
        if (t >= p.t1 + 0.6) { x = p.b; continue; }
        // 손으로 당김: 빠르게 시작해 종이 장력으로 살짝 넘쳤다가 돌아온다
        x = K.lerp(p.a, p.b, K.ease.spring(t - p.t0, (p.t1 - p.t0) * 1.15, 0.16));
      }
      return x;
    };
    const dip = (t: number) => {
      let d = 0;
      for (const m of imps) { const u = t - m.ti; if (u > 0 && u < 0.2) d += Math.sin((u / 0.2) * Math.PI) * (m.heavy ? 4 : 2.2); }
      return d;
    };
    const ripP = (t: number) => K.ease.inCubic(K.seg(t, RIP, 0.5));
    const goP = (t: number) => K.seg(t, RIP + 0.45, 0.9);

    // ---------- 그리기 ----------
    const ripX = venue === "cinema" ? v.stubW : venue === "concert" ? TW - v.stubW : TW * 0.6;
    const ripPath: [number, number][] = [];
    for (let yy = 0; yy <= TH + 0.1; yy += 6) {
      const free = venue === "matinee";
      ripPath.push([ripX + (free ? K.noise(yy * 0.012, seed % 13) * 14 : 0) + (K.rand(seed, yy) - 0.5) * (free ? 6 : 3.4), yy]);
    }
    const partPath = (g: CanvasRenderingContext2D, side: number) => {
      g.beginPath();
      const edge = side < 0 ? -2 : TW + 2;
      g.moveTo(edge, -2);
      for (const [x, y] of ripPath) g.lineTo(x, y);
      g.lineTo(edge, TH + 2);
      g.closePath();
    };
    const holeShape = (g: CanvasRenderingContext2D, x: number, y: number, r: number) => {
      g.beginPath();
      if (v.punch === "star") { for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); }
      else if (v.punch === "diamond") { g.moveTo(x, y - r); g.lineTo(x + r * 0.75, y); g.lineTo(x, y + r); g.lineTo(x - r * 0.75, y); g.closePath(); }
      else g.arc(x, y, r * 0.8, 0, Math.PI * 2);
    };
    const drawTicket = (g: CanvasRenderingContext2D, t: number, i: number) => {
      g.fillStyle = "rgba(0,0,0,0.13)";
      for (let k = 1; k <= 3; k++) g.fillRect(4 * k, 5 * k, TW, TH);
      drawBase(g, i);
      for (const m of imps) {
        if (m.si !== i || t < m.ti) continue;
        const u = t - m.ti;
        // 닿는 순간: 판이 잉크를 한두 프레임 짓누르고 자리 잡는다
        const sq = u < 0.07 ? 1 + (0.07 - u) * 0.25 : 1;
        const b = m.blk;
        if (sq !== 1) { g.save(); g.translate(b.x + b.w / 2, b.y + b.h / 2); g.scale(sq, sq); g.drawImage(b.c, -b.w / 2, -b.h / 2, b.w, b.h); g.restore(); }
        else g.drawImage(b.c, b.x, b.y, b.w, b.h);
      }
      // 압판의 그림자가 닿기 전에 다가오고, 들리며 물러난다
      for (const m of imps) {
        if (m.si !== i) continue;
        const u = t - m.ti, pre = m.heavy ? 0.2 : 0.13;
        if (u < -pre || u > 0.22) continue;
        const a = u < 0 ? (1 + u / pre) * (m.heavy ? 0.34 : 0.24) : (1 - u / 0.22) * 0.2;
        const off = u < 0 ? 8 + (-u / pre) * 46 : 6 + (u / 0.22) * 30;
        const b = m.blk;
        g.fillStyle = `rgba(0,0,0,${(a / 4).toFixed(3)})`;
        for (let q = 0; q < 4; q++) g.fillRect(b.x - 6 - q * 7 + off, b.y - 6 - q * 7 + off * 1.2, b.w + 12 + q * 14, b.h + 12 + q * 14);
      }
      for (const pu of punches) {
        if (pu.si !== i || t < pu.ti) continue;
        g.fillStyle = v.ground; holeShape(g, pu.x, pu.y, 17); g.fill();
        g.strokeStyle = "rgba(0,0,0,0.25)"; g.lineWidth = 1.5; g.stroke();
      }
      for (const pf of perfs) {
        if (pf.si !== i || t < pf.ti) continue;
        const showCols = Math.ceil(K.clamp((t - pf.ti) / 0.24) * perfPat.cols);
        g.fillStyle = v.ground;
        const raw = perfPat.raw, p = perfPat.p;
        for (let q = 0; q < raw.length; q += 2) { if (raw[q] >= showCols) continue; g.beginPath(); g.arc(pf.x + raw[q] * p, pf.y + raw[q + 1] * p, perfPat.r, 0, Math.PI * 2); g.fill(); }
      }
    };
    const drawChads = (g: CanvasRenderingContext2D, t: number, i: number) => {
      for (const pu of punches) {
        if (pu.si !== i) continue;
        const u = t - pu.ti;
        if (u < 0 || u > 0.55) continue;
        // 뚫린 종이 조각이 떨어진다
        g.save();
        g.translate(pu.x + u * 40, pu.y + 6 + u * u * 1400);
        g.rotate(u * 7);
        g.globalAlpha = 1 - K.clamp((u - 0.35) / 0.2);
        g.fillStyle = v.stock; holeShape(g, 0, 0, 17); g.fill();
        g.strokeStyle = "rgba(0,0,0,0.2)"; g.lineWidth = 1; g.stroke();
        g.restore();
      }
    };

    // 카메라: 매표소 창에 고정, 멈춤에서만 밀어 들어가고, 찢은 뒤엔 남는 쪽을 찾아간다
    const baseZ = 1290 / TW;
    const ripCam = K.ease.bezier(0.4, 0, 0.12, 1);
    const camAt = (t: number) => {
      let z = baseZ, x = 0;
      for (const tk of tickets) {
        if (t < tk.holdStart) break;
        const e = K.ease.outCubic(K.seg(t, tk.holdStart, 2.4));
        z = baseZ * (1 + 0.04 * e * (t < tk.holdEnd + 0.3 ? 1 : 0));
      }
      const k = ripCam(K.seg(t, RIP + 0.35, 1.3));
      if (k > 0) {
        const kx = (keep.x0 + keep.x1) / 2 - TW / 2;
        const zt = Math.min(1.75, 1300 / (keep.x1 - keep.x0 + 200), 780 / (TH + 40));
        x = kx * k; z = K.lerp(z, zt, k);
      }
      return { x, z };
    };

    return {
      duration,
      starts,
      render(g, t) {
        g.fillStyle = v.ground; g.fillRect(0, 0, K.W, K.H);
        const c = camAt(t);
        const sx = stripX(t);
        g.save();
        g.translate(800, 450);
        g.rotate((v.tilt * Math.PI) / 180);
        g.scale(c.z, c.z);
        g.translate(-TW / 2 - c.x, -TH / 2);
        // 띠 좌표: i번 표는 [i*TW, (i+1)*TW], 창에는 sx의 표가 보인다
        g.translate(TW / 2 - sx, dip(t));
        const viewHalf = 840 / c.z + 30;
        const lo = Math.max(0, Math.floor((sx - viewHalf) / TW)), hi = Math.min(N - 1, Math.floor((sx + viewHalf) / TW));
        const rp = ripP(t), gp = goP(t);
        const last = N - 1;
        // 공연: 찢고 나면 꼬리표만 남고 나머지 띠는 끌려간다
        const stripGone = venue === "concert" ? K.ease.inCubic(gp) * -2600 : 0;
        for (let i = lo; i <= hi; i++) {
          g.save();
          g.translate(i * TW, 0);
          if (i !== last || rp <= 0) {
            if (i !== last) g.translate(stripGone, 0);
            drawTicket(g, t, i);
            drawChads(g, t, i);
            g.restore();
            continue;
          }
          // 검표원이 마지막 표를 찢는다
          const goSide = venue === "concert" ? -1 : 1;
          const front = TH * rp;
          for (const side of [goSide, -goSide]) {
            const going = side === goSide;
            g.save();
            if (going) {
              g.translate(ripX, front); g.rotate(rp * 0.035 * (venue === "concert" ? -1 : 1)); g.translate(-ripX, -front);
              const e = K.ease.inCubic(gp);
              if (venue === "cinema") { g.translate(e * 220, -e * 1100); g.translate(ripX, TH); g.rotate(e * 0.22); g.translate(-ripX, -TH); }
              else if (venue === "matinee") { g.translate(e * 160, e * 1100); g.translate(ripX, 0); g.rotate(e * 0.35); g.translate(-ripX, 0); }
              else g.translate(stripGone, 0);
            } else if (venue === "concert") {
              // 풀려난 꼬리표가 카운터에 살짝 떨어져 자리 잡는다
              const s = K.ease.spring(Math.max(0, t - RIP - 0.4), 0.8, 0.2);
              g.translate(TW - v.stubW / 2, TH / 2); g.rotate(-0.05 * s); g.translate(-(TW - v.stubW / 2), -TH / 2);
              g.translate(0, 26 * s);
            }
            partPath(g, side);
            g.clip();
            drawTicket(g, t, i);
            if (!going && t > HAND - 0.01) {
              const hp = K.seg(t, HAND, 2.5);
              const hd = keep.hand;
              if (hd.rot) { g.translate(hd.x, hd.y); g.rotate(hd.rot); }
              K.handoff(g, hp, { ink: v.ink, family: SLAB, size: hd.size, x: hd.rot ? 0 : hd.x, y: hd.rot ? 0 : hd.y, handle: work.handle });
            }
            g.restore();
          }
          g.restore();
        }
        g.restore();
        K.grain(g, t, 0.05, seed, 12, "overlay");
      },
    };
  },
};
