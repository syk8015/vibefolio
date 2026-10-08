// 제도 도면 — 작품 하나를 물건 한 점(기계·기기·집)으로 보고 한 장의 도면에 그려 나간다(필름 실험실 G23 v2, 2026-10-08).
// 세계의 규칙: 도면은 한 장, 물건도 하나. 장면마다 부품·투상도·주기가 하나씩 붙고, 치수는 작품의 진짜 숫자다.
//   기계(터미널 장면이 있는 작품, 연필·필름): 기록을 받는 호퍼 → 거름망 → 남은 몫 크기로 그린 통, 버린 몫 너비의 배출구, 계기.
//   집(값 대부분이 %인 항목 장면이 있는 작품, 청사진): 평면도 — 방마다 측정점과 값, 허브까지 배선, 창 단면에 맺히는 물방울.
//   기기(그 밖, 디아조 백사진): 왼쪽 기기와 오른쪽 폰의 정면도, 그 사이 신호 경로, 타이밍도, 폰 화면 배치.
// 고르기·역할은 장면 구조와 순서로만 정한다(영어 낱말을 보지 않는다 — 한국어 이름은 다르다).
// 움직임: 감속 카메라(0.2,0,0,1) 1.0초 이동(멀수록 더 높이 뜬다) · 다음 자리의 윤곽을 먼저 긋고 상세 표시를 단 뒤 떠난다 ·
// 그린 층은 24fps로 끊는다 · 보조선 → 외형선 → 치수 → 글씨(손 속도로 왼쪽부터) · 끝에 도면 전체로 물러나 표제란을 보인다.
import type { FlatScene, Genre, GenreWork } from "./types";
import * as K from "./kit";

const SW = 3200, SH = 1800;

const LABEL = {
  en: {
    coinSlot: "COIN SLOT", sampleValue: "SAMPLE VALUE", sampleFigures: "SAMPLE FIGURES", sampleRun: "SAMPLE RUN", sampleNotif: "SAMPLE NOTIFICATION",
    sampleValues: "SAMPLE VALUES", sampleReadings: "READINGS ARE SAMPLES", sampleAlert: "SAMPLE ALERT",
    notes: "GENERAL NOTES", notMeasured: "VALUES MARKED SAMPLE ARE NOT MEASURED.", screen: "SCREEN", testRun: "TEST RUN",
    timing: "TIMING", section: "SECTION A — WINDOW", inside: "INSIDE", outside: "OUTSIDE", specs: "SPECIFICATIONS", measured: "MEASURED — SEE ",
    points: (n: number) => `${n} READINGS · 1 PER ROOM`, hours: (n: number) => `${n} H`,
    title: "TITLE", desc: "DESCRIPTION", drawnBy: "DRAWN BY", scale: "SCALE", sheet: "SHEET", asNoted: "AS NOTED", oneOfOne: "1 OF 1",
  },
  ko: {
    coinSlot: "투입구", sampleValue: "예시값", sampleFigures: "예시 수치", sampleRun: "예시 실행", sampleNotif: "예시 알림",
    sampleValues: "예시값", sampleReadings: "측정값은 예시", sampleAlert: "예시 경보",
    notes: "일반 주기", notMeasured: "‘예시’ 표시 값은 실측이 아님.", screen: "거름망", testRun: "시험 성적",
    timing: "타이밍도", section: "단면 A — 창", inside: "실내", outside: "실외", specs: "사양", measured: "실측 — 출처 ",
    points: (n: number) => `측정점 ${n}곳 · 방마다 하나`, hours: (n: number) => `${n}시간`,
    title: "도면명", desc: "설명", drawnBy: "작성", scale: "축척", sheet: "매수", asNoted: "도시한 대로", oneOfOne: "1/1",
  },
};

// ---- 한글은 넓고 읽는 데 더 든다 ----
const isWide = (c: string) => {
  const n = c.codePointAt(0) || 0;
  return (n >= 0x1100 && n <= 0x115f) || (n >= 0x2e80 && n <= 0xa4cf) || (n >= 0xac00 && n <= 0xd7a3) || (n >= 0xf900 && n <= 0xfaff) || (n >= 0xff00 && n <= 0xff60) || (n >= 0xffe0 && n <= 0xffe6);
};
const readLen = (s: string) => Array.from(s).reduce((a, c) => a + (isWide(c) ? 1.7 : 1), 0);

type Proc = { name: "pencil" | "cyan" | "diazo"; ground: string; ink: string; faint: string; mark: string; desk: string; tex: [number, number, number]; texA: number };
type Design = "machine" | "house" | "devices";

/** 물건은 장면의 짜임으로만 고른다. */
function pickDesign(work: GenreWork): Design {
  if (work.scenes.some((s) => s.kind === "terminal")) return "machine";
  const pct = (s: FlatScene) => s.kind === "items" && s.items.length >= 3 && s.items.filter((it) => /%\s*$/.test(it.value)).length / s.items.length > 0.5;
  if (work.scenes.some(pct)) return "house";
  return "devices";
}
function processFor(work: GenreWork, d: Design): Proc {
  if (d === "machine") return { name: "pencil", ground: "#e4e7e6", ink: "#2f3338", faint: "rgba(47,51,56,0.3)", mark: work.accent ? K.mix(work.accent, "#000000", 0.2) : "#b8352b", desk: "#3a3e42", tex: [40, 44, 48], texA: 20 };
  if (d === "house") return { name: "cyan", ground: "#173c6e", ink: "#eef3f8", faint: "rgba(238,243,248,0.32)", mark: work.accent ? K.mix(work.accent, "#ffffff", 0.12) : "#ffb347", desk: "#10151b", tex: [255, 255, 255], texA: 16 };
  return { name: "diazo", ground: "#eef0f5", ink: "#2c3488", faint: "rgba(44,52,136,0.28)", mark: work.accent ? K.mix(work.accent, "#000000", 0.14) : "#c0362c", desk: "#2a2c33", tex: [44, 52, 136], texA: 12 };
}

const arcPts = (cx: number, cy: number, r: number, a0: number, a1: number, n = 24, ry = r) => {
  const p: number[] = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; p.push(cx + Math.cos(a) * r, cy + Math.sin(a) * ry); }
  return p;
};
const rrPts = (x: number, y: number, w: number, h: number, r: number) => [
  ...arcPts(x + r, y + r, r, Math.PI, Math.PI * 1.5, 6), ...arcPts(x + w - r, y + r, r, -Math.PI / 2, 0, 6),
  ...arcPts(x + w - r, y + h - r, r, 0, Math.PI / 2, 6), ...arcPts(x + r, y + h - r, r, Math.PI / 2, Math.PI, 6), x, y + r,
];

type View = { x: number; y: number; w: number };
type El = {
  kind: string; t0: number; d?: number; T?: number; pre?: boolean; faint?: boolean; mark?: boolean;
  pts?: number[]; w?: number; dash?: number[]; cap?: CanvasLineCap;
  str?: string; x?: number; y?: number; size?: number; align?: CanvasTextAlign; mono?: boolean; bg?: boolean; fit?: number;
  a?: number[]; b?: number[]; m?: number[]; label?: string; vertical?: boolean; num?: string; r?: number; unit?: string;
  ux?: number; uy?: number; len?: number; letter?: string; cx?: number; cy?: number; to?: number; a0?: number; a1?: number;
  x0?: number; x1?: number; y0?: number; y1?: number; h?: number; name?: string; lines?: string[]; lock?: number;
};
type Shot = { view: View; els: El[]; imp: number; co?: [number, number]; sc: FlatScene; draw: number; read: number; at: number; arrive: number; drawAt: number; end: number };
type LOpt = { faint?: boolean; mark?: boolean; dash?: number[]; cap?: CanvasLineCap; pre?: boolean };
type TOpt = { w?: number; align?: CanvasTextAlign; mark?: boolean; mono?: boolean; faint?: boolean; bg?: boolean; pre?: boolean; fit?: number };

export const blueprint: Genre = {
  id: "blueprint",
  name: "Technical drawing",
  ko: "제도 도면",
  koIdea: "작품 하나를 기계·기기·집 한 채로 보고 한 장의 도면에 그려 나간다 — 장면마다 부품이 하나씩 붙고 치수는 진짜 숫자",
  enIdea: "The work drawn as one object — a machine, a pair of devices or a house — on a single drafting sheet, a part per scene, dimensioned with its real numbers",
  family: "B",
  fonts: ["b612", "b612Mono"],
  make(work, { seed, fonts }) {
    const FONT = fonts.b612, MONO = fonts.b612Mono;
    const T = LABEL[work.locale];
    const ko = work.locale === "ko";
    const up = (s: string) => (ko ? s : s.toUpperCase());
    const design = pickDesign(work);
    const P = processFor(work, design);
    const scenes = work.scenes;
    const meas = document.createElement("canvas").getContext("2d")!;
    const tw = (str: string, size: number, w = 400, f = FONT) => { meas.font = K.font(size, f, w); return meas.measureText(str).width; };
    /** 띄어쓰기로 끊고, 한 낱말이 너무 길면 글자 단위로 끊는다(한국어 긴 낱말·경로 이름). */
    const wrapT = (str: string, size: number, w: number, maxW: number, f = FONT) => {
      meas.font = K.font(size, f, w);
      const out: string[] = [];
      let cur = "";
      for (const word of String(str).split(/\s+/).filter(Boolean)) {
        const next = cur ? cur + " " + word : word;
        if (meas.measureText(next).width <= maxW) { cur = next; continue; }
        if (cur) out.push(cur);
        if (meas.measureText(word).width <= maxW) { cur = word; continue; }
        cur = "";
        for (const ch of Array.from(word)) { if (meas.measureText(cur + ch).width > maxW && cur) { out.push(cur); cur = ch; } else cur += ch; }
      }
      if (cur) out.push(cur);
      return out;
    };

    // ---------------- 도면에 놓을 것: 장면마다 한 컷, 절대 도면 좌표 ----------------
    const shots: Shot[] = [];
    let E: El[] = [];
    const shot = (view: View, imp = 1, co?: [number, number]) => { E = []; shots.push({ view, els: E, imp, co } as Shot); };
    const line = (pts: number[], w: number, t0: number, d: number, o: LOpt = {}) => { E.push({ kind: "line", pts, w, t0, d, ...o }); };
    const rect = (x: number, y: number, w: number, h: number, wt: number, t0: number, d = 0.6, o: LOpt = {}) => line([x, y, x + w, y, x + w, y + h, x, y + h, x, y], wt, t0, d, o);
    const cons = (x0: number, y0: number, x1: number, y1: number, t0: number, e = 40) => { const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1; line([x0 - (dx / L) * e, y0 - (dy / L) * e, x1 + (dx / L) * e, y1 + (dy / L) * e], 1, t0, 0.4, { faint: true }); };
    const text = (str: string, x: number, y: number, size: number, t0: number, o: TOpt = {}) => { if (str) E.push({ kind: "text", str: String(str), x, y, size, t0, w: o.w || 400, align: o.align || "left", mark: o.mark, mono: o.mono, faint: o.faint, bg: o.bg, pre: o.pre, fit: o.fit }); };
    const para = (str: string, x: number, y: number, size: number, maxW: number, lh: number, t0: number, o: TOpt = {}) => {
      const ls = wrapT(str, size, o.w || 400, maxW, o.mono ? MONO : FONT);
      ls.forEach((l, i) => text(l, x, y + i * lh, size, t0 + i * 0.32, o));
      return ls.length;
    };
    const hatch = (x: number, y: number, w: number, h: number, t0: number, sp = 16, o: { mark?: boolean } = {}) => {
      let i = 0;
      for (let u = -h + sp / 2; u < w; u += sp, i++) {
        let sx = x + u, sy = y + h, ex = x + u + h, ey = y;
        if (sx < x) { sy -= x - sx; sx = x; }
        if (ex > x + w) { ey += ex - (x + w); ex = x + w; }
        if (ex > sx) line([sx, sy, ex, ey], 1.1, t0 + i * 0.008, 0.22, { mark: o.mark });
      }
    };
    const dim = (x0: number, y0: number, x1: number, y1: number, off: number, label: string, t0: number, o: { size?: number; bg?: boolean; mark?: boolean } = {}) => {
      const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      const a = [x0 + nx * off, y0 + ny * off], b = [x1 + nx * off, y1 + ny * off];
      const sg = Math.sign(off) || 0;
      if (sg) {
        line([x0 + nx * 8 * sg, y0 + ny * 8 * sg, a[0] + nx * 16 * sg, a[1] + ny * 16 * sg], 1.1, t0, 0.3);
        line([x1 + nx * 8 * sg, y1 + ny * 8 * sg, b[0] + nx * 16 * sg, b[1] + ny * 16 * sg], 1.1, t0 + 0.06, 0.3);
      }
      E.push({ kind: "dim", a, b, m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], t0: t0 + 0.2, d: 0.6, label, size: o.size || 32, w: 700, vertical: Math.abs(dy) > Math.abs(dx), mark: o.mark, bg: o.bg });
    };
    const balloon = (x: number, y: number, num: string, bx: number, by: number, t0: number, label?: string, o: { lx?: number; ly?: number; align?: CanvasTextAlign; size?: number; fit?: number } = {}) => {
      const L = Math.hypot(x - bx, y - by) || 1;
      line([x, y, bx + (x - bx) * (30 / L), by + (y - by) * (30 / L)], 1.2, t0, 0.3);
      E.push({ kind: "dot", x, y, t0 });
      E.push({ kind: "balloon", x: bx, y: by, num, t0: t0 + 0.25 });
      if (label) text(label, o.lx ?? bx + 46, o.ly ?? by + 11, o.size || 30, t0 + 0.4, { w: 700, align: o.align, fit: o.fit });
    };
    const cloud = (x: number, y: number, w: number, h: number, t0: number) => {
      const pts: number[] = []; const per = 2 * (w + h), nS = Math.max(8, Math.round(per / 44));
      const at = (u: number): [number, number] => { u = ((u % per) + per) % per; if (u < w) return [x + u, y]; u -= w; if (u < h) return [x + w, y + u]; u -= h; if (u < w) return [x + w - u, y + h]; u -= w; return [x, y + h - u]; };
      for (let i = 0; i < nS; i++) {
        const [ax, ay] = at((i / nS) * per), [bx, by] = at(((i + 1) / nS) * per);
        const mx = (ax + bx) / 2, my = (ay + by) / 2, r = Math.hypot(bx - ax, by - ay) / 2, base = Math.atan2(by - ay, bx - ax);
        for (let j = 0; j <= 6; j++) { const q = base + Math.PI + (j / 6) * Math.PI; pts.push(mx + Math.cos(q) * r, my + Math.sin(q) * r); }
      }
      line(pts, 2.6, t0, 1.0, { mark: true });
    };
    const circle = (cx: number, cy: number, r: number, w: number, t0: number, d = 0.5, o: LOpt = {}) => line(arcPts(cx, cy, r, -Math.PI / 2, Math.PI * 1.5, Math.max(16, Math.round(r / 3))), w, t0, d, o);
    const tag = (x: number, y: number, str: string, size: number, t0: number, o: { mark?: boolean; maxW?: number } = {}) => {
      const s = o.maxW ? Math.min(size, K.fitSize(meas, str, FONT, 700, o.maxW / 1.35, size, 20)) : size;
      E.push({ kind: "tag", x, y, str, size: s, t0, mark: o.mark });
    };
    const note = (str: string, x: number, y: number, t0: number, o: { size?: number; align?: CanvasTextAlign; mark?: boolean } = {}) => text(str, x, y, o.size || 22, t0, { w: 700, align: o.align, mark: o.mark });
    const arrowLine = (pts: number[], w: number, t0: number, d: number) => { E.push({ kind: "arrow", pts, w, t0, d }); };
    const TB = { x: 2280, y: 1310, w: 800, h: 390 };
    const titleblock = (name: string, lines: string[]) => { E.push({ kind: "titleblock", ...TB, t0: 0, name, lines }); };
    // 도면 배치: 제도사가 먼저 잡아 두는 옅은 틀(표제란, 앞으로 올 그림 자리)
    const layout = (rs: number[][]) => { rect(TB.x, TB.y, TB.w, TB.h, 1, 0.3, 0.8, { faint: true }); rs.forEach(([x, y, w, h], i) => (h ? rect(x, y, w, h, 1, 0.4 + i * 0.1, 0.7, { faint: true }) : line([x, y, x + w, y], 1, 0.4 + i * 0.1, 0.6, { faint: true }))); };
    const sampleAny = scenes.some((s) => s.data === "sample");
    const first = <K2 extends FlatScene["kind"]>(k: K2) => scenes.find((s) => s.kind === k) as Extract<FlatScene, { kind: K2 }> | undefined;
    const done = new Set<string>();
    const part = (name: string, fn: () => void) => { if (!done.has(name)) { done.add(name); fn(); } };
    const fmt = (n: number) => n.toLocaleString("en-US");

    // ---- 갈 곳 없는 장면은 일반 주기 칸에 번호를 달아 적는다 ----
    type NotesBox = { x: number; y: number; w: number; maxY: number; head: boolean; n: number; view: View; co?: [number, number] };
    const sceneText = (s: FlatScene): [string, string] => {
      switch (s.kind) {
        case "hook": return [`${s.value} — ${s.label}`, s.line];
        case "story": return [s.line, s.line2];
        case "alert": return [`${s.title}: ${s.body}`, [s.line, s.line2].filter(Boolean).join(" ")];
        case "items": return [s.items.map((it) => `${it.label} ${it.value}`).join(" · "), s.line];
        case "stats": return [s.stats.map((x) => `${x.value}${x.unit === "%" ? "%" : " " + x.unit} ${x.label}`).join(" · "), s.line];
        case "flow": return [s.nodes.join(" → "), s.line];
        case "terminal": return ["$ " + s.command, s.line];
        case "ending": return [s.name, [s.line, s.line2].filter(Boolean).join(" ")];
      }
    };
    const noteScene = (nb: NotesBox, s: FlatScene, size = 40) => {
      shot(nb.view, 0.9, nb.co);
      if (!nb.head) { nb.head = true; text(T.notes, nb.x, nb.y, 34, 0.0, { w: 700, pre: true }); line([nb.x, nb.y + 20, nb.x + nb.w, nb.y + 20], 1.4, 0.1, 0.5, { pre: true }); nb.y += 95; }
      const [a, b] = sceneText(s);
      nb.n += 1;
      const lh = size * 1.3, room = Math.max(1, Math.floor((nb.maxY - nb.y) / lh));
      text(`${nb.n}.`, nb.x, nb.y, size, 0.3, { w: 700 });
      const la = wrapT(a, size, 700, nb.w - 70).slice(0, Math.max(1, room - 1));
      la.forEach((l, i) => text(l, nb.x + 70, nb.y + i * lh, size, 0.3 + i * 0.3, { w: 700, mark: s.kind === "alert" }));
      nb.y += la.length * lh;
      const lb = b ? wrapT(b, size * 0.8, 400, nb.w - 70).slice(0, Math.max(0, Math.floor((nb.maxY - nb.y) / (lh * 0.8)))) : [];
      lb.forEach((l, i) => text(l, nb.x + 70, nb.y + i * lh * 0.8, size * 0.8, 0.9 + i * 0.3));
      nb.y += lb.length * lh * 0.8 + 26;
      if (s.data === "sample") note(T.sampleValue, nb.x + nb.w, nb.y - 26, 1.0, { align: "right" });
    };

    // ================= 기계: 거름 장치 단면 =================
    function machine() {
      const term = first("terminal"), st = first("stats");
      const outs = term ? term.output : [];
      const pctOf = (s: string) => { const m = s.match(/(\d+(?:\.\d+)?)\s*%/); return m ? +m[1] : null; };
      const numsOf = (s: string) => (s.replace(/\(?\d+(?:\.\d+)?\s*%\)?/g, "").match(/\d[\d,]*(?:\.\d+)?/g) || []).map((x) => +x.replace(/,/g, ""));
      const pctLines = outs.filter((o) => pctOf(o) !== null);
      // 첫 % 줄 = 남은 몫, 그 뒤 % 줄 = 버린 몫(배출구), 남은 몫보다 큰 수 = 들어온 전부
      const statPct = st?.stats.find((x) => x.unit === "%" && isFinite(+x.value));
      const keptPct = pctLines[0] ? pctOf(pctLines[0])! : statPct ? +statPct.value : null;
      const keptN = pctLines[0] ? numsOf(pctLines[0])[0] ?? null : null;
      const bigger = outs.flatMap(numsOf).filter((n) => keptN !== null && n > keptN).sort((a, b) => b - a);
      const written = bigger[0] ?? null;
      const wastes = pctLines.slice(1, 3).map((o) => ({ pct: pctOf(o)!, label: o.replace(/:.*$/, "").split(" - ").pop()!.trim() }));
      const HX0 = 930, HX1 = 1570, HW = HX1 - HX0, HY = 300, TX0 = 1180, TX1 = 1320, TY = 520;
      const CX0 = 980, CX1 = 1520, CY0 = 580, CY1 = 960, BY0 = 1040, BY1 = 1330;
      const bw = (HW * K.clamp((keptPct ?? 60) / 100, 0.08, 1)), BX0 = 1250 - bw / 2, BX1 = 1250 + bw / 2;
      let cy = 806;
      const ch = wastes.map((w) => { const h = K.clamp((HW * w.pct) / 100, 14, 110); const c = { ...w, h, y0: cy, y1: cy + h }; cy += h + 16; return c; }).filter((c) => c.y1 < CY1 - 4);
      const G = { x: 790, y: 860, r: 82 };
      const gAng = (f: number) => Math.PI * 0.75 + K.clamp(f) * Math.PI * 1.5;
      const notes: NotesBox = { x: 2160, y: 250, w: 920, maxY: 760, head: false, n: 0, view: { x: 2010, y: 590, w: 2100 }, co: [2110, 730] };
      const hopper = () => {
        cons(HX0, HY, HX1, HY, 0); cons(HX0, HY, TX0, TY, 0.05); cons(HX1, HY, TX1, TY, 0.08);
        line([HX0, HY, TX0, TY, TX0, CY0], 4, 0.15, 0.7); line([HX1, HY, TX1, TY, TX1, CY0], 4, 0.22, 0.7);
        line([HX0 - 34, HY, HX1 + 34, HY], 2, 0.5, 0.4);
        rect(CX0, CY0, CX1 - CX0, CY1 - CY0, 1, 0.6, 0.6, { faint: true }); rect(BX0, BY0, bw, BY1 - BY0, 1, 0.75, 0.6, { faint: true });
        cons(CX1, CY0, CX1, BY1, 0.7); cons(BX0, CY1, BX0, BY1, 0.8); cons(CX0 - 40, G.y, CX1 + 280, G.y, 0.85);
        circle(G.x, G.y, G.r, 1, 0.9, 0.5, { faint: true });
        layout([[2160, 820, 920, 344], [2160, 270, 920, 0]]);
        // 들어오는 기록: 호퍼 안의 글줄
        for (let r = 0; r < 7; r++) {
          const y = HY + 30 + r * 27, f = (y - HY) / (TY - HY), x0 = K.lerp(HX0, TX0, f) + 26, x1 = K.lerp(HX1, TX1, f) - 26;
          let x = x0, j = 0;
          while (x < x1 - 20) { const L = Math.min(x1 - x, 30 + K.rand(seed, r, j) * 90); line([x, y, x + L, y], 2, 0.8 + r * 0.05 + j * 0.02, 0.18, { faint: true }); x += L + 14; j++; }
        }
      };
      const chamber = (pre: boolean) => {
        rect(CX0, CY0, CX1 - CX0, CY1 - CY0, 4, 0.0, 0.8, { pre });
        line([1000, 650, 1500, 790], 3, 0.6, 0.5);
        for (let i = 0; i < 16; i++) { const f = (i + 0.5) / 16, xx = K.lerp(1000, 1500, f), yy = K.lerp(650, 790, f); line([xx, yy + 6, xx, yy + 16], 1.2, 0.8 + i * 0.02, 0.12); }
        note(T.screen, 1010, 628, 1.2);
      };
      const lower = () => {
        line([TX0, CY1, TX0, BY0], 3, 0.5, 0.3); line([TX1, CY1, TX1, BY0], 3, 0.52, 0.3);
        rect(BX0, BY0, bw, BY1 - BY0, 4, 0.6, 0.7);
        ch.forEach((c, i) => { line([CX1, c.y0, 1760, c.y0], 2.6, 0.7 + i * 0.1, 0.4); line([CX1, c.y1, 1760, c.y1], 2.6, 0.72 + i * 0.1, 0.4); line([1760, c.y0 - 8, 1760, c.y1 + 8], 1.2, 0.95 + i * 0.1, 0.2); });
        line([G.x + G.r, G.y - 8, CX0, G.y - 8], 2.4, 0.8, 0.3); line([G.x + G.r, G.y + 8, CX0, G.y + 8], 2.4, 0.82, 0.3);
        circle(G.x, G.y, G.r, 3, 0.85, 0.5);
        for (let i = 0; i <= 10; i++) { const a = gAng(i / 10); line([G.x + Math.cos(a) * (G.r - 16), G.y + Math.sin(a) * (G.r - 16), G.x + Math.cos(a) * (G.r - 4), G.y + Math.sin(a) * (G.r - 4)], i % 5 ? 1.1 : 2, 1.1 + i * 0.01, 0.1); }
        if (keptPct !== null) E.push({ kind: "needle", cx: G.x, cy: G.y, r: G.r - 22, to: keptPct / 100, t0: 1.3 });
      };
      return {
        parts: { hopper, chamber: () => chamber(false), lower },
        notes,
        hook(s: Extract<FlatScene, { kind: "hook" }>) {
          shot({ x: 820, y: 520, w: 1400 }, 1.25, [1600, 500]);
          part("hopper", hopper);
          rect(300, 300, 520, 200, 3.2, 0.1, 0.7); rect(318, 318, 484, 164, 1.3, 0.4, 0.5);
          for (const [hx, hy] of [[338, 338], [782, 338], [338, 462], [782, 462]]) circle(hx, hy, 9, 1.6, 0.55, 0.25);
          text(s.value, 560, 456, 150, 0.45, { w: 700, align: "center", mark: !!s.alarm, fit: 440 });
          arrowLine([822, 360, 900, 360, 958, 322], 2.2, 0.9, 0.4);
          note(T.coinSlot, 838, 394, 1.0);
          text(up(s.label || ""), 300, 590, 30, 0.9, { w: 700, fit: 620 });
          para(s.line || "", 300, 646, 40, 600, 52, 1.2);
          if (s.data === "sample") note(T.sampleValue, 820, 540, 1.1, { align: "right" });
        },
        story(s: Extract<FlatScene, { kind: "story" }>) {
          shot(notes.view, 0.9, notes.co);
          const x = notes.x;
          notes.head = true;
          text(T.notes, x, 250, 34, 0.05, { w: 700, pre: true });
          line([x, 270, 3080, 270], 1.4, 0.15, 0.5, { pre: true });
          let y = 345;
          [s.line, s.line2].filter(Boolean).forEach((str, i) => {
            notes.n++;
            text(`${notes.n}.`, x, y, 46, i ? 1.1 : 0.4, { w: 700, pre: !i });
            y += 64 * para(up(str), x + 70, y, 46, 760, 60, i ? 1.1 : 0.4, { w: i ? 400 : 700, pre: !i }) + 22;
          });
          // 이야기가 곧 거름망: 많이 들어와도 조금만 남는다 — 방과 거름망을 지금 먹선으로 긋는다
          part("chamber", () => chamber(true));
          if (sampleAny) { notes.n++; text(`${notes.n}.`, x, y, 28, 1.7, { w: 700 }); text(T.notMeasured, x + 70, y, 28, 1.7, { fit: 840 }); y += 50; }
          notes.y = y + 20;
        },
        flow(s: Extract<FlatScene, { kind: "flow" }>) {
          shot({ x: 1120, y: 810, w: 2300 }, 1.0, [1880, 720]);
          part("chamber", () => chamber(false));
          part("lower", lower);
          // 부품마다 작품이 붙인 이름(순서대로: 호퍼 · 거름망 · 배출구 · 계기 · 통)
          const parts: number[][] = [[HX1 - 60, HY + 40, 1690, 220], [1330, 728, 1690, 600], [1760, (ch[0]?.y0 ?? 860) + 6, 1700, 1080], [G.x - 50, G.y + 60, 590, 1040], [BX0 + 30, BY0 + 60, 640, 1240]];
          s.nodes.slice(0, 5).forEach((nm, i) => {
            const [px, py, bx, by] = parts[i];
            balloon(px, py, String(i + 1), bx, by, 1.15 + [0, 0.22, 0.38, 0.5, 0.6][i], up(nm), i === 3 ? { lx: bx, ly: by + 72, align: "center", fit: 340 } : i === 4 ? { fit: 330 } : { fit: 400 });
          });
          // 경계: 이 안의 것은 밖으로 나가지 않는다
          E.push({ kind: "phantom", pts: [240, 170, 2000, 170, 2000, 1430, 240, 1430, 240, 170], t0: 1.7, d: 1.1 });
          text(s.line || "", 270, 1392, 34, 2.4, { w: 700, fit: 1700 });
        },
        terminal(s: Extract<FlatScene, { kind: "terminal" }>) {
          shot({ x: 2620, y: 1000, w: 1250 }, 1.15, [2100, 1290]);
          const out = s.output.slice(0, 7);
          const x = 2160, w = 920, y = 820, rh = out.length > 5 ? 40 : 52, h = 84 + out.length * rh, fs = out.length > 5 ? 24 : 28;
          text(T.testRun, x, y - 16, 28, 0.0, { w: 700 });
          if (s.data === "sample") note(T.sampleRun, x + w, y - 16, 0.1, { align: "right" });
          rect(x, y, w, h, 3, 0.1, 0.6, { pre: true });
          line([x, y + 84, x + w, y + 84], 2, 0.35, 0.4, { pre: true });
          text("$ " + s.command, x + 24, y + 54, 28, 0.55, { mono: true, w: 700, fit: w - 48 });
          out.forEach((o, i) => {
            const yy = y + 84 + (i + 1) * rh - rh * 0.34, m = o.match(/^(.*?):\s*(.*)$/);
            if (i) line([x, y + 84 + i * rh, x + w, y + 84 + i * rh], 1, 0.5 + i * 0.05, 0.3);
            const t0 = 0.75 + [0, 0.2, 0.42, 0.7, 0.86, 1, 1.1][i % 7];
            const isKept = pctLines[0] === o;
            text(m ? m[1] : o, x + 24, yy, fs, t0, { mono: true, w: isKept ? 700 : 400, fit: m ? w * 0.6 : w - 48 });
            if (m) text(m[2], x + w - 24, yy, fs, t0 + 0.1, { mono: true, w: 700, align: "right", fit: w * 0.34 });
            const ref = isKept ? "2" : pctLines.includes(o) ? "3" : written !== null && numsOf(o).includes(written) ? "1" : "";
            if (ref) E.push({ kind: "balloon", x: x - 34, y: yy - 9, num: ref, t0: t0 + 0.3, r: 20 });
          });
          para(s.line || "", x, y + h + 62, 38, w, 50, 1.5, { w: 700 });
        },
        stats(s: Extract<FlatScene, { kind: "stats" }>) {
          shot({ x: 1250, y: 765, w: 2000 }, 1.2, [1850, 1300]);
          part("chamber", () => chamber(false));
          part("lower", lower);
          const sts = s.stats;
          if (written !== null) dim(HX0, HY, HX1, HY, -64, `${fmt(written)} · 100%`, 0.0, { size: 32 });
          hatch(BX0 + 3, BY0 + 3, bw - 6, BY1 - BY0 - 6, 0.5, 18);
          if (keptPct !== null) dim(BX0, 1150, BX1, 1150, 0, keptN !== null ? `${fmt(keptN)} · ${keptPct}%` : `${keptPct}%`, 0.9, { size: 32, bg: true });
          if (sts[0]) text(up(sts[0].label), 1250, 1262, 28, 1.3, { w: 700, align: "center", bg: true, fit: Math.max(200, bw + 40) });
          ch.forEach((c, i) => {
            hatch(CX1 + 4, c.y0 + 2, 1760 - CX1 - 8, c.h - 4, 0.6 + i * 0.15, 12, { mark: true });
            text(`${c.pct}%  ${up(c.label)}`, 1790, (c.y0 + c.y1) / 2 + 9, 24, 1.1 + i * 0.25, { w: 700, mark: i === 1, fit: 340 });
          });
          // 계기: 맨 끝 % 수치를 눈금판의 부채꼴로
          const lim = sts.length > 1 && sts[sts.length - 1].unit === "%" ? sts[sts.length - 1] : null;
          if (lim) {
            E.push({ kind: "sector", cx: G.x, cy: G.y, r: G.r - 6, a0: gAng(0), a1: gAng(+lim.value / 100), t0: 1.4 });
            text(`${lim.value}% ${up(lim.label)}`, G.x, G.y + G.r + 46, 24, 1.6, { w: 700, align: "center", mark: true, fit: 380 });
          }
          para(s.line || "", 290, 1238, 38, 640, 50, 1.9);
          if (s.data === "sample") note(T.sampleFigures, BX1 + 24, BY1 - 10, 1.4);
        },
      };
    }

    // ================= 기기: 왼쪽 기기와 폰 =================
    function devices() {
      const MX0 = 220, MX1 = 1100, MY0 = 330, MY1 = 840;
      const PX0 = 2160, PX1 = 2700, PY0 = 200, PY1 = 1240, SX0 = 2190, SX1 = 2670, SY0 = 290;
      let flowN = 0, rightY = 560;
      const notes: NotesBox = { x: 1250, y: 960, w: 820, maxY: 1150, head: false, n: 0, view: { x: 1660, y: 900, w: 1700 }, co: [1300, 1180] };
      const mac = () => {
        cons(MX0, MY1, MX1, MY1, 0); cons(MX0, MY0, MX0, MY1, 0.05);
        rect(MX0, MY0, MX1 - MX0, MY1 - MY0, 3.6, 0.1, 0.8);
        rect(MX0 + 28, MY0 + 28, MX1 - MX0 - 56, MY1 - MY0 - 70, 1.4, 0.4, 0.6);
        circle(660, MY0 + 14, 4, 1.4, 0.5, 0.1);
        line([160, MY1, 1160, MY1, 1130, 884, 190, 884, 160, MY1], 3, 0.45, 0.6);
        line([600, MY1, 600, 852, 720, 852, 720, MY1], 1.4, 0.8, 0.2);
        // 화면 속: 글줄로만(내용을 지어내지 않는다) — 마지막 줄에서 커서가 깜빡인다
        for (let r = 0; r < 6; r++) {
          let x = MX0 + 64, j = 0;
          const end = MX0 + 64 + 200 + K.rand(seed, r, 77) * 520;
          while (x < end) { const L = Math.min(end - x, 24 + K.rand(seed, r, j) * 110); line([x, 420 + r * 50, x + L, 420 + r * 50], 3, 0.6 + r * 0.12 + j * 0.02, 0.15, { faint: r > 0 }); x += L + 16; j++; }
        }
        E.push({ kind: "cursor", x: MX0 + 64, y: 420 + 6 * 50 + 10, t0: 1.3 });
        layout([[PX0, PY0, PX1 - PX0, PY1 - PY0], [470, 1560, 1520, 0]]);
        cons(MX1, 560, PX0, 560, 0.6, 0);
      };
      const phone = () => {
        line(rrPts(PX0, PY0, PX1 - PX0, PY1 - PY0, 70), 3.6, 0, 0.9);
        rect(SX0, SY0, SX1 - SX0, 860, 1.6, 0.4, 0.6);
        line([2380, 248, 2480, 248], 5, 0.7, 0.2);
        circle(2430, 1196, 22, 1.6, 0.8, 0.3);
      };
      const rightPara = (str: string, size: number, t0: number, w = 400) => { if (!str) return; const n = para(str, PX1 + 70, rightY, size, 330, size * 1.33, t0, { w }); rightY += n * size * 1.33 + 24; };
      return {
        parts: { mac, phone },
        notes,
        story(s: Extract<FlatScene, { kind: "story" }>) {
          shot({ x: 680, y: 700, w: 1500 }, 1.1, [1200, 690]);
          part("mac", mac);
          let y = 962;
          y += 52 * para("1.  " + up(s.line || ""), 160, y, 38, 960, 52, 0.2, { w: 700 });
          if (s.line2) para("2.  " + up(s.line2), 160, y + 14, 38, 960, 52, 0.9, { w: 700, mark: true });
        },
        flow(s: Extract<FlatScene, { kind: "flow" }>) {
          const n = s.nodes;
          if (flowN === 0) {
            flowN++;
            shot({ x: 1640, y: 620, w: 1900 }, 1, [2090, 690]);
            part("mac", mac);
            part("phone", phone);
            // 신호 경로: 처음 마디 = 왼쪽 기기, 끝 마디 = 폰, 사이 마디 = 경로 위 상세 원
            E.push({ kind: "center", a: [MX1 + 10, 560], b: [PX0 - 10, 560], t0: 0.5, pre: true });
            const mids = n.slice(1, -1).slice(0, 3);
            const xs = mids.map((_, i) => K.lerp(MX1, PX0, (i + 1) / (mids.length + 1)));
            let x = MX1 + 10;
            xs.forEach((cx, i) => {
              arrowLine([x, 560, cx - 130, 560], 2.4, 0.7 + i * 0.3, 0.5);
              circle(cx, 560, 120, 1.4, 0.85, 0.6, { faint: true, pre: true });
              // 마디 기호: 접속함(네모 + X) — 중립 제도 기호
              rect(cx - 46, 516, 92, 88, 3.4, 0.95, 0.35, { pre: true });
              line([cx - 46, 516, cx + 46, 604], 1.6, 1.1, 0.2); line([cx + 46, 516, cx - 46, 604], 1.6, 1.15, 0.2);
              x = cx + 130;
            });
            arrowLine([x, 560, PX0 - 10, 560], 2.4, 0.7 + xs.length * 0.3, 0.5);
            E.push({ kind: "packet", x0: MX1 + 20, x1: PX0 - 20, y: 560, t0: 1.6, lock: xs.length ? xs[0] : -1e9 });
            if (n.length) balloon(MX1 - 30, MY0 + 30, "1", 1180, 300, 1.2, up(n[0]), { fit: 520 });
            mids.forEach((nm, i) => balloon(xs[i], 440, String(i + 2), xs[i], 340, 1.38 + i * 0.12, up(nm), { fit: Math.min(420, (PX0 - MX1) / (mids.length + 1) - 30) }));
            if (n.length > 1) balloon(PX0 + 60, PY0 + 30, String(mids.length + 2), 2010, 150, 1.5, up(n[n.length - 1]), { lx: 1964, align: "right", fit: 560 });
            para(s.line || "", 1180, 790, 38, 900, 50, 1.6);
          } else if (flowN === 1) {
            flowN++;
            // 타이밍도: 첫 마디 = 끝나는 구간, 사이 마디 = 펄스, 끝 마디 = 새로 시작하는 구간
            shot({ x: 1110, y: 1360, w: 1800 }, 1, [2060, 1200]);
            part("mac", mac);
            const hours = (() => { const m = (n[0] || "").match(/(\d+(?:\.\d+)?)/); const v = m ? +m[1] : 0; return v >= 1 && v <= 24 ? v : 0; })();
            const x0 = 470, xR = 1990, xE = x0 + 900, hr = hours ? 900 / hours : 0;
            text(T.timing, 260, 1190, 28, 0.0, { w: 700 });
            line([x0, 1560, xR, 1560], 1.6, 0.1, 0.5, { pre: true });
            if (hours) {
              for (let i = 0; i * hr <= xR - x0 + 1; i++) { const xx = x0 + i * hr; line([xx, 1552, xx, 1568], 1.2, 0.2 + i * 0.03, 0.1); if (hours <= 12 || i % 2 === 0) text(T.hours(i), xx, 1600, 22, 0.3 + i * 0.03, { align: "center" }); }
            } else for (let i = 0; i <= 10; i++) line([x0 + i * 152, 1552, x0 + i * 152, 1568], 1.2, 0.2 + i * 0.03, 0.1);
            rect(x0, 1290, xE - x0, 50, 3, 0.3, 0.6, { pre: true }); hatch(x0 + 2, 1292, xE - x0 - 4, 46, 0.7, 16);
            if (hours) dim(x0, 1290, xE, 1290, -46, T.hours(hours), 0.9, { size: 30 });
            line([xE, 1240, xE, 1560], 2, 1.0, 0.4, { mark: true, dash: [14, 8] });
            const mids = n.slice(1, -1).slice(0, 3);
            const px = mids.map((_, i) => xE + 2 + i * 120);
            const wave: number[] = [x0, 1490];
            px.forEach((p) => wave.push(p, 1490, p, 1424, p + 18, 1424, p + 18, 1490));
            wave.push(xR, 1490);
            line(wave, 2.6, 1.15, 0.8);
            const xN = mids.length ? px[px.length - 1] + 40 : xE + 22;
            rect(xN, 1290, xR - xN, 50, 3, 1.55, 0.5, { mark: true });
            hatch(xN + 2, 1292, xR - xN - 4, 46, 1.8, 16, { mark: true });
            if (n[0]) text(up(n[0]), xE - 12, 1230, 26, 1.2, { w: 700, align: "right", mark: true, fit: 640 });
            mids.forEach((nm, i) => text(up(nm), px[i] + 36, 1438 + i * 0, 26, 1.4 + i * 0.15, { w: 700, fit: xR - px[i] - 50 }));
            if (n.length > 1) text(up(n[n.length - 1]), xN + 16, 1276, 26, 1.8, { w: 700, fit: xR - xN - 20 });
            para(s.line || "", 260, 1680, 36, 1500, 46, 2.0);
          } else noteScene(notes, s);
        },
        alert(s: Extract<FlatScene, { kind: "alert" }>) {
          shot({ x: 2470, y: 560, w: 1300 }, 1.2, [1900, 960]);
          part("phone", phone);
          line(rrPts(SX0 + 22, SY0 + 34, SX1 - SX0 - 44, 130, 22), 2.4, 0.05, 0.5, { mark: true });
          text(s.title || "", SX0 + 50, SY0 + 86, 30, 0.35, { w: 700, mark: true, fit: SX1 - SX0 - 100 });
          text(s.body || "", SX0 + 50, SY0 + 132, 26, 0.55, { mark: true, fit: SX1 - SX0 - 100 });
          cloud(SX0 - 6, SY0 + 14, SX1 - SX0 + 12, 172, 0.7);
          E.push({ kind: "delta", x: SX1 + 46, y: SY0 + 4, t0: 1.25, num: "1" });
          for (let i = 0; i < 3; i++) {
            line(arcPts(PX0 - 6, 400, 34 + i * 22, Math.PI * 0.82, Math.PI * 1.18, 10), 2.4, 1.0 + i * 0.1, 0.25, { mark: true });
            line(arcPts(PX1 + 6, 400, 34 + i * 22, -Math.PI * 0.18, Math.PI * 0.18, 10), 2.4, 1.05 + i * 0.1, 0.25, { mark: true });
          }
          if (s.data === "sample") note(T.sampleNotif, PX1 + 70, 296, 1.3);
          rightPara(s.line, 36, 1.4, 700);
          rightPara(s.line2, 36, 2.0);
        },
        items(s: Extract<FlatScene, { kind: "items" }>) {
          shot({ x: 2470, y: 812, w: 1300 }, 1.1, [2950, 1200]);
          part("phone", phone);
          const its = s.items.slice(0, 7);
          const L: number[][] = [[SX0 + 20, 494, SX1 - SX0 - 40, 200]];
          const cw = (SX1 - SX0 - 50) / 2;
          for (let i = 1; i < its.length; i++) { const c = (i - 1) % 2, r = Math.floor((i - 1) / 2); L.push([SX0 + 20 + c * (cw + 10), 710 + r * 210, cw, 196]); }
          its.forEach((it, i) => {
            const [x, y, w, h] = L[i], t0 = 0.1 + [0, 0.35, 0.55, 0.85, 1.0, 1.15, 1.25][i];
            line(rrPts(x, y, w, h, 18), 2, t0, 0.5);
            const big = i === 0;
            text(it.value === "✓" ? "OK" : it.value, x + 22, y + (big ? 112 : 104), big ? 96 : 66, t0 + 0.3, { w: 700, mark: big || it.alarm, fit: big ? w - 280 : w - 40 });
            const ls = wrapT(up(it.label), big ? 26 : 22, 700, w - 40).slice(0, 2);
            ls.forEach((l, j) => text(l, x + 22, y + h - 26 - (ls.length - 1 - j) * 26, big ? 26 : 22, t0 + 0.4, { w: 700 }));
            const f = parseFloat(it.value) / 100;
            if (big && /%\s*$/.test(it.value) && f >= 0 && f <= 1) { rect(x + w - 230, y + 60, 200, 34, 1.6, t0 + 0.4, 0.3); hatch(x + w - 228, y + 62, 196 * f, 30, t0 + 0.7, 10, { mark: true }); dim(x + w - 230, y + 94, x + w - 230 + 200 * f, y + 94, 30, it.value, t0 + 0.8, { size: 22 }); }
          });
          rightY = Math.max(rightY, 870);
          rightPara(s.line, 34, 1.6, 700);
          if (s.data === "sample") note(T.sampleValues, PX1 + 70, Math.min(1200, rightY + 10), 1.5);
        },
      };
    }

    // ================= 집: 평면도 =================
    function house() {
      const X0 = 240, X1 = 1700, Y0 = 220, Y1 = 1220, WT = 18;
      const hook = first("hook"), itemsSc = scenes.find((s) => s.kind === "items" && s.items.filter((it) => /%\s*$/.test(it.value)).length / s.items.length > 0.5) as Extract<FlatScene, { kind: "items" }> | undefined;
      const its = itemsSc ? itemsSc.items : [];
      // 자리는 순서로: 0 첫 방(왼쪽 위) · 1·2 위쪽 방 · 3 아래 큰 방 · 4 바깥 · 5 복도
      const SEN: number[][] = [[736, 520], [1180, 670], [1650, 670], [1650, 1170], [1890, 640], [700, 1170]];
      const room0 = hook ? { label: hook.label, value: hook.value, alarm: !!hook.alarm } : its[0] ? { label: its[0].label, value: its[0].value, alarm: !!its[0].alarm } : null;
      const BOARD = { x: 410, y: 980, w: 210, h: 110 };
      const RX = 1960;
      let rcY = 900;   // 오른쪽 가운데 칸(사양·주기)이 함께 쓰는 커서
      const notes: NotesBox = { x: RX, y: 960, w: 1120, maxY: 1290, head: false, n: 0, view: { x: 2585, y: 1085, w: 1250 }, co: [2150, 1360] };
      const sensor = (x: number, y: number, t0: number, o: { mark?: boolean } = {}) => { circle(x, y, 16, 2, t0, 0.25, o); line([x - 10, y, x + 10, y], 1.6, t0 + 0.2, 0.1, o); line([x, y - 10, x, y + 10], 1.6, t0 + 0.22, 0.1, o); };
      const shell = () => {
        E.push({ kind: "center", a: [X0, Y0 - 60], b: [X0, Y1 + 60], t0: 0, faint: true });
        E.push({ kind: "center", a: [X0 - 60, Y0], b: [X1 + 60, Y0], t0: 0.05, faint: true });
        const ext = [[X0, Y0, 380, Y0], [560, Y0, 900, Y0], [1080, Y0, 1380, Y0], [1560, Y0, X1, Y0], [X1, Y0, X1, Y1], [X1, Y1, 1400, Y1], [1100, Y1, X0, Y1], [X0, Y1, X0, 1100], [X0, 1000, X0, Y0]];
        ext.forEach((p, i) => line(p, WT, 0.15 + i * 0.07, 0.45, { cap: "square" }));
        for (const [a, b] of [[380, 560], [900, 1080], [1380, 1560]]) for (const dy of [-7, 0, 7]) line([a, Y0 + dy, b, Y0 + dy], dy ? 1.4 : 1, 0.8, 0.3);
        for (const dy of [-7, 0, 7]) line([1100, Y1 + dy, 1400, Y1 + dy], dy ? 1.4 : 1, 0.85, 0.3);
        line([760, Y0, 760, 680], 9, 0.5, 0.35, { cap: "square" });
        line([X0, 680, 560, 680], 9, 0.55, 0.3, { cap: "square" }); line([680, 680, 760, 680], 9, 0.58, 0.15, { cap: "square" });
        line([680, 680, 680, 800], 2, 0.9, 0.2); line(arcPts(680, 680, 120, Math.PI / 2, Math.PI, 12), 1.2, 0.95, 0.3);
        line([470, 150, 470, 300], 2.2, 1.1, 0.3, { dash: [36, 8, 6, 8] });
        E.push({ kind: "cut", x: 470, y: 128, letter: "A", t0: 1.25 });
        layout([[2130, 270, 220, 110], [2130, 720, 220, 120]]);
        for (const y of [270, 380, 720, 840]) line([1960, y, 2420, y], 1, 1.0, 0.5, { faint: true });
      };
      const interior = () => {
        line([1230, Y0, 1230, 720], 9, 0, 0.35, { cap: "square" });
        line([760, 720, 800, 720], 9, 0.09, 0.1, { cap: "square" }); line([900, 720, 1270, 720], 9, 0.09, 0.3, { cap: "square" }); line([1370, 720, X1, 720], 9, 0.18, 0.3, { cap: "square" });
        line([760, 680, 760, 900], 9, 0.27, 0.2, { cap: "square" }); line([760, 1100, 760, Y1], 9, 0.27, 0.15, { cap: "square" });
        for (const dx of [800, 1270]) { line([dx, 720, dx, 620], 2, 0.5, 0.2); line(arcPts(dx, 720, 100, -Math.PI / 2, 0, 12), 1.2, 0.55, 0.3); }
        line([X0, 1000, X0 - 90, 1000], 2, 0.5, 0.2); line(arcPts(X0, 1000, 100, Math.PI, Math.PI / 2, 12), 1.2, 0.55, 0.3);
      };
      const room0Draw = (t0: number) => {
        if (!room0) return;
        sensor(SEN[0][0], SEN[0][1], t0 + 0.3, { mark: room0.alarm });
        text(up(room0.label), 420, 300, 28, t0, { w: 700, fit: 320 });
        tag(560, 470, room0.value, 110, t0, { mark: room0.alarm, maxW: 330 });
      };
      return {
        parts: { shell, interior },
        notes,
        hook(s: Extract<FlatScene, { kind: "hook" }>) {
          shot({ x: 600, y: 500, w: 1150 }, 1.3, [1100, 600]);
          part("shell", shell);
          room0Draw(0.6);
          const nl = Math.min(2, para(s.line || "", 420, 596, 34, 320, 40, 1.2, { w: 700 }));
          if (s.data === "sample") note(T.sampleValue, 420, 596 + nl * 40 + 4, 1.4);
        },
        items(s: Extract<FlatScene, { kind: "items" }>) {
          if (s !== itemsSc) { noteScene(notes, s); return; }
          shot({ x: 1080, y: 720, w: 2000 }, 1.1, [1820, 1330]);
          part("shell", shell);
          part("interior", interior);
          if (!hook) room0Draw(0.4);
          const slots = [
            null,
            { lx: 790, ly: 290, tx: 995, ty: 500, w: 400 },
            { lx: 1260, ly: 290, tx: 1465, ty: 500, w: 400 },
            { lx: 790, ly: 800, tx: 1230, ty: 1000, w: 860 },
            { lx: 1890, ly: 720, tx: 1890, ty: 480, w: 220, center: true },
            { lx: 270, ly: 1170, tx: 560, ty: 1130, w: 400 },
          ];
          its.slice(1, 6).forEach((it, k) => {
            const i = k + 1, sl = slots[i]!, t0 = 0.6 + [0, 0, 0.3, 0.55, 0.8, 1.0][i];
            text(up(it.label), sl.lx, sl.ly, i === 4 ? 26 : 28, t0, { w: 700, align: sl.center ? "center" : "left", fit: sl.w });
            sensor(SEN[i][0], SEN[i][1], t0 + 0.1, { mark: it.alarm });
            tag(sl.tx, sl.ty, it.value, i === 4 ? 60 : 72, t0 + 0.25, { mark: it.alarm, maxW: sl.w });
          });
          para(s.line || "", 270, 768, 32, 280, 42, 1.5, { w: 700 });
          dim(X0, Y1, X1, Y1, 74, T.points(its.length), 1.7, { size: 28 });
          if (s.data === "sample") note(T.sampleReadings, X1 - 24, Y1 - 30, 1.6, { align: "right" });
        },
        flow(s: Extract<FlatScene, { kind: "flow" }>) {
          shot({ x: 960, y: 1170, w: 1900 }, 1, [1990, 880]);
          part("shell", shell);
          part("interior", interior);
          const n = s.nodes;
          const b = BOARD;
          // 둘째 마디 = 복도의 허브(핀 머리 달린 기판 기호), 첫 마디 = 측정점들, 그 뒤 마디 = 집 밖으로 이어지는 상자
          rect(b.x, b.y, b.w, b.h, 3, 0.0, 0.5, { pre: true });
          for (let i = 0; i < 9; i++) { rect(b.x + 16 + i * 20, b.y + 8, 10, 10, 1, 0.3 + i * 0.01, 0.1); rect(b.x + 16 + i * 20, b.y + b.h - 18, 10, 10, 1, 0.32 + i * 0.01, 0.1); }
          text(n[1] || "", b.x + b.w / 2, b.y + 66, 26, 0.45, { w: 700, align: "center", fit: b.w - 20 });
          const runs = [
            [SEN[0][0], SEN[0][1] + 16, SEN[0][0], 940, b.x + 160, 940, b.x + 160, b.y],
            [SEN[1][0], SEN[1][1] + 16, SEN[1][0], 760, 820, 760, 820, 1000, b.x + b.w, 1000],
            [SEN[2][0], SEN[2][1] + 16, SEN[2][0], 780, 840, 780, 840, 1030, b.x + b.w, 1030],
            [SEN[3][0] - 16, SEN[3][1], 860, SEN[3][1], 860, 1060, b.x + b.w, 1060],
            [SEN[4][0], SEN[4][1] + 16, SEN[4][0], 1150, 1720, 1150, 1720, 1140, 880, 1140, 880, 1080, b.x + b.w, 1080],
            [SEN[5][0] - 16, SEN[5][1], 640, SEN[5][1], 640, b.y + b.h],
          ];
          runs.slice(0, Math.max(1, its.length)).forEach((p, i) => line(p, 2, 0.6 + [0, 0.25, 0.42, 0.55, 0.62, 0.7][i], 0.9, { dash: [16, 9] }));
          const outs = n.slice(2, 5);
          const bx = outs.map((_, i) => 700 + i * 420);
          line([b.x + 100, b.y + b.h, b.x + 100, 1470, bx.length ? bx[0] - 70 : b.x + 100, 1470], 2.4, 1.3, 0.5);
          outs.forEach((nm, i) => {
            rect(bx[i] - 70, 1420, 140, 100, 2.6, 1.5 + i * 0.25, 0.4);
            if (i) arrowLine([bx[i - 1] + 70, 1470, bx[i] - 74, 1470], 2.4, 1.6 + i * 0.25, 0.3);
            balloon(bx[i], 1520, String(i + 3), bx[i], 1580, 1.7 + i * 0.25, up(nm), { lx: bx[i] + 40, fit: 330 });
          });
          if (n[0]) balloon(SEN[0][0], SEN[0][1], "1", 560, 860, 1.1, up(n[0]), { fit: 180 });
          balloon(b.x + 20, b.y + b.h, "2", 330, 1180, 1.38);
          para(s.line || "", 700 + outs.length * 420 - 200, 1440, 34, 560, 46, 2.0, { w: 700 });
        },
        alert(s: Extract<FlatScene, { kind: "alert" }>) {
          shot({ x: 2560, y: 560, w: 1300 }, 1.2, [2600, 840]);
          part("shell", shell);
          const xi = 2130, xo = 2350;
          text(T.section, 2010, 240, 28, 0.0, { w: 700 });
          E.push({ kind: "cut", x: 2010 + tw(T.section, 28, 700) + 40, y: 230, letter: "A", t0: 0.05 });
          rect(xi, 270, xo - xi, 110, 3, 0.15, 0.4, { pre: true }); hatch(xi + 2, 272, xo - xi - 4, 106, 0.35, 16);
          rect(xi, 720, xo - xi, 120, 3, 0.2, 0.4, { pre: true }); hatch(xi + 2, 722, xo - xi - 4, 116, 0.4, 16);
          rect(2196, 380, 88, 22, 2, 0.5, 0.2); rect(2196, 698, 88, 22, 2, 0.5, 0.2);
          line([2222, 402, 2222, 698], 3, 0.6, 0.4, { pre: true }); line([2258, 402, 2258, 698], 3, 0.65, 0.4, { pre: true });
          text(T.inside, 1990, 520, 26, 0.7, { w: 700 });
          if (room0) text(room0.value, 1990, 572, 38, 0.8, { w: 700, mark: true, fit: 140 });
          text(T.outside, 2296, 520, 26, 0.75, { w: 700 });
          E.push({ kind: "drops", x: 2218, y0: 420, y1: 690, t0: 0.9 });
          cloud(2168, 392, 120, 316, 1.0);
          E.push({ kind: "delta", x: 2300, y: 372, t0: 1.4, num: "1" });
          const tx = 2440;
          let y = 450;
          y += 58 * para(up(s.title || ""), tx, y, 50, 640, 58, 1.2, { w: 700, mark: true });
          y += 46 * para(up(s.body || ""), tx, y - 4, 30, 640, 40, 1.5, { mark: true }) + 50;
          y += 52 * para(s.line || "", tx, y, 38, 640, 50, 1.9, { w: 700 });
          if (s.line2) y += 52 * para(s.line2, tx, y, 38, 640, 50, 2.2);
          if (s.data === "sample") note(T.sampleAlert, tx, Math.min(840, y + 10), 1.6);
        },
        stats(s: Extract<FlatScene, { kind: "stats" }>) {
          shot({ x: 2585, y: 1085, w: 1250 }, 1.15, [2150, 1360]);
          const x = RX, sts = s.stats.slice(0, 3);
          text(T.specs, x, rcY + 60, 30, 0.0, { w: 700 });
          line([x, rcY + 78, 3080, rcY + 78], 1.4, 0.1, 0.5, { pre: true });
          const cw = 1120 / Math.max(1, sts.length);
          sts.forEach((st, i) => {
            const cx = x + i * cw, t0 = 0.35 + [0, 0.3, 0.6][i];
            const size = Math.min(84, K.fitSize(meas, st.value, FONT, 700, cw - 170, 84, 30));
            E.push({ kind: "basic", x: cx, y: rcY + 110, str: st.value, unit: up(st.unit), t0, size });
            text(up(st.label), cx, rcY + 270, 26, t0 + 0.3, { w: 700, fit: cw - 30 });
          });
          text(s.line || "", x, rcY + 386, 38, 1.4, { w: 700, fit: s.source ? 560 : 1100 });
          if (s.source) note(T.measured + s.source, 3080, rcY + 386, 1.5, { align: "right" });
          else if (s.data === "sample") note(T.sampleFigures, 3080, rcY + 386, 1.5, { align: "right" });
          rcY += 420;
          notes.y = Math.max(notes.y, rcY + 30);
        },
      };
    }

    // ---------------- 장면 → 컷 ----------------
    type Handlers = { parts: Record<string, () => void>; notes: NotesBox } & Partial<Record<FlatScene["kind"], (s: never) => void>>;
    const D: Handlers = design === "machine" ? machine() : design === "house" ? house() : devices();
    const used = new Set<string>();
    scenes.forEach((sc) => {
      const fn = D[sc.kind] as unknown as ((s: FlatScene) => void) | undefined;
      const once = sc.kind !== "flow" && sc.kind !== "items";
      if (sc.kind === "ending") {
        shot({ x: 2400, y: 1300, w: 1600 }, 1);
        titleblock(sc.name || work.title, [sc.line, sc.line2].filter(Boolean));
      } else if (fn && !(once && used.has(sc.kind))) fn(sc);
      else noteScene(D.notes, sc);
      used.add(sc.kind);
      shots[shots.length - 1].sc = sc;
    });
    if (!shots.length) { shot({ x: 2400, y: 1300, w: 1600 }); shots[0].sc = { kind: "ending", name: work.title, line: "", line2: "" }; }
    // 어느 장면도 그리지 않은 몸체는 첫 컷에 둔다(도면이 비지 않게)
    E = shots[0].els;
    for (const [name, fn] of Object.entries(D.parts)) part(name, fn);
    if (!scenes.some((s) => s.kind === "ending")) { E = shots[shots.length - 1].els; titleblock(work.title, []); }

    // ---------------- 시간 ----------------
    const TRAVEL = 1.0, HAND = 2.4, PULL = 1.35, CALL = 0.75;
    const sceneChars = (sc: FlatScene) => { const [a, b] = sceneText(sc); return readLen(a + " " + b); };
    shots.forEach((s) => {
      const raw = Math.max(0.4, ...s.els.map((e) => e.t0 + (e.d || 0.4)));
      if (raw > 2.2 && s.sc.kind !== "ending") s.els.forEach((e) => { e.t0 *= 2.2 / raw; if (e.d) e.d = Math.max(0.1, e.d * (2.2 / raw)); });
      s.draw = s.sc.kind === "ending" ? 2.4 : Math.min(2.2, raw);
      s.read = Math.max(1.8, sceneChars(s.sc) / 22 + 0.8) * s.imp;   // 선이 아직 그어지는 동안 읽기 시작한다
    });
    const lay = (f: number) => {
      let at = 0;
      shots.forEach((s, k) => {
        s.at = at;
        s.arrive = at + (k ? TRAVEL : 0);
        s.drawAt = k ? s.arrive - 0.2 : -s.draw * 0.85;
        const tail = k < shots.length - 1 ? 0.15 : 0;
        s.end = s.sc.kind === "ending" ? s.drawAt + 1.7 : k ? s.drawAt + Math.max(s.draw + 0.45, 0.3 + s.read * f) + tail : Math.max(3.8, s.read * f) + tail;
        at = s.end;
      });
      return at;
    };
    let f = 1, body = lay(f);
    const want = K.clamp(body, 21 - PULL * 0.45 - HAND, 26 + K.rand(seed, 3, 3) * 1.6 - PULL * 0.45 - HAND);
    for (let it = 0; it < 12 && Math.abs(body - want) > 0.05; it++) { f = K.clamp(f * (1 + ((want - body) / body) * 1.6), 0.6, 1.6); body = lay(f); }
    const pullAt = body, duration = body + PULL * 0.45 + HAND;
    const starts = shots.map((s, k) => (k ? s.at : 0));

    // 상세 표시: 카메라가 떠나기 전에 다음 자리 쪽으로 긋는다
    const scaleOf = (v: View) => K.W / v.w;
    shots.forEach((s, k) => {
      if (k === shots.length - 1) return;
      const a = s.view, b = shots[k + 1].view, dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
      if (L < 200) return;
      const hw = a.w / 2, hh = (a.w * 9) / 32, sc = scaleOf(a);
      const u = Math.min(Math.abs(dx) > 1 ? (hw * 0.8) / Math.abs(dx / L) : 1e9, Math.abs(dy) > 1 ? (hh * 0.72) / Math.abs(dy / L) : 1e9);
      let px = a.x + (dx / L) * u * 0.92 - (dx / L) * (60 / sc), py = a.y + (dy / L) * u * 0.92 - (dy / L) * (60 / sc);
      if (s.co) { px = s.co[0]; py = s.co[1]; }
      s.els.push({ kind: "callout", x: px, y: py, ux: dx / L, uy: dy / L, r: 24 / sc, len: 64 / sc, letter: String.fromCharCode(66 + k), T: s.end - CALL - 0.1, t0: 0 });
    });
    // "pre" 부품(윤곽·틀)은 카메라가 떠나기 전부터 그어진다
    shots.forEach((s, k) => s.els.forEach((e) => { if (e.T === undefined) e.T = e.pre && k ? shots[k - 1].end - 1.1 + e.t0 * 0.35 : s.drawAt + e.t0; }));
    const ALL = shots.flatMap((s) => s.els);
    // 글씨 맞춤(fit): 미리 재 둔다
    for (const e of ALL) if (e.kind === "text" && e.fit) e.size = Math.min(e.size!, K.fitSize(meas, e.str!, e.mono ? MONO : FONT, e.w || 400, e.fit, e.size!, 14));

    // ---------------- 카메라 ----------------
    const camOf = (v: View) => ({ x: v.x, y: v.y, s: scaleOf(v) });
    const full = { x: SW / 2, y: 960, s: Math.min(1500 / SW, 780 / SH) };
    const EM = K.ease.bezier(0.2, 0, 0, 1);
    function camera(t: number) {
      if (t >= pullAt) {
        const q = EM(K.clamp((t - pullAt) / PULL)), a = camOf(shots[shots.length - 1].view);
        return { x: K.lerp(a.x, full.x, q), y: K.lerp(a.y, full.y, q), s: a.s * Math.pow(full.s / a.s, q) };
      }
      let k = shots.findIndex((s) => t < s.end); if (k < 0) k = shots.length - 1;
      const s = shots[k], b = camOf(s.view);
      if (k && t < s.arrive) {
        const a = camOf(shots[k - 1].view), q = K.clamp((t - s.at) / TRAVEL), e = EM(q);
        const lift = Math.sin(Math.PI * q) * (0.1 + 0.2 * K.clamp(Math.hypot(b.x - a.x, b.y - a.y) / 1800));
        return { x: K.lerp(a.x, b.x, e), y: K.lerp(a.y, b.y, e), s: a.s * Math.pow(b.s / a.s, e) * (1 - lift) };
      }
      const hold = Math.max(0, t - s.arrive);
      return { x: b.x, y: b.y + hold * 1.4, s: b.s * (1 + hold * 0.005) };
    }

    // ---------------- 종이 결 ----------------
    const tex = document.createElement("canvas"); tex.width = 800; tex.height = 450;
    {
      const c = tex.getContext("2d")!, im = c.createImageData(800, 450), r = K.rng(seed + 9);
      for (let i = 0; i < im.data.length; i += 4) {
        const x = (i / 4) % 800, y = Math.floor(i / 4 / 800);
        const m = K.noise(x * 0.02 + K.noise(y * 0.015, 3) * 2, 7) * 0.5 + 0.5;
        im.data[i] = P.tex[0]; im.data[i + 1] = P.tex[1]; im.data[i + 2] = P.tex[2];
        im.data[i + 3] = Math.floor((m * 0.7 + r() * 0.3) * P.texA);
      }
      c.putImageData(im, 0, 0);
    }

    // ---------------- 그리기 ----------------
    const prog = (tt: number, e: El) => K.clamp((tt - e.T!) / (e.d || 0.5));
    function drawSheetBase(g: CanvasRenderingContext2D) {
      g.fillStyle = P.ground; g.fillRect(0, 0, SW, SH);
      g.drawImage(tex, 0, 0, SW, SH);
      g.strokeStyle = P.ink; g.lineWidth = 4; g.strokeRect(50, 50, SW - 100, SH - 100);
      g.lineWidth = 1.5; g.strokeRect(80, 80, SW - 160, SH - 160);
      g.fillStyle = P.ink; g.font = K.font(28, FONT, 700); g.textAlign = "center"; g.textBaseline = "middle";
      for (let i = 0; i < 8; i++) { const x = 80 + ((SW - 160) * (i + 0.5)) / 8; g.fillText(String(8 - i), x, 65); g.fillText(String(8 - i), x, SH - 65); g.beginPath(); g.moveTo(80 + ((SW - 160) * i) / 8, 50); g.lineTo(80 + ((SW - 160) * i) / 8, 80); g.moveTo(80 + ((SW - 160) * i) / 8, SH - 50); g.lineTo(80 + ((SW - 160) * i) / 8, SH - 80); g.stroke(); }
      for (let i = 0; i < 4; i++) { const y = 80 + ((SH - 160) * (i + 0.5)) / 4; g.fillText("DCBA"[i], 65, y); g.fillText("DCBA"[i], SW - 65, y); g.beginPath(); g.moveTo(50, 80 + ((SH - 160) * i) / 4); g.lineTo(80, 80 + ((SH - 160) * i) / 4); g.moveTo(SW - 50, 80 + ((SH - 160) * i) / 4); g.lineTo(SW - 80, 80 + ((SH - 160) * i) / 4); g.stroke(); }
      g.textBaseline = "alphabetic"; g.textAlign = "left";
    }
    function polyPartial(g: CanvasRenderingContext2D, pts: number[], f: number) {
      let total = 0; for (let i = 2; i < pts.length; i += 2) total += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
      let Lr = total * f;
      g.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) {
        const d = Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
        if (d >= Lr) { const q = d ? Lr / d : 0; g.lineTo(pts[i - 2] + (pts[i] - pts[i - 2]) * q, pts[i - 1] + (pts[i + 1] - pts[i - 1]) * q); return; }
        g.lineTo(pts[i], pts[i + 1]); Lr -= d;
      }
    }
    const arrowHead = (g: CanvasRenderingContext2D, x: number, y: number, ang: number, s = 22) => { g.beginPath(); g.moveTo(x, y); g.lineTo(x - Math.cos(ang - 0.28) * s, y - Math.sin(ang - 0.28) * s); g.lineTo(x - Math.cos(ang + 0.28) * s, y - Math.sin(ang + 0.28) * s); g.closePath(); g.fill(); };
    /** 글씨: 손 속도(초당 약 55자)로 왼쪽부터 — 튀어나오거나 흐려지며 나타나지 않는다. */
    const letter = (g: CanvasRenderingContext2D, T0: number, align: CanvasTextAlign | undefined, tt: number, x: number, y: number, str: string) => {
      const chars = Array.from(str);
      const n = Math.min(chars.length, Math.floor((tt - T0) * 55) + 1);
      const full = g.measureText(str).width;
      const x0 = align === "center" ? x - full / 2 : align === "right" ? x - full : x;
      g.textAlign = "left";
      g.fillText(n >= chars.length ? str : chars.slice(0, n).join(""), x0, y);
    };
    function drawEl(g: CanvasRenderingContext2D, e: El, tt: number, t: number, fade: number) {
      if (tt < e.T!) return;
      const ink = e.mark ? P.mark : P.ink;
      g.strokeStyle = e.faint ? P.faint : ink; g.fillStyle = e.faint ? P.faint : ink;
      switch (e.kind) {
        case "line": {
          const q = K.ease.outQuart(prog(tt, e)); g.lineWidth = e.w!; if (e.dash) g.setLineDash(e.dash); if (e.cap) g.lineCap = e.cap;
          g.beginPath(); polyPartial(g, e.pts!, q); g.stroke(); g.setLineDash([]); g.lineCap = "round"; return;
        }
        case "arrow": {
          const q = K.ease.outQuart(prog(tt, e)); g.lineWidth = e.w!; g.beginPath(); polyPartial(g, e.pts!, q); g.stroke();
          if (q > 0.95) { const p = e.pts!, n = p.length; arrowHead(g, p[n - 2], p[n - 1], Math.atan2(p[n - 1] - p[n - 3], p[n - 2] - p[n - 4]), 24); }
          return;
        }
        case "text": {
          g.font = K.font(e.size!, e.mono ? MONO : FONT, e.w);
          if (e.bg) { const w = g.measureText(e.str!).width, x0 = e.align === "center" ? e.x! - w / 2 : e.align === "right" ? e.x! - w : e.x!; g.fillStyle = P.ground; g.fillRect(x0 - 10, e.y! - e.size! * 0.85, w + 20, e.size! * 1.15); g.fillStyle = ink; }
          letter(g, e.T!, e.align, tt, e.x!, e.y!, e.str!); return;
        }
        case "dim": {
          const q = K.ease.outQuart(prog(tt, e));
          const [ax, ay] = e.a!, [bx, by] = e.b!, [mx, my] = e.m!;
          g.font = K.font(e.size!, FONT, e.w);
          const tw_ = g.measureText(e.label!).width + 30;
          const L = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / L, uy = (by - ay) / L;
          const outside = !e.vertical && L < tw_ + 60;
          const gap = e.vertical || outside ? 0 : Math.min(tw_ / 2, L / 2 - 30);
          g.lineWidth = 1.4; g.beginPath();
          g.moveTo(mx - ux * gap, my - uy * gap); g.lineTo(mx - ux * gap - ux * (L / 2 - gap) * q, my - uy * gap - uy * (L / 2 - gap) * q);
          g.moveTo(mx + ux * gap, my + uy * gap); g.lineTo(mx + ux * gap + ux * (L / 2 - gap) * q, my + uy * gap + uy * (L / 2 - gap) * q);
          g.stroke();
          if (q > 0.97) { arrowHead(g, ax, ay, Math.atan2(-uy, -ux), 20); arrowHead(g, bx, by, Math.atan2(uy, ux), 20); }
          if (tt > e.T! + e.d! * 0.85) {
            const tx = e.vertical ? mx + 18 : outside ? bx + 24 : mx, ty = e.vertical ? my + e.size! * 0.35 : my + e.size! * 0.36;
            const al: CanvasTextAlign = e.vertical || outside ? "left" : "center";
            if (e.bg) { const w = g.measureText(e.label!).width, x0 = al === "center" ? tx - w / 2 : tx; g.fillStyle = P.ground; g.fillRect(x0 - 12, ty - e.size! * 0.9, w + 24, e.size! * 1.2); g.fillStyle = ink; }
            letter(g, e.T! + e.d! * 0.85, al, tt, tx, ty, e.label!);
          }
          return;
        }
        case "dot": { g.beginPath(); g.arc(e.x!, e.y!, 4.5, 0, 6.3); g.fill(); return; }
        case "balloon": {
          const r = e.r || 28, q = K.ease.outQuart(K.clamp((tt - e.T!) / 0.3));
          g.lineWidth = 2; g.beginPath(); g.arc(e.x!, e.y!, r, -Math.PI / 2, -Math.PI / 2 + 6.2832 * q); g.stroke();
          if (q > 0.6) { g.font = K.font(r * 1.05, FONT, 700); g.textAlign = "center"; g.fillText(e.num!, e.x!, e.y! + r * 0.38); g.textAlign = "left"; }
          return;
        }
        case "center": case "phantom": {
          const q = K.ease.outQuart(K.clamp((tt - e.T!) / (e.d || 0.7)));
          g.lineWidth = e.kind === "phantom" ? 2 : 1.2; g.strokeStyle = e.kind === "phantom" ? ink : P.faint;
          g.setLineDash(e.kind === "phantom" ? [48, 10, 8, 10, 8, 10] : [40, 10, 8, 10]);
          g.beginPath();
          if (e.pts) polyPartial(g, e.pts, q); else { g.moveTo(e.a![0], e.a![1]); g.lineTo(K.lerp(e.a![0], e.b![0], q), K.lerp(e.a![1], e.b![1], q)); }
          g.stroke(); g.setLineDash([]); return;
        }
        case "tag": {
          g.font = K.font(e.size!, FONT, 700);
          const w = g.measureText(e.str!).width + e.size! * 0.8, h = e.size! * 0.78;
          const q = K.ease.outQuart(K.clamp((tt - e.T!) / 0.45));
          g.lineWidth = e.mark ? 3.4 : 2.2; g.beginPath(); g.ellipse(e.x!, e.y! - e.size! * 0.34, w / 2, h, 0, -Math.PI / 2, -Math.PI / 2 + 6.2832 * q); g.stroke();
          if (q > 0.5) letter(g, e.T! + 0.25, "center", tt, e.x!, e.y!, e.str!);
          return;
        }
        case "delta": {
          const q = K.ease.outQuart(K.clamp((tt - e.T!) / 0.35));
          g.lineWidth = 2.6; g.strokeStyle = P.mark; g.fillStyle = P.mark; g.beginPath(); polyPartial(g, [e.x!, e.y! - 34, e.x! + 36, e.y! + 26, e.x! - 36, e.y! + 26, e.x!, e.y! - 34], q); g.stroke();
          if (q > 0.9) { g.font = K.font(30, FONT, 700); g.textAlign = "center"; g.fillText(e.num!, e.x!, e.y! + 18); g.textAlign = "left"; }
          return;
        }
        case "basic": {
          g.font = K.font(e.size!, FONT, 700); const w = g.measureText(e.str!).width;
          const q = K.ease.outQuart(K.clamp((tt - e.T!) / 0.5));
          g.lineWidth = 2.6; g.beginPath(); polyPartial(g, [e.x!, e.y!, e.x! + w + 40, e.y!, e.x! + w + 40, e.y! + e.size! + 26, e.x!, e.y! + e.size! + 26, e.x!, e.y!], q); g.stroke();
          if (q > 0.4) { g.fillText(e.str!, e.x! + 20, e.y! + e.size! * 0.9 + 6); g.font = K.font(30, FONT, 700); letter(g, e.T! + 0.35, "left", tt, e.x! + w + 58, e.y! + e.size! * 0.9 + 6, e.unit!); }
          return;
        }
        case "callout": {
          // 길 안내 표시는 마지막에 도면 전체로 물러날 때 거둔다
          if (fade <= 0) return;
          g.globalAlpha = fade;
          const q = K.ease.outQuart(K.clamp((tt - e.T!) / 0.3)), q2 = K.ease.outQuart(K.clamp((tt - e.T! - 0.2) / 0.4));
          g.lineWidth = Math.max(2, e.r! * 0.09); g.beginPath(); g.arc(e.x!, e.y!, e.r!, -Math.PI / 2, -Math.PI / 2 + 6.2832 * q); g.stroke();
          if (q > 0.7) { g.font = K.font(e.r! * 1.1, FONT, 700); g.textAlign = "center"; g.fillText(e.letter!, e.x!, e.y! + e.r! * 0.4); g.textAlign = "left"; }
          if (q2 > 0) {
            const sx = e.x! + e.ux! * e.r!, sy = e.y! + e.uy! * e.r!, ex = sx + e.ux! * e.len! * q2, ey = sy + e.uy! * e.len! * q2;
            g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
            if (q2 > 0.9) arrowHead(g, ex, ey, Math.atan2(e.uy!, e.ux!), e.r! * 0.75);
          }
          g.globalAlpha = 1;
          return;
        }
        case "cut": {
          g.lineWidth = 2.4; g.beginPath(); g.arc(e.x!, e.y!, 26, 0, 6.3); g.stroke();
          g.font = K.font(28, FONT, 700); g.textAlign = "center"; g.fillText(e.letter!, e.x!, e.y! + 10); g.textAlign = "left";
          arrowHead(g, e.x! + 64, e.y!, 0, 24); g.beginPath(); g.moveTo(e.x! + 26, e.y!); g.lineTo(e.x! + 60, e.y!); g.stroke();
          return;
        }
        case "needle": {
          const k = K.ease.bezier(0.3, 0, 0, 1)(K.clamp((tt - e.T!) / 1.2));
          const a = Math.PI * 0.75 + K.clamp(e.to! * k) * Math.PI * 1.5;
          g.lineWidth = 3.4; g.beginPath(); g.moveTo(e.cx!, e.cy!); g.lineTo(e.cx! + Math.cos(a) * e.r!, e.cy! + Math.sin(a) * e.r!); g.stroke();
          g.beginPath(); g.arc(e.cx!, e.cy!, 8, 0, 6.3); g.fill();
          return;
        }
        case "sector": {
          const k = K.ease.outQuart(K.clamp((tt - e.T!) / 0.6));
          g.save(); g.beginPath(); g.moveTo(e.cx!, e.cy!); g.arc(e.cx!, e.cy!, e.r!, e.a0!, K.lerp(e.a0!, e.a1!, k)); g.closePath(); g.clip();
          g.strokeStyle = P.mark; g.lineWidth = 1.6; g.beginPath();
          for (let u = -e.r!; u < e.r!; u += 9) { g.moveTo(e.cx! + u - e.r!, e.cy! + e.r!); g.lineTo(e.cx! + u + e.r!, e.cy! - e.r!); }
          g.stroke(); g.restore();
          return;
        }
        case "cursor": {
          if (Math.floor((t - e.T!) / 0.5) % 2 === 0) g.fillRect(e.x!, e.y! - 22, 16, 26);
          return;
        }
        case "packet": {
          // 상태가 오른쪽으로 건너간다: 첫 마디 상세를 지나면 속이 찬 상자가 된다
          const per = 2.6, q = ((t - e.T!) / per) % 1, x = K.lerp(e.x0!, e.x1!, K.ease.bezier(0.4, 0, 0.6, 1)(q));
          const lock = e.lock ?? -1e9;
          if (Math.abs(x - lock) < 140) return;
          g.lineWidth = 2; g.fillStyle = P.mark; g.strokeStyle = P.mark;
          if (x > lock) g.fillRect(x - 22, e.y! - 15, 44, 30);
          else { g.fillStyle = P.ground; g.fillRect(x - 22, e.y! - 15, 44, 30); g.strokeRect(x - 22, e.y! - 15, 44, 30); }
          return;
        }
        case "drops": {
          // 유리 안쪽 면에 물방울이 하나씩 맺힌다
          const n = Math.floor(K.clamp((tt - e.T!) / 3.2) * 26);
          g.fillStyle = P.mark;
          for (let i = 0; i < n; i++) {
            const y = e.y0! + K.rand(seed, i, 41) * (e.y1! - e.y0!), r = 3 + K.rand(seed, i, 42) * 4;
            g.beginPath(); g.arc(e.x! - r, y, r, 0, 6.3); g.fill();
            g.beginPath(); g.moveTo(e.x! - r * 2, y); g.lineTo(e.x! - r, y - r * 2.2); g.lineTo(e.x!, y); g.fill();
          }
          return;
        }
        case "titleblock": {
          const x = e.x!, y = e.y!, w = e.w!, h = e.h!;
          const q = K.ease.outQuart(K.clamp((tt - e.T!) / 0.7));
          g.lineWidth = 4; g.beginPath(); polyPartial(g, [x, y, x + w, y, x + w, y + h, x, y + h, x, y], q); g.stroke();
          g.lineWidth = 1.6;
          [0.46, 0.78].forEach((r, i) => { const qq = K.ease.outQuart(K.clamp((tt - e.T! - 0.3 - i * 0.08) / 0.5)); g.beginPath(); g.moveTo(x, y + h * r); g.lineTo(x + w * qq, y + h * r); g.stroke(); });
          [0.42, 0.72].forEach((v, i) => { const qq = K.ease.outQuart(K.clamp((tt - e.T! - 0.5 - i * 0.07) / 0.4)); g.beginPath(); g.moveTo(x + w * v, y + h * 0.78); g.lineTo(x + w * v, y + h * 0.78 + h * 0.22 * qq); g.stroke(); });
          const lab = (s: string, lx: number, ly: number) => { g.font = K.font(20, FONT, 400); g.fillText(s, lx, ly); };
          if (tt > e.T! + 0.45) {
            lab(T.title, x + 22, y + 32);
            let fs = 96; g.font = K.font(fs, FONT, 700); while (g.measureText(e.name!).width > w - 50 && fs > 36) { fs -= 4; g.font = K.font(fs, FONT, 700); }
            letter(g, e.T! + 0.45, "left", tt, x + 22, y + h * 0.46 - 28, e.name!);
          }
          if (tt > e.T! + 0.9 && e.lines!.length) {
            lab(T.desc, x + 22, y + h * 0.46 + 28);
            e.lines!.slice(0, 2).forEach((l, i) => {
              if (tt <= e.T! + 1.0 + i * 0.4) return;
              let fs = 30; g.font = K.font(fs, FONT, 400); while (g.measureText(l).width > w - 44 && fs > 18) { fs -= 2; g.font = K.font(fs, FONT, 400); }
              letter(g, e.T! + 1.0 + i * 0.4, "left", tt, x + 22, y + h * 0.46 + 66 + i * 38, l);
            });
          }
          if (tt > e.T! + 1.6) {
            lab(T.drawnBy, x + 22, y + h * 0.78 + 28); lab(T.scale, x + w * 0.42 + 22, y + h * 0.78 + 28); lab(T.sheet, x + w * 0.72 + 22, y + h * 0.78 + 28);
            g.font = K.font(30, FONT, 700);
            const hd = "@" + work.handle; let fs = 30; while (g.measureText(hd).width > w * 0.42 - 40 && fs > 16) { fs -= 2; g.font = K.font(fs, FONT, 700); }
            g.fillText(hd, x + 22, y + h * 0.78 + 68);
            g.font = K.font(30, FONT, 700); g.fillText(T.asNoted, x + w * 0.42 + 22, y + h * 0.78 + 68); g.fillText(T.oneOfOne, x + w * 0.72 + 22, y + h * 0.78 + 68);
          }
          return;
        }
      }
    }

    return {
      duration,
      starts,
      render(g, t) {
        g.fillStyle = P.desk; g.fillRect(0, 0, K.W, K.H);
        const cam = camera(t);
        const tt = K.step(t, 24);
        const fade = 1 - K.clamp((t - pullAt) / (PULL * 0.8));
        g.save();
        g.translate(K.W / 2, K.H / 2); g.scale(cam.s, cam.s); g.translate(-cam.x, -cam.y);
        drawSheetBase(g);
        g.lineCap = "round"; g.lineJoin = "round"; g.textBaseline = "alphabetic";
        for (const e of ALL) drawEl(g, e, tt, t, fade);
        g.restore();
        const hp = K.seg(t, duration - HAND, HAND);
        if (hp > 0) {
          const x = K.W / 2 + (60 - cam.x) * cam.s, y = K.H / 2 + (SH - cam.y) * cam.s + 44;
          K.handoff(g, hp, { ink: P.name === "cyan" ? P.ink : P.ground, family: FONT, size: 26, x, y, handle: work.handle });
        }
      },
    };
  },
};
