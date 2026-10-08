// 기록계 용지 — 기록계 펜이 작품의 진짜 숫자를 종이에 그리고, 사람이 손으로 메모한다(필름 실험실 G09 v2, 2026-10-08).
// 한 세계(종이는 모터가 돌 때만 움직이고, 장면이 바뀔 때마다 모터가 한 번 돈다), 작품마다 다른 기계:
//   헬리코더(그을음 종이에 흰 긁힘, 세션마다 한 줄, 타자 테이프·종이 꼬리표·빨간 크레용) — 터미널 장면이 있는 작품
//   원형 기록지(12시간 원판, 화면엔 윗부분 활만 보이고 끝에 카메라가 물러나 원판 전체가 드러난다) — 첫 장면이 hook이 아닌 작품
//   드럼 온습도계(방마다 펜 하나, 휜 시간선, 원통 원근, 요일이 지나간다) — 항목이 모두 %인 작품
// 움직임: 모터 구간은 sin² 속도 혹(≥1.2초), 그 뒤로 기어가는 동안 손이 쓴다. 펜은 서보(살짝 넘쳤다 멈춘다).
// 손으로 그린 층은 12fps로 끊고, 인쇄·타자는 줄·글자 단위로 끊는다.
import type { FlatScene, Genre, GenreWork } from "./types";
import * as K from "./kit";

const PI = Math.PI;
const W = K.W, H = K.H;
const mod = (a: number, n: number) => ((a % n) + n) % n;
const sm = (x: number) => x * x * (3 - 2 * x);
const ramp = (x: number, a: number, b: number) => K.clamp((x - a) / (b - a));

// 기계가 스스로 찍거나 쓰는 말 — 영상의 언어로.
const LABEL = {
  en: {
    sampleRecord: "SAMPLE RECORD", sampleRun: "SAMPLE RUN", sampleFigures: "SAMPLE FIGURES",
    sample: "SAMPLE", sampleData: "SAMPLE DATA", sampleAlert: "SAMPLE ALERT",
    ring: "ring!", alertLine: "alert line", dot: "1 dot = 1 reading", measured: "measured · ",
    chart: "12 HOUR CHART", pct: "%", days: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
  },
  ko: {
    sampleRecord: "예시 기록", sampleRun: "예시 실행", sampleFigures: "예시 수치",
    sample: "예시", sampleData: "예시 자료", sampleAlert: "예시 알림",
    ring: "울림!", alertLine: "경보선", dot: "점 하나 = 측정 한 번", measured: "측정 · ",
    chart: "12시간 기록지", pct: "%", days: ["월", "화", "수", "목", "금", "토", "일"],
  },
};

// ---- 한글은 넓고 읽는 데 더 걸린다 ----
const isWide = (c: string) => {
  const n = c.codePointAt(0) || 0;
  return (n >= 0x1100 && n <= 0x115f) || (n >= 0x2e80 && n <= 0xa4cf) || (n >= 0xac00 && n <= 0xd7a3) || (n >= 0xf900 && n <= 0xfaff) || (n >= 0xff00 && n <= 0xff60) || (n >= 0xffe0 && n <= 0xffe6) || n >= 0x1f300;
};
const readLen = (s: string) => Array.from(s).reduce((a, c) => a + (isWide(c) ? 1.7 : 1), 0);
const unitJoin = (value: string, unit: string) => value + (unit === "%" ? "%" : unit ? (isWide(Array.from(unit)[0]) || unit[0] === "/" ? "" : " ") + unit : "");
/** "MY BATHROOM" → "My bathroom"(라틴 대문자만 바꾼다; 한글은 그대로). */
const softCase = (s: string) => (/[a-z]/.test(s) || !/[A-Z]/.test(s) ? s : s.charAt(0) + s.slice(1).toLowerCase());
const titleCase = (s: string) => (/[a-z]/.test(s) || !/[A-Z]/.test(s) ? s : s.split(" ").map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" "));
const pctOf = (v: string) => { const m = /^\s*([\d.]+)\s*%\s*$/.exec(v); return m ? parseFloat(m[1]) : null; };

type Inst = "heli" | "disc" | "drum";
function pickInstrument(work: GenreWork, seed: number): Inst {
  const kinds = work.scenes.map((s) => s.kind);
  const pctItems = work.scenes.some((s) => s.kind === "items" && s.items.length > 0 && s.items.every((it) => pctOf(it.value) != null));
  if (pctItems) return "drum";
  if (kinds.includes("terminal")) return "heli";
  if (kinds[0] !== "hook") return "disc";
  return (["heli", "disc", "drum"] as const)[seed % 3];
}

type PenOut = { v: number | null; d: boolean };
type PenFn = (qd: number, u: number, P: number) => PenOut;
type Scene = { sc: FlatScene; si: number; runAt: number; T0: number; pen: PenFn[]; runD: number; at: number; len: number; stop?: boolean };
type NoteKind = "hand" | "tag" | "type" | "print" | "circle" | "under" | "arrow" | "bracket" | "dash" | "swatch" | "stamp";
type Note = {
  kind: NoteKind; S: Scene; t0: number; dur: number; tw: number; ta: number; color: string;
  x: number; y: number; text: string; size: number; rot: number; align: "left" | "right"; wt: number; w: number;
  tagRot: number; ox: number; oy: number; h: number;
  cx: number; cy: number; rx: number; ry: number; lw: number; seedk: number;
  x1: number; x2: number; y1: number; y2: number; bend: number;
  lines: string[]; cps: number; step: number; lh: number; fam: string;
};
type Opt = { color?: string; rot?: number; align?: "left" | "right"; wt?: number; dur?: number; lh?: number; indent?: number; lw?: number; bend?: number; h?: number; size?: number; fam?: string; cps?: number; step?: number };
type Pen = { LX: Float32Array; LY: Float32Array; Dn: Uint8Array; SP: Float32Array; PP: Float64Array; ink: string };

export const chartrecorder: Genre = {
  id: "chartrecorder",
  name: "Chart recorder",
  ko: "기록계 용지",
  koIdea: "기록계 펜이 작품의 진짜 숫자를 종이에 그리고, 사람이 손으로 메모한다 — 작품마다 다른 기계로",
  enIdea: "A recorder's pen draws the work's real numbers on moving paper and a person annotates by hand — a different machine for each work",
  family: "A",
  fonts: ["architectsDaughter", "gochiHand", "kalam", "courierPrime", "barlowCondensed", "plexSansCondensed"],
  make(work, { seed, fonts }) {
    const kind = pickInstrument(work, seed);
    const T = LABEL[work.locale];
    const KO = work.locale === "ko";
    const rnd = (i: number, j = 0) => K.rand(seed, i, j);
    const HAND = { heli: fonts.architectsDaughter, disc: fonts.gochiHand, drum: fonts.kalam }[kind];
    const CP = fonts.courierPrime, BC = fonts.barlowCondensed, PX = fonts.plexSansCondensed;
    // 손글씨 크기 보정 — 한글 대체 글꼴(개구·나눔손글씨 붓)은 em 상자 안에서 작게 앉는다
    const HS = KO ? { heli: 1.14, disc: 1.3, drum: 1.04 }[kind] : { heli: 1.0, disc: 1.08, drum: 1.0 }[kind];
    const mkc = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
    const meas = mkc(8, 8).getContext("2d")!;
    const tw = (text: string, size: number, fam = HAND, wt = 400) => { meas.font = K.font(fam === HAND ? size * HS : size, fam, wt); return meas.measureText(text).width; };
    /** 띄어쓰기로 끊고, 한 낱말이 너무 길면 글자 단위로 끊는다(한국어 긴 낱말 대비). */
    const wrapW = (text: string, size: number, maxW: number, fam = HAND): string[] => {
      const out: string[] = [];
      let cur = "";
      for (const w of String(text).split(/\s+/).filter(Boolean)) {
        const n = cur ? cur + " " + w : w;
        if (tw(n, size, fam) <= maxW) { cur = n; continue; }
        if (cur) { out.push(cur); cur = ""; }
        if (tw(w, size, fam) <= maxW) { cur = w; continue; }
        let piece = "";
        for (const ch of Array.from(w)) { if (piece && tw(piece + ch, size, fam) > maxW) { out.push(piece); piece = ch; } else piece += ch; }
        cur = piece;
      }
      if (cur) out.push(cur);
      return out.length ? out : [""];
    };

    // ---------------- 색 ----------------
    const accent = work.accent, alarm = work.alarm;
    const base = {
      ground: "#18191b", soot: "#171513", scratch: "#e9edf0", chalk: "#f3f4f2", grease: "#e5483e", tag: "#eef0ee", tagInk: "#1d2335", tape: "#e3e6e2",
      paper: "#fbfbf9", grid: "#3d64b0", gridMinor: "#a9bde2", ink1: "#3d2c7a", ink2: "#ff453a", marker: "#151515", hi: "#ff9f0a", red: "#d8322a",
      ink: "#161616", hot: "#f18600", alarm: "#f04251", stamp: "#5a3b9c", brass: "#b08d4a",
    };
    const PAL = kind === "heli" ? { ...base, ground: "#0d0c0b" }
      : kind === "disc" ? { ...base, ground: "#18191b", paper: "#fbfbf9", grid: accent || "#ff9f0a", ink2: alarm || "#ff453a", hi: accent || "#ff9f0a" }
      : { ...base, ground: "#232723", paper: "#f6f7f3", hot: accent || "#f18600", alarm: alarm || "#f04251" };

    // ---------------- 메모(종이와 함께 움직인다) ----------------
    const notes: Note[] = [];
    const blank = (): Note => ({
      kind: "hand", S: null as unknown as Scene, t0: 0, dur: 0.3, tw: 0, ta: 0, color: "",
      x: 0, y: 0, text: "", size: 0, rot: 0, align: "left", wt: 400, w: 0, tagRot: 0, ox: 0, oy: 0, h: 0,
      cx: 0, cy: 0, rx: 0, ry: 0, lw: 3, seedk: 0, x1: 0, x2: 0, y1: 0, y2: 0, bend: 0, lines: [], cps: 34, step: 0.12, lh: 1.36, fam: "",
    });
    const add = (p: Partial<Note>): Note => { const n = { ...blank(), seedk: notes.length, ...p }; notes.push(n); return n; };
    const handDur = (text: string, size: number) => Math.max(0.35, readLen(text) / (size > 100 ? 9 : 22));
    const hand = (S: Scene, text: string, x: number, y: number, size: number, t0: number, o: Opt = {}) => {
      const dur = o.dur || handDur(text, size);
      add({ kind: "hand", S, text, x, y, size, t0, dur, color: o.color, rot: o.rot != null ? o.rot : (rnd(notes.length, 4) - 0.5) * 0.03, align: o.align || "left", wt: o.wt || 400 });
      return t0 + dur;
    };
    const handBlock = (S: Scene, text: string, x: number, y: number, size: number, maxW: number, t0: number, o: Opt = {}) => {
      const lines = wrapW(text, size, maxW);
      let t = t0;
      const lh = size * (o.lh || 1.06);
      lines.forEach((ln, i) => { t = hand(S, ln, x + (i ? (o.indent != null ? o.indent : 4 + rnd(i, 9) * 8) : 0), y + i * lh, size, t + (i ? 0.08 : 0), o); });
      return { end: t, h: lines.length * lh, w: Math.max(...lines.map((l) => tw(l, size))), n: lines.length };
    };
    const circle = (S: Scene, cx: number, cy: number, rx: number, ry: number, t0: number, o: Opt = {}) => { add({ kind: "circle", S, cx, cy, rx, ry, t0, dur: o.dur || 0.5, color: o.color, lw: o.lw || 3.4 }); return t0 + (o.dur || 0.5); };
    const under = (S: Scene, x1: number, x2: number, y: number, t0: number, o: Opt = {}) => { add({ kind: "under", S, x1, x2, y, t0, dur: o.dur || 0.32, color: o.color, lw: o.lw || 3.6 }); return t0 + (o.dur || 0.32); };
    const arrow = (S: Scene, x1: number, y1: number, x2: number, y2: number, t0: number, o: Opt = {}) => { add({ kind: "arrow", S, x1, y1, x2, y2, t0, dur: o.dur || 0.34, color: o.color, lw: o.lw || 3, bend: o.bend == null ? -18 : o.bend }); return t0 + (o.dur || 0.34); };
    const bracket = (S: Scene, x1: number, x2: number, y: number, t0: number, o: Opt = {}) => { add({ kind: "bracket", S, x1, x2, y, t0, dur: o.dur || 0.45, color: o.color, lw: o.lw || 4, h: o.h || 14 }); return t0 + (o.dur || 0.45); };
    const dash = (S: Scene, x1: number, x2: number, y: number, t0: number, o: Opt = {}) => { add({ kind: "dash", S, x1, x2, y, t0, dur: o.dur || 0.6, color: o.color, lw: o.lw || 2.6 }); return t0 + (o.dur || 0.6); };
    const stamp = (S: Scene, text: string, x: number, y: number, t0: number, o: Opt = {}) => { add({ kind: "stamp", S, text, x, y, t0, dur: 0.1, rot: o.rot != null ? o.rot : -0.08 + rnd(notes.length, 2) * 0.06, color: o.color, size: o.size || 30, fam: o.fam || BC, seedk: notes.length + 3 }); };
    /** 타자기로 친 테이프 — 글자 단위로 나온다. */
    const typed = (S: Scene, lines: string[], x: number, y: number, size: number, t0: number, o: Opt = {}) => {
      const cps = o.cps || 34;
      const dur = lines.join("").length / cps + lines.length * 0.06;
      add({ kind: "type", S, lines, x, y, size, t0, cps, dur, rot: o.rot || 0, lh: o.lh || 1.36 });
      return t0 + dur;
    };
    /** 기록계가 스스로 찍는 글 — 줄 단위로 나온다. */
    const print = (S: Scene, lines: string[], x: number, y: number, size: number, t0: number, o: Opt = {}) => {
      const step = o.step || 0.12;
      add({ kind: "print", S, lines, x, y, size, t0, step, dur: lines.length * step, color: o.color, fam: o.fam || PX, wt: o.wt || 400, lh: o.lh || 1.4 });
      return t0 + lines.length * step;
    };
    /** 그을음 위에 붙인 종이 꼬리표 — 손이 그 위에 쓴다. */
    const tag = (S: Scene, lines: string[], x: number, y: number, size: number, t0: number, o: Opt = {}) => {
      const lh = size * 1.1, pad = size * 0.5;
      const w = Math.max(...lines.map((l) => tw(l, size))) + pad * 2, h = lines.length * lh + pad * 1.5;
      const rot = o.rot != null ? o.rot : (rnd(notes.length, 11) - 0.5) * 0.05;
      add({ kind: "tag", S, x, y, w, h, t0, dur: 0.25, rot });
      let t = t0 + 0.3;
      lines.forEach((ln, i) => {
        t = hand(S, ln, x + pad, y + pad * 0.6 + lh * (i + 0.78), size, t + (i ? 0.06 : 0), { color: PAL.tagInk, rot: 0 });
        const n = notes[notes.length - 1]; n.tagRot = rot; n.ox = x; n.oy = y;
      });
      return { end: t, w, h };
    };

    // ---------------- 장면 ----------------
    const scenes: Scene[] = [];
    const FF = { heli: 1.3, disc: 1.3, drum: 1.25 }[kind];
    const RUN0 = -(FF + 0.8); // 첫 장면의 모터는 0초 전에 돈다 — 영상은 이미 그려진 기록에서 시작
    const NP = { heli: 1, disc: 2, drum: 5 }[kind];
    const up: PenFn = () => ({ v: null, d: false }); // 든 펜은 있던 자리에 머문다
    const pens = (S: Scene, fns: PenFn[]) => { S.pen = Array.from({ length: NP }, (_, i) => fns[i] || up); };
    const D01 = (q: number) => q - Math.sin(2 * PI * q) / (2 * PI); // sin² 모터의 거리 비율
    const flowIndex = (si: number) => work.scenes.slice(0, si).filter((s) => s.kind === "flow").length;

    // ===================== 헬리코더 =====================
    const HL = { X0: 110, L: 1380, RH: 66, BASE: 718, crawl: 62 };
    const heliQuiet = (P: number) => K.noise(P / 9, seed + 1) * 1.4 + K.noise(P / 2.4, seed + 2) * 0.6 + (mod(P, 117) < 6 ? 6 : 0);
    const heliAct = (P: number, a: number) => a * (K.noise(P / 5.2, seed + 3) * 0.62 + K.noise(P / 1.9, seed + 4) * 0.38);
    const quake = (x: number, x0: number, a: number, dec: number) => (x < x0 ? 0 : a * Math.exp(-(x - x0) / dec) * Math.min(1, (x - x0) / 6) * Math.sin((x - x0) * 0.9));
    function heliScene(S: Scene, sc: FlatScene, T0: number) {
      const X0 = HL.X0, L = HL.L, DY = HL.BASE - HL.RH;
      const at = (qd: number) => { if (qd > 1 || qd < 0) return { r: -1, x: 0 }; const z = (S.runD * (1 - qd)) / L; const r = Math.floor(z); return { r, x: (1 - (z - r)) * L }; };
      const chalk = PAL.chalk, red = PAL.grease;
      if (sc.kind === "hook") {
        pens(S, [(qd, u, P) => { const a = at(qd); let v = heliQuiet(P); if (a.r === 0) v += heliAct(P, 7) + quake(a.x, 380, 30, 120) + quake(a.x, 840, 24, 90); return { v, d: true }; }]);
        const vs = K.clamp(560 / Math.max(1, tw(sc.value, 1)), 90, 210);
        hand(S, sc.value, X0 - 6, 470, vs, T0, { color: chalk, dur: 0.6, rot: -0.02 });
        const vw = tw(sc.value, vs);
        under(S, X0, X0 + vw, 500, T0 + 0.65, { color: red, lw: 6 });
        arrow(S, X0 + vw * 0.7, 520, X0 + 380, DY - 34, T0 + 0.95, { color: red, lw: 5, bend: 30 });
        tag(S, [sc.label + (KO ? "" : ":"), ...wrapW(sc.line, 46, 640)].slice(0, 4), 760, 170, 46, T0 + 0.5);
        if (sc.data === "sample") typed(S, [T.sampleRecord], 772, 120, 24, T0 + 0.2, { cps: 40 });
      } else if (sc.kind === "story") {
        pens(S, [(qd, u, P) => { const a = at(qd); let v = heliQuiet(P); if (a.r === 0) v += heliAct(P, 16) + quake(a.x, 140, 58, 160) + quake(a.x, 520, 64, 220) + quake(a.x, 960, 52, 180); else if (a.r === 1) v += heliAct(P, 6); return { v, d: true }; }]);
        const t1 = tag(S, wrapW(sc.line, 60, 1000), X0, 210, 60, T0 + 0.1);
        const b = handBlock(S, sc.line2, 560, 440, 54, 900, t1.end + 0.4, { color: red });
        arrow(S, 620, 440 + b.h - 30, 520, DY - 46, b.end + 0.1, { color: red, lw: 5, bend: 20 });
      } else if (sc.kind === "flow") {
        const n = sc.nodes.length, xs = sc.nodes.map((_, i) => (0.1 + (0.8 * i) / Math.max(1, n - 1)) * L);
        pens(S, [(qd, u, P) => { const a = at(qd); let v = heliQuiet(P); if (a.r === 0) { for (const x0 of xs) if (a.x > x0 && a.x < x0 + 46) v += 20; v += heliAct(P, 2); } return { v, d: true }; }]);
        const room = (0.8 * L) / Math.max(1, n - 1) * 2 - 30;
        sc.nodes.forEach((nd, i) => {
          const x = X0 + xs[i] + 23, lift = i % 2 ? 0 : 70;
          const sz = Math.min(44, K.clamp((44 * room) / Math.max(1, tw(nd, 44)), 30, 44)), w = tw(nd, sz), lx = K.clamp(x - w / 2, X0 - 20, W - 70 - w);
          const t1 = T0 + 0.25 + [0, 0.62, 1.12, 1.55, 1.9, 2.2][i % 6];
          hand(S, nd, lx, DY - 66 - lift, sz, t1, { color: i === n - 1 ? red : chalk });
          arrow(S, x, DY - 54 - lift, x, DY - 28, t1 + 0.35, { color: i === n - 1 ? red : chalk, lw: 3, bend: 0, dur: 0.2 });
        });
        tag(S, wrapW(sc.line, 54, 1100), X0, 230, 54, T0 + 2.0, { rot: -0.015 });
      } else if (sc.kind === "terminal") {
        pens(S, [(qd, u, P) => ({ v: heliQuiet(P) + heliAct(P, 1.5), d: true })]);
        const lines = ["$ " + sc.command, ...sc.output];
        const ty0 = 236, ts = lines.length > 7 ? 28 : 33;
        const te = typed(S, lines, X0, ty0, ts, T0 + 0.1, { cps: 46 });
        const iS = sc.output.findIndex((o) => /%/.test(o));
        if (iS >= 0) { const yy = ty0 + (iS + 1) * ts * 1.36 + 10; under(S, X0, X0 + tw(sc.output[iS], ts, CP), yy, te + 0.25, { color: red, lw: 5 }); }
        handBlock(S, sc.line, 880, 330, 56, 620, te + 0.6, { color: chalk });
        if (sc.data === "sample") stamp(S, T.sampleRun, 1160, 250, te + 0.2, { color: red, fam: CP, size: 30 });
      } else if (sc.kind === "items") {
        pens(S, [(qd, u, P) => { const a = at(qd); let v = heliQuiet(P); if (a.r === 0) v += heliAct(P, 9); return { v, d: true }; }]);
        const vw = Math.max(...sc.items.map((it) => it.value.length));
        const lines = sc.items.map((it) => it.value.padEnd(vw, " ") + "  " + it.label);
        const te = typed(S, lines, X0, 250, 34, T0 + 0.1, { cps: 40 });
        sc.items.forEach((it, i) => { if (it.alarm) under(S, X0, X0 + tw(lines[i], 34, CP), 250 + i * 34 * 1.36 + 10, te + 0.2, { color: red, lw: 5 }); });
        handBlock(S, sc.line, 880, 330, 56, 620, te + 0.5, { color: chalk });
        if (sc.data === "sample") stamp(S, T.sampleFigures, 1160, 250, te + 0.2, { color: red, fam: CP, size: 28 });
      } else if (sc.kind === "alert") {
        pens(S, [(qd, u, P) => { const a = at(qd); let v = heliQuiet(P); if (a.r === 0) v += quake(a.x, 420, 66, 260) + heliAct(P, 4); return { v, d: true }; }]);
        const ts = K.clamp((96 * 1300) / Math.max(1, tw(sc.title, 96)), 56, 96);
        const t1 = hand(S, sc.title, X0, 300, ts, T0 + 0.1, { color: red, dur: 0.6 });
        const t2 = hand(S, sc.body, X0 + 4, 370, 48, t1 + 0.1, { color: chalk });
        tag(S, [...wrapW(sc.line, 46, 900), ...wrapW(sc.line2, 46, 900)], X0 + 10, 410, 46, t2 + 0.3, { rot: 0.012 });
        arrow(S, X0 + 420, 330, X0 + 420, DY - 40, t1, { color: red, lw: 5, bend: 0 });
        if (sc.data === "sample") stamp(S, T.sample, 1240, 250, t1, { color: red, fam: CP, size: 34 });
      } else if (sc.kind === "stats") {
        pens(S, [(qd, u, P) => { const a = at(qd); let v = heliQuiet(P); if (a.r === 0) v += heliAct(P, 13) + quake(a.x, 300, 20, 300); return { v, d: true }; }]);
        // 수치 = 한 세션 줄 위에서 잰 길이
        const nums = sc.stats.map((st) => parseFloat(st.value.replace(/[^\d.]/g, "")) || 0);
        const mx = Math.max(1, ...nums);
        const ys = [DY - 40, DY - 170, DY - 268];
        let t = T0 + 0.2;
        sc.stats.slice(0, 3).forEach((st, i) => {
          const frac = K.clamp(st.unit === "%" && nums[i] <= 100 ? nums[i] / 100 : nums[i] / mx, 0.04, 1), x2 = X0 + frac * L;
          const col = i === 1 ? red : chalk;
          t = bracket(S, X0, x2, ys[i], t + (i ? 0.3 : 0), { color: col, lw: i ? 3.6 : 6, h: i ? 12 : 18, dur: 0.35 + frac * 0.6 });
          const vs = i ? 54 : 104, vt = unitJoin(st.value, st.unit);
          hand(S, vt, X0, ys[i] - 26, vs, t, { color: col, dur: 0.35 });
          hand(S, st.label, X0 + tw(vt, vs) + 16, ys[i] - 30, i ? 40 : 48, t + 0.3, { color: col });
        });
        tag(S, wrapW(sc.line, 50, 600), 860, 220, 50, t + 0.4, { rot: 0.02 });
        if (sc.data === "sample") typed(S, [T.sampleFigures], 872, 190, 24, t + 0.2, { cps: 40 });
        else if (sc.source) typed(S, [sc.source], 872, 190, 24, t + 0.2, { cps: 40 });
      } else if (sc.kind === "ending") {
        pens(S, [(qd, u, P) => { const a = at(qd); const v = heliQuiet(P) + (a.r === 0 ? heliAct(P, 5) : 0); return { v, d: qd <= 1 && !(a.r === 0 && a.x > 0.58 * L) }; }]);
        const nsz = K.clamp((180 * 1360) / Math.max(1, tw(sc.name, 180)), 80, 180);
        const e = hand(S, sc.name, X0 - 4, 380, nsz, T0 + 0.1, { color: chalk, dur: 0.95, rot: -0.018 });
        under(S, X0, X0 + tw(sc.name, nsz), 414, e + 0.05, { color: red, lw: 6 });
        tag(S, [...wrapW(sc.line, 44, 900), ...wrapW(sc.line2, 44, 900)], X0 + 10, 450, 44, e + 0.3, { rot: 0.012 });
        S.stop = true;
      }
    }

    // ===================== 원형 기록지 =====================
    const DC = { cx: 800, cy: 2300, R: 2160, A: (284 * PI) / 180, runA: (40 * PI) / 180, crawl: 0.0035 };
    const rv = (v: number) => 1880 + 1.9 * v;
    const discArm = (() => {
      const r0 = rv(50), tx = DC.cx + r0 * Math.cos(DC.A), ty = DC.cy + r0 * Math.sin(DC.A);
      let dx = -Math.sin(DC.A), dy = Math.cos(DC.A);
      if (dx < 0) { dx = -dx; dy = -dy; }
      const La = 560;
      return { px: tx + La * dx, py: ty + La * dy, La };
    })();
    const armPivot = (p: number): [number, number, number] => {
      const rotP = p * 0.03, c = Math.cos(rotP), s = Math.sin(rotP);
      return [DC.cx + (discArm.px - DC.cx) * c - (discArm.py - DC.cy) * s, DC.cy + (discArm.px - DC.cx) * s + (discArm.py - DC.cy) * c, rotP];
    };
    const discTip = (v: number, p = 0): [number, number] => {
      const r = rv(v);
      const [px, py, rotP] = armPivot(p);
      const ddx = px - DC.cx, ddy = py - DC.cy, d = Math.hypot(ddx, ddy);
      const a = (r * r - discArm.La * discArm.La + d * d) / (2 * d), h = Math.sqrt(Math.max(0, r * r - a * a));
      const bx = DC.cx + (a * ddx) / d, by = DC.cy + (a * ddy) / d;
      const c1: [number, number] = [bx - (h * ddy) / d, by + (h * ddx) / d], c2: [number, number] = [bx + (h * ddy) / d, by - (h * ddx) / d];
      const ref = [DC.cx + r * Math.cos(DC.A + rotP), DC.cy + r * Math.sin(DC.A + rotP)];
      return Math.hypot(c1[0] - ref[0], c1[1] - ref[1]) < Math.hypot(c2[0] - ref[0], c2[1] - ref[1]) ? c1 : c2;
    };
    const polar = (deg: number, r: number): [number, number] => [DC.cx + r * Math.cos((deg * PI) / 180), DC.cy + r * Math.sin((deg * PI) / 180)];
    const beat = (q: number) => { const ph = mod(q * 22, 1); const gs = (c: number, w: number, k: number) => k * Math.exp(-((ph - c) * (ph - c)) / (2 * w * w)); return gs(0.2, 0.04, 8) + gs(0.42, 0.016, 34) - gs(0.47, 0.016, 10) + gs(0.7, 0.06, 9); };
    function discScene(S: Scene, sc: FlatScene, T0: number) {
      const mk = PAL.marker, red = PAL.red;
      const Adeg = (DC.A * 180) / PI, Rdeg = (DC.runA * 180) / PI;
      const qa = (deg: number) => 1 - (Adeg - deg) / Rdeg; // 이 화면 각도에 잉크가 놓이게 되는 qd
      const inA = (qd: number, d0: number, d1: number) => qd <= 1 && qd >= qa(d0) && qd <= qa(d1);
      const busy = (qd: number, b = 62, amp = 12) => b + K.noise(qd * 40, seed + 5) * amp + K.noise(qd * 160, seed + 6) * amp * 0.6;
      /** 활 모양 띠 바로 안쪽에 띠를 따라 쓴 이름표. */
      const arcLab = (text: string, deg: number, r: number, size: number, t0: number, o: Opt = {}) => {
        const [x, y] = polar(deg, r); const w = tw(text, size); const a = ((deg + 90) * PI) / 180;
        return hand(S, text, x - (Math.cos(a) * w) / 2, y - (Math.sin(a) * w) / 2, size, t0, { ...o, rot: a });
      };
      const labSize = (texts: string[], span: number, max: number) => Math.min(max, ...texts.map((s) => K.clamp((max * span) / Math.max(1, tw(s, max)), 30, max)));
      if (sc.kind === "story") {
        pens(S, [(qd) => ({ v: busy(qd, 66, 16), d: true }), (qd) => ({ v: 6 + K.noise(qd * 20, seed + 9) * 1.5, d: true })]);
        const b = handBlock(S, sc.line, 250, 610, 58, 1100, T0 + 0.1, { color: mk });
        handBlock(S, sc.line2, 260, 610 + b.h + 64, 76, 1100, b.end + 0.45, { color: red });
      } else if (sc.kind === "flow" && flowIndex(S.si) % 2 === 0) {
        // 신호가 지나가는 길: 노드마다 무늬가 바뀌고, 마지막 노드는 두 번째 펜이 다시 또렷하게 그린다
        const n = sc.nodes.length, degs = sc.nodes.map((_, i) => (n === 1 ? 264 : 251 + (27 * i) / (n - 1)));
        const half = n === 1 ? 14 : 13.5 / (n - 1) + 1;
        pens(S, [
          (qd) => { let v = 46; for (let i = 0; i < n - 1; i++) if (inA(qd, degs[i] - half, degs[i] + half)) v = i % 2 ? 46 + K.noise(qd * 700, seed + 4) * 26 : 46 + beat(qd); return { v, d: true }; },
          (qd) => ({ v: inA(qd, degs[n - 1] - half, degs[n - 1] + half + 3) ? 6 + beat(qd) * 0.9 : 6, d: true }),
        ]);
        const ls = labSize(sc.nodes, (27 / Math.max(1, n - 1)) * 32 * 1.6, 50);
        sc.nodes.forEach((nd, i) => arcLab(nd, degs[i], 1815 - (n > 3 && i % 2 ? 60 : 0), ls, T0 + 0.25 + i * 0.5, { color: i === n - 1 ? red : mk }));
        handBlock(S, sc.line, 260, 660, 56, 1080, T0 + 0.6 + n * 0.5, { color: mk });
      } else if (sc.kind === "flow") {
        // 창이 차오르다 끝나고, 짧은 신호 하나, 새 창이 다시 오른다
        const n = sc.nodes.length, degs = sc.nodes.map((_, i) => (n === 1 ? 264 : 252 + (24.5 * i) / (n - 1)));
        const e0 = n > 1 ? (degs[0] + degs[1]) / 2 - 2 : 256, b0 = n > 1 ? degs[Math.min(1, n - 1)] : 264;
        pens(S, [
          (qd) => { if (qd > 1) return { v: 14 + 4 * (qd - 1), d: true }; let v; if (qd < qa(e0)) v = 30 + 62 * ramp(qd, 0, qa(e0)); else if (qd < qa(b0 - 2)) v = 4; else if (qd < qa(b0 + 2)) v = 4 + 40 * Math.sin(ramp(qd, qa(b0 - 2), qa(b0 + 2)) * PI); else v = 4 + 12 * ramp(qd, qa(b0 + 2), 1); return { v, d: true }; },
          () => ({ v: 6, d: true }),
        ]);
        const ls = labSize(sc.nodes, (24.5 / Math.max(1, n - 1)) * 32 * 1.7, 46);
        sc.nodes.forEach((nd, i) => arcLab(nd, degs[i], i % 2 ? 1760 : 1810, i === 1 ? ls * 1.25 : ls, T0 + 0.2 + i * 0.55, { color: i === 1 ? red : mk }));
        handBlock(S, sc.line, 260, 690, 54, 1080, T0 + 0.8 + n * 0.5, { color: mk });
      } else if (sc.kind === "alert") {
        // 일이 끝나 첫 펜이 쉬고, 두 번째 펜이 울린다
        pens(S, [
          (qd) => ({ v: qd < qa(263) ? busy(qd, 70, 12) : 18 + K.noise(qd * 30, seed + 8) * 1.2, d: true }),
          (qd) => { let v = 6; if (inA(qd, 265, 279)) { const a = (qd - qa(265)) / (qa(279) - qa(265)); v = 6 + 30 * Math.abs(Math.sin(a * PI * 7)) * Math.exp(-a * 1.6); } return { v, d: true }; },
        ]);
        const [cx, cy] = polar(271, 1900);
        const tsz = K.clamp((74 * 560) / Math.max(1, tw(sc.title, 74)), 46, 74);
        const t1 = hand(S, sc.title, 260, 600, tsz, T0 + 0.15, { color: mk, dur: 0.5 });
        const bw = tw(sc.title, tsz) + 30;
        const t2 = handBlock(S, sc.body, 270 + bw, 600, 52, 1340 - 270 - bw, t1 + 0.1, { color: mk }).end;
        circle(S, cx, cy, 170, 66, t2 + 0.15, { color: PAL.hi, lw: 6 });
        arcLab(T.ring, 271, 1800, 46, t2 + 0.5, { color: red });
        const b = handBlock(S, sc.line, 260, 700, 60, 1000, t2 + 0.7, { color: red });
        hand(S, sc.line2, 266, 700 + b.h + 16, 46, b.end + 0.3, { color: mk });
        if (sc.data === "sample") stamp(S, T.sample, 1150, 515, t1, { color: red, size: 44, rot: 0.09 });
      } else if (sc.kind === "items" || sc.kind === "stats") {
        const rows = sc.kind === "items" ? sc.items.map((it) => ({ v: it.value, l: it.label, hot: !!it.alarm })) : sc.stats.map((st) => ({ v: unitJoin(st.value, st.unit), l: st.label, hot: false }));
        const lead = pctOf(rows[0]?.v || "") ?? 23;
        pens(S, [(qd) => ({ v: K.clamp(lead, 4, 96) + K.noise(qd * 30, seed + 3) * 1.4, d: true }), (qd) => ({ v: 6 + (qd <= 1 && mod(qd * 14, 1) < 0.05 ? 10 : 0), d: true })]);
        const b = handBlock(S, sc.line, 250, 590, 48, 1000, T0 + 0.1, { color: mk });
        let t = b.end + 0.2;
        const per = Math.ceil(rows.length / 2);
        const vMax = Math.max(...rows.map((r) => tw(r.v, 56)));
        rows.forEach((it, i) => {
          const col = rows.length > 3 && i >= per ? 1 : 0, row = col ? i - per : i;
          const x = (col ? 850 : 260) + vMax, y = 590 + b.h + 30 + row * 64;
          t = hand(S, it.v, x, y, 56, t + (i ? 0.12 : 0), { color: i === 0 || it.hot ? red : mk, align: "right", dur: 0.3 });
          t = hand(S, it.l, x + 22, y, 44, t + 0.05, { color: mk });
        });
        const [ux, uy] = polar(262, rv(K.clamp(lead, 4, 96)));
        arrow(S, 330, 590 + b.h - 10, ux, uy + 28, t + 0.1, { color: red, bend: 30 });
        if (sc.data === "sample") stamp(S, T.sample, 1080, 530, T0 + 1.2, { color: red, size: 40, rot: -0.1 });
        else if (sc.source) print(S, [T.measured + sc.source], 1000, 840, 24, t + 0.2, { color: PAL.grid, fam: BC });
      } else if (sc.kind === "hook") {
        const hv = K.clamp(pctOf(sc.value) ?? 78, 8, 96);
        pens(S, [(qd) => ({ v: qd < qa(262) ? 24 + K.noise(qd * 40, seed + 5) * 3 : hv + K.noise(qd * 40, seed + 5) * 2, d: true }), () => ({ v: 6, d: true })]);
        hand(S, sc.label, 250, 600, 46, T0 + 0.05, { color: mk });
        const vs = K.clamp((150 * 600) / Math.max(1, tw(sc.value, 150)), 70, 150);
        const e = hand(S, sc.value, 246, 750, vs, T0 + 0.35, { color: sc.alarm ? red : mk, dur: 0.55, rot: -0.02 });
        const [cx, cy] = polar(263, rv(hv));
        circle(S, cx, cy, 120, 60, e + 0.1, { color: PAL.hi, lw: 6 });
        handBlock(S, sc.line, 300 + tw(sc.value, vs), 740, 52, 1340 - 300 - tw(sc.value, vs), e + 0.4, { color: red });
        if (sc.data === "sample") stamp(S, T.sample, 1150, 515, e + 0.2, { color: red, size: 44, rot: 0.08 });
      } else if (sc.kind === "terminal") {
        pens(S, [(qd) => ({ v: busy(qd, 40, 6), d: true }), () => ({ v: 6, d: true })]);
        const lines = ["$ " + sc.command, ...sc.output].slice(0, 7);
        const te = print(S, lines, 250, 590, 32, T0 + 0.1, { fam: BC, color: "#2a2a30", step: 0.16, lh: 1.3 });
        handBlock(S, sc.line, 920, 620, 50, 520, te + 0.4, { color: red });
        if (sc.data === "sample") stamp(S, T.sample, 1150, 515, te, { color: red, size: 40 });
      } else if (sc.kind === "ending") {
        pens(S, [(qd) => ({ v: 30 + K.noise(qd * 30, seed + 2) * 2, d: qd < 0.55 }), (qd) => ({ v: 6, d: qd < 0.5 })]);
        const ns = K.clamp((150 * 1000) / Math.max(1, tw(sc.name, 150)), 70, 150);
        const e = hand(S, sc.name, 250, 650, ns, T0 + 0.1, { color: mk, dur: 0.9, rot: -0.02 });
        under(S, 250, 262 + tw(sc.name, ns), 684, e + 0.05, { color: PAL.hi, lw: 9 });
        const b = handBlock(S, sc.line, 262, 768, 56, 1100, e + 0.35, { color: mk });
        handBlock(S, sc.line2, 266, 768 + b.h + 6, 42, 1100, b.end + 0.2, { color: red });
        S.stop = true;
      }
    }

    // ===================== 드럼 온습도계 =====================
    const DR = { cx: 700, Rd: 1000, Xp: 2060, La: 900, Yp: 460, crawl: 12, runD: 1120, top: 150, bot: 790 };
    const yv = (v: number) => 742 - v * 5.6;
    const drumTipX = (y: number, p: number) => DR.Xp + p * 18 - Math.sqrt(DR.La * DR.La - (y - DR.Yp) * (y - DR.Yp));
    const arcDx = (y: number) => DR.La - Math.sqrt(DR.La * DR.La - (y - DR.Yp) * (y - DR.Yp));
    const drumInks = [PAL.alarm, "#5b3a99", "#2d5fa8", "#2f6b52", PAL.hot];
    function drumScene(S: Scene, sc: FlatScene, T0: number) {
      const ink = PAL.ink;
      const fx = (qd: number) => drumTipX(yv(50), 0) - DR.runD * (1 - qd); // qd에 놓인 잉크가 결국 놓이는 x
      const qx = (x: number) => 1 - (drumTipX(yv(50), 0) - x) / DR.runD;
      const nz = (qd: number, i: number, a = 0.7) => K.noise(qd * 26 + i * 7, seed + 31) * a;
      if (sc.kind === "hook") {
        const hv = K.clamp(pctOf(sc.value) ?? 72, 8, 95);
        pens(S, [(qd) => ({ v: 47 + (hv - 47) * sm(ramp(qd, qx(640), qx(900))) + nz(qd, 0), d: true })]);
        const vs = K.clamp((200 * 760) / Math.max(1, tw(sc.value, 200)), 90, 200);
        hand(S, softCase(sc.label), 130, 236, 52, T0 + 0.05, { color: ink });
        const e = hand(S, sc.value, 120, 420, vs, T0 + 0.35, { color: sc.alarm ? PAL.alarm : ink, dur: 0.55, rot: -0.02 });
        arrow(S, 130 + tw(sc.value, vs) + 20, 330, 960, yv(hv) - 16, e + 0.1, { color: PAL.alarm, bend: -40 });
        handBlock(S, sc.line, 130, 640, 84, 900, e + 0.5, { color: ink });
        if (sc.data === "sample") stamp(S, T.sampleData, 760, 560, e + 0.9, { color: PAL.stamp, size: 34 });
      } else if (sc.kind === "items") {
        const raw = sc.items.map((it) => pctOf(it.value) ?? (parseFloat(it.value.replace(/[^\d.]/g, "")) || 0));
        const allPct = sc.items.every((it) => pctOf(it.value) != null), mx = Math.max(1, ...raw);
        const vals = raw.map((v) => K.clamp(allPct ? v : (v / mx) * 85, 3, 97));
        pens(S, vals.slice(0, 5).map((v, i) => (qd: number) => ({ v: v + nz(qd, i, 0.8), d: qd > 0.08 + [0, 0.17, 0.27, 0.4, 0.46][i % 5] })));
        handBlock(S, sc.line, 130, 220, 60, 1000, T0 + 0.1, { color: ink });
        const order = vals.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 6);
        const vw = Math.max(...sc.items.map((it) => tw(it.value, 56)));
        order.forEach(([, i], j) => {
          const it = sc.items[i], y = 320 + j * 74, t1 = T0 + 0.75 + j * 0.34 + (j > 1 ? 0.15 : 0);
          add({ kind: "swatch", S, x: 130, y: y - 14, w: 54, t0: t1, dur: 0.2, color: drumInks[i % 5] });
          hand(S, it.value, 210 + vw, y, it.alarm ? 56 : 46, t1 + 0.15, { color: it.alarm ? PAL.alarm : ink, align: "right", dur: 0.28 });
          hand(S, it.label, 230 + vw, y, it.alarm ? 56 : 46, t1 + 0.4, { color: it.alarm ? PAL.alarm : ink });
        });
        if (sc.data === "sample") stamp(S, T.sampleData, 300, 720, T0 + 2.6, { color: PAL.stamp, size: 30 });
      } else if (sc.kind === "flow") {
        // 읽은 값 하나가 단계를 하나씩 오른다 — 단계마다 그 자리에 이름을 쓴다
        const n = sc.nodes.length, xs = sc.nodes.map((_, i) => 560 + (i * 520) / Math.max(1, n - 1));
        const stepV = Math.min(20, 68 / Math.max(1, n - 1));
        pens(S, [up, up, up, up, (qd) => { const x = fx(qd); let s = 0; for (let i = 1; i < n; i++) s += sm(ramp(x, xs[i] - 70, xs[i] - 40)); return { v: 18 + s * stepV + nz(qd, 4, 0.4), d: true }; }]);
        handBlock(S, sc.line, 130, 220, 58, 1000, T0 + 0.1, { color: ink });
        sc.nodes.forEach((nd, i) => {
          const y = yv(18 + i * stepV) + 52, x = (i ? xs[i] - 40 : 300) - 6;
          const sz = Math.min(i === 1 ? 54 : 48, K.clamp((48 * 420) / Math.max(1, tw(nd, 48)), 30, 54));
          hand(S, nd, x, y, sz, T0 + 0.7 + [0, 0.6, 1.0, 1.35, 1.65, 1.9][i % 6], { color: i === 1 ? PAL.hot : ink, align: "right", wt: i === 1 ? 700 : 400 });
        });
      } else if (sc.kind === "alert") {
        const fog = 72;
        pens(S, [(qd) => ({ v: 58 + (fog - 1.5 - 58) * sm(ramp(qd, 0.2, 0.85)) + nz(qd, 0, 0.6), d: true })]);
        const t0 = dash(S, 120, 1130, yv(fog), T0 + 0.1, { color: PAL.alarm });
        hand(S, T.alertLine, 130, yv(fog) - 14, 38, t0, { color: PAL.alarm });
        const tsz = K.clamp((66 * 1000) / Math.max(1, tw(sc.title, 66, HAND, 700)), 44, 66);
        const t1 = hand(S, sc.title, 130, 210, tsz, t0 + 0.45, { color: PAL.alarm, wt: 700 });
        const t2 = handBlock(S, sc.body, 140, 270, 46, 1000, t1 + 0.1, { color: ink }).end;
        circle(S, 1020, yv(fog - 1), 92, 44, t2 + 0.15, { color: PAL.alarm });
        const b = handBlock(S, sc.line + " " + sc.line2, 130, 560, 62, 860, t2 + 0.5, { color: ink });
        if (sc.data === "sample") stamp(S, T.sampleAlert, 900, 690, b.end - 0.6, { color: PAL.stamp, size: 30 });
      } else if (sc.kind === "stats") {
        // 1분에 한 번 재는 기계: 펜이 선 대신 점을 찍는다
        const DV = 30;
        pens(S, [up, (qd, u, P) => ({ v: DV + nz(qd, 1, 1.2), d: qd > 1 ? true : mod(P, 15) < 3 })]);
        handBlock(S, sc.line, 130, 230, 66, 1000, T0 + 0.1, { color: ink });
        let t = T0 + 0.7;
        sc.stats.slice(0, 4).forEach((st, i) => {
          const y = 360 + i * 116, big = i === 0;
          t = hand(S, st.value, 330, y + 10, big ? 112 : 92, t + (i ? 0.2 : 0), { color: ink, align: "right", dur: 0.35, wt: 700 });
          t = hand(S, st.unit + "  " + (KO ? st.label : st.label.toLowerCase()), 350, y, 48, t + 0.05, { color: ink });
        });
        const pdx = drumTipX(yv(DV), 1);
        arrow(S, pdx - 330, yv(DV) + 70, pdx - 250, yv(DV) + 14, t + 0.15, { color: PAL.hot, bend: 18 });
        hand(S, T.dot, pdx - 560, yv(DV) + 96, 42, t + 0.2, { color: PAL.hot });
        if (sc.source) print(S, [T.measured + sc.source], 130, 760, 24, t + 0.4, { color: PAL.grid, fam: PX });
        else if (sc.data === "sample") stamp(S, T.sampleData, 760, 700, t, { color: PAL.stamp, size: 30 });
      } else if (sc.kind === "story") {
        pens(S, [(qd) => ({ v: 40 + K.noise(qd * 6, seed + 7) * 12 + nz(qd, 0, 1.2), d: true })]);
        const b = handBlock(S, sc.line, 130, 260, 76, 1000, T0 + 0.1, { color: ink });
        handBlock(S, sc.line2, 136, 260 + b.h + 50, 62, 1000, b.end + 0.4, { color: PAL.hot });
      } else if (sc.kind === "terminal") {
        pens(S, [(qd) => ({ v: 34 + nz(qd, 0, 0.8), d: true })]);
        const lines = ["$ " + sc.command, ...sc.output].slice(0, 8);
        const te = print(S, lines, 130, 230, 30, T0 + 0.1, { fam: PX, color: "#1f2d52", step: 0.15, lh: 1.45 });
        handBlock(S, sc.line, 130, 230 + lines.length * 44 + 70, 60, 1000, te + 0.4, { color: ink });
        if (sc.data === "sample") stamp(S, T.sampleData, 900, 260, te, { color: PAL.stamp, size: 30 });
      } else if (sc.kind === "ending") {
        pens(S, [(qd) => ({ v: 60 + nz(qd, 0), d: qd < 0.6 }), (qd) => ({ v: 52, d: qd < 0.5 })]);
        const nm = titleCase(sc.name);
        const lines = wrapW(nm, 150, 980);
        let t = T0 + 0.1;
        lines.slice(0, 3).forEach((ln, i) => { t = hand(S, ln, 124, 330 + i * 150, 150, t, { color: ink, dur: 0.75, wt: 700 }); });
        handBlock(S, sc.line + " " + sc.line2, 132, 330 + Math.min(3, lines.length) * 150 + 10, 64, 1100, t + 0.3, { color: PAL.hot });
        S.stop = true;
      }
    }

    work.scenes.forEach((sc, si) => {
      // 헬리코더: 먼저 종이를 새 그을음까지 넘기고(0.7초, 바늘 듦), 모터가 한 줄을 그린다
      const runAt = si === 0 ? RUN0 : kind === "heli" ? 0.7 : 0;
      const T0 = runAt + FF * (si === 0 ? 1 : kind === "heli" ? 0.55 : 0.8);
      const S: Scene = { sc, si, runAt, T0, pen: [], runD: 1, at: 0, len: 0 };
      if (kind === "heli") heliScene(S, sc, T0); else if (kind === "disc") discScene(S, sc, T0); else drumScene(S, sc, T0);
      if (!S.pen.length) pens(S, []);
      scenes.push(S);
    });

    // ---------------- 시간표 ----------------
    const endOf = (n: Note) => n.t0 + (n.dur || 0.3);
    const holdOf = (S: Scene, i: number) => (i === scenes.length - 1 ? (kind === "disc" ? 3.2 : 2.5) : i === 0 ? 1.7 : /stats|terminal|items/.test(S.sc.kind) ? 1.25 : 0.95);
    const cap = 29.6;
    const plan = (f: number) => scenes.map((S, i) => {
      const rel = notes.filter((n) => n.S === S).reduce((m, n) => Math.max(m, endOf(n) - S.T0), 0) * f;
      return Math.max(S.T0 + rel + holdOf(S, i), i ? S.runAt + FF + 2.4 : 3.7);
    });
    let f = 1;
    for (let k = 0; k < 40; k++) { if (plan(f).reduce((a, b) => a + b, 0) + 0.4 <= cap) break; f *= 0.975; }
    f = Math.max(f, KO ? 0.5 : 0.44);
    for (const n of notes) {
      const T0s = n.S.T0;
      if (n.t0 >= T0s) n.t0 = T0s + (n.t0 - T0s) * f;
      n.dur *= f;
      if (n.kind === "print") n.step *= f;
      if (n.kind === "type") n.cps /= f;
    }
    const lens = plan(1);
    let acc = 0;
    scenes.forEach((S, i) => { S.len = lens[i]; S.at = acc; acc += S.len; });
    scenes[scenes.length - 1].len += 0.4;
    const duration = acc + 0.4;
    // tw = 손이 쓰는 때, ta = 그 메모가 속한 종이 자리(그 장면 모터가 멈춘 때)
    for (const n of notes) { n.tw = n.S.at + n.t0; n.ta = Math.max(n.tw, n.S.at + n.S.runAt + FF); }
    const starts = scenes.map((S) => S.at);

    // ---------------- 종이 움직임 P(t) ----------------
    const T_START = kind === "heli" ? RUN0 - 0.5 : -7;
    const crawl = kind === "heli" ? HL.crawl : kind === "disc" ? DC.crawl : DR.crawl;
    const runs = scenes.map((S) => ({ t0: S.at + S.runAt, d: kind === "disc" ? DC.runA : DR.runD }));
    if (kind === "heli") {
      // 모터는 기어가던 줄을 마저 채우고 데이터 한 줄을 그린다 — 늘 줄 경계에서 멈춘다
      let Pacc = 0, lastT = T_START;
      runs.forEach((r, i) => {
        Pacc += crawl * (r.t0 - lastT);
        const end = (Math.ceil(Pacc / HL.L + 0.02) + 1) * HL.L;
        scenes[i].runD = end - Pacc;
        r.d = end - Pacc - crawl * FF;
        Pacc = end; lastT = r.t0 + FF;
      });
    } else scenes.forEach((S, i) => { S.runD = runs[i].d; });
    const stopAt = scenes[scenes.length - 1].stop ? scenes[scenes.length - 1].at + FF + 1.4 : 1e9;
    const speedAt = (t: number) => {
      let v = crawl;
      for (const r of runs) { const u = (t - r.t0) / FF; if (u >= 0 && u < 1) v += (r.d / FF) * 2 * Math.pow(Math.sin(PI * u), 2); }
      if (t > stopAt) v *= Math.max(0, 1 - (t - stopAt) / 0.8);
      return v;
    };
    const DT = 1 / 240;
    const NPOS = Math.ceil((duration - T_START + 1) / DT);
    const Ptab = new Float64Array(NPOS + 1);
    for (let i = 1; i <= NPOS; i++) Ptab[i] = Ptab[i - 1] + speedAt(T_START + (i - 0.5) * DT) * DT;
    const P = (t: number) => { const x = (t - T_START) / DT; const i = Math.max(0, Math.min(NPOS - 1, Math.floor(x))); return Ptab[i] + (Ptab[i + 1] - Ptab[i]) * K.clamp(x - i, 0, 1); };
    // 헬리코더: 장면마다 빈 줄을 건너뛴다(바늘 든 채) — 새 장면은 새 그을음 위에서
    const SKIP = 7 * HL.RH, skipE = K.ease.bezier(0.35, 0, 0.15, 1);
    const skipAt = (t: number) => { if (kind !== "heli") return 0; let s = 0; for (let i = 1; i < scenes.length; i++) s += SKIP * skipE(K.clamp((t - scenes[i].at) / 0.95)); return s; };
    const scrollOf = (t: number) => (P(t) / HL.L) * HL.RH + skipAt(t);

    // ---------------- 펜: 흉내 내고, 잉크를 종이 좌표로 담아 둔다 ----------------
    const SR = kind === "heli" ? 480 : 120;
    const NS = Math.ceil((duration - T_START) * SR) + 2;
    const sceneAt = (t: number) => { let S = scenes[0]; for (const s of scenes) if (t >= s.at) S = s; return S; };
    const qdOf = (S: Scene, u: number) => {
      const ra = S.runAt;
      if (u < ra) return ((u - ra) * crawl) / S.runD;
      if (u < ra + FF) return D01((u - ra) / FF);
      return 1 + ((u - ra - FF) * crawl) / S.runD;
    };
    const tipOf = (v: number, p: number, Pt: number): [number, number] => {
      if (kind === "heli") return [HL.X0 + mod(Pt, HL.L), HL.BASE - v];
      if (kind === "disc") return discTip(v, p);
      const y = yv(v);
      return [drumTipX(y, p), y];
    };
    // 원판은 시계 반대로 돈다: 회전각 = -P
    const toLocal = (x: number, y: number, Pt: number, t: number): [number, number] => {
      if (kind === "heli") return [x, y + scrollOf(t)];
      if (kind === "disc") { const c = Math.cos(Pt), s = Math.sin(Pt), dx = x - DC.cx, dy = y - DC.cy; return [DC.cx + dx * c - dy * s, DC.cy + dx * s + dy * c]; }
      return [x + Pt, y];
    };
    const penData: Pen[] = [];
    const omega = { heli: 0, disc: 70, drum: 38 }[kind];
    for (let p = 0; p < NP; p++) {
      const LX = new Float32Array(NS), LY = new Float32Array(NS), Dn = new Uint8Array(NS), SP = new Float32Array(NS), PP = new Float64Array(NS);
      let y = 30, vy = 0, lastV = 30;
      for (let i = 0; i < NS; i++) {
        const t = T_START + i / SR;
        const S = sceneAt(t);
        const u = t - S.at, Pt = P(t);
        const out = S.pen[p](qdOf(S, u), u, Pt);
        const target = out.v == null ? lastV : out.v;
        lastV = target;
        if (omega) { const z = 0.72; for (let k = 0; k < 4; k++) { const a = omega * omega * (target - y) - 2 * z * omega * vy; vy += a / (SR * 4); y += vy / (SR * 4); } }
        else { vy = (target - y) * SR; y = target; }
        const [x0, y0] = tipOf(y, p, Pt);
        const [lx, ly] = toLocal(x0, y0, Pt, t);
        LX[i] = lx; LY[i] = ly; Dn[i] = out.d ? 1 : 0; PP[i] = Pt;
        SP[i] = Math.abs(vy) + speedAt(t) * (kind === "disc" ? 1900 : 1);
        if (kind === "heli" && S.si > 0 && u < S.runAt) Dn[i] = 0;
      }
      const ink = kind === "heli" ? PAL.scratch : kind === "disc" ? [PAL.ink1, PAL.ink2][p] : drumInks[p];
      penData.push({ LX, LY, Dn, SP, PP, ink });
    }
    const idxAt = (t: number) => Math.max(0, Math.min(NS - 1, Math.floor((t - T_START) * SR)));

    // 헬리코더: 영상 전에 기록된 줄들(조용하고, 가끔 사건)
    const hist: number[][] = [];
    if (kind === "heli") {
      let sg: number[] = [];
      for (let Pp = -13 * HL.L; Pp <= 0; Pp += 2.5) {
        const x = HL.X0 + mod(Pp, HL.L);
        if (sg.length && x < sg[sg.length - 2]) { hist.push(sg); sg = []; }
        const row = Math.floor(Pp / HL.L), xr = mod(Pp, HL.L);
        let v = heliQuiet(Pp);
        if (rnd(row, 50) < 0.55) v += quake(xr, 200 + rnd(row, 51) * 900, 8 + rnd(row, 52) * 26, 60 + rnd(row, 53) * 140);
        v += heliAct(Pp, 1 + rnd(row, 54) * 4);
        sg.push(x, HL.BASE - v + (Pp / HL.L) * HL.RH);
      }
      if (sg.length) hist.push(sg);
    }

    // ---------------- 미리 그려 두는 종이 ----------------
    let soot: HTMLCanvasElement | null = null, drumTile: HTMLCanvasElement | null = null;
    const DTILE = 1152; // 드럼 기록지: 하루 = 1152px(시간당 48px)
    const SH = 2400;
    if (kind === "heli") {
      // 그을음: 고르지 않은 연기(¼ 해상도 2옥타브 노이즈를 키움) + 섬유 티
      const lw = 400, lh = SH / 4;
      soot = mkc(W, SH);
      const x = soot.getContext("2d")!;
      x.fillStyle = PAL.soot; x.fillRect(0, 0, W, SH);
      const lo = mkc(lw, lh), lx = lo.getContext("2d")!, im = lx.createImageData(lw, lh);
      // 값 노이즈: 격자 꼭짓점 난수는 한 번만 뽑아 둔다
      const lattice = (s0: number, nx: number, ny: number) => { const a = new Float32Array((nx + 2) * (ny + 2)); for (let j = 0; j < ny + 2; j++) for (let i = 0; i < nx + 2; i++) a[j * (nx + 2) + i] = K.rand(s0, i, j); return { a, nx }; };
      const LA = lattice(seed + 61, Math.ceil(lw / 38), Math.ceil(lh / 22)), LB = lattice(seed + 62, Math.ceil(lw / 9), Math.ceil(lh / 6));
      const n2 = (u: number, v: number, L: { a: Float32Array; nx: number }) => { const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv), st = L.nx + 2; const a = L.a[j * st + i], b = L.a[j * st + i + 1], c = L.a[(j + 1) * st + i], d = L.a[(j + 1) * st + i + 1]; return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv; };
      for (let j = 0; j < lh; j++) for (let i = 0; i < lw; i++) {
        const v = n2(i / 38, j / 22, LA) * 0.65 + n2(i / 9, j / 6, LB) * 0.35;
        const k = (j * lw + i) * 4;
        im.data[k] = 78; im.data[k + 1] = 66; im.data[k + 2] = 54; im.data[k + 3] = Math.max(0, v - 0.35) * 150;
      }
      lx.putImageData(im, 0, 0);
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high"; x.drawImage(lo, 0, 0, W, SH);
      const r = K.rng(seed + 5);
      for (let i = 0; i < 9000; i++) { x.fillStyle = r() < 0.6 ? "rgba(0,0,0,0.4)" : "rgba(255,240,220,0.06)"; x.fillRect(r() * W, r() * SH, 1 + r() * 2, 1); }
      for (let i = 0; i < 120; i++) { x.fillStyle = "rgba(255,245,235,0.03)"; x.fillRect(0, r() * SH, W, 1); }
    }
    if (kind === "drum") {
      drumTile = mkc(DTILE, H);
      const x = drumTile.getContext("2d")!;
      x.fillStyle = PAL.paper; x.fillRect(0, 0, DTILE, H);
      const r = K.rng(seed + 9);
      for (let i = 0; i < 2400; i++) { x.fillStyle = "rgba(120,130,150,0.06)"; x.fillRect(r() * DTILE, DR.top + r() * (DR.bot - DR.top), 1 + r() * 3, 1); }
      for (let v = 0; v <= 100; v += 2) {
        x.strokeStyle = v % 10 ? PAL.gridMinor : PAL.grid; x.lineWidth = v % 10 ? 0.8 : 1.3;
        x.beginPath(); x.moveTo(0, yv(v)); x.lineTo(DTILE, yv(v)); x.stroke();
      }
      // 시간선은 호다: 펜 팔이 휘두르니 매시간이 팔의 호
      for (let hh = 0; hh < 24; hh++) {
        for (const half of [0, 1]) {
          const c = hh * 48 + half * 24;
          x.strokeStyle = half ? PAL.gridMinor : PAL.grid; x.lineWidth = half ? 0.7 : hh % 6 === 0 ? 2 : 1.1;
          x.beginPath();
          for (let y = yv(100); y <= yv(0) + 0.1; y += 8) { const xx = c + arcDx(y); if (y === yv(100)) x.moveTo(xx, y); else x.lineTo(xx, y); }
          x.stroke();
        }
        x.fillStyle = PAL.grid; x.font = K.font(15, PX, 400); x.textAlign = "center";
        if (hh % 2 === 0) x.fillText(String(hh), hh * 48 + arcDx(yv(100) - 14), yv(100) - 12);
      }
      x.font = K.font(15, PX, 400); x.textAlign = "left";
      for (let v = 10; v <= 100; v += 10) for (const c of [6 * 48, 18 * 48]) x.fillText(String(v), c + arcDx(yv(v)) + 4, yv(v) - 4);
      x.font = K.font(14, PX, 600); x.fillText(T.pct, 12 * 48 + arcDx(yv(96)) + 6, yv(96) + 16);
    }

    // ---------------- 그리기 ----------------
    const strokeNote = (g: CanvasRenderingContext2D, n: Note) => { g.strokeStyle = n.color; g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = n.lw; };
    const wob = (g: CanvasRenderingContext2D, pts: [number, number][]) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
    const defaultInk = kind === "heli" ? PAL.chalk : kind === "disc" ? PAL.marker : PAL.ink;
    for (const n of notes) if (!n.color) n.color = defaultInk;
    function drawNote(g: CanvasRenderingContext2D, n: Note, t: number) {
      const tq = K.step(t, 12);
      if (tq < n.tw) return;
      const p = K.clamp((tq - n.tw) / (n.dur || 0.3));
      g.save();
      g.fillStyle = n.color;
      if (n.kind === "hand") {
        if (n.tagRot) { g.translate(n.ox, n.oy); g.rotate(n.tagRot); g.translate(-n.ox, -n.oy); }
        g.translate(n.x, n.y); g.rotate(n.rot);
        const w = (n.w = n.w || tw(n.text, n.size, HAND, n.wt));
        g.beginPath();
        if (n.align === "right") g.rect(-w - 6, -n.size * 1.4, w * p + 12, n.size * 2.1); else g.rect(-6, -n.size * 1.4, w * p + 12, n.size * 2.1);
        g.clip();
        g.font = K.font(n.size * HS, HAND, n.wt);
        g.textAlign = "left"; g.textBaseline = "alphabetic";
        const x0 = n.align === "right" ? -w : 0;
        g.fillText(n.text, x0, 0);
        if (kind === "drum" && n.wt >= 700) g.fillText(n.text, x0 + 0.7, 0);
      } else if (n.kind === "tag") {
        const k = K.ease.outCubic(K.clamp(K.step(t - n.tw, 12) / 0.25));
        g.translate(n.x, n.y); g.rotate(n.rot * (0.4 + 0.6 * k)); g.translate(0, (1 - k) * -18);
        g.globalAlpha = K.clamp(k * 3);
        g.fillStyle = "rgba(0,0,0,0.45)"; g.fillRect(6, 8, n.w, n.h);
        g.fillStyle = PAL.tag; g.fillRect(0, 0, n.w, n.h);
        g.fillStyle = "rgba(225,228,222,0.72)"; g.fillRect(n.w * 0.5 - 60, -14, 120, 30);
      } else if (n.kind === "type") {
        g.translate(n.x, n.y); g.rotate(n.rot);
        const lh = n.size * n.lh;
        g.font = K.font(n.size, CP, 400);
        let left = Math.floor((t - n.tw) * n.cps);
        // 테이프는 타자가 그 줄에 닿을 때 붙는다
        n.lines.forEach((l, i) => {
          const len = Array.from(l).length;
          if (left <= 0 && i > 0) { left -= len + 2; return; }
          g.fillStyle = PAL.tape; g.globalAlpha = 0.92;
          g.fillRect(-12, i * lh - n.size * 0.95, g.measureText(l).width + 24, lh * 0.98);
          g.globalAlpha = 1; g.fillStyle = "#1a1a1a";
          if (left > 0) g.fillText(Array.from(l).slice(0, left).join(""), 0, i * lh);
          left -= len + 2;
        });
      } else if (n.kind === "print") {
        g.font = K.font(n.size, n.fam, n.wt);
        const k = Math.floor((t - n.tw) / n.step) + 1;
        n.lines.slice(0, k).forEach((ln, i) => g.fillText(ln, n.x, n.y + i * n.size * n.lh));
      } else if (n.kind === "circle") {
        strokeNote(g, n);
        const a0 = -2.2 + rnd(n.seedk, 1) * 0.6, sweep = PI * 2 * 1.08 * p, pts: [number, number][] = [];
        for (let a = 0; a <= sweep; a += 0.05) { const r = 1 + 0.04 * Math.sin(a * 1.7 + n.seedk) + 0.05 * (a / (PI * 2)); pts.push([n.cx + Math.cos(a0 + a) * n.rx * r, n.cy + Math.sin(a0 + a) * n.ry * r]); }
        wob(g, pts);
      } else if (n.kind === "under") {
        strokeNote(g, n);
        const pts: [number, number][] = [];
        for (let q = 0; q <= p + 1e-6; q += 0.02) pts.push([n.x1 + (n.x2 - n.x1) * q, n.y + Math.sin(q * 5 + n.seedk) * 3 + q * 4]);
        wob(g, pts);
      } else if (n.kind === "arrow") {
        strokeNote(g, n);
        const x2 = n.x1 + (n.x2 - n.x1) * p, y2 = n.y1 + (n.y2 - n.y1) * p;
        const mx = (n.x1 + x2) / 2, my = (n.y1 + y2) / 2 + n.bend * p;
        g.beginPath(); g.moveTo(n.x1, n.y1); g.quadraticCurveTo(mx, my, x2, y2); g.stroke();
        if (p >= 1) { const a = Math.atan2(y2 - my, x2 - mx); g.beginPath(); g.moveTo(x2 - Math.cos(a - 0.5) * 18, y2 - Math.sin(a - 0.5) * 18); g.lineTo(x2, y2); g.lineTo(x2 - Math.cos(a + 0.5) * 18, y2 - Math.sin(a + 0.5) * 18); g.stroke(); }
      } else if (n.kind === "bracket") {
        strokeNote(g, n);
        const x2 = n.x1 + (n.x2 - n.x1) * p;
        g.beginPath(); g.moveTo(n.x1, n.y + n.h); g.lineTo(n.x1 + 2, n.y);
        for (let q = 0; q <= 1.001; q += 0.05) g.lineTo(n.x1 + (x2 - n.x1) * q, n.y + Math.sin(q * 7 + n.seedk) * 1.6);
        if (p >= 1) g.lineTo(x2 + 1, n.y + n.h);
        g.stroke();
      } else if (n.kind === "dash") {
        strokeNote(g, n);
        g.setLineDash([18, 12]);
        g.beginPath(); g.moveTo(n.x1, n.y); g.lineTo(n.x1 + (n.x2 - n.x1) * p, n.y + Math.sin(n.seedk) * 2 * p); g.stroke();
      } else if (n.kind === "swatch") {
        g.strokeStyle = n.color; g.lineWidth = 5; g.lineCap = "round";
        g.beginPath(); g.moveTo(n.x, n.y); g.lineTo(n.x + n.w * p, n.y + 2 * p); g.stroke();
      } else if (n.kind === "stamp") {
        const age = t - n.tw, s = age < 0.09 ? 1.1 - (age / 0.09) * 0.1 : 1;
        g.translate(n.x, n.y); g.rotate(n.rot); g.scale(s, s);
        g.font = K.font(n.size, n.fam, 700);
        const w = g.measureText(n.text).width;
        g.strokeStyle = n.color; g.globalAlpha = 0.8; g.lineWidth = 3.5;
        g.strokeRect(-14, -n.size * 1.1, w + 28, n.size * 1.55);
        g.fillText(n.text, 0, 0);
        g.globalCompositeOperation = "destination-out";
        for (let i = 0; i < 90; i++) { g.globalAlpha = 0.55; g.fillRect(rnd(n.seedk, i) * (w + 28) - 14, rnd(n.seedk, i + 99) * n.size * 1.55 - n.size * 1.1, 2 + rnd(i, 5) * 3, 2); }
      }
      g.restore();
    }

    // 잉크 선: 빠르면 가늘게, 머물면 번지게 — 굵기 셋
    let SX = new Float32Array(4096), SY = new Float32Array(4096), OK = new Uint8Array(4096);
    function traceRuns(g: CanvasRenderingContext2D, pd: Pen, i0: number, i1: number, xf: (x: number, y: number) => [number, number] | null, widths: [number, number, number, number][]) {
      const n = Math.max(0, i1 - i0 + 1);
      if (SX.length < n) { SX = new Float32Array(n * 2); SY = new Float32Array(n * 2); OK = new Uint8Array(n * 2); }
      for (let i = 0; i < n; i++) { const q = xf(pd.LX[i0 + i], pd.LY[i0 + i]); if (q) { SX[i] = q[0]; SY[i] = q[1]; OK[i] = 1; } else OK[i] = 0; }
      for (const [wmin, wmax, lw, al] of widths) {
        g.beginPath();
        let open = false;
        for (let j = 0; j < n - 1; j++) {
          const i = i0 + j;
          const ok = OK[j] && OK[j + 1] && pd.Dn[i] && pd.Dn[i + 1] && pd.SP[i] >= wmin && pd.SP[i] < wmax && Math.abs(SX[j + 1] - SX[j]) < 200;
          if (!ok) { open = false; continue; }
          if (!open) { g.moveTo(SX[j], SY[j]); open = true; }
          g.lineTo(SX[j + 1], SY[j + 1]);
        }
        g.strokeStyle = pd.ink; g.globalAlpha = al; g.lineWidth = lw; g.stroke();
      }
      g.globalAlpha = 1;
    }
    const lowerBound = (pd: Pen, i1: number, target: number) => { let a = 0, b = i1; while (a < b) { const m = (a + b) >> 1; if (pd.PP[m] < target) a = m + 1; else b = m; } return a; };

    function renderHeli(g: CanvasRenderingContext2D, t: number) {
      const Pt = P(t), sy = scrollOf(t);
      g.fillStyle = PAL.ground; g.fillRect(0, 0, W, H);
      const off = mod(sy, SH);
      g.drawImage(soot!, 0, -off); if (SH - off < H) g.drawImage(soot!, 0, SH - off);
      g.lineCap = "round"; g.lineJoin = "round";
      if (sy < 1400) {
        g.strokeStyle = PAL.scratch; g.globalAlpha = 0.7; g.lineWidth = 1.6;
        g.beginPath();
        for (const s of hist) for (let i = 0; i < s.length; i += 2) { const y = s[i + 1] - sy; if (i) g.lineTo(s[i], y); else g.moveTo(s[i], y); }
        g.stroke(); g.globalAlpha = 1;
      }
      const pd = penData[0], i1 = idxAt(t);
      traceRuns(g, pd, lowerBound(pd, i1, Pt - 4 * HL.L), i1, (x, y) => [x, y - sy], [[2600, 1e9, 1.4, 0.8], [0, 2600, 2.1, 0.95]]);
      for (const n of notes) {
        if (t < n.tw - 0.01) continue;
        const dy = -(sy - scrollOf(n.ta));
        if (dy < -1100) continue;
        g.save(); g.translate(0, dy); drawNote(g, n, t); g.restore();
      }
      // 레일 위 수레에 달린 바늘
      const ii = Math.min(NS - 1, i1);
      const tx = HL.X0 + mod(Pt, HL.L), ty = pd.LY[ii] - sy, lift = pd.Dn[ii] ? 0 : 10;
      g.fillStyle = "#2a2826"; g.fillRect(0, 846, W, 54);
      g.fillStyle = "#4a4743"; g.fillRect(0, 846, W, 5);
      g.fillStyle = "#6d6862"; g.fillRect(tx + 18, 822, 84, 34);
      g.strokeStyle = "#b9b4ab"; g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(tx + 60, 832); g.lineTo(tx + 3 + lift, ty + 4 - lift); g.stroke();
      g.fillStyle = "#d8d4cc"; g.beginPath(); g.arc(tx + 60, 832, 6, 0, 2 * PI); g.fill();
      const hp = K.seg(t, duration - 2.4, 2.4);
      if (hp > 0) K.handoff(g, hp, { ink: "#cfcac1", family: CP, size: 24, x: HL.X0, y: 882, handle: work.handle });
    }

    // 펜 팔의 호 = 인쇄된 모든 시간선의 모양
    const discGrid: [number, number][] = [];
    let gridInk = "", gridSoft = "", gridMid = "", gridText = "";
    if (kind === "disc") {
      for (let v = -5; v <= 101; v += 3) discGrid.push(discTip(v, 0));
      gridInk = K.mix(PAL.grid, PAL.paper, 0.05); gridSoft = K.mix(PAL.grid, PAL.paper, 0.6); gridMid = K.mix(PAL.grid, PAL.paper, 0.3); gridText = K.mix(PAL.grid, "#000000", 0.28);
    }
    const HOURS = ["12", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];
    const chartTitle = T.chart + " · " + work.title;
    function drawDiscPaper(g: CanvasRenderingContext2D) {
      for (let v = 0; v <= 100; v += 10) {
        g.strokeStyle = v % 50 ? gridSoft : gridMid; g.lineWidth = v % 50 ? 1.2 : 2;
        g.beginPath(); g.arc(DC.cx, DC.cy, rv(v), 0, 2 * PI); g.stroke();
      }
      g.strokeStyle = K.mix(PAL.grid, PAL.paper, 0.86); g.lineWidth = 1;
      for (let r = 500; r < 1860; r += 110) { g.beginPath(); g.arc(DC.cx, DC.cy, r, 0, 2 * PI); g.stroke(); }
      // 12시간 = 360°: 5°(10분)마다 호, 한 시간마다 굵게
      for (let k = 0; k < 72; k++) {
        const phi = (k / 72) * 2 * PI, c = Math.cos(phi), s = Math.sin(phi);
        g.strokeStyle = k % 6 ? gridSoft : gridInk; g.lineWidth = k % 6 ? 1.1 : 2.6;
        g.beginPath();
        discGrid.forEach(([x, y], i) => { const dx = x - DC.cx, dy = y - DC.cy; const X = DC.cx + dx * c - dy * s, Y = DC.cy + dx * s + dy * c; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); });
        g.stroke();
        if (k % 6 === 0) {
          const [ex, ey] = discGrid[discGrid.length - 1];
          const a = Math.atan2(ey - DC.cy, ex - DC.cx) + phi;
          g.save(); g.translate(DC.cx + Math.cos(a) * (DC.R - 34), DC.cy + Math.sin(a) * (DC.R - 34)); g.rotate(a + PI / 2);
          g.fillStyle = gridText; g.font = K.font(40, BC, 700); g.textAlign = "center";
          g.fillText(HOURS[(k / 6) % 12], 0, 12);
          g.restore();
        }
      }
      g.fillStyle = gridText; g.font = K.font(22, BC, 500); g.textAlign = "center";
      for (let q = 0; q < 4; q++) {
        const phi = (q / 4) * 2 * PI + (3 / 72) * 2 * PI, c = Math.cos(phi), sn = Math.sin(phi);
        for (let v = 20; v <= 100; v += 20) {
          const [x0, y0] = discTip(v, 0), dx = x0 - DC.cx, dy = y0 - DC.cy;
          const X = DC.cx + dx * c - dy * sn, Y = DC.cy + dx * sn + dy * c, a = Math.atan2(Y - DC.cy, X - DC.cx);
          g.save(); g.translate(X, Y); g.rotate(a + PI / 2); g.fillText(String(v), 0, -5); g.restore();
        }
      }
      g.font = K.font(64, BC, 700); g.textAlign = "center";
      g.fillText(chartTitle, DC.cx, DC.cy - 300);
    }
    const camPB = K.ease.bezier(0.32, 0, 0.12, 1);
    function renderDisc(g: CanvasRenderingContext2D, t: number) {
      g.fillStyle = PAL.ground; g.fillRect(0, 0, W, H);
      const Pt = P(t), i1 = idxAt(t);
      // 끝: 카메라가 물러나 원판 하나 = 기록 전체가 보인다
      const e = camPB(K.clamp((t - (duration - 3.3)) / 2.4));
      const s1 = 860 / (2 * DC.R + 40);
      const s = K.lerp(1, s1, e), ox = K.lerp(0, 800 - s1 * DC.cx, e), oy = K.lerp(0, 450 - s1 * DC.cy, e);
      g.save(); g.translate(ox, oy); g.scale(s, s);
      g.fillStyle = "rgba(0,0,0,0.55)"; g.beginPath(); g.arc(DC.cx + 12, DC.cy + 18, DC.R, 0, 2 * PI); g.fill();
      g.fillStyle = PAL.paper; g.beginPath(); g.arc(DC.cx, DC.cy, DC.R, 0, 2 * PI); g.fill();
      g.save();
      g.translate(DC.cx, DC.cy); g.rotate(-Pt); g.translate(-DC.cx, -DC.cy);
      drawDiscPaper(g);
      g.lineCap = "round"; g.lineJoin = "round";
      for (const pd of penData) traceRuns(g, pd, 0, i1, (x, y) => [x, y], [[900, 1e9, 2.2, 0.9], [0, 900, 3.2, 1]]);
      g.restore();
      for (const n of notes) {
        if (t < n.tw - 0.01) continue;
        g.save(); g.translate(DC.cx, DC.cy); g.rotate(-(Pt - P(n.ta))); g.translate(-DC.cx, -DC.cy); drawNote(g, n, t); g.restore();
      }
      g.fillStyle = "#2b2c2f"; g.beginPath(); g.arc(DC.cx, DC.cy, 120, 0, 2 * PI); g.fill();
      g.fillStyle = "#8d9095"; g.beginPath(); g.arc(DC.cx, DC.cy, 80, 0, 2 * PI); g.fill();
      const ii = Math.min(NS - 1, i1);
      penData.forEach((pd, p) => {
        const c = Math.cos(-Pt), sn = Math.sin(-Pt), dx = pd.LX[ii] - DC.cx, dy = pd.LY[ii] - DC.cy;
        const x = DC.cx + dx * c - dy * sn, y = DC.cy + dx * sn + dy * c;
        const [px, py] = armPivot(p);
        const lift = pd.Dn[ii] ? 0 : 1;
        g.strokeStyle = p ? "#9ea3a9" : "#c4c8cd"; g.lineWidth = 6; g.lineCap = "round";
        g.beginPath(); g.moveTo(px, py); g.lineTo(x + lift * 8, y - lift * 12); g.stroke();
        g.fillStyle = pd.ink; g.beginPath(); g.moveTo(x + lift * 8, y - lift * 12); g.lineTo(x + 22 + lift * 8, y - 8 - lift * 12); g.lineTo(x + 18 + lift * 8, y + 12 - lift * 12); g.closePath(); g.fill();
      });
      g.restore();
      const hp = K.seg(t, duration - 2.4, 2.4);
      if (hp > 0) K.handoff(g, hp, { ink: "#ecebe6", family: HAND, size: 34, x: 72, y: 852, handle: work.handle });
    }

    const warp = (xf: number) => DR.cx + DR.Rd * Math.sin((xf - DR.cx) / DR.Rd);
    const kxOf = (xf: number) => Math.cos((xf - DR.cx) / DR.Rd);
    const drumMinX = DR.cx - DR.Rd * Math.asin(0.72), drumMaxX = DR.cx + DR.Rd * Math.asin(0.95);
    function renderDrum(g: CanvasRenderingContext2D, t: number) {
      const Pt = P(t);
      g.fillStyle = PAL.ground; g.fillRect(0, 0, W, H);
      // 드럼 위의 종이 — 세로 조각으로(원통 원근)
      const SL = 56;
      for (let xf = drumMinX - SL; xf < drumMaxX + SL; xf += SL) {
        const sx0 = warp(xf), sx1 = warp(xf + SL);
        const src = mod(xf + Pt, DTILE);
        const w1 = Math.min(SL, DTILE - src);
        g.drawImage(drumTile!, src, DR.top, w1, DR.bot - DR.top, sx0, DR.top, (sx1 - sx0) * (w1 / SL) + 0.6, DR.bot - DR.top);
        if (w1 < SL) g.drawImage(drumTile!, 0, DR.top, SL - w1, DR.bot - DR.top, sx0 + (sx1 - sx0) * (w1 / SL), DR.top, (sx1 - sx0) * ((SL - w1) / SL) + 0.6, DR.bot - DR.top);
      }
      // 기록지 윗띠에 찍힌 요일
      g.fillStyle = PAL.grid; g.font = K.font(22, PX, 600); g.textAlign = "center";
      const d0 = Math.floor((Pt + drumMinX) / DTILE) - 1;
      for (let d = d0; d < d0 + 4; d++) {
        const xf = d * DTILE + 12 * 48 - Pt;
        if (xf < drumMinX || xf > drumMaxX) continue;
        g.save(); g.translate(warp(xf), DR.top + 26); g.scale(kxOf(xf), 1); g.fillText(T.days[mod(d + 2, 7)], 0, 0); g.restore();
      }
      g.lineCap = "round"; g.lineJoin = "round";
      const i1 = idxAt(t);
      for (const pd of penData) traceRuns(g, pd, lowerBound(pd, i1, Pt + drumMinX - 2200), i1, (x, y) => { const xf = x - Pt; return xf < drumMinX ? null : [warp(xf), y]; }, [[180, 1e9, 1.4, 0.85], [20, 180, 2.1, 0.95], [0, 20, 3, 1]]);
      // 메모도 드럼을 따라 돈다 — 제 가운데를 기준으로 휘고, 가운데가 가장자리를 넘으면 사라진다
      for (const n of notes) {
        if (t < n.tw - 0.01) continue;
        const dx = -(Pt - P(n.ta));
        let c0: number;
        if (n.kind === "hand") { const w = n.w || (n.w = tw(n.text, n.size, HAND, n.wt)); c0 = n.align === "right" ? n.x - w / 2 : n.x + w / 2; }
        else if (n.kind === "print") c0 = n.x + 200;
        else if (n.kind === "circle") c0 = n.cx;
        else if (n.kind === "under" || n.kind === "arrow" || n.kind === "bracket" || n.kind === "dash") c0 = (n.x1 + n.x2) / 2;
        else c0 = n.x;
        const ax = c0 + dx;
        if (ax < drumMinX + 20) continue;
        g.save(); g.translate(warp(ax), 0); g.scale(kxOf(ax), 1); g.translate(-c0, 0);
        drawNote(g, n, t);
        g.restore();
      }
      // 원통 그늘(꾸밈이 아니라 형태): 양쪽 가장자리로 갈수록 계단처럼 어두워진다
      for (let xf = drumMinX; xf < drumMaxX; xf += SL) {
        const a = Math.abs((xf + SL / 2 - DR.cx) / DR.Rd);
        const sh = Math.pow(a, 2) * 0.42;
        if (sh < 0.01) continue;
        g.fillStyle = "rgba(20,24,30," + sh.toFixed(3) + ")";
        g.fillRect(warp(xf), DR.top, warp(xf + SL) - warp(xf) + 0.6, DR.bot - DR.top);
      }
      g.fillStyle = "#3a3f3a"; g.fillRect(0, DR.top - 22, W, 22); g.fillRect(0, DR.bot, W, 16);
      g.fillStyle = "#596059"; g.fillRect(0, DR.top - 22, W, 4); g.fillRect(0, DR.bot, W, 3);
      g.fillStyle = PAL.brass; g.fillRect(0, 846, W, 54);
      g.fillStyle = "#8d6f39"; g.fillRect(0, 846, W, 4);
      const ii = Math.min(NS - 1, i1);
      penData.forEach((pd, p) => {
        const y = pd.LY[ii], x = warp(pd.LX[ii] - Pt);
        const lift = pd.Dn[ii] ? 0 : 1;
        g.strokeStyle = p % 2 ? "#9aa0a3" : "#c9b27a"; g.lineWidth = 3;
        g.beginPath(); g.moveTo(x + 8, y - 6 - lift * 8); g.lineTo(W + 40, DR.Yp + (y - DR.Yp) * 0.82 - 30 + p * 12); g.stroke();
        g.fillStyle = pd.ink;
        g.beginPath(); g.moveTo(x, y - lift * 8); g.lineTo(x + 18, y - 10 - lift * 8); g.lineTo(x + 18, y + 8 - lift * 8); g.closePath(); g.fill();
      });
      const hp = K.seg(t, duration - 2.4, 2.4);
      if (hp > 0) K.handoff(g, hp, { ink: "#2c2414", family: PX, size: 26, x: 120, y: 884, handle: work.handle });
    }

    return {
      duration,
      starts,
      render(g, t) {
        if (kind === "heli") renderHeli(g, t); else if (kind === "disc") renderDisc(g, t); else renderDrum(g, t);
      },
    };
  },
};
