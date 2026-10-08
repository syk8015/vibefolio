// 종이 오리기 타이틀 — 가위로 오린 종이 조각들이 재즈 박자로 툭툭 들어와 글자와 상징이 되는 50년대식 타이틀
// (필름 실험실 G28 → 2차 수정 cutpaper-v2, 2026-10-08).
// 세계의 규칙: 화면의 모든 것은 가위로 오린 종이다 — 곧게 자르되 작은 꺾임이 남고, 모서리는 완벽하지 않다.
// 평평한 바탕 위에 머리카락만 한 그림자. 작품마다 상징 하나(코드 띠 · 기기 · 물방울)가 영화를 끌고 간다.
// 움직임: 끊기는 back-out · 모든 종이는 12fps로 끊어 움직인다 · 장면 넘김 = 큰 종이가 화면을 덮었다 걷힌다 ·
// 글자 = 띠가 미끄러져 들어오거나 낱자가 엇박으로 떨어진다.
// 2차: 흐름(flow)의 노드는 도형 사슬이 아니라 노드 이름 그대로 오린 물건이다(기록지·이빨·동전·모니터·자물쇠·
// 시계·말풍선·센서·칩·구름…, 한국어 이름도 알아본다). 흐름 배치도 작품마다 다르다(컨베이어 · 대각선 · 시계 궤도 · 하늘길).
import type { FlatScene, Genre, GenreWork } from "./types";
import * as K from "./kit";

const W = K.W, H = K.H, FPS = 12;
const RHYTHMS = [
  [0, 0.18, 0.5, 0.62, 0.9, 1.3, 1.42, 1.8, 2.0, 2.3],
  [0, 0.3, 0.42, 0.84, 0.96, 1.4, 1.7, 1.82, 2.2, 2.32],
  [0, 0.24, 0.36, 0.72, 1.08, 1.2, 1.56, 1.92, 2.04, 2.4],
];

// 정직 표시 — 영상의 언어로 쓴다.
const LABEL = {
  en: { sampleFigures: "sample figures", sampleRun: "sample run", sampleReadings: "sample readings", sampleAlert: "sample alert", source: "source: " },
  ko: { sampleFigures: "예시 수치", sampleRun: "예시 실행", sampleReadings: "예시 측정값", sampleAlert: "예시 알림", source: "출처: " },
};

// ---- 한글은 읽는 시간이 더 든다 ----
const isWide = (c: string) => {
  const n = c.codePointAt(0) || 0;
  return (n >= 0x1100 && n <= 0x115f) || (n >= 0x2e80 && n <= 0xa4cf) || (n >= 0xac00 && n <= 0xd7a3) || (n >= 0xf900 && n <= 0xfaff) || (n >= 0xff00 && n <= 0xff60) || (n >= 0xffe0 && n <= 0xffe6) || n >= 0x1f300;
};
const readLen = (s: string) => Array.from(s).reduce((a, c) => a + (isWide(c) ? 1.7 : 1), 0);

type Pt = [number, number];
type Motif = "strips" | "devices" | "drop";
type Pal = { ground: string; ink: string; paper: string; hot: string; onGround: string };
type Col = { a: string; b: string; hole: string; name: string };
type Shape = "logs" | "survivors" | "jaw" | "coin" | "monitor" | "lock" | "phone" | "clockEnd" | "clockNew" | "bubble" | "sensors" | "chip" | "cloud" | "letter";

// ---------- 종이 ----------
function cutRect(w: number, h: number, sd: number, kink = 2.2): Pt[] { // 가위로 자른 직사각형: 곧은 선에 작은 꺾임
  const pts: Pt[] = [], C: Pt[] = [[0, 0], [w, 0], [w, h], [0, h]];
  for (let e = 0; e < 4; e++) {
    const [ax, ay] = C[e], [bx, by] = C[(e + 1) % 4];
    const len = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / len, ny = (bx - ax) / len;
    let t = 0, k = 0;
    while (t < 1) {
      const j = (k === 0 ? 1.6 : 1) * (K.rand(sd, e, k) - 0.5) * 2 * kink;
      pts.push([ax + (bx - ax) * t + nx * j, ay + (by - ay) * t + ny * j]);
      t += (50 + K.rand(sd, e, k + 50) * 80) / Math.max(len, 1); k++;
    }
  }
  return pts;
}
function cutOval(rx: number, ry: number, sd: number, n = 34): Pt[] {
  const pts: Pt[] = [];
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2, r = 1 + (K.rand(sd, k) - 0.5) * 0.025; pts.push([Math.cos(a) * rx * r, Math.sin(a) * ry * r]); }
  return pts;
}
function cutDrop(r: number, sd: number): Pt[] { // 물방울: 둥근 배, 위는 뾰족하게 자른다
  const pts: Pt[] = [];
  for (let k = 0; k <= 30; k++) { const a = Math.PI * (-0.25 + (1.5 * k) / 30); const j = 1 + (K.rand(sd, k) - 0.5) * 0.03; pts.push([Math.cos(a) * r * j, Math.sin(a) * r * j]); }
  pts.push([0, -r * 1.75]);
  return pts;
}
function poly(g: CanvasRenderingContext2D, pts: Pt[], x: number, y: number, rot: number, col: string, shadow = true): void {
  g.save(); g.translate(x, y); if (rot) g.rotate(rot);
  if (shadow) { g.fillStyle = "rgba(0,0,0,0.22)"; g.beginPath(); pts.forEach(([a, b], k) => (k ? g.lineTo(a + 3, b + 4) : g.moveTo(a + 3, b + 4))); g.closePath(); g.fill(); }
  g.fillStyle = col; g.beginPath(); pts.forEach(([a, b], k) => (k ? g.lineTo(a, b) : g.moveTo(a, b))); g.closePath(); g.fill();
  g.restore();
}
// 반지름 둘 사이의 띠(고리·시계 테·자물쇠 고리), 각도는 라디안
function band(r0: number, r1: number, a0: number, a1: number, sd: number, n = 40): Pt[] {
  const pts: Pt[] = [];
  for (let k = 0; k <= n; k++) { const a = a0 + ((a1 - a0) * k) / n, j = 1 + (K.rand(sd, k, 1) - 0.5) * 0.02; pts.push([Math.cos(a) * r0 * j, Math.sin(a) * r0 * j]); }
  for (let k = n; k >= 0; k--) { const a = a0 + ((a1 - a0) * k) / n, j = 1 + (K.rand(sd, k, 2) - 0.5) * 0.02; pts.push([Math.cos(a) * r1 * j, Math.sin(a) * r1 * j]); }
  return pts;
}
function wedge(r: number, a0: number, a1: number, sd: number, n = 30): Pt[] {
  const pts: Pt[] = [[0, 0]];
  for (let k = 0; k <= n; k++) { const a = a0 + ((a1 - a0) * k) / n, j = 1 + (K.rand(sd, k, 3) - 0.5) * 0.025; pts.push([Math.cos(a) * r * j, Math.sin(a) * r * j]); }
  return pts;
}

// ---------- 노드 실루엣: 흐름의 진짜 노드 이름이 그대로 오린 물건이 된다(영어·한국어 둘 다) ----------
const shapeOf = (nm: string): Shape => {
  const s = String(nm).toLowerCase();
  if (/\blogs?\b|기록|로그/.test(s)) return "logs";
  if (/surviv|kept|\bcode\b|살아남|남은 코드/.test(s)) return "survivors";
  if (/\beats?\b|limit|spend|먹|한도/.test(s)) return "jaw";
  if (/pay|money|worth|\$|본전|돈|비용|구독/.test(s)) return "coin";
  if (/hour|ends\b|timer|clock|끝|종료|마감/.test(s)) return "clockEnd";
  if (/\bnew\b|starts?\b|시작|새로/.test(s)) return "clockNew";
  if (/\bhi\b|hello|ping|안녕/.test(s)) return "bubble";
  if (/encrypt|lock|secure|private|암호|잠금|보안/.test(s)) return "lock";
  if (/phone|mobile|폰|휴대/.test(s)) return "phone";
  if (/\bmac\b|computer|laptop|desktop|맥|컴퓨터|노트북/.test(s)) return "monitor";
  if (/sensor|센서/.test(s)) return "sensors";
  if (/esp|chip|board|arduino|보드|칩/.test(s)) return "chip";
  if (/cloud|server|클라우드|서버/.test(s)) return "cloud";
  return "letter";
};
const HALF: Record<Shape, number> = { logs: 118, survivors: 108, jaw: 108, coin: 124, monitor: 112, lock: 112, phone: 128, clockEnd: 112, clockNew: 112, bubble: 118, sensors: 52, chip: 108, cloud: 84, letter: 112 };
/** 칩 위에 찍을 이름 — 첫 낱말이 짧은 영숫자면 그것(ESP32), 아니면 CPU. */
const chipText = (nm: string) => { const tok = nm.trim().split(/\s+/)[0] || ""; return /^[A-Za-z0-9-]{1,6}$/.test(tok) ? tok : "CPU"; };

/** 작품의 상징 — 장면의 생김새로 고른다(터미널 → 코드 띠, % 측정값 → 물방울, 훅 없이 시작 → 기기). */
function pickMotif(work: GenreWork, seed: number): Motif {
  const kinds = work.scenes.map((s) => s.kind);
  if (kinds.includes("terminal")) return "strips";
  const pctItems = work.scenes.some((s) => s.kind === "items" && s.items.length > 0 && s.items.every((it) => /^\s*[\d.,]+\s*%\s*$/.test(it.value)));
  if (pctItems) return "drop";
  if (!kinds.includes("hook")) return "devices";
  return (["strips", "devices", "drop"] as const)[seed % 3];
}

const sceneText = (s: FlatScene): string => {
  switch (s.kind) {
    case "hook": return [s.label, s.value, s.line].join(" ");
    case "story": return [s.line, s.line2].join(" ");
    case "flow": return [s.line, ...s.nodes].join(" ");
    case "terminal": return [s.command, s.line, ...s.output].join(" ");
    case "items": return [s.line, ...s.items.map((x) => x.label + " " + x.value)].join(" ");
    case "alert": return [s.title, s.body, s.line, s.line2].join(" ");
    case "stats": return [s.line, ...s.stats.map((x) => x.label + " " + x.value)].join(" ");
    case "ending": return [s.line, s.line2, s.name].join(" ");
  }
};

export const cutpaper: Genre = {
  id: "cutpaper",
  name: "Cut-paper titles",
  ko: "종이 오리기 타이틀",
  koIdea: "가위로 오린 종이 조각들이 재즈 박자로 툭툭 들어와 글자와 상징이 되는 50년대식 타이틀 영화",
  enIdea: "Scissor-cut paper pieces land on a jazz beat and become the words and symbols — a 1950s title sequence",
  family: "C",
  fonts: ["archivoNarrow", "courierPrime"],
  make(work, { seed, fonts }) {
    const F = fonts.archivoNarrow, T = fonts.courierPrime;
    const L = LABEL[work.locale];
    const R = (i: number, j = 0) => K.rand(seed, i, j);
    const motif = pickMotif(work, seed);
    // 색: 평평한 세 가지. 색 없는 CLI는 회색 바탕, 앱의 색은 화면 가득 바탕이 되거나 오린 강조색이 된다
    const P: Pal = {
      strips: { ground: "#8d8f8a", ink: "#151515", paper: "#f2f2ed", hot: "#f2f2ed", onGround: "#f2f2ed" },
      devices: { ground: "#141414", ink: "#141414", paper: "#f2f2ed", hot: work.accent || "#f39a14", onGround: "#f2f2ed" },
      drop: { ground: work.accent || "#ef8a12", ink: "#141414", paper: "#f3f3ee", hot: "#141414", onGround: "#141414" },
    }[motif];
    // 이 바탕에서 늘 읽히는 띠 두 가지: [바탕, 글자]
    const S1 = motif === "devices" ? [P.paper, P.ink] : [P.ink, P.paper];
    const S2 = motif === "devices" ? [P.hot, P.ink] : [P.paper, P.ink];
    const darkGround = K.oklch(P.ground)[0] < 0.4;
    const beats = RHYTHMS[seed % 3];
    const B = (k: number) => beats[k % beats.length] + Math.floor(k / beats.length) * (beats[beats.length - 1] + 0.3);
    // 끊기는 back-out, 12fps
    const pop = (u: number, at: number, d = 0.42, s = 1.9) => { const q = K.step(u - at, FPS); return q < 0 ? 0 : K.ease.outBack(K.clamp(q / d), s); };
    const fall = (u: number, at: number) => { const q = K.step(u - at, FPS); return q < 0 ? 0 : 0.5 * 2600 * q * q; };
    const boil = (u: number, k: number, a = 0.8) => (K.rand(seed, Math.floor(u * 6), k) - 0.5) * a; // 멈춰 있을 때의 작은 숨, 6fps

    // ---------- 글자 ----------
    // 손으로 오린 글자: 낱자마다 한 조각, 조금씩 비뚤다
    type GlyOpt = { wt?: number; fam?: string; drop?: ((i: number) => { dy: number; dr?: number } | null) | null; track?: number };
    const glyphs = (g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, col: string, sd: number, { wt = 700, fam = F, drop = null, track = 0 }: GlyOpt = {}) => {
      g.font = K.font(size, fam, wt); g.fillStyle = col; g.textAlign = "left";
      let cx = x;
      const chs = Array.from(text);
      for (let i = 0; i < chs.length; i++) {
        const ch = chs[i], w = g.measureText(ch).width;
        let dy = 0, dr = 0;
        if (drop) { const v = drop(i); if (v === null) { cx += w + track; continue; } dy = v.dy; dr = v.dr || 0; }
        if (ch !== " ") {
          const r = (K.rand(sd, i, 1) - 0.5) * 0.06 + dr, oy = (K.rand(sd, i, 2) - 0.5) * size * 0.035, sc = 1 + (K.rand(sd, i, 3) - 0.5) * 0.05;
          g.save(); g.translate(cx + w / 2, y + oy + dy); g.rotate(r); g.scale(sc, sc);
          g.fillText(ch, -w / 2, 0); g.restore();
        }
        cx += w + track;
      }
      return cx - x;
    };
    const textW = (g: CanvasRenderingContext2D, text: string, size: number, fam = F, wt = 700) => { g.font = K.font(size, fam, wt); return g.measureText(text).width; };
    const fit = (g: CanvasRenderingContext2D, text: string, maxW: number, maxS: number, fam = F, wt = 700, minS = 28) => { let s = maxS; while (s > minS && textW(g, text, s, fam, wt) > maxW) s -= 2; return s; };
    // 띄어쓰기에서 끊고, 한 낱말이 줄보다 길면 글자 단위로 끊는다(한국어 긴 낱말 대비)
    const wrapText = (g: CanvasRenderingContext2D, text: string, size: number, maxW: number, fam = F, wt = 700): string[] => {
      g.font = K.font(size, fam, wt);
      const out: string[] = [];
      let cur = "";
      for (const word of String(text).split(/\s+/).filter(Boolean)) {
        const next = cur ? cur + " " + word : word;
        if (g.measureText(next).width <= maxW) { cur = next; continue; }
        if (cur) out.push(cur);
        if (g.measureText(word).width <= maxW) { cur = word; continue; }
        cur = "";
        for (const ch of Array.from(word)) { if (cur && g.measureText(cur + ch).width > maxW) { out.push(cur); cur = ch; } else cur += ch; }
      }
      if (cur) out.push(cur);
      return out;
    };
    // 글자를 실은 종이 띠; 폭을 돌려준다
    type StripOpt = { rot?: number; fam?: string; wt?: number; padX?: number; align?: "left" | "right" };
    const strip = (g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fg: string, bg: string, sd: number, { rot = 0, fam = F, wt = 700, padX = 0.5, align = "left" }: StripOpt = {}) => {
      const tw = textW(g, text, size, fam, wt), w = tw + size * padX * 2, h = size * 1.42;
      const ox = align === "right" ? -w : 0;
      g.save(); g.translate(x + ox, y); g.rotate(rot);
      poly(g, cutRect(w, h, sd), 0, 0, 0, bg);
      glyphs(g, text, size * padX, h * 0.73, size, fg, sd + 7, { fam, wt });
      g.restore();
      return w;
    };

    // ---------- 기기 ----------
    const drawMac = (g: CanvasRenderingContext2D, x: number, y: number, s: number, col: string, screen: string, sd: number) => { // x,y = 화면 왼쪽 위
      poly(g, cutRect(420 * s, 280 * s, sd), x, y, 0, col);
      poly(g, cutRect(380 * s, 238 * s, sd + 1), x + 20 * s, y + 20 * s, 0, screen, false);
      poly(g, [[0, 0], [90 * s, 0], [120 * s, 70 * s], [-30 * s, 70 * s]], x + 165 * s, y + 280 * s, 0, col);
      poly(g, cutRect(260 * s, 18 * s, sd + 2), x + 80 * s, y + 348 * s, 0, col);
    };
    const drawPhone = (g: CanvasRenderingContext2D, x: number, y: number, s: number, col: string, screen: string, sd: number) => {
      poly(g, cutRect(200 * s, 400 * s, sd, 2.6), x, y, 0, col);
      poly(g, cutRect(170 * s, 330 * s, sd + 1), x + 15 * s, y + 34 * s, 0, screen, false);
    };

    // ---------- 노드 물건들(원점 둘레 ±120쯤). uu = 그 조각이 내려앉은 뒤 흐른 초 ----------
    const clock = (g: CanvasRenderingContext2D, C: Col, sd: number, uu: number, fresh: boolean) => {
      poly(g, cutOval(112, 112, sd), 0, 0, 0, C.a);
      const frac = fresh ? (uu < 0.6 ? 0.012 : uu < 1.5 ? 0.035 : 0.07) : 5 / 12;
      const a0 = -Math.PI / 2, a1 = a0 + frac * Math.PI * 2;
      poly(g, wedge(94, a0, a1, sd + 1), 0, 0, 0, C.b, false);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2, big = k % 3 === 0;
        g.save(); g.rotate(a); poly(g, cutRect(big ? 9 : 5, big ? 18 : 10, sd + 40 + k, 0.6), -(big ? 4.5 : 2.5), -104, 0, C.hole, false); g.restore();
      }
      const hand = (a: number, len: number, w: number, k: number) => { g.save(); g.rotate(a + Math.PI / 2); poly(g, cutRect(w, len, sd + 60 + k, 0.8), -w / 2, -len + 8, 0, C.hole, false); g.restore(); };
      hand(a1, 62, 13, 0); hand(a0, 84, 8, 1);
      poly(g, cutOval(11, 11, sd + 70), 0, 0, 0, C.hole, false);
    };
    const SHAPES: Record<Exclude<Shape, "clockEnd" | "clockNew">, (g: CanvasRenderingContext2D, C: Col, sd: number, uu: number) => void> = {
      logs(g, C, sd) {
        poly(g, cutRect(170, 220, sd), -118, -128, -0.07, C.b);
        poly(g, cutRect(170, 220, sd + 1), -98, -118, -0.025, C.b === C.hole ? C.a : C.b);
        g.save(); g.translate(-72, -106); g.rotate(0.035);
        poly(g, cutRect(170, 222, sd + 2), 0, 0, 0, C.a);
        for (let j = 0; j < 6; j++) { const w = 62 + K.rand(sd, j, 5) * 72; poly(g, cutRect(w, 10, sd + 10 + j, 1.1), 22, 32 + j * 29, 0, C.hole, false); }
        poly(g, [[130, 0], [170, 0], [170, 40]], 0, 0, 0, C.hole, false); // 귀퉁이를 접어 자른 자리
        poly(g, [[130, 0], [170, 40], [130, 40]], 0, 0, 0, C.b === C.hole ? C.a : C.b);
        g.restore();
      },
      survivors(g, C, sd) {
        const base = 108;
        ([[-160, 168], [-122, 214], [-84, 132], [-46, 190], [-8, 150]] as Pt[]).forEach(([x, h], j) => poly(g, cutRect(28, h, sd + j, 1.3), x, base - h, (K.rand(sd, j, 3) - 0.5) * 0.05, C.a));
        poly(g, cutRect(28, 178, sd + 7, 1.3), 62, base - 168, 0.55, C.b); // 넘어지는 하나
        poly(g, cutRect(130, 26, sd + 8, 1.3), 10, base - 26, 0.02, C.b); // 이미 쓰러진 하나
      },
      jaw(g, C, sd, uu) {
        // 한도(종이 막대)가 한 입씩 천천히 짧아진다
        const per = 1.15, q = K.step(Math.max(0, uu - 0.45), FPS);
        const done = q < 0.22 * per ? 0 : Math.min(4, Math.floor((q - 0.22 * per) / per) + 1);
        const ph = (q % per) / per, live = q > 0 && Math.floor(q / per) < 4;
        const close = live ? (ph < 0.22 ? ph / 0.22 : ph < 0.42 ? 1 - (ph - 0.22) / 0.2 : 0) : 0;
        const len = 176 - done * 30;
        poly(g, cutRect(len, 36, sd + 1), -20, -18, 0, C.a);
        for (let c = 0; c < done; c++) poly(g, cutRect(20 + K.rand(sd, c, 7) * 14, 14, sd + 20 + c), -6 + c * 22, 88 + K.rand(sd, c, 8) * 26, K.rand(sd, c, 9) - 0.5, C.a);
        const m = 0.66 * (1 - close) + 0.05;
        poly(g, wedge(108, m, Math.PI * 2 - m, sd + 2), -70, 0, 0, C.b);
        poly(g, cutOval(12, 12, sd + 3), -66, -58, 0, C.hole, false);
      },
      coin(g, C, sd) {
        poly(g, cutOval(114, 30, sd + 3), 0, 112, 0, C.b);
        poly(g, cutOval(114, 30, sd + 4), 0, 96, 0, C.a);
        poly(g, cutOval(114, 114, sd), 0, -10, 0, C.a);
        poly(g, band(92, 80, 0, Math.PI * 2, sd + 1), 0, -10, 0, C.b, false);
        const w = textW(g, "$", 150);
        glyphs(g, "$", -w / 2, 42, 150, C.b, sd + 2);
      },
      monitor(g, C, sd) {
        drawMac(g, -130, -112, 0.62, C.a, C.hole, sd);
        [0.7, 0.45, 0.82, 0.3].forEach((f, j) => poly(g, cutRect(200 * f, 11, sd + 30 + j, 1), -130 + 26, -112 + 30 + j * 26, 0, C.b, false));
      },
      lock(g, C, sd) {
        const Ro = 74, Ri = 46, top = -42, pts: Pt[] = [[-Ro, top + 28]];
        for (let k = 0; k <= 24; k++) { const a = Math.PI + (Math.PI * k) / 24; pts.push([Math.cos(a) * Ro, top + Math.sin(a) * Ro]); }
        pts.push([Ro, top + 28], [Ri, top + 28]);
        for (let k = 24; k >= 0; k--) { const a = Math.PI + (Math.PI * k) / 24; pts.push([Math.cos(a) * Ri, top + Math.sin(a) * Ri]); }
        pts.push([-Ri, top + 28]);
        poly(g, pts, 0, 0, 0, C.a);
        poly(g, cutRect(212, 156, sd), -106, -44, 0, C.b);
        poly(g, cutOval(20, 20, sd + 1), 0, 22, 0, C.hole, false);
        poly(g, [[-9, 30], [9, 30], [15, 78], [-15, 78]], 0, 0, 0, C.hole, false);
      },
      phone(g, C, sd) {
        drawPhone(g, -64, -128, 0.64, C.a, C.hole, sd);
        [0.8, 0.55, 0.7].forEach((f, j) => poly(g, cutRect(100 * f, 12, sd + 30 + j, 1), -64 + 22, -128 + 60 + j * 30, 0, C.b, false));
      },
      bubble(g, C, sd) {
        poly(g, [[-62, 50], [-18, 72], [-104, 118]], 0, 0, 0, C.b);
        poly(g, cutOval(136, 94, sd), 0, -6, 0, C.b);
        const w = textW(g, "hi", 150);
        glyphs(g, "hi", -w / 2, 42, 150, C.hole, sd + 2); // 말풍선에서 오려 낸 글자
      },
      sensors(g, C, sd, uu) {
        for (let j = 0; j < 5; j++) {
          const dl = K.rand(sd, j, 4) * 0.34, e = uu < dl ? 0 : K.ease.outBack(K.clamp(K.step(uu - dl, FPS) / 0.3), 1.8);
          if (e <= 0) continue;
          const x = -190 + j * 78, oy = (1 - e) * -160;
          poly(g, cutRect(64, 98, sd + j), x, -50 + oy, (K.rand(sd, j, 5) - 0.5) * 0.06, C.b);
          poly(g, cutOval(13, 13, sd + 10 + j), x + 32, -20 + oy, 0, C.a, false);
          for (let s = 0; s < 3; s++) poly(g, cutRect(38, 6, sd + 20 + j * 3 + s, 0.6), x + 13, 6 + s * 13 + oy, 0, C.hole, false);
        }
      },
      chip(g, C, sd) {
        for (let k = 0; k < 6; k++) {
          const o = -70 + k * 28;
          poly(g, cutRect(11, 26, sd + 80 + k, 0.6), o, -104, 0, C.a); poly(g, cutRect(11, 26, sd + 90 + k, 0.6), o, 78, 0, C.a);
          poly(g, cutRect(26, 11, sd + 100 + k, 0.6), -104, o, 0, C.a); poly(g, cutRect(26, 11, sd + 110 + k, 0.6), 78, o, 0, C.a);
        }
        poly(g, cutRect(164, 164, sd), -82, -82, 0, C.a);
        poly(g, cutOval(10, 10, sd + 1), -56, -56, 0, C.b, false);
        const nm = chipText(C.name), cs = fit(g, nm, 130, 46, F, 700, 20), w = textW(g, nm, cs);
        glyphs(g, nm, -w / 2, 16, cs, C.b, sd + 2);
      },
      cloud(g, C, sd) {
        poly(g, cutRect(250, 56, sd + 4), -125, 22, 0, C.b);
        poly(g, cutOval(64, 54, sd), -76, 18, 0, C.b);
        poly(g, cutOval(86, 78, sd + 1), -6, -20, 0, C.b);
        poly(g, cutOval(62, 56, sd + 2), 78, 16, 0, C.b);
      },
      letter(g, C, sd) {
        const ch = (Array.from(String(C.name).trim())[0] || "?").toUpperCase(); // 한글은 첫 음절
        const sz = isWide(ch) ? 230 : 280, w = textW(g, ch, sz);
        glyphs(g, ch, -w / 2, isWide(ch) ? 84 : 100, sz, C.a, sd);
      },
    };
    const drawNode = (g: CanvasRenderingContext2D, kind: Shape, x: number, y: number, sc: number, C: Col, sd: number, uu: number) => {
      g.save(); g.translate(x, y); g.scale(sc, sc);
      if (kind === "clockEnd" || kind === "clockNew") clock(g, C, sd, uu, kind === "clockNew");
      else SHAPES[kind](g, C, sd, uu);
      g.restore();
    };

    // ---------- 장면 길이 ----------
    const sc = work.scenes;
    const kindX: Record<FlatScene["kind"], number> = { hook: 0.8, story: 0.4, flow: 1.0, terminal: 1.4, items: 1.0, alert: 1.0, stats: 1.2, ending: 0.6 };
    // 넘김은 0.9초(덮고 · 컷을 넘어 잠깐 머물고 · 걷힌다). 장면 시계는 종이가 걷히기 시작할 때 돈다(LEAD).
    const WIPE = 0.9, LEAD = 0.3;
    const flowKx = { strips: 1.6, devices: 1.4, drop: 1.5 }[motif];
    type Shot = { s: FlatScene; i: number; dur: number; at: number; lead: number };
    const shots: Shot[] = sc.map((s, i) => ({ s, i, at: 0, lead: 0, dur: K.clamp(readLen(sceneText(s)) / 18 + 0.9 + (s.kind === "flow" ? flowKx : kindX[s.kind] || 0), 2.2, s.kind === "flow" ? 6.4 : 6.0) }));
    shots[shots.length - 1].dur = Math.min(shots[shots.length - 1].dur, 3.6) + 2.4;
    const over = (k: number) => (k > 0 ? LEAD : 0) + (k < shots.length - 1 ? WIPE / 2 : 0);
    let gd = 0;
    const tot = () => shots.reduce((a, x, k) => a + x.dur + over(k), 0);
    while (tot() > 29.6 && gd++ < 60) shots.forEach((x, k) => { if (k < shots.length - 1) x.dur = Math.max(x.s.kind === "flow" ? 4.0 : 2.4, x.dur * 0.96); });
    if (shots.length > 1 && Math.max(...shots.slice(0, -1).map((x) => x.dur)) < 4.0) { const k = shots.findIndex((x) => x.s.kind === "stats" || x.s.kind === "terminal" || x.s.kind === "items"); if (k >= 0) shots[k].dur = 4.2; }
    shots.forEach((x, k) => { x.lead = k > 0 ? LEAD : 0; x.dur += over(k); });
    let acc = 0;
    shots.forEach((x) => { x.at = acc; acc += x.dur; });
    const duration = acc;
    const wipeP = (tau: number) => (tau < 0.44 ? 0.5 * K.ease.outCubic(tau / 0.44) : tau < 0.54 ? 0.5 : 0.5 + 0.5 * K.ease.inQuad((tau - 0.54) / 0.46));
    const wipes = shots.map((_, i) => ({ kind: (["bar", "bar", "disc", "slant"] as const)[Math.floor(R(i, 60) * 4)], dir: R(i, 61) > 0.5 ? 1 : -1, col: [P.ink, P.paper, P.hot][Math.floor(R(i, 62) * 3)] }));
    const flowIdx: number[] = [];
    { let n = 0; sc.forEach((s, i) => { flowIdx[i] = s.kind === "flow" ? n++ : -1; }); }

    // ---------- 상징 ----------
    const stripBars = Array.from({ length: 14 }, (_, k) => ({ w: 180 + R(k, 70) * 520, h: 20 + Math.floor(R(k, 71) * 3) * 8, sd: seed + k * 13 }));
    const drawStrips = (g: CanvasRenderingContext2D, u: number, x0: number, y0: number) => {
      let y = y0;
      stripBars.forEach((b, k) => {
        const e = pop(u, B(k) * 0.55, 0.36);
        poly(g, cutRect(b.w, b.h, b.sd), x0 - (1 - e) * (b.w + x0 + 40), y, 0, P.paper);
        y += b.h + 14;
      });
    };

    // ---------- 장면 ----------
    type Draw<S> = (g: CanvasRenderingContext2D, s: S, u: number, X: Shot) => void;
    type Of<Kd extends FlatScene["kind"]> = Extract<FlatScene, { kind: Kd }>;
    const D: { [Kd in FlatScene["kind"]]: Draw<Of<Kd>> } = {
      hook(g, s, u) {
        if (motif === "strips") drawStrips(g, u, 96, 170);
        else if (motif === "drop") {
          const e = pop(u, 0, 0.5, 1.4);
          poly(g, cutDrop(250, seed + 5), 420, 560 + (1 - e) * -700, 0.06, P.ink);
          poly(g, cutOval(60, 38, seed + 6), 340, 610 + (1 - e) * -700, -0.5, P.ground, false);
        } else drawPhone(g, 200, 200 - (1 - pop(u, 0)) * 800, 1.25, P.paper, P.ink, seed + 3);
        // 숫자는 크게 오린다
        const vs = fit(g, s.value, 760, 360);
        const vw = textW(g, s.value, vs);
        const vx = motif === "strips" ? W - 96 - vw : 760;
        glyphs(g, s.value, vx, 600, vs, P.paper, seed + 11, { drop: (i) => ({ dy: -(1 - pop(u, B(1) + i * 0.09 + (i % 2) * 0.05, 0.4)) * 900 }) });
        strip(g, s.label, motif === "strips" ? W - 96 : 96, 96, fit(g, s.label, motif === "strips" ? 700 : 600, 44), S1[1], S1[0], seed + 21, { rot: -0.012, align: motif === "strips" ? "right" : "left" });
        const le = pop(u, B(4), 0.45);
        if (le > 0) strip(g, s.line, (motif === "strips" ? W - 96 : 760) + (1 - le) * 900, 690, fit(g, s.line, 760, 50), S2[1], S2[0], seed + 22, { rot: 0.008, align: motif === "strips" ? "right" : "left" });
        if (s.data === "sample" && pop(u, B(6)) > 0) strip(g, L.sampleFigures, motif === "strips" ? W - 110 : 1300, motif === "strips" ? 790 : 222, 32, S1[1], S1[0], seed + 23, { rot: 0.05, fam: T, align: "right" });
      },
      story(g, s, u) {
        const e2 = pop(u, B(3) + 0.3, 0.4);
        const l1 = wrapText(g, s.line, 64, 1100);
        l1.forEach((l, k) => strip(g, l, 96 - (1 - pop(u, 0.05 + k * 0.17, 0.4)) * 1500, 170 + k * 104, 64, S1[1], S1[0], seed + 30 + k, { rot: k % 2 ? 0.01 : -0.014 }));
        const y2 = 170 + l1.length * 104 + 40;
        if (e2 > 0) strip(g, s.line2, W - 96 + (1 - e2) * 1500, y2, fit(g, s.line2, 1100, 52), S2[1], S2[0], seed + 35, { rot: 0.01, align: "right" });
        if (motif === "strips") { // 토큰을 태워도 남는 게 없다: 띠들이 떨어져 나간다
          let y = 560;
          stripBars.slice(0, 8).forEach((b, k) => {
            const fy = fall(u, 1.5 + B(k) * 0.6);
            if (fy < H) poly(g, cutRect(b.w * 0.8, b.h, b.sd), W - 96 - b.w * 0.8, y + fy, fy * 0.001 * (k % 2 ? 1 : -1), P.paper);
            y += b.h + 12;
          });
        } else if (motif === "devices") {
          const e = pop(u, 0, 0.5, 1.4);
          drawMac(g, 160 - (1 - e) * 900, 520 - 40, 0.62, P.paper, P.ink, seed + 40);
          const q = pop(u, B(5) + 0.8, 0.45, 2.2);
          if (q > 0) glyphs(g, "?", 560, 860 - (1 - q) * 200, 380, P.hot, seed + 41);
        } else {
          const e = pop(u, 0, 0.5);
          poly(g, cutDrop(130, seed + 42), 1300, 640 - (1 - e) * 900, 0.1, P.ink);
        }
      },
      flow(g, s, u, X) {
        // 노드마다 그 이름의 물건을 오린다; 작품마다 배치가 다르다
        const n = s.nodes.length, fi = Math.max(0, flowIdx[X.i]);
        if (!n) { strip(g, s.line, 96, 400, fit(g, s.line, W - 192, 56), S1[1], S1[0], seed + 110); return; }
        const lay = motif === "strips" ? "belt" : motif === "drop" ? "sky" : fi % 2 ? "ring" : "diag";
        const kinds = s.nodes.map(shapeOf);
        // 엇박 도착, 0.55초보다 붙지 않는다
        const at = s.nodes.map((_, k) => 0.3 + k * 0.66 + (K.rand(seed, k + fi * 10, 85) < 0.45 ? 0.16 : 0));
        const C = motif === "devices" ? { a: P.paper, b: P.hot, hole: P.ground } : motif === "drop" ? { a: P.ink, b: P.paper, hole: P.ground } : { a: P.paper, b: P.ink, hole: P.ground };
        const fit1 = n > 4 ? 4 / n : 1;
        const drift = lay === "belt" ? K.step(Math.max(0, u), FPS) * 18 : 0;
        const beltY = 650, RX = 400, RY = 290, RC: Pt = [800, 560];
        const pos: [number, number, number][] = s.nodes.map((_, k) => {
          const a = n > 1 ? k / (n - 1) : 0.5;
          if (lay === "belt") { const slot = (W - 220) / n, sc_ = 1.16 * fit1 * (kinds[k] === "jaw" ? 0.92 : 1); return [110 + slot * (k + 0.5) + 60 - drift + (kinds[k] === "jaw" ? 30 : 0), beltY - HALF[kinds[k]] * sc_ - 6, sc_]; }
          if (lay === "diag") return [300 + a * 1000, 270 + a * 230, 1.3 * fit1];
          if (lay === "ring") { const ang = Math.PI + a * Math.PI; return [RC[0] + Math.cos(ang) * RX, RC[1] + Math.sin(ang) * RY, 1.06 * fit1]; }
          return [k === 0 ? 290 : 330 + a * 1000, kinds[k] === "cloud" ? 262 : 560, (kinds[k] === "sensors" ? 0.96 : 1.25) * fit1];
        });
        const grow = (from: number) => Math.floor(K.clamp((u - from) / 0.42) * 3) / 3; // 잇는 띠는 세 번 가위질로 자란다
        // ---- 잇는 것(물건 밑) ----
        if (lay === "belt") {
          const e = pop(u, 0, 0.45, 1.4), ox = (1 - e) * 1700;
          poly(g, cutRect(W + 120, 36, seed + 500), -60 + ox, beltY, 0, P.ink);
          for (let r = 0; r < 9; r++) poly(g, cutOval(19, 19, seed + 510 + r), 70 + r * 182 + ox, beltY + 58, 0, P.ink);
          for (let j = 0; j < 22; j++) { const x = (((j * 84 - drift) % (W + 168)) + W + 168) % (W + 168) - 84 + ox; poly(g, cutRect(9, 36, seed + 530 + j, 0.5), x, beltY, 0, P.ground, false); }
        } else if (lay === "diag") {
          for (let k = 0; k < n - 1; k++) {
            const [ax, ay] = pos[k], [bx, by] = pos[k + 1], gr = grow(at[k] + 0.32);
            if (gr <= 0) continue;
            if (kinds[k] === "lock") { // 자물쇠를 지나면 상태가 뒤섞인 종이 조각으로 간다
              const m = 18;
              for (let j = 0; j < m; j++) {
                const q = (j + 0.5) / m; if (q > gr) break;
                const jx = (K.rand(seed, j, 520) - 0.5) * 90, jy = (K.rand(seed, j, 521) - 0.5) * 90, sz = 16 + K.rand(seed, j, 522) * 22;
                poly(g, cutRect(sz, sz * (0.6 + K.rand(seed, j, 523) * 0.6), seed + 540 + j), ax + (bx - ax) * q + jx, ay + (by - ay) * q + jy, K.rand(seed, j, 524) * 3, j % 3 ? C.a : C.b);
              }
            } else {
              const Ln = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax);
              g.save(); g.translate(ax, ay); g.rotate(ang); poly(g, cutRect(Ln * gr, 30, seed + 80 + k), 0, -15, 0, C.a); g.restore();
            }
          }
        } else if (lay === "ring") { // 시간의 궤도: 한 칸에 호 하나, 끝에 오려 낸 화살
          for (let k = 0; k < n - 1; k++) {
            const gr = grow(at[k] + 0.32);
            if (gr <= 0) continue;
            const a0 = Math.PI + (k / (n - 1)) * Math.PI, a1 = a0 + (Math.PI / (n - 1)) * gr;
            g.save(); g.translate(RC[0], RC[1]); g.scale(RX / 300, RY / 300);
            poly(g, band(309, 291, a0, a1, seed + 560 + k), 0, 0, 0, C.a, false);
            if (gr >= 1 && k === n - 2) { const ae = a1 - 0.2, cx = Math.cos(ae) * 300, cy = Math.sin(ae) * 300, tx = -Math.sin(ae), ty = Math.cos(ae); poly(g, [[cx - ty * 38 - tx * 10, cy + tx * 38 - ty * 10], [cx + ty * 38 - tx * 10, cy - tx * 38 - ty * 10], [cx + tx * 46, cy + ty * 46]], 0, 0, 0, C.a); }
            g.restore();
          }
        } else { // 하늘길: 점선, 그 위로 물방울이 측정값을 실어 나른다
          for (let k = 0; k < n - 1; k++) {
            const [ax, ay] = pos[k], [bx, by] = pos[k + 1], gr = grow(at[k] + 0.32);
            if (gr <= 0) continue;
            const Ln = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax), dn = Math.floor(Ln / 44);
            g.save(); g.translate(ax, ay); g.rotate(ang);
            for (let j = 1; j < dn; j++) if (j / dn <= gr) poly(g, cutRect(24, 9, seed + 600 + k * 40 + j, 0.6), j * 44 - 12, -4.5, 0, P.ink, false);
            g.restore();
            const t0 = at[k + 1] + 0.5;
            if (u > t0 && gr >= 1) {
              const q = (K.step(u - t0, FPS) % 1.6) / 1.6, dx = ax + (bx - ax) * q, dy = ay + (by - ay) * q;
              if (q > 0.12 && q < 0.88) poly(g, cutDrop(17, seed + 640 + k), dx, dy - 18, 0, P.paper);
            }
          }
        }
        // ---- 물건마다 이름을 띠에 오려 밑에 붙인다 ----
        s.nodes.forEach((nm, k) => {
          const e = pop(u, at[k], 0.42, 1.8);
          if (e <= 0) return;
          const [x, y0, scl] = pos[k];
          const y = y0 + (1 - e) * -700 + boil(u, k, 0.6);
          drawNode(g, kinds[k], x, y, scl, { ...C, name: nm }, seed + 90 + k * 7 + fi * 50, u - at[k]);
          if (e < 0.7 || (kinds[k] === "chip" && chipText(nm) === nm.trim())) return;
          const ts = fit(g, nm, lay === "belt" ? (W - 260) / n - 30 : 380, 42, F, 700, 26), tw = textW(g, nm, ts) + ts;
          const lx = x - tw / 2 + (kinds[k] === "jaw" ? -30 : 0);
          let ly = lay === "belt" ? beltY + 96 : y0 + HALF[kinds[k]] * scl + 22;
          if (lay === "ring" && k > 0 && k < n - 1) ly = y0 + HALF[kinds[k]] * scl + 18;
          const st = k === n - 1 ? S2 : S1;
          strip(g, nm, Math.min(W - 60 - tw, Math.max(60, lx)), ly, ts, st[1], st[0], seed + 100 + k + fi * 9, { rot: (R(k + fi * 5, 83) - 0.5) * 0.05 });
        });
        const le = pop(u, at[Math.min(1, n - 1)] + 0.55, 0.45);
        if (le > 0) strip(g, s.line, 96 - (1 - le) * 1700, lay === "belt" ? 96 : lay === "ring" ? 806 : 790, fit(g, s.line, W - 192, 48), S1[1], S1[0], seed + 110 + fi, { rot: -0.006 });
      },
      terminal(g, s, u) {
        strip(g, "$ " + s.command, 96 - (1 - pop(u, 0, 0.4)) * 1500, 96, fit(g, "$ " + s.command, 1100, 46, T), S1[1], S1[0], seed + 120, { fam: T, rot: -0.01 });
        const outs = s.output.slice(0, 6);
        outs.forEach((o, k) => {
          const e = pop(u, 0.35 + B(k + 1) * 0.7, 0.38, 1.7);
          if (e <= 0) return;
          const fromR = k % 2 === 1, hot = /surviv|살아남/i.test(o);
          const x = 140 + (R(k, 132) - 0.5) * 24;
          const sz = fit(g, o, W - 300, hot ? 50 : 42, T, 700, 24);
          strip(g, o, x + (fromR ? 1 : -1) * (1 - e) * 1600, 228 + k * 104, sz, hot ? P.paper : P.ink, hot ? (P.hot !== P.paper ? P.hot : P.ink) : P.paper, seed + 130 + k, { fam: T, rot: (R(k, 131) - 0.5) * 0.02 });
        });
        const le = pop(u, 0.35 + B(outs.length + 2) * 0.7, 0.4);
        if (le > 0) glyphs(g, s.line, 96, 860 + (1 - le) * 200, fit(g, s.line, W - 420, 46, F, 400), P.onGround, seed + 140, { wt: 400 });
        if (s.data === "sample") strip(g, L.sampleRun, W - 96, 96, 32, S2[1], S2[0], seed + 141, { fam: T, rot: 0.04, align: "right" });
      },
      stats(g, s, u) {
        const [h0, ...rest] = s.stats;
        const mirror = motif === "drop"; // 물방울 작품: 주인공 숫자가 오른쪽에 내려앉는다
        strip(g, s.line, 96 - (1 - pop(u, 0, 0.4)) * 1600, 80, fit(g, s.line, 1300, 48), S1[1], S1[0], seed + 150, { rot: -0.01 });
        rest.slice(0, 2).forEach((st, k) => {
          const e = pop(u, B(k + 1), 0.4);
          if (e <= 0) return;
          const y = 400 + k * 250, x = mirror ? 110 : 980;
          const sz = fit(g, st.value, 420, 170);
          glyphs(g, st.value, x, y + (1 - e) * -700, sz, darkGround ? P.paper : P.ink, seed + 160 + k);
          const vw = textW(g, st.value, sz);
          glyphs(g, st.unit, x + vw + 14, y + (1 - e) * -700, 64, darkGround ? P.paper : P.ink, seed + 165 + k);
          strip(g, st.label, x, y + 22, fit(g, st.label, 520, 38), S1[1], S1[0], seed + 168 + k, { rot: 0.012 });
        });
        // 주인공은 마지막에, 가장 크게
        const he = h0 ? pop(u, B(4) + 0.2, 0.45, 2.1) : 0;
        if (h0 && he > 0) {
          const vs = fit(g, h0.value, 640, 470), us = readLen(h0.unit) > 2 ? vs * 0.2 : vs * 0.36;
          const off = (1 - he) * -1000;
          const hx = mirror ? W - 96 - textW(g, h0.value, vs) - 16 - textW(g, h0.unit, us) : 96;
          const vw = glyphs(g, h0.value, hx, 640 + off, vs, P.paper, seed + 170);
          glyphs(g, h0.unit, hx + vw + 16, 640 + off, us, P.paper, seed + 171);
          // 이름표는 숫자 밑에 — 숫자를 가리지 않게 글자 기준선 아래로 붙인다
          strip(g, h0.label, hx + 14, 668 + off * 0.3, fit(g, h0.label, 600, 48), P.ink === P.ground ? P.ground : P.paper, P.ink === P.ground ? P.paper : P.ink, seed + 172, { rot: -0.016 });
        }
        const foot = s.source ? L.source + s.source : s.data === "sample" ? L.sampleFigures : "";
        if (foot && pop(u, B(6)) > 0) strip(g, foot, W - 96, 820, 30, S2[1], S2[0], seed + 175, { fam: T, rot: 0.02, align: "right" });
      },
      items(g, s, u) {
        const items = s.items.slice(0, 6), n = items.length;
        const pct = n > 0 && items.every((x) => /%\s*$/.test(x.value));
        strip(g, s.line, 96 - (1 - pop(u, 0, 0.4)) * 1600, 80, fit(g, s.line, 1200, 50), S1[1], S1[0], seed + 180, { rot: -0.012 });
        if (pct) { // 높이만큼 자른 종이 기둥
          const base = 740, cw = n > 5 ? 170 : 196, gap = n > 1 ? (W - 192 - n * cw) / (n - 1) : 0;
          items.forEach((it, k) => {
            const v = K.clamp((parseFloat(it.value) || 0) / 100, 0.08, 1), h = v * 620;
            const grow = Math.floor(K.clamp((u - B(k) * 0.8 - 0.2) / 0.42) * 4) / 4; // 네 번 가위질로 자란다
            const e = K.ease.outBack(grow, 1.6);
            if (e <= 0) return;
            const x = 96 + k * (cw + gap), hh = h * e;
            poly(g, cutRect(cw, hh, seed + 190 + k), x, base - hh, 0, it.alarm ? P.ink : P.paper);
            glyphs(g, it.value, x + 14, base - hh + 84, fit(g, it.value, cw - 28, 78), it.alarm ? P.paper : P.ink, seed + 200 + k);
            glyphs(g, it.label, x + 4, base + 64, fit(g, it.label, cw + gap - 20, 40, F, 700, 22), P.onGround, seed + 210 + k);
          });
        } else { // 조각 콜라주
          const slots: [number, number, number, number, string?][] = [[96, 190, 470, 420], [600, 190, 330, 300], [960, 170, 300, 300, "disc"], [1290, 230, 214, 360], [600, 520, 660, 190], [96, 640, 470, 150]];
          items.forEach((it, k) => {
            const [x, y, w, h, kind] = slots[k % slots.length];
            const e = pop(u, B(k) * 0.9 + 0.1, 0.4, 1.8);
            if (e <= 0) return;
            const dy = (1 - e) * (k % 2 ? 900 : -900);
            const col = k === 0 ? P.hot : k % 2 ? P.paper : P.hot === P.paper ? P.ink : P.paper;
            const tc = K.oklch(col)[0] > 0.6 ? P.ink : P.paper;
            if (kind === "disc") poly(g, cutOval(w / 2, h / 2, seed + 220 + k), x + w / 2, y + h / 2 + dy, 0, col);
            else poly(g, cutRect(w, h, seed + 220 + k), x, y + dy, (R(k, 221) - 0.5) * 0.03, col);
            const vs = fit(g, it.value, w - 60, k === 0 ? 240 : h < 200 ? 90 : 140);
            const cx = kind === "disc" ? x + w / 2 - textW(g, it.value, vs) / 2 : x + 30;
            glyphs(g, it.value, cx, y + h * (kind === "disc" ? 0.56 : h < 200 ? 0.5 : 0.62) + dy, vs, tc, seed + 230 + k);
            const ll = wrapText(g, it.label, 34, w - (kind === "disc" ? 90 : 50)).slice(0, 3);
            ll.forEach((l, j) => glyphs(g, l, kind === "disc" ? x + w / 2 - textW(g, l, 34) / 2 : x + 30, y + h - 30 - (ll.length - 1 - j) * 38 + dy - (kind === "disc" ? 40 : 0), 34, tc, seed + 240 + k * 3 + j));
          });
        }
        // 기둥 배치면 이름표 줄(아래)과 겹치지 않게 위 오른쪽에 붙인다
        if (s.data === "sample" && pop(u, B(7)) > 0) strip(g, L.sampleReadings, W - 96, pct ? 170 : 800, 30, S2[1], S2[0], seed + 250, { fam: T, rot: 0.03, align: "right" });
      },
      alert(g, s, u) {
        if (motif === "drop") { // 창문: 네 칸 유리에 김이 차오르고 물방울이 흐른다
          const fx = 860, fy = 110, fw = 560, fh = 640;
          const e = pop(u, 0, 0.45, 1.4);
          const oy = (1 - e) * -900;
          poly(g, cutRect(fw, fh, seed + 260), fx, fy + oy, 0, P.ink);
          const pw = (fw - 60) / 2, ph = (fh - 60) / 2;
          for (let k = 0; k < 4; k++) {
            const px = fx + 20 + (k % 2) * (pw + 20), py = fy + 20 + Math.floor(k / 2) * (ph + 20) + oy;
            poly(g, cutRect(pw, ph, seed + 261 + k), px, py, 0, P.ground, false);
            const fogH = K.step(K.clamp((u - 0.8 - k * 0.15) / 2.6), 4) * ph * 0.85;
            if (fogH > 0) poly(g, cutRect(pw - 8, fogH, seed + 270 + k, 6), px + 4, py + ph - fogH - 4, 0, P.paper, false);
          }
          for (let d = 0; d < 3; d++) {
            const at = 1.6 + B(d) * 1.2, q = K.step(u - at, FPS);
            if (q > 0) poly(g, cutDrop(16, seed + 280 + d), fx + 70 + d * 170, fy + 120 + Math.min(fh - 180, q * q * 120), 0, P.ink, false);
          }
        } else { // 폰이 운다: 종이로 오린 들쭉날쭉한 울림
          const px = 980, py = 150;
          const e = pop(u, 0, 0.45, 1.4);
          drawPhone(g, px, py + (1 - e) * 900, 1.35, P.paper, P.ink, seed + 260);
          for (let w = 0; w < 3; w++) {
            const at = 0.5 + B(w + 2) * 0.8;
            if (pop(u, at) <= 0 || u > at + 1.6 + w * 0.3) continue;
            const r = 230 + w * 70;
            for (const side of [-1, 1]) {
              const pts: Pt[] = [], n = 9;
              for (let k = 0; k <= n; k++) { const a = -0.55 + (1.1 * k) / n; const rr = r + (k % 2 ? 16 : -16); pts.push([side * Math.cos(a) * rr, Math.sin(a) * rr]); }
              for (let k = n; k >= 0; k--) { const a = -0.55 + (1.1 * k) / n; const rr = r - 22 + (k % 2 ? 16 : -16); pts.push([side * Math.cos(a) * rr, Math.sin(a) * rr]); }
              poly(g, pts, px + 135, py + 270, 0, P.hot);
            }
          }
          const sy = py + (1 - e) * 900;
          strip(g, s.title, px + 40, sy + 90, fit(g, s.title, 200, 34, T), P.ink, P.hot, seed + 290, { fam: T, rot: -0.02 });
          wrapText(g, s.body, 40, 200).slice(0, 5).forEach((l, k) => glyphs(g, l, px + 40, sy + 200 + k * 46, 40, P.paper, seed + 291 + k));
        }
        const tl = pop(u, B(3) + 0.3, 0.42);
        const title = motif === "drop" ? s.title : s.line;
        if (tl > 0) strip(g, title, 96 - (1 - tl) * 1600, 200, fit(g, title, 700, 60), S1[1], S1[0], seed + 300, { rot: -0.015 });
        const sub = motif === "drop" ? [s.body, s.line + " " + s.line2] : [s.line2];
        sub.forEach((l, k) => {
          const e2 = pop(u, B(5 + k) + 0.5, 0.42);
          if (e2 > 0) strip(g, l, 96 - (1 - e2) * 1600, 330 + k * 100, fit(g, l, 720, 44), S2[1], S2[0], seed + 301 + k, { rot: k % 2 ? 0.012 : -0.008 });
        });
        if (s.data === "sample") strip(g, L.sampleAlert, 96, 780, 30, S1[1], S1[0], seed + 310, { fam: T, rot: 0.03 });
      },
      ending(g, s, u) {
        const ns = fit(g, s.name, W - 192, 230, F, 700, 60);
        // 끝 카드 세 가지: 이름 왼쪽 아래(띠) · 이름 위, 물방울 아래(물방울) · 이름 오른쪽, 폰 왼쪽(기기)
        const lay = motif === "strips" ? { nx: 96, ny: 560, l1: 600, l2: 696, al: "left" as const } : motif === "drop" ? { nx: 96, ny: 330, l1: 380, l2: 476, al: "left" as const } : { nx: W - 96 - textW(g, s.name, ns), ny: 470, l1: 520, l2: 616, al: "right" as const };
        // 상징이 한 번, 크게, 화면 끝에 잘려 돌아온다
        if (motif === "strips") {
          ([[860, 44, 70], [560, 30, 150], [1000, 52, 214], [300, 30, 300]] as [number, number, number][]).forEach(([w, h, y], k) => {
            const e = pop(u, 0.15 + B(k) * 0.5, 0.38); if (e > 0) poly(g, cutRect(w, h, seed + 340 + k), W - w + 30 + (1 - e) * (w + 60), y, 0, k === 3 ? P.ink : P.paper);
          });
        } else if (motif === "drop") {
          const e = pop(u, 0.1, 0.45, 1.6); poly(g, cutDrop(150, seed + 334), W - 300, 700 + (1 - e) * -900, 0.12, P.ink);
          poly(g, cutOval(34, 22, seed + 336), W - 352, 742 + (1 - e) * -900, -0.5, P.ground, false);
        } else {
          const e = pop(u, 0.1, 0.45, 1.6);
          g.save(); g.translate(150, 130 + (1 - e) * -900); g.rotate(-0.12); drawPhone(g, 0, 0, 1.1, P.hot, P.ink, seed + 335); g.restore();
        }
        // 낱자가 하나씩 엇박으로 떨어진다
        glyphs(g, s.name, lay.nx, lay.ny, ns, darkGround ? P.paper : P.ink, seed + 320, {
          drop: (i) => { const at = 0.35 + i * 0.07 + (K.rand(seed, i, 321) < 0.3 ? 0.05 : 0); const e = pop(u, at, 0.36, 2.2); return e <= 0 ? null : { dy: -(1 - e) * 700, dr: (1 - e) * 0.4 }; },
        });
        const e1 = pop(u, 1.1, 0.4), e2 = pop(u, 1.45, 0.4), Rt = lay.al === "right";
        if (e1 > 0) strip(g, s.line, Rt ? W - 96 + (1 - e1) * 1600 : 96 - (1 - e1) * 1600, lay.l1, fit(g, s.line, 1000, 50), S1[1], S1[0], seed + 330, { rot: -0.01, align: lay.al });
        if (e2 > 0) strip(g, s.line2, Rt ? W - 120 + (1 - e2) * 1700 : 120 + (1 - e2) * 1700, lay.l2, fit(g, s.line2, 1000, 40), S2[1], S2[0], seed + 331, { rot: 0.008, align: lay.al });
      },
    };
    const drawScene = (g: CanvasRenderingContext2D, s: FlatScene, u: number, X: Shot) => {
      (D[s.kind] as Draw<FlatScene>)(g, s, u, X);
    };

    const wipe = (g: CanvasRenderingContext2D, p: number, w: (typeof wipes)[number]) => { // p 0..1, 이미 끊긴 값
      g.save();
      if (w.kind === "disc") {
        const r = Math.sin(p * Math.PI) * 1100;
        if (r > 2) poly(g, cutOval(r, r, seed + 400), W / 2 + (p - 0.5) * 300 * w.dir, H / 2, 0, w.col);
      } else {
        const rot = w.kind === "slant" ? -0.35 * w.dir : 0;
        const bw = w.kind === "slant" ? 2600 : 1820, x = K.lerp(-bw - 400, W + 400, p);
        g.translate(W / 2, H / 2); g.rotate(rot); g.translate(-W / 2, -H / 2);
        poly(g, cutRect(bw, H * 2.2, seed + 401), w.dir > 0 ? x : W - x - bw, -H * 0.6, 0, w.col);
      }
      g.restore();
    };

    return {
      duration,
      starts: shots.map((x) => x.at),
      render(g, t) {
        let i = 0;
        for (let k = 0; k < shots.length; k++) if (t >= shots[k].at) i = k;
        const X = shots[i];
        let u = t - X.at - X.lead;
        if (i === 0) u += 0.9; // 움직이는 중에 연다: 첫 장부터 훅이 이미 화면에 있다
        g.fillStyle = P.ground; g.fillRect(0, 0, W, H);
        // 넘김은 컷을 걸친다: 끝 0.45초 동안 덮고, 컷을 넘어 잠깐 머물고, 걷힌다
        const toEnd = X.at + X.dur - t;
        drawScene(g, X.s, u, X);
        if (i < shots.length - 1 && toEnd < WIPE / 2) wipe(g, wipeP(K.step(0.5 - toEnd / WIPE, FPS)), wipes[i]);
        if (i > 0 && t - X.at < WIPE / 2) wipe(g, wipeP(K.step(0.5 + (t - X.at) / WIPE, FPS)), wipes[i - 1]);
        if (i === shots.length - 1) {
          const hp = K.seg(t, duration - 2.4, 2.4);
          if (hp > 0) K.handoff(g, hp, { ink: darkGround ? P.paper : P.ink, family: F, size: 34, x: 96, y: H - 70, handle: work.handle });
        }
        K.grain(g, t, 0.06, seed, FPS, "overlay");
      },
    };
  },
};
