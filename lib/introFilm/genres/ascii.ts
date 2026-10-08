// 아스키 — 글자로만 그린 세계(필름 실험실 G11 v2, 2026-10-08).
// 화면 전체가 고정폭 글자 한 판이고, 모든 그림은 글자로 그린 "물건"이다. 작품마다 다른 물건을 고른다:
//   명령줄 장면이 있는 작품 = 로그 벽(세션 기록 글자로 숫자가 켜지고, 토큰을 태우면 줄이 밀도 사다리를 타고 꺼진다)
//   방마다 % 수치가 있는 작품 = 집 평면도(습도는 바닥부터 차오르는 글자 밀도, 경고는 김 서린 창에 손가락으로 쓴 글씨)
//   그 밖 = 맥과 폰(상태가 맥을 떠나 선 위에서 암호 글자가 되고, 폰 안에서만 풀린다)
// 움직임: 글자판은 15fps로 끊어 바뀌고, 장면은 1.0초 밀도 디졸브(X → + → : → . 로 내려갔다 다음 장면이 올라온다),
// 글자는 같은 사다리로 왼→오 도착. 한글은 두 칸을 차지한다.
import type { FlatScene, Genre, GenreWork } from "./types";
import * as K from "./kit";

type Loc = "en" | "ko";
const LABEL: Record<Loc, { sample: string; sampleData: string; sampleAlert: string; thisComputer: string; working: string; source: string; time: string; hashSample: string }> = {
  en: { sample: "sample", sampleData: "sample data", sampleAlert: "sample alert", thisComputer: " this computer ", working: "working", source: "source: ", time: "time", hashSample: "# sample data" },
  ko: { sample: "예시", sampleData: "예시 자료", sampleAlert: "예시 알림", thisComputer: " 이 컴퓨터 ", working: "작업 중", source: "출처: ", time: "시각", hashSample: "# 예시 자료" },
};

// ---- 한글은 두 칸(읽는 시간도 더 든다) ----
const isWide = (c: string) => {
  const n = c.codePointAt(0) || 0;
  return (n >= 0x1100 && n <= 0x115f) || (n >= 0x2e80 && n <= 0xa4cf) || (n >= 0xac00 && n <= 0xd7a3) || (n >= 0xf900 && n <= 0xfaff) || (n >= 0xff00 && n <= 0xff60) || (n >= 0xffe0 && n <= 0xffe6) || n >= 0x1f300;
};
const colLen = (s: string) => Array.from(s).reduce((a, c) => a + (isWide(c) ? 2 : 1), 0);
const readLen = (s: string) => Array.from(s).reduce((a, c) => a + (isWide(c) ? 1.7 : 1), 0);
/** 칸 수 안으로 자른다. */
const fitCols = (s: string, n: number) => { let out = "", w = 0; for (const c of Array.from(s)) { const cw = isWide(c) ? 2 : 1; if (w + cw > n) break; out += c; w += cw; } return out; };
/** 칸 단위 줄바꿈 — 띄어쓰기로 끊고, 줄보다 긴 낱말은 글자로 끊는다. 줄 길이를 고르게 맞춘다. */
function wrapCols(text: string, n: number): string[] {
  const words = String(text).split(/\s+/).filter(Boolean);
  const greedy = (m: number) => {
    const out: string[] = [];
    let cur = "";
    for (let w of words) {
      if (cur && colLen(cur + " " + w) > m) { out.push(cur); cur = ""; }
      while (colLen(w) > m) { const head = fitCols(w, m); out.push((cur ? cur + " " : "") + head); cur = ""; w = Array.from(w).slice(Array.from(head).length).join(""); }
      cur = cur ? cur + " " + w : w;
    }
    if (cur) out.push(cur);
    return out;
  };
  const base = greedy(n);
  if (base.length < 2) return base;
  let best = base, sc = 1e9;
  const longestWord = Math.max(...words.map(colLen));
  for (let m = n; m >= Math.max(Math.floor(n * 0.6), longestWord); m--) {
    const w = greedy(m);
    if (w.length !== base.length) break;
    const s = Math.max(...w.map(colLen)) - Math.min(...w.map(colLen));
    if (s < sc) { sc = s; best = w; }
  }
  return best;
}

function makeNoise(seed: number) {
  const r = K.rng(seed);
  const p = new Uint8Array(512), v = new Float32Array(256);
  for (let i = 0; i < 256; i++) { p[i] = i; v[i] = r(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 256; i++) p[i + 256] = p[i];
  const sm = (t: number) => t * t * (3 - 2 * t);
  const h = (x: number, y: number, z: number) => v[p[p[p[x & 255] + (y & 255)] + (z & 255)]];
  return (x: number, y: number, z = 0) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = sm(x - xi), yf = sm(y - yi), zf = sm(z - zi);
    const a = h(xi, yi, zi) + (h(xi + 1, yi, zi) - h(xi, yi, zi)) * xf;
    const b = h(xi, yi + 1, zi) + (h(xi + 1, yi + 1, zi) - h(xi, yi + 1, zi)) * xf;
    const c = h(xi, yi, zi + 1) + (h(xi + 1, yi, zi + 1) - h(xi, yi, zi + 1)) * xf;
    const d = h(xi, yi + 1, zi + 1) + (h(xi + 1, yi + 1, zi + 1) - h(xi, yi + 1, zi + 1)) * xf;
    const e = a + (b - a) * yf, f = c + (d - c) * yf;
    return e + (f - e) * zf;
  };
}

type Buf = { ch: Uint16Array; ly: Uint8Array; inv: Uint8Array };
type Mask = { m: Float32Array; t: Float32Array; b: Float32Array; x0: number; x1: number; y0: number; y1: number; size: number };
type Cap = { s: string; c2: number; r2: number; at: number; L: number; inv?: boolean; on?: boolean; type?: number; tight?: boolean };
type Scene = { draw(B: Buf, lt: number): void; caps: Cap[]; over?: (g: CanvasRenderingContext2D, lt: number) => void; fadeBg?: boolean; s?: FlatScene; at?: number; dur?: number };
type WorldKind = "log" | "devices" | "house";

/** 어떤 물건을 그릴지는 장면 구조로 정한다(낱말이 아니라 — 두 언어에서 같다). */
function worldOf(scenes: FlatScene[]): WorldKind {
  if (scenes.some((s) => s.kind === "terminal")) return "log";
  const items = scenes.find((s) => s.kind === "items");
  if (items && items.kind === "items" && items.items.length >= 3) {
    const pct = items.items.filter((x) => /%\s*$/.test(x.value)).length;
    if (pct >= Math.ceil(items.items.length * 0.6)) return "house";
  }
  return "devices";
}

export const ascii: Genre = {
  id: "ascii",
  name: "ASCII text-mode",
  ko: "아스키",
  koIdea: "글자로만 그린 세계 — 작품마다 다른 물건(로그 벽·맥과 폰·집 평면도)을 글자로 그리고, 숫자는 그 물건의 글자로 떠오른다",
  enIdea: "A world drawn only in characters — each work becomes its own object (a log wall, a Mac and a phone, a floor plan) and its numbers light up out of that object's text.",
  family: "E",
  fonts: ["plexMono", "dmMono", "courierPrime", "archivo"],
  make(work: GenreWork, { seed, fonts }) {
    const W = K.W, H = K.H;
    const T = LABEL[work.locale];
    const noise = makeNoise(seed);
    const scenes = work.scenes;
    const world = worldOf(scenes);
    const acc = work.accent, alarmHex = work.alarm || "#ff5a4e";
    const HEAVY = fonts.archivo;
    // ---------- 세계마다 글꼴·색·디졸브 방향 ----------
    const LOOK = {
      log: { fam: fonts.plexMono, fs: 16, lh: 1.14, bw: 600, bg: "#0b0c0d", cols: ["#2a2d2f", "#6c706d", "#d8dad5", "#ffffff", acc || "#ffffff", alarmHex], dir: "down", invFill: "" },
      devices: { fam: fonts.dmMono, fs: 21, lh: 1.3, bw: 500, bg: "#e6e9ec", cols: ["#c2c8ce", "#868d95", "#25292e", "#0c0e10", acc ? K.mix(acc, "#000000", 0.1) : "#d9820a", alarmHex], dir: "right", invFill: "" },
      house: { fam: fonts.courierPrime, fs: 19, lh: 1.3, bw: 700, bg: "#0d1821", cols: ["#22384a", "#58718a", "#c9d8e3", "#eef4f8", acc || "#f18600", alarmHex], dir: "up", invFill: "#40596d" },
    }[world];
    const FAM = LOOK.fam, COLS = LOOK.cols.slice();
    const mkCanvas = () => document.createElement("canvas");
    const mc = mkCanvas().getContext("2d")!;
    mc.font = K.font(LOOK.fs, FAM, 400);
    const CW = mc.measureText("M").width, LH = Math.round(LOOK.fs * LOOK.lh);
    const C = Math.floor(W / CW), R = Math.ceil(H / LH);
    const N = C * R;
    const C2 = Math.floor(C / 2), R2 = Math.floor(R / 2);
    const FS2 = LOOK.fs * 2;
    const cw2 = CW * 2, lh2 = LH * 2;
    // 층: 0 옅음 · 1 흐림 · 2 잉크 · 3 굵은 잉크 · 4 강조 · 5 경고 · 6/7 화면 안(반전) 밝음·중간
    const L_F = 0, L_D = 1, L_I = 2, L_B = 3, L_A = 4, L_X = 5;
    const RAMP = [".", ":", "+"];

    // ---------- 글자판 ----------
    const mkB = (): Buf => ({ ch: new Uint16Array(N), ly: new Uint8Array(N), inv: new Uint8Array(N) });
    const BA = mkB(), BB = mkB(), BF = mkB();
    const put = (B: Buf, x: number, y: number, c: string, L: number) => {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || x >= C || y < 0 || y >= R) return;
      const i = y * C + x, k0 = c.codePointAt(0) || 32, k = k0 > 0xffff ? 63 : k0;
      B.ch[i] = k === 32 ? 0 : k; B.ly[i] = L;
      if (isWide(c) && x + 1 < C) B.ch[i + 1] = 0; // 한글은 다음 칸까지 차지한다
    };
    const str = (B: Buf, x: number, y: number, s: string, L: number) => { let col = 0; for (const c of Array.from(s)) { put(B, x + col, y, c, L); col += isWide(c) ? 2 : 1; } };
    const clear = (B: Buf, x0: number, y0: number, w: number, h: number) => { for (let y = Math.max(0, y0); y < Math.min(R, y0 + h); y++) for (let x = Math.max(0, x0); x < Math.min(C, x0 + w); x++) B.ch[y * C + x] = 0; };
    const invRect = (B: Buf, x0: number, y0: number, w: number, h: number) => { for (let y = Math.max(0, y0); y < Math.min(R, y0 + h); y++) for (let x = Math.max(0, x0); x < Math.min(C, x0 + w); x++) B.inv[y * C + x] = 1; };
    const hline = (B: Buf, x0: number, x1: number, y: number, c: string, L: number) => { for (let x = x0; x <= x1; x++) put(B, x, y, c, L); };
    const vline = (B: Buf, x: number, y0: number, y1: number, c: string, L: number) => { for (let y = y0; y <= y1; y++) put(B, x, y, c, L); };
    const box = (B: Buf, x: number, y: number, w: number, h: number, L: number, k = "+") => {
      const cr = k === "round" ? [".", ".", "'", "'"] : ["+", "+", "+", "+"];
      hline(B, x + 1, x + w - 2, y, "-", L); hline(B, x + 1, x + w - 2, y + h - 1, "-", L);
      vline(B, x, y + 1, y + h - 2, "|", L); vline(B, x + w - 1, y + 1, y + h - 2, "|", L);
      put(B, x, y, cr[0], L); put(B, x + w - 1, y, cr[1], L); put(B, x, y + h - 1, cr[2], L); put(B, x + w - 1, y + h - 1, cr[3], L);
    };
    /** 둘레를 왼쪽 위부터 시계 방향으로 그려 나간다(p = 0..1). */
    const boxP = (B: Buf, x: number, y: number, w: number, h: number, L: number, p: number, k = "+") => {
      if (p >= 1) return box(B, x, y, w, h, L, k);
      const per: [number, number, number][] = [];
      for (let q = 0; q < w; q++) per.push([x + q, y, q === 0 || q === w - 1 ? 1 : 0]);
      for (let q = 1; q < h; q++) per.push([x + w - 1, y + q, q === h - 1 ? 1 : 2]);
      for (let q = w - 2; q >= 0; q--) per.push([x + q, y + h - 1, q === 0 ? 1 : 0]);
      for (let q = h - 2; q >= 1; q--) per.push([x, y + q, 2]);
      const n = Math.floor(per.length * p);
      for (let q = 0; q < n; q++) { const [a, b, t] = per[q]; put(B, a, b, t === 1 ? (k === "round" ? (b === y ? "." : "'") : "+") : t === 0 ? "-" : "|", L); }
    };

    // ---------- 글자를 칸마다의 덮임으로 바꾼다(칸 위·아래 반쪽까지) ----------
    const off = mkCanvas();
    const ox = off.getContext("2d", { willReadFrequently: true })!;
    type MaskOpt = { col: number; row: number; hRows?: number; maxCols: number; align?: "l" | "r" | "c"; fam?: string; wt?: number; size?: number; sy?: number; ls?: number };
    function mask(text: string, o: MaskOpt): Mask {
      // 한국어 대체 글꼴(도현)은 한 굵기뿐 — 가짜 굵게를 걸면 받침 속공간이 막힌다
      const fam = o.fam || HEAVY, wt = work.locale === "ko" ? 400 : o.wt || 800, ls = o.ls || 0;
      let size = o.size || ((o.hRows || 10) * LH) / 0.72;
      const setFont = () => { ox.font = K.font(size, fam, wt); ox.letterSpacing = ls ? Math.round(ls * size) + "px" : "0px"; };
      setFont();
      let w = ox.measureText(text).width;
      if (!o.size && w / CW > o.maxCols) { size *= (o.maxCols * CW) / w; setFont(); w = ox.measureText(text).width; }
      const wc = Math.ceil(w / CW);
      const col = o.align === "r" ? o.col - wc : o.align === "c" ? Math.round(o.col - wc / 2) : o.col;
      // 칸은 폭보다 2배 넘게 높다 — 세로로 늘인 글자는 속공간이 막히지 않는다
      const sy = o.sy || 1;
      // 기준선: 글자 윗머리가 잘리지 않게(한글은 대문자보다 높다)
      const tm = ox.measureText(text);
      const base = Math.max(size * 0.8, (tm.actualBoundingBoxAscent || 0) + size * 0.02);
      const desc = Math.max(size * 0.22, tm.actualBoundingBoxDescent || 0);
      const k = 3, ky = 4, cw = wc + 2, chh = Math.ceil(((base + desc) * sy) / LH) + 2;
      off.width = cw * k; off.height = chh * ky;
      ox.setTransform(k / CW, 0, 0, (ky / LH) * sy, k, ky);
      ox.fillStyle = "#fff"; setFont(); ox.textBaseline = "alphabetic";
      ox.fillText(text, 0, base);
      ox.setTransform(1, 0, 0, 1, 0, 0);
      ox.letterSpacing = "0px";
      const im = ox.getImageData(0, 0, off.width, off.height).data;
      const m = new Float32Array(N), mt = new Float32Array(N), mb = new Float32Array(N);
      let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
      for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
        let a = 0, b = 0;
        for (let j = 0; j < ky; j++) for (let i = 0; i < k; i++) { const v = im[((y * ky + j) * off.width + x * k + i) * 4 + 3]; if (j < ky / 2) a += v; else b += v; }
        a /= (k * ky * 255) / 2; b /= (k * ky * 255) / 2;
        const v = (a + b) / 2, gx = col + x - 1, gy = o.row + y - 1;
        if (v > 0 && gx >= 0 && gx < C && gy >= 0 && gy < R) { const i = gy * C + gx; m[i] = v; mt[i] = a; mb[i] = b; if (v > 0.35) { x0 = Math.min(x0, gx); x1 = Math.max(x1, gx); y0 = Math.min(y0, gy); y1 = Math.max(y1, gy); } }
      }
      if (x1 < 0) { x0 = col; x1 = col + wc; y0 = o.row; y1 = o.row + 2; }
      return { m, t: mt, b: mb, x0, x1, y0, y1, size };
    }
    /** 덮인 글자가 왼→오로 차오르는 순서(앞머리는 들쭉날쭉). */
    const maskOn = (M: Mask, i: number, p: number) => { if (p >= 1) return true; const x = i % C, y = (i / C) | 0; const u = (x - M.x0) / Math.max(1, M.x1 - M.x0 + 1); return u * 0.8 + noise(x * 0.3, y * 0.5, 9.7) * 0.2 < p; };
    // 반쪽 덮임 → 2 꽉 참 · 1 위 반쪽 · -1 아래 반쪽 · 0 빈칸
    const half = (M: Mask, i: number) => { const t = M.t[i] > 0.45, b = M.b[i] > 0.45; return t && b ? 2 : t ? 1 : b ? -1 : 0; };
    const HT = 34, HB = 111; // '"'는 칸 위 반쪽에, 'o'는 아래 반쪽에 앉는다
    const rampFill = (B: Buf, M: Mask, L: number, p = 1) => { for (let i = 0; i < N; i++) { const h = half(M, i); if (!h || !maskOn(M, i, p)) continue; B.ch[i] = h === 2 ? 35 : h === 1 ? HT : HB; B.ly[i] = L; } };

    // ---------- 자막(같은 판 위의 두 배 크기 줄 — VT100 배폭 줄처럼) ----------
    const cap = (s: string, c2: number, r2: number, at: number, L: number, o: Partial<Cap> = {}): Cap => ({ s, c2, r2, at, L, ...o });
    const capsWrap = (text: string, n: number, c2: number, r2: number, at: number, L: number, o: Partial<Cap> = {}) => wrapCols(text, n).map((l, q) => cap(l, c2, r2 + q, at + q * 0.32, L, o));
    const valUnit = (v: string, u: string) => v + (u === "%" ? "%" : !u ? "" : u.startsWith("/") ? u : (isWide(Array.from(u)[0]) ? "" : " ") + u);

    // ---------- 공통 문법(세계가 따로 정하지 않은 장면) ----------
    const G = {
      hook(s: Extract<FlatScene, { kind: "hook" }>, bg: (B: Buf, lt: number) => void): Scene {
        const M = mask(s.value, { col: C - 3, row: Math.round(R * 0.18), hRows: Math.round(R * 0.5), maxCols: C - 8, align: "r" });
        return { draw(B, lt) { bg(B, lt); rampFill(B, M, s.alarm ? L_X : L_A); }, caps: [cap(s.label + (s.data === "sample" ? "  · " + T.sample : ""), 2, 1, 0, L_D), ...capsWrap(s.line, 30, 2, Math.ceil(M.y1 / 2) + 2, 0.6, L_B)] };
      },
      story(s: Extract<FlatScene, { kind: "story" }>, bg: (B: Buf, lt: number) => void): Scene {
        return { draw(B, lt) { bg(B, lt); }, caps: [...capsWrap(s.line, 32, 3, 3, 0.1, L_B), ...(s.line2 ? capsWrap(s.line2, 32, 3, R2 - 5, 1.6, L_A) : [])] };
      },
      flow(s: Extract<FlatScene, { kind: "flow" }>, bg: (B: Buf, lt: number) => void): Scene {
        const n = Math.max(1, s.nodes.length), bw = Math.floor((C - 10) / n) - 6;
        const ats = s.nodes.map((_, k) => 0.3 + k * 0.62 + (k > 1 ? 0.12 : 0));
        const y = Math.round(R * 0.3);
        return {
          draw(B, lt) {
            bg(B, lt);
            s.nodes.forEach((_, k) => {
              const x = 4 + k * (bw + 6);
              boxP(B, x, y, bw, 7, k === n - 1 ? L_A : L_I, K.ease.outCubic(K.seg(lt, ats[k], 0.6)));
              if (k < n - 1 && lt > ats[k] + 0.5) { const p = K.seg(lt, ats[k] + 0.5, 0.4); hline(B, x + bw + 1, x + bw + Math.round(4 * p), y + 3, "-", L_D); if (p >= 1) put(B, x + bw + 4, y + 3, ">", L_I); }
            });
          },
          caps: [...s.nodes.flatMap((nm, k) => wrapCols(nm, Math.floor(bw / 2) - 2).map((l, q) => cap(l, Math.floor((5 + k * (bw + 6)) / 2) + 1, Math.round(y / 2) + 1 + q, ats[k] + 0.4, k === n - 1 ? L_A : L_B))), ...capsWrap(s.line, 40, 3, R2 - 4, ats[n - 1] + 0.7, L_I)],
        };
      },
      terminal(s: Extract<FlatScene, { kind: "terminal" }>, bg: (B: Buf, lt: number) => void): Scene {
        const out = s.output || [];
        return { draw(B, lt) { bg(B, lt); }, caps: [cap("$ " + s.command, 2, 2, 0.2, L_D, { type: 26 }), ...out.map((o, q) => cap(o, 2, 4 + q, 1.4 + q * 0.34, L_I)), ...capsWrap(s.line, 30, 2, 5 + out.length + 1, 1.4 + out.length * 0.34 + 0.6, L_A)] };
      },
      alert(s: Extract<FlatScene, { kind: "alert" }>, bg: (B: Buf, lt: number) => void): Scene {
        const M = mask(s.title, { col: 3, row: 3, hRows: Math.round(R * 0.22), maxCols: C - 6 });
        return { draw(B, lt) { bg(B, lt); rampFill(B, M, L_X, K.ease.outCubic(K.seg(lt, 0.1, 0.9))); }, caps: [...capsWrap(s.body, 36, 2, Math.ceil(M.y1 / 2) + 2, 0.9, L_B), ...capsWrap([s.line, s.line2].filter(Boolean).join(" "), 36, 2, R2 - 4, 1.8, L_A)] };
      },
      stats(s: Extract<FlatScene, { kind: "stats" }>, bg: (B: Buf, lt: number) => void): Scene {
        const st = s.stats, big = st[0] || { value: "", unit: "", label: "" };
        const M = mask(big.value + (big.unit === "%" ? "%" : ""), { col: C - 3, row: 3, hRows: Math.round(R * 0.5), maxCols: Math.round(C * 0.5), align: "r" });
        return { draw(B, lt) { bg(B, lt); rampFill(B, M, L_A, K.ease.outCubic(K.seg(lt, 0.1, 1.0))); }, caps: [cap(big.label, Math.floor(M.x0 / 2), Math.ceil(M.y1 / 2) + 1, 0.8, L_B), ...st.slice(1).map((x, q) => cap(`${valUnit(x.value, x.unit)}  ${x.label}`, 2, 3 + q * 2, 1.3 + q * 0.5, L_I)), ...capsWrap(s.line, 30, 2, R2 - 4, 2.4, L_D)] };
      },
      items(s: Extract<FlatScene, { kind: "items" }>, bg: (B: Buf, lt: number) => void): Scene {
        const lw = Math.max(...s.items.map((x) => colLen(x.value))) + 2;
        return { draw(B, lt) { bg(B, lt); }, caps: [...s.items.map((x, q) => cap(x.value + " ".repeat(Math.max(1, lw - colLen(x.value))) + x.label, 3, 2 + q, 0.3 + q * 0.28, x.alarm ? L_X : L_I)), ...capsWrap(s.line, 34, 3, R2 - 4, 0.4 + s.items.length * 0.28 + 0.4, L_A)] };
      },
      ending(s: Extract<FlatScene, { kind: "ending" }>, bg: (B: Buf, lt: number) => void): Scene {
        const nl = colLen(s.name) > 12 ? wrapCols(s.name, Math.ceil(colLen(s.name) * 0.62)) : [s.name];
        let row = Math.round(R * 0.12);
        const Ms: Mask[] = [];
        for (const l of nl) { const M = mask(l, { col: 4, row, hRows: Math.round(R * (nl.length > 1 ? 0.2 : 0.3)), maxCols: C - 8 }); Ms.push(M); row = M.y1 + 3; }
        const last = Ms[Ms.length - 1];
        return { draw(B, lt) { bg(B, lt); Ms.forEach((M) => rampFill(B, M, L_B)); }, caps: [s.line, s.line2].filter(Boolean).map((l, q) => cap(l, 2, Math.ceil(last.y1 / 2) + 2 + q, 0.6 + q * 0.5, L_I)), fadeBg: true };
      },
    };
    type Overrides = Partial<{ [Kd in FlatScene["kind"]]: (s: Extract<FlatScene, { kind: Kd }>) => Scene }>;
    const firstOf = <Kd extends FlatScene["kind"]>(k: Kd) => scenes.find((s) => s.kind === k) as Extract<FlatScene, { kind: Kd }> | undefined;
    const pctOf = (v: string) => { const m = /(-?\d+(?:\.\d+)?)\s*%/.exec(v); return m ? +m[1] / 100 : null; };

    // ======================== 세계 1: 로그 벽 ========================
    function logWorld(): { O: Overrides; bg: (B: Buf, lt: number) => void } {
      const nW = R + 90;
      const r = K.rng(seed + 3);
      const term = firstOf("terminal");
      const stats = firstOf("stats");
      // 벽은 작품의 진짜 명령·출력으로만 쓴다(꾸며 낸 파일 이름 없이)
      const stream = term ? ["$ " + term.command, ...term.output] : [work.title];
      // 켜져 남는 줄의 비율 = 첫 수치(%), 나머지 둘 = 그다음 수치들
      const fr = stats ? stats.stats.map((x) => (x.unit === "%" ? (+x.value || 0) / 100 : 0)) : [];
      const keepF = fr[0] || 0.7, f2 = fr[1] || 0, f3 = fr[2] || 0;
      const order = Array.from({ length: nW }, (_, i) => i);
      for (let i = nW - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      const flag: number[] = new Array(nW);
      order.forEach((j, k) => (flag[j] = k < nW * keepF ? 0 : k < nW * (keepF + f2) ? 1 : k < nW * (keepF + f2 + f3) ? 2 : 3));
      let sec = 9 * 3600 + 14 * 60;
      const rows = flag.map(() => {
        sec += 3 + Math.floor(r() * 40);
        const hh = String(Math.floor(sec / 3600)).padStart(2, "0"), mm = String(Math.floor(sec / 60) % 60).padStart(2, "0"), ss = String(sec % 60).padStart(2, "0");
        let s = `${hh}:${mm}:${ss}  | `;
        let q = Math.floor(r() * stream.length);
        while (s.length < C + 4) s += stream[q++ % stream.length] + "   ";
        return s.replace(/[^\x20-\x7e]/g, " ");
      });
      const wrapI = (y: number, off: number) => (((y + off) % nW) + nW) % nW;
      const wall = (y: number, off: number) => rows[wrapI(y, off)];
      const flagAt = (y: number, off: number) => flag[wrapI(y, off)];
      const dense = rows.map((s) => { const d = s.replace(/[^A-Za-z0-9$%#@&]/g, "").toUpperCase(); return d || "LOG"; });
      // 벽은 0.8초에 한 줄씩 올라간다 — 기록은 아직 쓰이는 중
      const drawWall = (B: Buf, lt: number, off0: number, L: number, xs = 0, xe = C) => {
        const off = off0 + Math.floor(K.step(lt, 15) * 1.25);
        for (let y = 0; y < R; y++) { const s = wall(y, off); for (let x = xs; x < xe; x++) { const c = s.charCodeAt(x); if (c !== 32) { B.ch[y * C + x] = c; B.ly[y * C + x] = L; } } }
        return off;
      };
      const litMask = (B: Buf, M: Mask, lt: number, off0: number, p = 1) => {
        const off = off0 + Math.floor(K.step(lt, 15) * 1.25);
        for (let i = 0; i < N; i++) {
          if (M.m[i] <= 0.04 || !maskOn(M, i, p)) continue;
          const h = half(M, i);
          if (!h) { B.ch[i] = 0; continue; } // 켜진 모양 둘레는 비운다 — 벽 위에서 읽히게
          const y = (i / C) | 0, x = i % C, d = dense[wrapI(y, off)];
          B.ch[i] = h === 2 ? d.charCodeAt(x % d.length) : h === 1 ? HT : HB; B.ly[i] = L_B;
        }
      };
      const O: Overrides = {};
      O.hook = (s) => {
        const M = mask(s.value, { col: C - 5, row: 5, hRows: Math.round(R * 0.6), maxCols: Math.round(C * 0.82), align: "r" });
        return { draw(B, lt) { drawWall(B, lt, 0, L_F); litMask(B, M, lt, 0); }, caps: [cap(s.label + (s.data === "sample" ? "  · " + T.sample : ""), 2, 1, 0, L_D), ...capsWrap(s.line, Math.floor((C - M.x0) / 2) - 2, Math.floor(M.x0 / 2), Math.ceil(M.y1 / 2) + 2, 0.5, L_B)] };
      };
      O.story = (s) => {
        // 많이 쓴 만큼 벽이 다 켜졌다가… 줄마다 밀도 사다리를 타고 타 버린다. 거의 아무것도 남지 않는다
        const keep = Array.from({ length: R }, (_, y) => K.rand(seed, y, 41) < 0.07);
        return {
          draw(B, lt) {
            const st = K.step(lt, 15);
            const off = drawWall(B, 0, 37, L_I);
            for (let y = 0; y < R; y++) {
              const b0 = 1.9 + K.rand(seed, y, 42) * 1.5;
              for (let x = 0; x < C; x++) {
                const i = y * C + x; if (!B.ch[i]) continue;
                if (keep[y] && flagAt(y, off) === 0) { if (st > 1.9) B.ly[i] = L_B; continue; }
                const age = st - (b0 + (1 - x / C) * 0.45);
                if (age < 0) continue;
                if (age < 0.5) { B.ch[i] = RAMP[2 - Math.floor(age / 0.17)].charCodeAt(0); B.ly[i] = L_D; } else B.ch[i] = 0;
              }
            }
          },
          caps: [...capsWrap(s.line, 34, 2, 2, 0.2, L_B), ...(s.line2 ? capsWrap(s.line2, 34, 2, R2 - 5, 2.6, L_B) : [])],
        };
      };
      O.flow = (s) => {
        // 점선 경계 "이 컴퓨터" 안의 판들: 기록 → 남은 줄 → (수치가 있으면) 새는 몫 → 판단
        const n = Math.max(2, s.nodes.length), gap = 7, x0 = 5, bx1 = C - 6, pw = Math.floor((bx1 - x0 - 2 - (n - 1) * gap) / n);
        const py = 9, ph = R - 20;
        const ats = s.nodes.map((_, k) => 0.25 + k * 0.7 + (k === n - 1 ? 0.2 : 0));
        const verdict = mask("?", { col: x0 + 1 + (n - 1) * (pw + gap) + Math.floor(pw / 2), row: py + 3, hRows: ph - 7, maxCols: pw - 4, align: "c" });
        const bars = stats ? stats.stats.slice(1).filter((x) => x.unit === "%").map((x) => [x.label, (+x.value || 0) / 100] as [string, number]) : [];
        const bmax = Math.max(0.01, ...bars.map((b) => b[1]));
        return {
          draw(B, lt) {
            const st = K.step(lt, 15);
            const bp = K.ease.outCubic(K.seg(st, 0, 0.9));
            const bxw = Math.round((bx1 - 2) * bp);
            for (let x = 2; x < 2 + bxw; x += 2) { put(B, x, 2, "-", L_D); put(B, x, R - 7, "-", L_D); }
            if (bp >= 1) for (let y = 3; y < R - 7; y += 2) { put(B, 2, y, ":", L_D); put(B, bx1, y, ":", L_D); }
            s.nodes.forEach((_, k) => {
              const x = x0 + 1 + k * (pw + gap), p = K.ease.outCubic(K.seg(st, ats[k], 0.7));
              if (p <= 0) return;
              boxP(B, x, py, pw, ph, k === n - 1 ? L_B : L_D, p);
              if (p < 1) return;
              const inner = (fn: (y: number, s2: string, fl: number) => void) => { for (let y = py + 2; y < py + ph - 1; y++) fn(y, wall(y, 120), flagAt(y, 120)); };
              if (k === n - 1) rampFill(B, verdict, L_A, K.ease.outCubic(K.seg(st, ats[k] + 0.3, 0.8)));
              else if (k === 0) inner((y, s2) => str(B, x + 2, y, s2.slice(10, 10 + pw - 4), L_D));
              else if (k === 1 || !bars.length) inner((y, s2, fl) => { if (fl === 0 && (k === 1 || K.rand(seed, y, k) < 0.5)) str(B, x + 2, y, s2.slice(10, 10 + pw - 4), L_B); });
              else {
                // 한도를 먹은 몫: 수치마다 막대 하나, 길이는 진짜 비율
                bars.forEach(([lab, v], j) => {
                  const yy = py + 4 + j * 4, len = Math.round((pw - 6) * (v / bmax) * 0.62 * K.ease.outCubic(K.seg(st, ats[k] + 0.6 + j * 0.25, 0.8)));
                  str(B, x + 2, yy, fitCols(lab, pw - 4), L_D); hline(B, x + 2, x + 2 + len, yy + 1, "#", L_B); hline(B, x + 3 + len, x + pw - 3, yy + 1, ".", L_F);
                });
              }
              if (k < n - 1) { const ap = K.seg(st, ats[k] + 0.5, 0.5); const ay = py + Math.floor(ph / 2); hline(B, x + pw + 1, x + pw + Math.round((gap - 2) * ap), ay, "-", L_I); if (ap >= 1) put(B, x + pw + gap - 1, ay, ">", L_B); }
            });
            clear(B, 3, 2, colLen(T.thisComputer) + 2, 1); str(B, 4, 2, T.thisComputer, L_I);
          },
          caps: [
            ...s.nodes.flatMap((nm, k) => wrapCols(nm, Math.floor(pw / 2) - 1).map((l, j) => cap(l, Math.floor((x0 + 1 + k * (pw + gap)) / 2), 2 + j, ats[k] + 0.35, k === n - 1 ? L_A : L_B))),
            ...capsWrap(s.line, 60, 3, R2 - 3, ats[n - 1] + 0.9, L_I),
          ],
        };
      };
      O.terminal = (s) => {
        const out = s.output || [];
        const t0 = 0.3, typeEnd = t0 + colLen(s.command) / 26;
        const keyIdx = out.findIndex((o) => pctOf(o) !== null && Math.abs((pctOf(o) || 0) - keepF) < 0.005);
        return {
          draw(B, lt) { drawWall(B, lt, 200, L_F, Math.round(C * 0.66)); },
          caps: [
            cap("$ " + s.command, 2, 2, t0, L_B, { type: 26 }),
            ...(s.data === "sample" ? [cap(T.hashSample, 2, 3, typeEnd + 0.2, L_D)] : []),
            ...out.map((o, q) => cap(o, 2, 5 + q, typeEnd + 0.5 + q * 0.38 + (q === 2 ? 0.25 : 0), q === keyIdx ? L_B : L_I, { inv: q === keyIdx })),
            ...capsWrap(s.line, 26, 2, 5 + out.length + 2, typeEnd + 0.5 + out.length * 0.38 + 0.8, L_I),
          ],
        };
      };
      O.stats = (s) => {
        const st = s.stats, big = st[0] || { value: "", unit: "", label: "" };
        const xs = Math.round(C * 0.47);
        const M = mask(big.value + (big.unit === "%" ? "%" : ""), { col: xs + 3, row: 2, hRows: Math.round(R * 0.42), maxCols: C - xs - 7 });
        const r2 = Math.ceil(M.y1 / 2) + 1, c2 = Math.ceil((xs + 3) / 2);
        const tagCols = 14;
        const tags = ["", st[1] ? "< " + fitCols(st[1].label, tagCols) : "", st[2] ? "< " + fitCols(st[2].label, tagCols) : "", ""];
        return {
          draw(B, lt) {
            // 왼쪽: 벽의 줄마다 무엇이 됐는지 — 남은 줄만 켜져 있다(정확히 첫 수치만큼)
            const sp = K.step(lt, 15);
            const off = 300;
            const xe = xs - 3 - tagCols - 2;
            for (let y = 0; y < R; y++) {
              const s2 = wall(y, off), fl = flagAt(y, off);
              const p = K.seg(sp, 0.2 + y * 0.022, 0.4);
              for (let x = 0; x < xe; x++) {
                let c = s2.charCodeAt(x); if (c === 32) continue;
                let L = L_D;
                if (p > 0) { if (fl === 0) L = L_B; else if (fl === 1) { c = 126; L = L_D; } else if (fl === 2) { c = 46; L = L_D; } else L = L_F; }
                B.ch[y * C + x] = c; B.ly[y * C + x] = L;
              }
              if (p > 0.9 && tags[fl]) str(B, xe + 1, y, tags[fl], L_D);
            }
            litMask(B, M, 0, off, K.ease.outCubic(K.seg(sp, 0.7, 0.9)));
          },
          caps: [
            cap(big.label, c2, r2, 1.4, L_B),
            ...st.slice(1).map((x, q) => cap(`${valUnit(x.value, x.unit)}  ${x.label}`, c2, r2 + 2 + q, 2.1 + q * 0.55, L_I)),
            ...capsWrap(s.line, C2 - c2 - 2, c2, r2 + 2 + Math.max(0, st.length - 1) + 1, 3.3, L_D),
            ...(s.data === "sample" ? [cap(T.sampleData, c2, R2 - 2, 3.6, L_D)] : s.source ? [cap(T.source + s.source, c2, R2 - 2, 3.6, L_D)] : []),
          ],
        };
      };
      O.ending = (s) => {
        const M = mask(s.name, { col: 3, row: Math.round(R * 0.14), hRows: Math.round(R * 0.36), maxCols: C - 6 });
        return {
          draw(B, lt) { drawWall(B, lt, 400, L_F); litMask(B, M, lt, 400, K.ease.outCubic(K.seg(K.step(lt, 15), 0.1, 1.1))); },
          caps: [s.line, s.line2].filter(Boolean).map((l, q) => cap(l, 2, Math.ceil(M.y1 / 2) + 2 + q, 1.1 + q * 0.6, q ? L_D : L_I)),
          fadeBg: true,
        };
      };
      return { O, bg: (B, lt) => { drawWall(B, lt, 500, L_F); } };
    }

    // ======================== 세계 2: 맥과 폰 ========================
    function devicesWorld(): { O: Overrides; bg: (B: Buf, lt: number) => void } {
      const mx = 4, mw = Math.round(C * 0.36), my = Math.round(R * 0.36), mh = Math.round(R * 0.4);
      const pw = Math.round(C * 0.19), ph = Math.round(R * 0.72), px = C - pw - 7, py = Math.round(R * 0.22);
      const alertS = firstOf("alert"), itemsS = firstOf("items");
      const proj = fitCols((alertS?.title || work.title.split(/\s+[·—|]\s+/)[0] || "project").replace(/\s+/g, "-"), mw - 12);
      const drawMac = (B: Buf, lines: [string, number][], L = L_I) => {
        box(B, mx, my, mw, mh, L, "round");
        invRect(B, mx + 2, my + 1, mw - 4, mh - 2);
        put(B, mx + Math.floor(mw / 2), my, "o", L_D);
        str(B, mx - 2, my + mh, "/" + "_".repeat(mw + 2) + "\\", L);
        str(B, mx - 3, my + mh + 1, "'" + "-".repeat(mw + 4) + "'", L);
        lines.forEach(([s, LL], q) => str(B, mx + 4, my + 2 + q, fitCols(s, mw - 8), LL));
      };
      const scr = { x: px + 3, y: py + 4, w: pw - 6, h: ph - 8 };
      const drawPhone = (B: Buf, L = L_I, o: { x?: number; y?: number; w?: number; h?: number } = {}) => {
        const X = o.x ?? px, Y = o.y ?? py, Wd = o.w ?? pw, Hh = o.h ?? ph;
        box(B, X, Y, Wd, Hh, L, "round");
        invRect(B, X + 1, Y + 2, Wd - 2, Hh - 4);
        str(B, X + Math.floor(Wd / 2) - 3, Y + 1, "( --- )", L_D);
        str(B, X + Math.floor(Wd / 2) - 4, Y + Hh - 2, "-------", L_D);
      };
      // 맥의 작업 화면: 진행 막대 하나만 움직인다. 끝나면 알림 본문이 그대로 뜬다
      const session = (lt: number, done: boolean): [string, number][] => {
        const bar = Math.min(16, 5 + Math.floor(K.step(lt, 15) * 1.3));
        return [["~/" + proj, L_D], ["> " + T.working, L_I], ["", 0], done && alertS ? ["[ok] " + alertS.body, L_A] : ["[" + "#".repeat(bar) + ".".repeat(16 - bar) + "]", L_A]];
      };
      const O: Overrides = {};
      let flowN = 0;
      O.story = (s) => {
        const m = mask("?", { col: scr.x + Math.floor(scr.w / 2), row: scr.y + 4, hRows: Math.round(ph * 0.34), maxCols: scr.w, align: "c" });
        return {
          draw(B, lt) { drawMac(B, session(lt, false)); drawPhone(B, L_D); rampFill(B, m, L_A, K.ease.outCubic(K.seg(K.step(lt, 15), 2.0, 0.9))); },
          caps: [...capsWrap(s.line, 36, 2, 1, 0.1, L_B), ...(s.line2 ? capsWrap(s.line2, Math.floor((px - mx - mw - 7) / 2), Math.floor((mx + mw + 5) / 2), Math.floor((py + ph - 8) / 2), 1.9, L_A) : [])],
        };
      };
      O.flow = (s) => {
        const which = flowN++;
        if (which === 0) {
          // 상태가 맥을 떠나 선 위에서 암호 글자가 되고, 폰 안에서만 풀린다
          const v0 = itemsS?.items[0]?.value || "";
          const msg = Array.from(T.working + (v0 ? " " + v0 : ""));
          const cols: number[] = []; let cc = 0;
          for (const c of msg) { cols.push(cc); cc += isWide(c) ? 2 : 1; }
          const cipher = msg.map((c, q) => Array.from({ length: isWide(c) ? 2 : 1 }, (_, j) => "x9#Qe!2k@v7%Zr$m"[Math.floor(K.rand(seed, q * 2 + j, 51) * 16)]).join(""));
          const wy = py + Math.round(ph * 0.42), wx0 = mx + mw + 2, wx1 = px - 2, lockX = Math.round((wx0 + wx1) / 2), z0 = wx0 + Math.round((wx1 - wx0) * 0.28);
          const T0 = 0.9, TT = 2.8;
          const lock = ["  .--.  ", " /    \\ ", " |    | ", ".------.", "| [##] |", "'------'"];
          const n1 = s.nodes[1] || "", n2 = s.nodes[2] || s.nodes[s.nodes.length - 1] || "";
          return {
            draw(B, lt) {
              const st = K.step(lt, 15);
              drawMac(B, session(lt + 3, false));
              drawPhone(B, L_I);
              const wp = K.ease.outCubic(K.seg(st, 0.2, 0.7));
              for (let x = wx0; x < wx0 + (wx1 - wx0) * wp; x += 2) put(B, x, wy, ".", L_D);
              if (wp >= 1) lock.forEach((l, q) => str(B, lockX - 4, wy - 9 + q, l, q > 2 ? L_A : L_I));
              if (st > T0 + TT + 0.9) str(B, scr.x + 1, scr.y + 2, fitCols(proj, scr.w - 1), L_D);
            },
            // 꾸러미는 두 배 크기 줄로 간다: 평문 → 선 위에서 암호 → 폰에서만 풀림
            over(g, lt) {
              const st = K.step(lt, 15);
              const k = K.ease.outCubic(K.seg(st, T0, TT));
              if (k <= 0 || k >= 1) return;
              const head = K.lerp(wx0 * CW, px * CW, k);
              g.save(); g.beginPath(); g.rect(wx0 * CW, 0, (px - wx0) * CW, H); g.clip();
              g.font = K.font(FS2, FAM, LOOK.bw);
              msg.forEach((c, q) => {
                const x = head - (cc - cols[q]) * cw2;
                const enc = x >= z0 * CW;
                g.fillStyle = enc ? COLS[L_A] : COLS[L_B];
                g.fillText(enc ? cipher[q] : c, x, wy * LH - 6);
              });
              g.restore();
            },
            caps: [
              ...capsWrap(s.line, 38, 2, 1, 0.1, L_B),
              cap(s.nodes[0] || "", Math.floor((mx + 2) / 2), Math.floor((my + mh + 3) / 2), 0.6, L_D),
              cap(n1, Math.floor((lockX - colLen(n1)) / 2), Math.floor((wy + 2) / 2), 1.6, L_A),
              cap(n2, Math.floor((px - 3) / 2) - colLen(n2), Math.floor((py + ph) / 2) - 1, T0 + TT + 0.3, L_D),
              cap(T.working, Math.floor((scr.x + 1) / 2), Math.floor((scr.y + 5) / 2), T0 + TT, L_B, { on: true }),
              ...(v0 ? [cap(v0, Math.floor((scr.x + 1) / 2), Math.floor((scr.y + 5) / 2) + 1, T0 + TT + 0.2, L_A, { on: true })] : []),
            ],
          };
        }
        // 다음 흐름: 한 구간이 다 차면 맥이 한 낱말을 치고 새 구간이 시작된다
        const ty = py + Math.round(ph * 0.42), ax = mx + mw + 4, bx = px - 4, mid = Math.round(ax + (bx - ax) * 0.56);
        const n0 = s.nodes[0] || "", n1 = s.nodes[1] || "", n2 = s.nodes[2] || s.nodes[s.nodes.length - 1] || "";
        const word = (/([A-Za-z]+)["”']?\s*$/.exec(n1) || [])[1] || n1;
        return {
          draw(B, lt) {
            const st = K.step(lt, 15);
            const typed = st > 2.3 ? Array.from(word).slice(0, Math.floor((st - 2.3) * 8)).join("") : "";
            const ls = session(lt + 6, true).slice(0, 3);
            ls.push(["> " + typed, L_A]);
            drawMac(B, ls);
            drawPhone(B, L_I);
            const a = K.ease.outCubic(K.seg(st, 0.6, 1.5));
            put(B, ax, ty, "|", L_I);
            hline(B, ax + 1, ax + Math.round((mid - ax - 2) * a), ty, "=", st > 2.1 ? L_D : L_I);
            if (a >= 1) put(B, mid - 1, ty, "|", L_I);
            const b = K.ease.outCubic(K.seg(st, 2.7, 1.6));
            if (b > 0) { put(B, mid + 1, ty, "|", L_A); hline(B, mid + 2, mid + 2 + Math.round((bx - mid - 3) * b), ty, "=", L_A); }
            if (st > 3.0) wrapCols(n2, scr.w - 1).slice(0, 3).forEach((l, q) => str(B, scr.x + 1, scr.y + 4 + q, l, L_A));
          },
          caps: [
            ...capsWrap(s.line, 36, 2, 1, 0.1, L_B),
            cap(n0, Math.floor(ax / 2), Math.floor(ty / 2) - 2, 1.0, L_I),
            cap(n1, Math.floor((mx + 3) / 2), Math.floor((my + mh + 3) / 2), 2.4, L_A),
            cap(n2, Math.floor((px - 3) / 2) - colLen(n2), Math.floor(ty / 2) + 2, 3.1, L_A),
          ],
        };
      };
      O.alert = (s) => {
        const cy = scr.y + 3, cw = scr.w - 1;
        const body = wrapCols(s.body, cw - 4).slice(0, 3);
        return {
          draw(B, lt) {
            const st = K.step(lt, 15);
            drawMac(B, session(lt, true));
            drawPhone(B, L_B);
            const p = K.ease.outCubic(K.seg(st, 0.15, 0.6));
            const yy = Math.round(cy - 3 + 3 * p);
            boxP(B, scr.x, yy, cw, 8, L_A, p);
            if (p >= 1) {
              str(B, scr.x + 2, yy + 2, fitCols(s.title, cw - 4), L_B);
              body.forEach((l, q) => str(B, scr.x + 2, yy + 4 + q, l, L_I));
              if (s.data === "sample") str(B, scr.x + cw - 2 - colLen(T.sample), yy + 1, T.sample, L_D);
            }
            // 폰이 운다: 괄호 세 번, 그리고 조용히
            for (let k = 0; k < 3; k++) {
              const on = st > 0.9 + k * 0.55 && st < 0.9 + k * 0.55 + 0.33;
              if (!on) continue;
              for (let j = 1; j <= 2; j++) { const yy2 = py + Math.round(ph * 0.3); for (let d = 0; d < 5; d++) { put(B, px - 1 - j * 2, yy2 + d, "(", L_A); put(B, px + pw + j * 2, yy2 + d, ")", L_A); } }
            }
          },
          caps: [...capsWrap(s.line, 36, 2, 1, 0.3, L_B), ...(s.line2 ? capsWrap(s.line2, Math.floor(mw / 2) - 2, Math.floor((mx + 2) / 2), Math.floor((my + mh + 3) / 2), 2.4, L_D) : [])],
        };
      };
      O.items = (s) => {
        // 폰이 앞으로 나온다: 홈 화면 한 장이 곧 허브
        const its = s.items;
        const vw = Math.max(...its.map((x) => colLen(x.value === "✓" ? "OK" : x.value))) + 2;
        const need = Math.max(...its.map((x) => vw + colLen(x.label))) * 2 + 8;
        const W2 = Math.round(K.clamp(need, C * 0.38, C * 0.52)), X = C - W2 - 6, Y = 1, H2 = R - 2;
        const capCols = Math.floor((W2 - 6) / 2);
        const rowH = Math.max(3, Math.floor((H2 - 7) / Math.max(1, its.length)));
        return {
          draw(B, lt) {
            const st = K.step(lt, 15);
            drawPhone(B, L_B, { x: X, y: Y, w: W2, h: H2 });
            if (s.data === "sample") str(B, X + W2 - 3 - colLen(T.sample), Y + 2, T.sample, L_D);
            its.forEach((_, q) => { const p = K.seg(st, 0.3 + q * 0.3 + (q > 2 ? 0.1 : 0), 0.5); if (p <= 0) return; const yy = Y + 4 + q * rowH + rowH - 1; if (q < its.length - 1) hline(B, X + 3, X + 3 + Math.round((W2 - 7) * K.ease.outCubic(p)), yy, "-", L_F); });
          },
          caps: [
            ...its.map((it, q) => { const v = it.value === "✓" ? "OK" : it.value; return cap(fitCols(v + " ".repeat(Math.max(1, vw - colLen(v))) + it.label, capCols), Math.floor((X + 3) / 2), Math.floor((Y + 4 + q * rowH + Math.floor(rowH / 2) - 1) / 2), 0.4 + q * 0.3 + (q > 2 ? 0.1 : 0), it.alarm ? L_X : q === 0 ? L_A : L_B, { on: true }); }),
            ...capsWrap(s.line, Math.floor(X / 2) - 4, 2, 3, 0.2, L_I),
          ],
        };
      };
      O.ending = (s) => {
        const M = mask(s.name, { col: 3, row: 2, hRows: Math.round(R * 0.34), maxCols: C - 8 });
        const P = { x: C - 26, y: M.y1 + 3, w: 19, h: 0 }; P.h = Math.max(10, R - P.y - 1);
        return {
          draw(B, lt) {
            const st = K.step(lt, 15);
            drawPhone(B, L_I, P);
            rampFill(B, M, L_A, K.ease.outCubic(K.seg(st, 0.1, 1.0)));
            // 앱 아이콘이 빈 칸들 사이 홈 화면에 내려앉는다
            const iw = 4, gx = Math.floor((P.w - 4 - 3 * iw) / 2);
            for (let j = 0; j < 2; j++) for (let q = 0; q < 3; q++) {
              const x = P.x + 3 + q * (iw + gx), y = P.y + 4 + j * 4, me = j === 1 && q === 1;
              if (me && st < 0.9) continue;
              box(B, x, y, iw, 3, me ? L_A : L_D, "round");
              if (me) str(B, x + 1, y + 1, ((s.name.match(/[A-Z]/g) || []).length >= 2 ? (s.name.match(/[A-Z]/g) || []).slice(0, 2).join("") : Array.from(s.name.replace(/[^A-Za-z0-9]/g, "") || "AP").slice(0, 2).join("").toUpperCase()), L_A);
            }
          },
          caps: [s.line, s.line2].filter(Boolean).map((l, q) => cap(l, 2, Math.ceil(M.y1 / 2) + 2 + q, 1.0 + q * 0.6, q ? L_D : L_I)),
          fadeBg: true,
        };
      };
      return { O, bg: () => {} };
    }

    // ======================== 세계 3: 집 평면도 ========================
    function houseWorld(): { O: Overrides; bg: (B: Buf, lt: number) => void } {
      const itemsS = firstOf("items");
      const its = itemsS ? itemsS.items : [];
      // 방 넷 = 앞의 넷, 다섯째가 있으면 바깥(구조로 정한다)
      const roomIt = its.slice(0, 4);
      const outIt = its.length >= 5 ? its[4] : null;
      const vOf = (v: string) => K.clamp(pctOf(v) ?? 0.5);
      type Room = { x: number; y: number; w: number; h: number };
      const plan = (x0: number, y0: number, w: number, h: number) => {
        const bw = Math.round(w * 0.34), hh = Math.round(h * 0.5), bw2 = Math.round(w * 0.46);
        const rooms: Room[] = [
          { x: x0 + 1, y: y0 + 1, w: bw - 1, h: hh - 1 },
          { x: x0 + bw + 1, y: y0 + 1, w: w - bw - 2, h: hh - 1 },
          { x: x0 + 1, y: y0 + hh + 1, w: bw2 - 1, h: h - hh - 2 },
          { x: x0 + bw2 + 1, y: y0 + hh + 1, w: w - bw2 - 2, h: h - hh - 2 },
        ];
        return { x0, y0, w, h, rooms, bw, hh, bw2 };
      };
      type Plan = ReturnType<typeof plan>;
      const drawPlan = (B: Buf, P: Plan, L: number, p = 1) => {
        const { x0, y0, w, h, bw, hh, bw2 } = P;
        boxP(B, x0, y0, w, h, L, p);
        if (p < 1) return;
        for (let x = x0; x < x0 + w; x++) { put(B, x, y0, "#", L); put(B, x, y0 + h - 1, "#", L); }
        for (let y = y0; y < y0 + h; y++) { put(B, x0, y, "#", L); put(B, x0 + w - 1, y, "#", L); }
        hline(B, x0 + 1, x0 + w - 2, y0 + hh, "-", L);
        vline(B, x0 + bw, y0 + 1, y0 + hh - 1, "|", L);
        vline(B, x0 + bw2, y0 + hh + 1, y0 + h - 2, "|", L);
        for (const [dx, dy] of [[x0 + 4, y0 + hh], [x0 + bw + 4, y0 + hh], [x0 + bw2 + 6, y0 + hh]]) { hline(B, dx, dx + 3, dy, " ", L); put(B, dx, dy, "'", L); }
        hline(B, x0 + 3, x0 + bw - 3, y0, "=", L_I);
      };
      const fillRoom = (B: Buf, r: Room, v: number, p: number, L: number, k: number) => {
        for (let y = r.y; y < r.y + r.h; y++) {
          const fy = (r.y + r.h - y) / r.h;
          if (fy > v * p) continue;
          for (let x = r.x; x < r.x + r.w; x++) {
            const n = noise(x * 0.35, y * 0.62, k * 3.1) + v * 0.32;
            const c = n > 0.98 ? "~" : n > 0.78 ? ":" : n > 0.62 ? "." : "";
            if (c) put(B, x, y, c, L);
          }
        }
      };
      const sensor = (B: Buf, r: Room, L: number, dy = 0) => str(B, r.x + r.w - 5, r.y + 1 + dy, "[*]", L);
      const outside = (B: Buf, x0: number, v: number, p: number, L: number) => { for (let y = 0; y < R; y++) for (let x = x0; x < C; x++) { const n = noise(x * 0.4, y * 0.7, 77); if (n > 0.86 - v * 0.15 && K.rand(seed, x, y) < p) put(B, x, y, ".", L); } };
      const P0 = plan(3, 2, Math.round(C * 0.66), R - 9);
      // 이미 무언가 그려진 칸인지(벽·센서 위로 선을 긋지 않는다)
      const BAor = (B: Buf, i: number) => B.ch[i] && B.ly[i] > L_F;
      const O: Overrides = {};
      O.hook = (s) => {
        const r = { x: 4, y: 4, w: Math.round(C * 0.3), h: R - 10 };
        const v = vOf(s.value);
        const M = mask(s.value, { col: C - 3, row: 3, hRows: Math.round(R * 0.5), maxCols: Math.round(C * 0.56), align: "r" });
        return {
          draw(B, lt) {
            box(B, r.x - 1, r.y - 1, r.w + 2, r.h + 2, L_I);
            for (let x = r.x - 1; x <= r.x + r.w; x++) { put(B, x, r.y - 1, "#", L_I); put(B, x, r.y + r.h, "#", L_I); }
            for (let y = r.y - 1; y <= r.y + r.h; y++) { put(B, r.x - 1, y, "#", L_I); put(B, r.x + r.w, y, "#", L_I); }
            hline(B, r.x + 3, r.x + r.w - 4, r.y - 1, "=", L_I);
            fillRoom(B, r, v, K.ease.outCubic(K.seg(K.step(lt, 15), 0, 1.4)), s.alarm ? L_X : L_A, 0);
            sensor(B, r, L_B);
            rampFill(B, M, s.alarm ? L_X : L_A);
          },
          caps: [cap(s.label + (s.data === "sample" ? "  · " + T.sample : ""), Math.floor(r.x / 2), 0, 0, L_D, { tight: true }), ...capsWrap(s.line, 30, Math.floor(M.x0 / 2), Math.ceil(M.y1 / 2) + 1, 0.4, L_B)],
        };
      };
      const rAt = [0, 0.35, 0.6, 0.85];
      O.items = (s) => ({
        draw(B, lt) {
          const st = K.step(lt, 15);
          drawPlan(B, P0, L_I, K.ease.outCubic(K.seg(st, 0, 0.9)));
          P0.rooms.forEach((r, k) => {
            const it = roomIt[k]; if (!it) return;
            fillRoom(B, r, vOf(it.value), K.ease.outCubic(K.seg(st, 0.6 + rAt[k], 1.0)), it.alarm ? L_X : L_D, k + 1);
            if (st > 0.6) sensor(B, r, it.alarm ? L_X : L_A);
          });
          if (outIt) outside(B, P0.x0 + P0.w + 2, vOf(outIt.value), K.seg(st, 1.6, 0.8), L_D);
          if (s.data === "sample") str(B, C - 2 - colLen(T.sample), R - 2, T.sample, L_D);
        },
        caps: [
          ...P0.rooms.flatMap((r, k) => { const it = roomIt[k]; if (!it) return []; const at = 0.9 + rAt[k]; const cc = Math.floor((r.w - 3) / 2); return [cap(it.value, Math.floor((r.x + 2) / 2), Math.floor((r.y + 1) / 2), at, it.alarm ? L_X : L_B), cap(fitCols(it.label, cc), Math.floor((r.x + 2) / 2), Math.floor((r.y + 1) / 2) + 1, at + 0.15, L_D)]; }),
          ...(outIt ? [cap(outIt.value, Math.floor((P0.x0 + P0.w + 6) / 2), Math.floor((R * 0.3) / 2), 2.0, L_B), cap(fitCols(outIt.label, Math.floor((C - P0.x0 - P0.w - 8) / 2)), Math.floor((P0.x0 + P0.w + 6) / 2), Math.floor((R * 0.3) / 2) + 1, 2.15, L_D)] : []),
          ...capsWrap(s.line, 40, 2, R2 - 3, 2.4, L_I),
        ],
      });
      O.flow = (s) => {
        // 센서마다 선이 한 보드로 모이고, 거기서 공중으로 구름과 폰까지
        const busX = P0.x0 + P0.w + 3, chipX = busX + 3, chipY = Math.round(R * 0.45) - 2;
        const cloudX = C - 14, cloudY = 3, phX = C - 12, phY = R - 15;
        const sensors = P0.rooms.map((r, k) => [r.x + r.w - 4, r.y + 1 + (k % 2) * 2] as [number, number]).slice(0, Math.max(1, Math.min(4, roomIt.length || 4)));
        const top = Math.min(...sensors.map((q) => q[1])), bot = Math.max(...sensors.map((q) => q[1]));
        const chipName = fitCols(s.nodes[1] || "", 6);
        const shown = its.slice(0, 4).map((x) => (pctOf(x.value) !== null ? String(Math.round((pctOf(x.value) || 0) * 100)) : fitCols(x.value, 3)));
        const nd = (k: number) => s.nodes[k] || "";
        return {
          draw(B, lt) {
            const st = K.step(lt, 15);
            drawPlan(B, P0, L_D);
            P0.rooms.forEach((r, k) => { const it = roomIt[k]; if (it) fillRoom(B, r, vOf(it.value), 1, L_F, k + 1); });
            sensors.forEach(([sx, sy], k) => {
              str(B, sx - 1, sy, "[*]", L_A);
              const p = K.ease.outCubic(K.seg(st, 0.3 + [0, 0.25, 0.45, 0.6][k % 4], 0.9));
              const x1 = Math.round(K.lerp(sx + 2, busX, p));
              for (let x = sx + 2; x < x1; x++) if (!BAor(B, sy * C + x)) put(B, x, sy, ".", L_I);
            });
            const bp = K.seg(st, 1.0, 0.5);
            if (bp > 0) { const y1 = Math.round(K.lerp(top, Math.max(bot, chipY + 1), bp)); vline(B, busX, top, y1, ":", L_I); if (bp >= 1) hline(B, busX, chipX - 1, chipY + 1, ".", L_I); }
            if (st > 1.5) {
              const cp = K.seg(st, 1.5, 0.45);
              str(B, chipX, chipY - 1, " |||||||| ", L_B);
              str(B, chipX, chipY, "[        ]", L_B); str(B, chipX, chipY + 1, "[ " + chipName + " ".repeat(Math.max(0, 7 - colLen(chipName))) + "]", L_B); str(B, chipX, chipY + 2, "[        ]", L_B);
              str(B, chipX, chipY + 3, " |||||||| ", L_B);
              if (cp < 1) clear(B, chipX + Math.round(10 * cp), chipY - 1, 11, 5);
            }
            if (st > 2.2) {
              const a = K.seg(st, 2.2, 0.9);
              const n = Math.round(5 * a);
              for (let q = 0; q < n; q++) put(B, chipX + 11 + q * 2, chipY - 1 - Math.round(q * ((chipY - cloudY - 4) / 5)), ")", L_A);
              if (a >= 1) { str(B, cloudX, cloudY, "   .--.   ", L_I); str(B, cloudX, cloudY + 1, " .(    ). ", L_I); str(B, cloudX, cloudY + 2, "(___.__)_)", L_I); }
            }
            if (st > 3.1) {
              const a = K.seg(st, 3.1, 0.7);
              vline(B, cloudX + 5, cloudY + 4, Math.round(K.lerp(cloudY + 4, phY - 2, a)), ":", L_A);
              if (a >= 1) {
                box(B, phX, phY, 10, 11, L_B, "round");
                if (shown[0]) str(B, phX + 2, phY + 3, shown[0] + (pctOf(its[0]?.value || "") !== null ? "%" : ""), roomIt[0]?.alarm ? L_X : L_A);
                if (shown.length > 1) str(B, phX + 2, phY + 5, shown.slice(1, 3).join(" "), L_D);
                if (shown.length > 3) str(B, phX + 2, phY + 6, shown.slice(3, 4).join(" "), L_D);
              }
            }
          },
          caps: [
            cap(nd(0), Math.floor((P0.x0 + 2) / 2), Math.ceil((P0.y0 + P0.h) / 2), 0.5, L_A),
            cap(fitCols(nd(1), Math.floor((C - busX) / 2) - 1), Math.floor(busX / 2), Math.ceil((chipY + 5) / 2), 1.8, L_B),
            ...(nd(2) ? [cap(fitCols(nd(2), 10), Math.floor((cloudX - 1) / 2) - Math.min(10, colLen(nd(2))), Math.floor((cloudY + 1) / 2), 2.9, L_I)] : []),
            ...(nd(3) ? [cap(fitCols(nd(3), 10), Math.floor((phX - 1) / 2) - Math.min(10, colLen(nd(3))), Math.floor((phY + 4) / 2), 3.6, L_I)] : []),
            ...capsWrap(s.line, 46, 2, Math.ceil((P0.y0 + P0.h) / 2) + 1, 4.0, L_I),
          ],
        };
      };
      O.alert = (s) => {
        // 글자로 된 창에 가장자리부터 김이 서리고, 경고는 손가락으로 김을 닦아 쓴 글씨다
        const wx = 3, wy = 1, ww = C - 6, wh = R - 10;
        const tl = colLen(s.title) > 10 ? wrapCols(s.title, Math.ceil(colLen(s.title) * 0.62)).slice(0, 2) : [s.title];
        const longest = tl.reduce((a, b) => (colLen(b) > colLen(a) ? b : a));
        const up = (x: string) => (work.locale === "en" ? x.toUpperCase() : x);
        const sz = Math.min(mask(up(longest), { col: 0, row: 0, hRows: 30, maxCols: ww - 16, wt: 800, ls: work.locale === "en" ? 0.07 : 0.02 }).size, work.locale === "en" ? 1e9 : (wh * 0.4 * LH) / 0.95);
        // 세로로 늘인 글자가 창 높이를 넘지 않게
        const syMax = (wh * 0.42 * LH) / (sz * 0.75);
        // 세로 늘이기는 라틴 글자에만(한글은 이미 네모꼴이라 늘이면 획이 엉긴다)
        const sy = work.locale === "en" ? Math.min(1.85, Math.max(1, syMax)) : 1;
        const lineH = Math.round(wh * 0.46);
        const Ms = tl.map((l, q) => mask(up(l), { col: Math.round(wx + ww / 2 + (tl.length > 1 ? (q ? 5 : -5) : 0)), align: "c", row: wy + 1 + q * lineH, size: sz, sy, maxCols: ww, wt: 800, ls: work.locale === "en" ? 0.07 : 0.02 }));
        const wiped = new Uint8Array(N);
        for (const M of Ms) for (let i = 0; i < N; i++) if (M.m[i] > 0.34) wiped[i] = 1;
        return {
          draw(B, lt) {
            const st = K.step(lt, 15);
            const reach = 2 + K.ease.outCubic(K.seg(st, 0, 2.0)) * 24;
            for (let y = wy + 1; y < wy + wh - 1; y++) for (let x = wx + 1; x < wx + ww - 1; x++) {
              const edge = Math.min((x - wx) * 0.5, (wx + ww - 1 - x) * 0.5, y - wy, wy + wh - 1 - y);
              const n = noise(x * 0.18, y * 0.33, 5);
              const d = (reach - edge) / 5 + n * 0.7 - 0.25;
              if (d <= 0) continue;
              const i = y * C + x;
              if (wiped[i] && st > 1.1 + ((x - wx) / ww) * 1.1) continue;
              // 짙은 김은 칸 전체의 배경색(텍스트 모드 속성), 옅은 김은 글자만
              if (d > 1.1) { B.inv[i] = 1; put(B, x, y, n > 0.62 ? "." : n < 0.3 ? ":" : " ", L_D); }
              else put(B, x, y, d > 0.8 ? "=" : d > 0.5 ? ":" : ".", d > 0.8 ? L_I : L_D);
            }
            box(B, wx, wy, ww, wh, L_B);
            box(B, wx - 1, Math.max(0, wy - 1), ww + 2, wh + 2, L_D);
            hline(B, wx - 2, wx + ww + 1, wy + wh, "=", L_I);
            // 닦은 글씨 아래로 물방울 두 줄기
            for (let k = 0; k < 2; k++) {
              const M = Ms[k % Ms.length];
              const x = M.x0 + 2 + Math.round((M.x1 - M.x0) * (0.3 + k * 0.4)), y0 = M.y1 + 1;
              const len = Math.floor(K.clamp((st - 2.6 - k * 0.8) * 2.0, 0, wy + wh - 2 - y0));
              for (let y = y0; y < y0 + len; y++) put(B, x, y, y === y0 + len - 1 ? "o" : " ", L_B);
            }
            if (s.data === "sample") str(B, wx + ww - 2 - colLen(T.sampleAlert), wy + wh + 2, T.sampleAlert, L_D);
          },
          caps: [
            ...capsWrap(s.body, Math.floor(ww / 2) - 2, Math.floor((wx + 1) / 2), Math.ceil((wy + wh + 1) / 2), 2.4, L_I, { tight: true }).slice(0, 1),
            ...capsWrap([s.line, s.line2].filter(Boolean).join(" "), Math.floor(ww / 2) - 2, Math.floor((wx + 1) / 2), Math.ceil((wy + wh + 1) / 2) + 2, 3.1, L_A).slice(0, 1),
          ],
        };
      };
      O.stats = (s) => {
        // 보드의 기록: 1분에 한 줄, 맨 아래가 최신. 오른쪽엔 큰 수
        const st0 = s.stats, big = st0[0] || { value: "", unit: "", label: "" };
        const xs = Math.round(C * 0.48);
        const M = mask(big.value, { col: xs + 4, row: 2, hRows: Math.round(R * 0.42), maxCols: C - xs - 8 });
        const cols = its.slice(0, 5);
        const vals = cols.map((x) => x.value);
        // 칸 머리: 첫 낱말 앞부분 + 번호(Bedroom 1 → bed1, 침실 1 → 침실1)
        const heads = cols.map((x) => { const w = x.label.trim().split(/\s+/); const num = (/\d+$/.exec(x.label.trim()) || [""])[0]; const word = w[0].toLowerCase(); return fitCols(word, Math.max(2, (isWide(Array.from(word)[0] || "a") ? 4 : 3) - (isWide(Array.from(word)[0] || "a") ? 0 : num.length - 1))) + num; });
        const yTop = 5, yBot = R - 6;
        return {
          draw(B, lt) {
            const st = K.step(lt, 15);
            if (cols.length) {
              const n = Math.min(yBot - yTop + 1, 3 + Math.floor(st / 0.4));
              str(B, 3, yTop - 2, T.time + " ".repeat(Math.max(1, 7 - colLen(T.time))), L_D);
              heads.forEach((h, k) => str(B, 3 + 7 + k * 6 + (5 - colLen(h)), yTop - 2, h, L_D));
              hline(B, 3, 3 + 7 + cols.length * 6, yTop - 1, "-", L_F);
              for (let q = 0; q < n; q++) {
                const m = 21 * 60 + 40 + q, hh = String(Math.floor(m / 60) % 24).padStart(2, "0"), mm = String(m % 60).padStart(2, "0");
                const row = `${hh}:${mm}  ` + vals.map((v, k) => { const p = pctOf(v); return (p !== null ? String(Math.round(p * 100 + K.noise(m * 0.3, k + 1) * 1.6)) + "%" : fitCols(v, 5)).padStart(6); }).join("");
                str(B, 3, yTop + q, row, q === n - 1 ? L_B : q > n - 4 ? L_I : L_D);
              }
            }
            rampFill(B, M, L_A, K.ease.outCubic(K.seg(st, 0.3, 1.0)));
          },
          caps: [
            cap(big.label + (big.unit && big.unit !== "%" ? " · " + big.unit : ""), Math.ceil((xs + 4) / 2), Math.ceil(M.y1 / 2) + 1, 1.1, L_B),
            ...st0.slice(1).map((x, q) => cap(`${valUnit(x.value, x.unit)}  ${x.label}`, Math.ceil((xs + 4) / 2), Math.ceil(M.y1 / 2) + 3 + q, 1.8 + q * 0.6, L_I)),
            cap(s.line, Math.ceil((xs + 4) / 2), Math.ceil(M.y1 / 2) + 3 + Math.max(0, st0.length - 1) + 1, 3.0, L_D),
            ...(s.source ? [cap("// " + T.source + s.source, 1, R2 - 1, 3.3, L_D, { tight: true })] : s.data === "sample" ? [cap("// " + T.sampleData, 1, R2 - 1, 3.3, L_D, { tight: true })] : []),
          ],
        };
      };
      O.ending = (s) => {
        const nl = colLen(s.name) > 12 ? wrapCols(s.name, Math.ceil(colLen(s.name) * 0.62)) : [s.name];
        const longest = nl.reduce((a, b) => (colLen(b) > colLen(a) ? b : a));
        const sz = mask(longest, { col: 0, row: 0, hRows: Math.round(R * (colLen(longest) <= 10 ? 0.36 : 0.22)), maxCols: C - 6 }).size;
        let row = 1;
        const Ms: Mask[] = [];
        for (const l of nl) { const M = mask(l, { col: 3, row, size: sz, maxCols: C }); Ms.push(M); row = M.y1 + 2; }
        const last = Ms[Ms.length - 1];
        const P1 = plan(C - 34, last.y1 + 9, 30, Math.max(8, R - last.y1 - 10));
        return {
          draw(B, lt) {
            const st = K.step(lt, 15);
            Ms.forEach((M) => rampFill(B, M, L_B, K.ease.outCubic(K.seg(st, 0.1, 1.1))));
            drawPlan(B, P1, L_I);
            P1.rooms.forEach((r, k) => { const it = roomIt[k]; if (it) fillRoom(B, r, vOf(it.value), 1, it.alarm ? L_X : L_D, k + 1); });
            const rx0 = P1.x0 - 1, rx1 = P1.x0 + P1.w, ry = P1.y0 - 1;
            for (let q = 0; rx0 + q * 2 < rx1 - q * 2 - 1 && ry - q >= 0; q++) { put(B, rx0 + q * 2, ry - q, "/", L_I); put(B, rx1 - q * 2, ry - q, "\\", L_I); }
          },
          caps: [s.line, s.line2].filter(Boolean).map((l, q) => cap(l, 2, Math.ceil(last.y1 / 2) + 2 + q, 0.9 + q * 0.6, q ? L_D : L_I)),
          fadeBg: true,
        };
      };
      return { O, bg: () => {} };
    }

    const W0 = world === "log" ? logWorld() : world === "house" ? houseWorld() : devicesWorld();
    const S: Scene[] = scenes.map((s) => {
      const o = W0.O[s.kind] as ((x: FlatScene) => Scene) | undefined;
      const g = G[s.kind] as (x: FlatScene, bg: (B: Buf, lt: number) => void) => Scene;
      const sc = o ? o(s) : g(s, W0.bg);
      sc.s = s;
      return sc;
    });

    // ---------- 시간: 장면의 그림이 다 나온 뒤 + 읽는 시간, 길이는 제각각 ----------
    const TR = 1.0, PRE0 = 1.6;
    const lastCapAt = (sc: Scene) => Math.max(0, ...sc.caps.map((c) => c.at + colLen(c.s) / (c.type || 50)));
    const textOf = (s: FlatScene): string[] => {
      switch (s.kind) {
        case "hook": return [s.label, s.value, s.line];
        case "story": return [s.line, s.line2];
        case "items": return [s.line, ...s.items.map((x) => x.label)];
        case "flow": return [s.line, ...s.nodes];
        case "terminal": return [s.line, s.command, ...s.output];
        case "alert": return [s.title, s.body, s.line, s.line2];
        case "stats": return [s.line, ...s.stats.map((x) => x.label)];
        case "ending": return [s.name, s.line, s.line2];
      }
    };
    const base: number[] = [], want: number[] = [];
    S.forEach((sc, i) => {
      const s = sc.s!;
      const read = readLen(textOf(s).filter(Boolean).join(" "));
      const ready = lastCapAt(sc) - (i ? 0 : PRE0);
      const key = ["terminal", "items", "stats", "alert"].includes(s.kind) ? 0.9 : 0;
      base.push(Math.max(i ? 2.9 : 3.2, ready + 1.0));
      want.push(Math.max(base[i], ready + 1.7 + key, read / 19 + 1.2 - (i ? 0 : PRE0) + (s.kind === "hook" ? 1.0 : 0)));
    });
    const sb = base.reduce((a, b) => a + b, 0), sw = want.reduce((a, b) => a + b, 0);
    const capT = 23.6 + K.rand(seed, 5, 5) * 2.4;
    const f = sw > capT ? K.clamp((capT - sb) / Math.max(0.01, sw - sb)) : 1;
    let durs = base.map((b, i) => b + (want[i] - b) * f);
    const sum = durs.reduce((x, y) => x + y, 0);
    if (sum > 27.3) durs = durs.map((d) => d * (27.3 / sum)); // 전체가 30초를 넘지 않게
    let tt = 0;
    S.forEach((sc, i) => { sc.at = tt; sc.dur = durs[i]; tt += durs[i]; });
    const handAt = tt;
    const duration = tt + 2.4;
    const starts = S.map((sc) => sc.at!);

    // ---------- 디졸브 순서(세계마다 방향) ----------
    const U = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = i % C, y = (i / C) | 0;
      const d = LOOK.dir === "down" ? y / R : LOOK.dir === "up" ? 1 - y / R : x / C;
      U[i] = K.clamp(d * 0.62 + noise(x * 0.09, y * 0.16, 21) * 0.38);
    }
    const rampOut = (a: number) => (a > 0.75 ? 0 : a > 0.5 ? 43 : a > 0.25 ? 58 : a > 0 ? 46 : -1); // 0 = 원래 글자
    const rampIn = (b: number) => (b < 0.25 ? 46 : b < 0.5 ? 58 : b < 0.75 ? 43 : 0);
    const qAt = (p: number, i: number) => K.clamp((p - U[i] * 0.62) / 0.38);

    const knock = (B: Buf, sc: Scene, lt: number) => {
      for (const c of sc.caps) {
        if (lt < c.at - 0.12 || c.on) continue;
        const x0 = c.c2 * 2 - 2 <= 3 ? 0 : c.c2 * 2 - 2;
        clear(B, x0, c.r2 * 2 - (c.tight ? 0 : 1), c.c2 * 2 + colLen(c.s) * 2 + 2 - x0, c.tight ? 2 : 4);
      }
    };
    const sceneInto = (B: Buf, sc: Scene, lt: number) => { B.ch.fill(0); B.ly.fill(0); B.inv.fill(0); sc.draw(B, lt); knock(B, sc, lt); };

    const NL = 8;
    COLS[6] = LOOK.bg; COLS[7] = LOOK.invFill ? K.mix(LOOK.invFill, "#ffffff", 0.25) : K.mix(COLS[L_B], LOOK.bg, 0.5);
    const rowBufs = Array.from({ length: NL }, () => new Uint16Array(C));
    const fontsL = [400, 400, 400, LOOK.bw, LOOK.bw, LOOK.bw, 400, 400].map((w) => K.font(LOOK.fs, FAM, w));
    const capY = (r2: number) => r2 * lh2 + lh2 * 0.74;
    // 한글 한 자는 두 칸 — 글자를 두 칸 폭에 맞게 조금 키워 자간이 벌어져 보이지 않게
    mc.font = K.font(FS2, FAM, 400);
    const hgW = mc.measureText("가").width || FS2;
    const hgS = K.clamp((cw2 * 2 * 0.95) / hgW, 1, 1.3);
    const wideFontsL = [400, 400, 400, LOOK.bw, LOOK.bw, LOOK.bw, 400, 400].map((w) => K.font(LOOK.fs * hgS, FAM, w));
    const wideCells: [number, number, number, number][] = [];

    const drawCap = (g: CanvasRenderingContext2D, c: Cap, lt: number, outQ: ((x: number, y: number) => number) | null) => {
      const bold = c.L >= L_B;
      g.font = K.font(FS2, FAM, bold ? LOOK.bw : 400);
      const y = capY(c.r2), x0 = c.c2 * cw2;
      const ft = lt - c.at;
      if (ft < 0 && !outQ) return;
      const chars = Array.from(c.s);
      const width = colLen(c.s);
      if (c.inv && !outQ) {
        const k = K.ease.outCubic(K.seg(lt, c.at - 0.1, 0.35));
        g.fillStyle = COLS[L_I];
        g.fillRect(x0 - CW, y - lh2 * 0.74, (width * cw2 + CW * 2) * k, lh2);
      }
      g.fillStyle = c.inv && !outQ ? LOOK.bg : c.on && c.L <= L_B ? (c.L >= L_I ? COLS[6] : COLS[7]) : COLS[c.L];
      let col = 0;
      for (let q = 0; q < chars.length; q++) {
        let ch = chars[q];
        const wide = isWide(ch);
        const cx = x0 + col * cw2;
        col += wide ? 2 : 1;
        if (ch === " ") continue;
        if (outQ) {
          const a = 1 - 2 * outQ((c.c2 + col) * 2, c.r2 * 2);
          const r = rampOut(a); if (r < 0) continue; if (r) ch = String.fromCharCode(r);
        } else if (c.type) {
          if (ft < (col - 1) / c.type) break;
        } else {
          const rt = q * 0.02 + K.rand(seed, q, c.r2 * 7 + c.c2) * 0.05;
          const e = (K.step(lt, 30) - c.at - rt) / 0.15;
          if (e < 0) continue;
          if (e < 1) ch = RAMP[Math.min(2, Math.floor(e * 3))];
        }
        if (isWide(ch)) { const f0 = g.font; g.font = K.font(FS2 * hgS, FAM, bold ? LOOK.bw : 400); const w = g.measureText(ch).width; g.fillText(ch, cx + (cw2 * 2 - w) / 2, y); g.font = f0; }
        else g.fillText(ch, cx, y);
      }
    };

    return {
      duration,
      starts,
      render(g, t) {
        g.fillStyle = LOOK.bg;
        g.fillRect(0, 0, W, H);
        let k = 0;
        for (let i = 0; i < S.length; i++) if (t >= S[i].at!) k = i;
        const ltOf = (i: number) => t - S[i].at! + (i === 0 ? PRE0 : 0);
        const inT = k > 0 && t < S[k].at! + TR;
        const p = inT ? K.step(t - S[k].at!, 15) / TR : 1;
        const cur = S[k], prev = inT ? S[k - 1] : null;
        sceneInto(BA, cur, ltOf(k));
        if (prev) sceneInto(BB, prev, ltOf(k - 1));
        const hp = K.clamp((t - handAt) / 1.6);
        for (let i = 0; i < N; i++) {
          let c = BA.ch[i], L = BA.ly[i];
          let q = 1;
          if (prev) {
            q = qAt(p, i);
            if (q < 0.5) { const o = BB.ch[i]; if (o) { const r = rampOut(1 - 2 * q); c = r < 0 ? 0 : r ? r : o; L = r ? Math.min(BB.ly[i], L_D) : BB.ly[i]; } else c = 0; }
            else if (c) { const r = rampIn((q - 0.5) * 2); if (r) { c = r; L = Math.min(L, L_D); } }
          }
          // 넘김: 배경은 성겨지고, 이름과 물건은 남는다
          if (hp > 0 && c && L <= L_D && cur.fadeBg !== false && U[i] < hp * 1.1) c = 0;
          BF.ch[i] = c; BF.ly[i] = L;
          BF.inv[i] = prev && q < 0.5 ? BB.inv[i] : BA.inv[i];
        }
        g.fillStyle = LOOK.invFill || COLS[L_B];
        for (let y = 0; y < R; y++) { let x0 = -1; for (let x = 0; x <= C; x++) { const on = x < C && BF.inv[y * C + x]; if (on && x0 < 0) x0 = x; if (!on && x0 >= 0) { g.fillRect(x0 * CW, y * LH, (x - x0) * CW + 0.5, LH + 0.5); x0 = -1; } } }
        g.textBaseline = "alphabetic";
        wideCells.length = 0;
        for (let y = 0; y < R; y++) {
          for (let l = 0; l < NL; l++) rowBufs[l].fill(32);
          let used = 0;
          for (let x = 0; x < C; x++) {
            const i = y * C + x, c = BF.ch[i];
            if (!c) continue;
            let l = BF.ly[i];
            if (BF.inv[i] && l <= L_B) l = l >= L_I ? 6 : 7;
            if (c >= 0x1100 && isWide(String.fromCodePoint(c))) { wideCells.push([x, y, c, l]); continue; }
            rowBufs[l][x] = c; used |= 1 << l;
          }
          for (let l = 0; l < NL; l++) if (used & (1 << l)) { g.font = fontsL[l]; g.fillStyle = COLS[l]; g.fillText(String.fromCharCode.apply(null, Array.from(rowBufs[l])), 0, y * LH + LH * 0.78); }
        }
        // 한글은 두 칸 가운데에 한 자씩
        for (const [x, y, c, l] of wideCells) { g.font = wideFontsL[l]; g.fillStyle = COLS[l]; const ch = String.fromCodePoint(c); const w = g.measureText(ch).width; g.fillText(ch, x * CW + (CW * 2 - w) / 2, y * LH + LH * 0.78); }
        if (prev) {
          const outQ = (x: number, y: number) => qAt(p, Math.min(N - 1, Math.max(0, y * C + Math.min(C - 1, x))));
          for (const c of prev.caps) if (ltOf(k - 1) >= c.at) drawCap(g, c, ltOf(k - 1), outQ);
        }
        if (cur.over && !inT) cur.over(g, ltOf(k));
        for (const c of cur.caps) drawCap(g, c, ltOf(k), null);
        if (t >= handAt) K.handoff(g, K.clamp((t - handAt) / 2.4), { ink: COLS[L_I], family: FAM, size: Math.round(LOOK.fs * 1.5), x: cw2, y: H - LH * 1.4, handle: work.handle });
      },
    };
  },
};
