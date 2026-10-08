// 키네틱 타이포 — 글자만이 배우인 타이틀 시퀀스(필름 실험실 G35 v2, 2026-10-08).
// 세계의 규칙: 박자 격자 위에서만 바뀐다, 왼쪽 정렬, 극단적인 크기 대비, 폭 축이 있는 가변 글꼴(Anybody) 하나.
// v1이 온습도계에서만 통한 까닭: 그 작품의 글은 짧은 사물(68%, 방 이름, SENSORS → ESP32)이라 박자에 하나씩 꽂을 수 있었고,
// 띠(바)가 라벨처럼 읽혔다. 문장으로 된 작품은 반 박자마다 낱말 하나씩 잘리고 줄마다 폭이 달라 몸값 편지처럼 읽혔다.
// v2: 구절이 단위다(구절 경계에서만 끊고, 구절씩 쌓이며, 읽는 시간만큼 머문다) · 한 영상 안에서 역할마다 폭 하나 ·
// 작품마다 제 주제로 짠 글자 체계 —
//   측정 기기(하드웨어) → 라벨: v1의 녹아웃 띠 그대로(주인이 좋다고 한 것);
//   명령줄 도구 → 장부: 줄 친 장부 한 장, 낱말은 왼쪽·숫자는 오른쪽 정렬, 손실은 줄을 그어 지운다("얼마나 남았나");
//   생활 도구 → 두 장소: 화면이 맥(어두운 쪽, 집)과 폰(밝은 쪽, 밖)으로 나뉜다. 경계가 이야기가 있는 쪽으로 밀리고,
//   "암호화"가 경계를 건너고, 알림은 폰 쪽에 떨어져 떨고, 이름은 두 곳에 걸친다.
import type { FlatScene, Genre, GenreWork } from "./types";
import * as K from "./kit";

const W = K.W, H = K.H, M = 72;
const PAPER = "#f3f3f1", INK = "#0d0d0d";

const LABEL = {
  en: { sampleFigure: "sample figure", sampleFigures: "sample figures", sampleReadings: "sample readings", sampleAlert: "sample alert", sampleRun: "# sample run", source: "source  ", fnFigure: "* sample figure", fnFigures: "* sample figures" },
  ko: { sampleFigure: "예시 수치", sampleFigures: "예시 수치", sampleReadings: "예시 값", sampleAlert: "예시 알림", sampleRun: "# 예시 실행", source: "출처  ", fnFigure: "* 예시 수치", fnFigures: "* 예시 수치" },
};
type Lbl = (typeof LABEL)["en"];

const isWide = (c: string) => {
  const n = c.codePointAt(0) || 0;
  return (n >= 0x1100 && n <= 0x115f) || (n >= 0x2e80 && n <= 0xa4cf) || (n >= 0xac00 && n <= 0xd7a3) || (n >= 0xf900 && n <= 0xfaff) || (n >= 0xff00 && n <= 0xff60) || (n >= 0xffe0 && n <= 0xffe6) || n >= 0x1f300;
};
/** 읽는 길이(한글 1.7배). */
const readLen = (s: string) => Array.from(s).reduce((a, c) => a + (isWide(c) ? 1.7 : 1), 0);
/** 보이는 길이(한글은 라틴 글자 두 개쯤 폭). */
const vlen = (s: string) => Array.from(s).reduce((a, c) => a + (isWide(c) ? 1.8 : 1), 0);
const norm = (s: string) => String(s).replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
const up = (s: string) => norm(s).toUpperCase();

const STRETCH: [CanvasFontStretch, number][] = [["ultra-condensed", 0.5], ["extra-condensed", 0.625], ["condensed", 0.75], ["semi-condensed", 0.875], ["normal", 1], ["semi-expanded", 1.125], ["expanded", 1.25], ["extra-expanded", 1.5]];

type Sys = "bars" | "ledger" | "split";
/** 장면 구성으로 체계를 고른다(낱말이 아니라): 명령 출력 → 장부, %로 읽히는 측정 목록·센서 줄 → 라벨, 나머지 → 두 장소. */
function pickSys(work: GenreWork): Sys {
  const sc = work.scenes;
  if (sc.some((s) => s.kind === "terminal")) return "ledger";
  const pctItems = sc.some((s) => s.kind === "items" && s.items.length > 1 && s.items.every((it) => /^\s*[\d.,]+\s*(%|°[CF]?)\s*$/.test(it.value)));
  const sensor = sc.some((s) => s.kind === "flow" && s.nodes.some((n) => /esp32|arduino|pico|raspberry|sensor|board|센서|보드/i.test(n)));
  if (pctItems || sensor) return "bars";
  return "split";
}

/** 글자 도구 — 잴 캔버스는 make 안에서 만든다. */
function tools(FAM: string) {
  const mc = document.createElement("canvas").getContext("2d")!;
  const setK = (g: CanvasRenderingContext2D, size: number, weight = 800, stretch: CanvasFontStretch = "normal", fam = FAM) => {
    g.font = `normal ${weight} ${Math.round(size)}px ${fam}`;
    g.fontStretch = stretch;
    const tight = fam === FAM && !/condensed/.test(stretch) ? -0.012 * size : 0;
    g.letterSpacing = tight + "px";
  };
  const widthOf = (txt: string, size: number, weight: number, stretch: CanvasFontStretch, fam = FAM) => { setK(mc, size, weight, stretch, fam); return mc.measureText(txt).width; };
  /** txt가 폭 w를 채우는 크기 + 폭 축(want에 가장 가까운 크기가 나오는 폭을 고른다). */
  const fill = (txt: string, w: number, want: number, weight = 800, lo = 1, hi = STRETCH.length - 1) => {
    lo = Math.max(1, lo);
    let best: { size: number; stretch: CanvasFontStretch; d: number } | null = null;
    for (let i = lo; i <= hi; i++) {
      const st = STRETCH[i][0];
      const s = (w / Math.max(1, widthOf(txt, 100, weight, st))) * 100;
      const d = Math.abs(Math.log(s / want));
      if (!best || d < best.d) best = { size: s, stretch: st, d };
    }
    return best!;
  };
  return { setK, widthOf, fill };
}
type Tools = ReturnType<typeof tools>;

const sceneChars = (s: FlatScene): number => {
  switch (s.kind) {
    case "hook": return readLen([s.label, s.value, s.line].join(" "));
    case "story": return readLen([s.line, s.line2].join(" "));
    case "items": return readLen(s.line) + readLen(s.items.map((i) => i.value + i.label).join(" ")) * 0.7;
    case "flow": return readLen(s.line) + readLen(s.nodes.join(" ")) * 0.8;
    case "terminal": return readLen([s.command, s.line].join(" ")) + readLen(s.output.join(" ")) * 0.55;
    case "alert": return readLen([s.title, s.body, s.line, s.line2].join(" "));
    case "stats": return readLen(s.line) + readLen(s.stats.map((i) => i.value + i.unit + i.label).join(" ")) * 0.7;
    case "ending": return readLen([s.name, s.line, s.line2].join(" "));
  }
};

// =====================================================================================
// 라벨(v1 띠 체계) — 박자에 꽂히는 녹아웃 띠
// =====================================================================================
type BSlug = { txt: string; x: number; y: number; size: number; stretch: CanvasFontStretch; weight: number; color: string; on: number; slam?: boolean; fam?: string; rot?: number; bar?: { x: number; y: number; w: number; h: number }; barColor?: string; knock?: boolean };
type BCard = { b0: number; nb: number; bg: string; slugs: BSlug[]; push: number; anchor: [number, number] };

function makeBars(work: GenreWork, seed: number, FAM: string, MONO: string, LB: Lbl, T: Tools) {
  const { setK, widthOf, fill } = T;
  const BEAT = 0.5;
  const A = work.accent, Rr = work.alarm;
  const C = { paper: PAPER, ink: INK, acc: A || INK, alarm: Rr || INK };
  const grounds = ["acc", "ink", "acc", "paper"];
  const col = (k: string) => (k === "paper" || k === "ink" || k === "acc" || k === "alarm" ? C[k] : k);
  const onInk = (bg: string) => (K.oklch(col(bg))[0] < 0.55 ? C.paper : C.ink);

  const KF: Record<string, number> = { hook: 1.1, story: 1.0, flow: 1.0, terminal: 1.0, items: 0.9, alert: 0.95, stats: 1.0, ending: 0.85 };
  let lens = work.scenes.map((s) => (1.0 + sceneChars(s) / 17) * (KF[s.kind] || 1));
  const sum = lens.reduce((a, b) => a + b, 0);
  const target = K.clamp(sum * 0.78, 17, 26);
  lens = lens.map((l) => K.clamp((l * target) / sum, 2.0, 6.4));
  const shots: { s: FlatScene; atB: number; nb: number }[] = [];
  let atB = 0;
  work.scenes.forEach((s, i) => {
    let nb = Math.max(4, Math.round(lens[i] / BEAT));
    if (s.kind === "ending") nb = Math.max(nb, Math.ceil(2.6 / BEAT)) + Math.ceil(2.4 / BEAT);
    shots.push({ s, atB, nb });
    atB += nb;
  });
  const duration = atB * BEAT;
  let gi = 0;
  const nextGround = () => grounds[gi++ % grounds.length];

  /** 낱말을 줄로 나눈다(보이는 길이 기준). */
  function lines(text: string, target: number): string[] {
    const ws = up(text).split(/\s+/).filter(Boolean);
    const total = vlen(ws.join(" "));
    const per = Math.max(5, Math.ceil(total / target));
    const out: string[] = [];
    let cur = "";
    for (const w of ws) {
      const nx = cur ? cur + " " + w : w;
      if (vlen(nx) > per && cur && !(vlen(w) <= 2 && vlen(nx) < per + 3)) { out.push(cur); cur = w; } else cur = nx;
    }
    if (cur) out.push(cur);
    if (out.length > 1 && vlen(out[out.length - 1]) <= 3) { const l = out.pop()!; out[out.length - 1] += " " + l; }
    return out;
  }
  /** 띠: 줄마다 화면 끝에서 들어오는 단색 띠에서 글자를 녹여 낸다. */
  function bars(text: string, y: number, size: number, opt: { lines?: number; stretch?: CanvasFontStretch; alt?: boolean } = {}): BSlug[] {
    const ls = lines(text, opt.lines || Math.max(1, Math.round(vlen(up(text)) / 14)));
    const st = (l: string): CanvasFontStretch => opt.stretch || (vlen(l) > 12 ? "condensed" : vlen(l) < 6 ? "expanded" : "semi-condensed");
    // 가장 긴 줄도 화면 안에 들어오게 크기를 함께 줄인다(한국어 줄은 넓다)
    const widest = Math.max(...ls.map((l) => widthOf(l, size, 800, st(l)) + size * 0.56 + M));
    if (widest > W - 20) size *= (W - 20) / widest;
    let yy = y;
    return ls.map((l, i) => {
      const s2 = st(l);
      const tw = widthOf(l, size, 800, s2);
      const fromRight = !!opt.alt && i % 2 === 1;
      const pad = size * 0.28;
      const bw = tw + pad * 2 + M;
      const bx = fromRight ? W - bw : 0;
      const sl: BSlug = { txt: l, x: fromRight ? bx + pad : M, y: yy + size * 0.86, size, stretch: s2, weight: 800, color: INK, on: 0, bar: { x: bx, y: yy, w: bw, h: size * 1.08 }, knock: true };
      yy += size * 1.08 + size * 0.12;
      return sl;
    });
  }
  const cards: BCard[] = [];
  const addCard = (b0: number, nb: number, bg: string, slugs: BSlug[], o: { push?: number; anchor?: [number, number] } = {}) => { cards.push({ b0, nb, bg, slugs, push: o.push == null ? 0.03 : o.push, anchor: o.anchor || [M, M] }); };
  const tint = (bg: string) => (bg === "acc" ? (C.acc === C.paper ? C.ink : onInk("acc")) : bg === "ink" ? C.paper : C.ink);
  const hiOn = (bg: string) => {
    const cand = bg === "acc" ? [C.paper, C.ink] : [C.acc, C.alarm, tint(bg)];
    for (const c of cand) if (c !== col(bg) && Math.abs(K.oklch(c)[0] - K.oklch(col(bg))[0]) > 0.25) return c;
    return tint(bg);
  };
  const accumulate = (slugs: BSlug[], from: number, step: number) => { let b = from; slugs.forEach((s) => { s.on = b; s.slam = true; b += step; }); return b; };
  const sample = (bg: string, txt: string): BSlug => ({ txt: up(txt), x: W - M, y: H - M + 8, size: 30, weight: 500, stretch: "normal", color: tint(bg), on: 0, rot: -Math.PI / 2 });
  const fitW = (txt: string, size: number, weight: number, stretch: CanvasFontStretch, maxW: number) => Math.min(size, (maxW / Math.max(1, widthOf(txt, size, weight, stretch))) * size);
  let handoff: { at: number; ink: string } | null = null;

  for (const sh of shots) {
    const s = sh.s, B0 = sh.atB, NB = sh.nb;
    if (s.kind === "hook") {
      let bg = nextGround();
      if (s.alarm && Rr && Math.abs(K.oklch(Rr)[0] - K.oklch(col(bg))[0]) < 0.25) { bg = "ink"; gi++; }
      const ink = tint(bg);
      const vcol = s.alarm ? (bg === "acc" ? C.paper : C.alarm) : hiOn(bg);
      const vf = fill(s.value, W - 2 * M - 120, 600, 900, 4, 7);
      const vs = Math.min(vf.size, 640);
      const sl: BSlug[] = [
        { txt: s.value, x: M - vs * 0.03, y: H - M + vs * 0.02, size: vs, stretch: vf.stretch, weight: 900, color: vcol, on: 0, slam: true },
        { txt: up(s.label), x: M, y: M + 34, size: fitW(up(s.label), 40, 600, "semi-expanded", W - 2 * M - 60), weight: 600, stretch: "semi-expanded", color: ink, on: 0 },
      ];
      const c1 = Math.max(3, Math.round(NB * 0.38));
      if (s.data === "sample") sl.push(sample(bg, LB.sampleFigure));
      addCard(B0, c1, bg, sl, { push: 0.025, anchor: [M, H - M] });
      const bg2 = nextGround();
      const qs = bars(s.line, M + 30, 120, { alt: true });
      qs.forEach((q) => (q.color = tint(bg2)));
      const end = accumulate(qs, 0, 0.5);
      const keep: BSlug = { txt: s.value, x: W - M - widthOf(s.value, 200, 900, "condensed"), y: H - M, size: 200, stretch: "condensed", weight: 900, color: hiOn(bg2), on: end, slam: true };
      addCard(B0 + c1, NB - c1, bg2, [...qs, keep]);
    } else if (s.kind === "story") {
      const bg = nextGround();
      const n1 = Math.max(3, Math.round(NB * 0.58));
      const qs = bars(s.line, M, 130, { alt: false });
      qs.forEach((q) => (q.color = tint(bg)));
      accumulate(qs, 0, 0.5);
      addCard(B0, n1, bg, qs);
      const bg2 = nextGround();
      const qs2 = bars(s.line2, H * 0.42, 110, { alt: true });
      qs2.forEach((q) => (q.color = tint(bg2)));
      accumulate(qs2, 0, 0.5);
      addCard(B0 + n1, NB - n1, bg2, qs2);
    } else if (s.kind === "flow") {
      const n = s.nodes.length;
      const per = K.clamp(Math.floor(((NB - 4) / n) * 2) / 2, 0.5, 1.5);
      let b = 0;
      s.nodes.forEach((nd, i) => {
        const g2 = nextGround();
        const t = up(nd);
        const f = fill(t, W - 2 * M - (i < n - 1 ? 220 : 0), vlen(t) > 10 ? 200 : 380, 900);
        const sz = Math.min(f.size, 420);
        const sl: BSlug[] = [{ txt: t, x: M, y: H * 0.5 + sz * 0.36, size: sz, stretch: f.stretch, weight: 900, color: tint(g2), on: 0, slam: true }];
        if (i < n - 1) sl.push({ txt: "→", x: W - M - 170, y: H * 0.5 + 70, size: 200, stretch: "normal", weight: 800, color: hiOn(g2), on: per * 0.5, slam: true });
        addCard(B0 + b, per, g2, sl, { push: 0.06, anchor: [M, H * 0.5] });
        b += per;
      });
      const bg = nextGround();
      const chain = s.nodes.map((nd) => up(nd)).join("  →  ");
      const sl = bars(chain, M, Math.min(130, (H - 2 * M - 120) / n / 1.2), { lines: n, stretch: "condensed" });
      sl.forEach((q) => { q.color = tint(bg); q.on = 0; });
      const line: BSlug = { txt: norm(s.line), x: M, y: H - M, size: fitW(norm(s.line), 52, 600, "semi-condensed", W - 2 * M), stretch: "semi-condensed", weight: 600, color: hiOn(bg), on: 1, slam: true };
      addCard(B0 + b, NB - b, bg, [...sl, line], { push: 0.02 });
    } else if (s.kind === "terminal") {
      const ink = C.paper;
      const nOut = s.output.length;
      const sl: BSlug[] = [{ txt: "$ " + s.command, x: M, y: M + 40, size: 40, fam: MONO, weight: 700, stretch: "normal", color: ink, on: 0 }];
      s.output.forEach((o, i) => sl.push({ txt: o, x: M, y: M + 130 + i * 62, size: 40, fam: MONO, weight: 400, stretch: "normal", color: ink, on: 1 + i * 0.5 }));
      const pm = (s.output.join(" ").match(/\((\d+%)\)/) || [])[1];
      const hb = 1 + nOut * 0.5 + 0.5;
      if (pm) { const f = fill(pm, W * 0.42, 380, 900, 0, 3); sl.push({ txt: pm, x: W - M - widthOf(pm, f.size, 900, f.stretch), y: H - M - 70, size: f.size, stretch: f.stretch, weight: 900, color: A || C.paper, on: hb, slam: true }); }
      sl.push({ txt: up(s.line), x: M, y: H - M, size: fitW(up(s.line), 46, 700, "semi-condensed", W - 2 * M), stretch: "semi-condensed", weight: 700, color: ink, on: hb + 1.5, slam: true });
      if (s.data === "sample") sl.push({ txt: LB.sampleRun, x: M, y: M + 130 + nOut * 62 + 16, size: 30, fam: MONO, weight: 400, stretch: "normal", color: "#8a8a8a", on: hb });
      addCard(B0, NB, "ink", sl, { push: 0.015 });
      gi++;
    } else if (s.kind === "items") {
      const n = s.items.length;
      const per = K.clamp(Math.floor(((NB - 4) / n) * 2) / 2, 0.5, 1);
      let b = 0;
      s.items.forEach((it, i) => {
        const g2 = it.alarm ? "paper" : i % 2 ? "ink" : nextGround();
        const f = fill(it.value, W * 0.5, 520, 900, 3, 7);
        const sz = Math.min(f.size, 560);
        const vcol = it.alarm ? (g2 === "paper" ? C.alarm : C.paper) : tint(g2);
        addCard(B0 + b, per, g2, [
          { txt: it.value, x: M - sz * 0.03, y: H - M, size: sz, stretch: f.stretch, weight: 900, color: vcol, on: 0, slam: true },
          { txt: up(it.label), x: M, y: M + 50, size: fitW(up(it.label), 56, 700, "semi-expanded", W - 2 * M), stretch: "semi-expanded", weight: 700, color: tint(g2), on: 0 },
        ], { push: 0.05, anchor: [M, H - M] });
        b += per;
      });
      const bg = nextGround();
      const ink = tint(bg);
      const rows: BSlug[] = [];
      const rh = (H - 2 * M - 90) / n;
      s.items.forEach((it, i) => {
        const y = M + 90 + rh * (i + 0.82);
        const alarmOk = Math.abs(K.oklch(C.alarm)[0] - K.oklch(col(bg))[0]) > 0.2 && C.alarm !== col(bg);
        rows.push({ txt: it.value, x: M, y, size: rh * 0.95, stretch: "condensed", weight: 900, color: it.alarm ? (alarmOk ? C.alarm : hiOn(bg)) : ink, on: 0 });
        rows.push({ txt: up(it.label), x: M + 300, y, size: rh * 0.42, stretch: "semi-expanded", weight: 600, color: ink, on: 0 });
      });
      rows.push({ txt: norm(s.line), x: M, y: M + 40, size: fitW(norm(s.line), 44, 700, "semi-condensed", W - 2 * M - 60), stretch: "semi-condensed", weight: 700, color: ink, on: 0.5, slam: true });
      if (s.data === "sample") rows.push(sample(bg, LB.sampleReadings));
      addCard(B0 + b, NB - b, bg, rows, { push: 0.02 });
    } else if (s.kind === "alert") {
      const bg = "paper";
      const ink = tint(bg);
      const tf = fill(up(s.title), W - 2 * M, 200, 900, 0, 5);
      const tsz = Math.min(tf.size, 260);
      const sl: BSlug[] = [];
      sl.push({ txt: up(s.title), x: M, y: M + tsz * 0.9, size: tsz, stretch: tf.stretch, weight: 900, color: C.paper, on: 0, slam: true, bar: { x: 0, y: M - 10, w: W, h: tsz * 1.1 }, barColor: C.alarm });
      sl.push({ txt: up(s.body), x: M, y: M + tsz + 110, size: fitW(up(s.body), 84, 800, "semi-condensed", W - 2 * M), stretch: "semi-condensed", weight: 800, color: ink, on: 1, slam: true });
      if (s.data === "sample") sl.push({ txt: up(LB.sampleAlert), x: M, y: M + tsz + 170, size: 30, stretch: "semi-expanded", weight: 500, color: ink, on: 1 });
      const n1 = Math.max(4, Math.round(NB * 0.52));
      addCard(B0, n1, bg, sl, { push: 0.03 });
      const bg2 = nextGround();
      const q = bars(s.line, M, 130, { alt: true });
      q.forEach((x) => (x.color = tint(bg2)));
      const e2 = accumulate(q, 0, 0.5);
      if (s.line2) {
        const last = q[q.length - 1];
        const yb = (last.bar ? last.bar.y + last.bar.h : last.y) + 110;
        q.push({ txt: up(s.line2), x: M, y: Math.min(H - M, yb), size: fitW(up(s.line2), 72, 800, "semi-condensed", W - 2 * M), stretch: "semi-condensed", weight: 800, color: hiOn(bg2), on: e2 + 0.5, slam: true });
      }
      addCard(B0 + n1, NB - n1, bg2, q);
    } else if (s.kind === "stats") {
      const n = s.stats.length;
      const per = K.clamp(Math.floor(((NB - 5) / n) * 2) / 2, 0.5, 1.5);
      let b = 0;
      s.stats.forEach((st, i) => {
        const g2 = nextGround();
        const f = fill(st.value, W * 0.48, 560, 900, 2, 7);
        const sz = Math.min(f.size, 640);
        const vw = widthOf(st.value, sz, 900, f.stretch);
        addCard(B0 + b, per, g2, [
          { txt: st.value, x: M - sz * 0.03, y: H - M, size: sz, stretch: f.stretch, weight: 900, color: i === 0 ? hiOn(g2) : tint(g2), on: 0, slam: true },
          { txt: up(st.unit), x: M + vw + 24, y: H - M, size: fitW(up(st.unit), 150, 900, "condensed", W - M - (M + vw + 24)), stretch: "condensed", weight: 900, color: tint(g2), on: 0 },
          { txt: up(st.label), x: M, y: M + 50, size: fitW(up(st.label), 56, 700, "semi-expanded", W - 2 * M), stretch: "semi-expanded", weight: 700, color: tint(g2), on: 0 },
        ], { push: 0.05, anchor: [M, H - M] });
        b += per;
      });
      const bg = nextGround();
      const ink = tint(bg);
      const sl: BSlug[] = [{ txt: up(s.line), x: M, y: M + 50, size: fitW(up(s.line), 52, 800, "semi-condensed", W - 2 * M), stretch: "semi-condensed", weight: 800, color: ink, on: 0, slam: true }];
      s.stats.forEach((st, i) => {
        if (i === 0) {
          const vu = st.value + (/^[a-z]/i.test(st.unit) && st.unit.length > 3 ? " " + st.unit : st.unit);
          const f = fill(vu, W * 0.52, 360, 900, 1, 6);
          const sz = Math.min(f.size, 420);
          sl.push({ txt: vu, x: M - sz * 0.03, y: H - M - 70, size: sz, stretch: f.stretch, weight: 900, color: hiOn(bg), on: 0.5, slam: true });
          sl.push({ txt: up(st.label), x: M, y: H - M, size: 40, stretch: "semi-condensed", weight: 700, color: ink, on: 0.5 });
        } else {
          const x = W * 0.62, y = M + 230 + (i - 1) * 250;
          sl.push({ txt: st.value + st.unit, x, y, size: fitW(st.value + st.unit, 150, 900, "semi-condensed", W - M - x), stretch: "semi-condensed", weight: 900, color: ink, on: 1 + i * 0.5, slam: true });
          sl.push({ txt: up(st.label), x, y: y + 54, size: fitW(up(st.label), 36, 600, "semi-condensed", W - M - x), stretch: "semi-condensed", weight: 600, color: ink, on: 1 + i * 0.5 });
        }
      });
      if (s.data === "sample") sl.push(sample(bg, LB.sampleFigures));
      if (s.data === "measured" && s.source) sl.push({ txt: LB.source + s.source, x: W * 0.62, y: H - M, size: 30, fam: MONO, weight: 400, stretch: "normal", color: ink, on: 2 });
      addCard(B0 + b, NB - b, bg, sl, { push: 0.02 });
    } else if (s.kind === "ending") {
      const bg = "acc";
      const ink = tint(bg);
      const bb = bars(s.name, M + 60, 150, { lines: vlen(s.name) > 14 ? 2 : 1 });
      bb.forEach((x, i) => { x.color = col(bg); x.barColor = C.ink; x.on = i * 0.5; x.slam = true; });
      const sl = [...bb];
      const last = sl[sl.length - 1];
      const ly = (last.bar ? last.bar.y + last.bar.h : last.y) + 90;
      sl.push({ txt: up(s.line), x: M, y: ly, size: fitW(up(s.line), 52, 800, "semi-condensed", W - 2 * M), stretch: "semi-condensed", weight: 800, color: hiOn(bg), on: 1, slam: true });
      sl.push({ txt: up(s.line2), x: M, y: ly + 64, size: fitW(up(s.line2), 52, 500, "semi-condensed", W - 2 * M), stretch: "semi-condensed", weight: 500, color: ink, on: 2, slam: true });
      addCard(B0, NB, bg, sl, { push: 0.018 });
      handoff = { at: (B0 + NB) * BEAT - 2.4, ink };
    }
  }
  cards.sort((a, b) => a.b0 - b.b0);
  // 녹아웃 띠: 띠는 글자색, 글자는 바탕색
  for (const c of cards) for (const s of c.slugs) if (s.knock && !s.barColor) { s.barColor = tint(c.bg); s.color = col(c.bg); }

  const drawSlug = (g: CanvasRenderingContext2D, s: BSlug, age: number, bg: string) => {
    if (s.bar) {
      const p = K.clamp(age / 0.05);
      g.fillStyle = s.barColor || (bg === "ink" ? C.paper : C.ink);
      const fromRight = s.bar.x > 0 && s.bar.x + s.bar.w >= W - 1;
      const w = s.bar.w * (0.35 + 0.65 * p);
      g.fillRect(fromRight ? W - w : s.bar.x, s.bar.y, w, s.bar.h);
      if (p < 1) return;
    }
    setK(g, s.size, s.weight, s.stretch, s.fam || FAM);
    g.fillStyle = s.color;
    if (s.rot) { g.save(); g.translate(s.x, s.y); g.rotate(s.rot); g.fillText(s.txt, 0, 0); g.restore(); return; }
    if (s.slam && age < 0.1 && !s.bar) {
      const k = 1 + 0.09 * Math.pow(1 - age / 0.1, 2);
      g.save(); g.translate(s.x, s.y); g.scale(k, k); g.fillText(s.txt, 0, 0); g.restore();
    } else g.fillText(s.txt, s.x, s.y);
  };

  return {
    duration,
    starts: shots.map((sh) => sh.atB * BEAT),
    render(g: CanvasRenderingContext2D, t: number) {
      const tb = t / BEAT;
      let c = cards[0];
      for (const cd of cards) if (tb >= cd.b0 - 1e-6) c = cd;
      const lb = tb - c.b0;
      g.fillStyle = col(c.bg);
      g.fillRect(0, 0, W, H);
      const pp = 1 - Math.pow(1 - K.clamp(lb / c.nb), 2);
      const k = 1 + c.push * pp;
      const f = Math.floor(t * 12);
      const wx = (K.rand(seed, f, 1) - 0.5) * 1.6, wy = (K.rand(seed, f, 2) - 0.5) * 1.6;
      g.save();
      g.translate(c.anchor[0] + wx, c.anchor[1] + wy); g.scale(k, k); g.translate(-c.anchor[0], -c.anchor[1]);
      g.textAlign = "left"; g.textBaseline = "alphabetic";
      for (const s of c.slugs) { if (lb + 1e-6 < s.on) continue; drawSlug(g, s, (lb - s.on) * BEAT, c.bg); }
      g.restore();
      g.letterSpacing = "0px"; g.fontStretch = "normal";
      if (handoff && t > handoff.at) K.handoff(g, K.seg(t, handoff.at, 2.4), { ink: handoff.ink, family: FAM, size: 30, x: W - M, y: H - M + 16, handle: work.handle, align: "right" });
      K.grain(g, t, 0.06, seed, 12, "overlay");
    },
  };
}

// =====================================================================================
// v2 카드 영화(장부·두 장소) 공용
// =====================================================================================
const STOP = new Set(["a", "an", "the", "my", "to", "of", "and", "on", "in", "at", "is", "it", "its", "for", "or", "i"]);
type Tok = { w: string; glue: string };
/** 낱말 조각(가운뎃점 "사용량·온도" 뒤에서도 끊을 수 있다 — 붙임은 그대로 기억). */
function toks(text: string): Tok[] {
  const out: Tok[] = [];
  let g0 = "";
  for (const part of text.split(/(\s+)/)) {
    if (!part) continue;
    if (/^\s+$/.test(part)) { g0 = " "; continue; }
    part.split(/(?<=·)(?=.)/).forEach((w, i) => { out.push({ w, glue: i ? "" : g0 }); g0 = ""; });
  }
  return out;
}
const joinT = (ts: Tok[]) => ts.map((t, i) => (i ? t.glue : "") + t.w).join("");
/** 낱말을 k줄로 고르게 — 작은 낱말(영어 관사·한 글자 한국어 낱말)로 줄을 끝내지 않고, 이름("Claude | Code")을 가르지 않는다. */
function balance(ws: Tok[], k: number): string[] {
  const n = ws.length;
  if (k >= n) return ws.map((t) => t.w);
  const len = (i: number, j: number) => vlen(joinT(ws.slice(i, j)));
  const best = Array.from({ length: k + 1 }, () => Array(n + 1).fill(Infinity) as number[]);
  const prev = Array.from({ length: k + 1 }, () => Array(n + 1).fill(0) as number[]);
  best[0][0] = 0;
  for (let p = 1; p <= k; p++) for (let j = 1; j <= n; j++) for (let i = p - 1; i < j; i++) {
    if (best[p - 1][i] === Infinity) continue;
    const last = ws[j - 1].w;
    const small = STOP.has(last.toLowerCase()) || (Array.from(last).length === 1 && isWide(last));
    const pen = j < n ? (small ? 160 : 0) + (/^[A-Z][a-z]/.test(last) && /^[A-Z][a-z]/.test(ws[j].w) ? 400 : 0) : 0;
    const c = best[p - 1][i] + Math.pow(len(i, j), 2) + pen;
    if (c < best[p][j]) { best[p][j] = c; prev[p][j] = i; }
  }
  const out: string[] = [];
  let j = n;
  for (let p = k; p >= 1; p--) { const i = prev[p][j]; out.unshift(joinT(ws.slice(i, j))); j = i; }
  return out;
}
/** 구절: 문장부호·줄표에서 끊고, 긴 구절은 maxLen(보이는 길이) 이하로 고르게. */
function phrases(text: string, maxLen = 22): string[] {
  const raw = norm(text).split(/(?<=[,;:?!.])\s+|\s+[—–]\s+|\s+-\s+|\s*→\s*/).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of raw) { const k = Math.ceil(vlen(p) / maxLen); const ws = toks(p); if (k <= 1 || ws.length < 2) out.push(p); else out.push(...balance(ws, Math.min(k, ws.length))); }
  return out;
}
/** 꼭 두 구절로(맥 쪽·폰 쪽에 하나씩). */
function twoPhrases(text: string): string[] {
  const ph = phrases(text, 999);
  if (ph.length === 2) return ph;
  const ws = toks(norm(text));
  return ws.length >= 2 ? balance(ws, 2) : [norm(text)];
}
const readT = (s: string) => 0.15 + readLen(String(s)) / 20;

type VSlug = { txt: string; x: number; y: number; size: number; stretch: CanvasFontStretch; weight: number; color?: string; on: number; slam?: boolean; fam?: string; align?: "right"; side?: "L" | "R"; two?: boolean; colL?: string; colR?: string; move?: { x0: number; x1: number; delay: number; dur: number }; buzz?: boolean; check?: boolean; tw?: number };
type VRule = { x0: number; x1: number; y: number; h: number; color: string; on: number; draw: number; over?: boolean; side?: "L" | "R"; buzz?: boolean };
type VCard = { t0: number; t1: number; bg: string; slugs: VSlug[]; rules: VRule[]; push: number; anchor: [number, number]; ruled?: boolean; split?: number; from?: number };
type Line = { txt: string; x: number; y: number; size: number; stretch: CanvasFontStretch; weight: number };

function v2tools(T: Tools) {
  /** 한 크기·한 폭으로 줄을 놓는다: 모든 줄이 w에, 덩어리가 h에 들어가는 가장 큰 크기. */
  const layout = (lines: string[], o: { x: number; y: number; w: number; h: number; cap?: number; stretch?: CanvasFontStretch; weight?: number; lh?: number; min?: number }): Line[] => {
    const { x, y, w, h, cap = 200, stretch = "semi-condensed", weight = 800, lh = 1.0, min = 28 } = o;
    let size = cap;
    for (const l of lines) size = Math.min(size, (w / Math.max(1, T.widthOf(l, 100, weight, stretch))) * 100);
    size = Math.min(size, h / (0.8 + (lines.length - 1) * lh));
    size = Math.max(min, Math.floor(size));
    return lines.map((t, i) => ({ txt: t, x, y: y + size * 0.78 + i * size * lh, size, stretch, weight }));
  };
  return { layout };
}

function film(cards: VCard[], o: { seed: number; duration: number; starts: number[]; handoff: { at: number; ink: string; handle: string } | null; FAM: string; T: Tools }) {
  const { seed, duration, handoff, FAM, T } = o;
  const ease = K.ease.bezier(0.2, 0, 0, 1);
  const moveEase = K.ease.bezier(0.3, 0, 0.12, 1);
  const dAt = (c: VCard, lt: number) => (c.split == null ? null : K.lerp(c.from ?? c.split, c.split, ease(K.seg(lt, 0, 0.9))));
  const clipSide = (g: CanvasRenderingContext2D, side: "L" | "R", d: number) => { g.beginPath(); if (side === "L") g.rect(-50, -50, d + 50, H + 100); else g.rect(d, -50, W - d + 50, H + 100); g.clip(); };
  const buzzX = (a: number) => (a < 0.42 ? Math.sin(a * Math.PI * 2 * 17) * 7 * (1 - a / 0.42) : 0);
  const slug = (g: CanvasRenderingContext2D, s: VSlug, lt: number, d: number | null) => {
    if (lt + 1e-6 < s.on) return;
    const age = lt - s.on;
    let x = s.x;
    const y = s.y;
    if (s.move) x = K.lerp(s.move.x0, s.move.x1, moveEase(K.seg(lt, s.on + s.move.delay, s.move.dur)));
    if (s.buzz) x += buzzX(age);
    if (s.check) {
      g.save(); if (s.side && d != null) clipSide(g, s.side, d);
      g.strokeStyle = s.color || INK; g.lineWidth = s.size * 0.15; g.lineCap = "square"; g.lineJoin = "miter";
      g.beginPath(); g.moveTo(x, y - s.size * 0.36); g.lineTo(x + s.size * 0.24, y - s.size * 0.08); g.lineTo(x + s.size * 0.66, y - s.size * 0.72); g.stroke();
      g.restore();
      return;
    }
    T.setK(g, s.size, s.weight, s.stretch, s.fam || FAM);
    if (s.tw == null) s.tw = g.measureText(s.txt).width;
    if (s.align === "right") x -= s.tw;
    const k = s.slam && age < 0.09 ? 1 + 0.07 * Math.pow(1 - age / 0.09, 2) : 1;
    const paint = (col: string) => {
      g.fillStyle = col;
      if (k !== 1) { g.save(); g.translate(x, y); g.scale(k, k); g.fillText(s.txt, 0, 0); g.restore(); } else g.fillText(s.txt, x, y);
    };
    if (s.two && d != null) {
      g.save(); clipSide(g, "L", d); paint(s.colL || PAPER); g.restore();
      g.save(); clipSide(g, "R", d); paint(s.colR || INK); g.restore();
    } else if (s.side && d != null) { g.save(); clipSide(g, s.side, d); paint(s.color || INK); g.restore(); }
    else paint(s.color || INK);
  };
  const rule = (g: CanvasRenderingContext2D, r: VRule, lt: number, d: number | null) => {
    if (lt + 1e-6 < r.on) return;
    const p = r.draw ? K.ease.outCubic(K.seg(lt, r.on, r.draw)) : 1;
    const x0 = r.x0 + (r.buzz ? buzzX(lt - r.on) : 0);
    g.save();
    if (r.side && d != null) clipSide(g, r.side, d);
    g.fillStyle = r.color;
    g.fillRect(x0, r.y, (r.x1 - r.x0) * p, r.h);
    g.restore();
  };
  return {
    duration,
    starts: o.starts,
    render(g: CanvasRenderingContext2D, t: number) {
      let c = cards[0];
      for (const cd of cards) if (t >= cd.t0 - 1e-6) c = cd;
      const lt = t - c.t0;
      const d = dAt(c, lt);
      if (d == null) { g.fillStyle = c.bg; g.fillRect(0, 0, W, H); }
      else { g.fillStyle = INK; g.fillRect(0, 0, d, H); g.fillStyle = PAPER; g.fillRect(d, 0, W - d, H); }
      // 장부 종이: 옅은 괘선(종이 그 자체)
      if (c.ruled) { g.fillStyle = "rgba(13,13,13,0.07)"; for (let y = 96; y < H; y += 72) g.fillRect(0, y, W, 1.5); }
      const pp = 1 - Math.pow(1 - K.clamp(lt / Math.max(0.1, c.t1 - c.t0)), 2);
      const k = 1 + c.push * pp;
      const f = Math.floor(t * 12);
      const wx = (K.rand(seed, f, 1) - 0.5) * 1.2, wy = (K.rand(seed, f, 2) - 0.5) * 1.2;
      g.save();
      g.translate(c.anchor[0] + wx, c.anchor[1] + wy); g.scale(k, k); g.translate(-c.anchor[0], -c.anchor[1]);
      g.textAlign = "left"; g.textBaseline = "alphabetic";
      for (const r of c.rules) if (!r.over) rule(g, r, lt, d);
      for (const s of c.slugs) slug(g, s, lt, d);
      for (const r of c.rules) if (r.over) rule(g, r, lt, d);
      g.restore();
      g.letterSpacing = "0px"; g.fontStretch = "normal";
      if (handoff && t > handoff.at) K.handoff(g, K.seg(t, handoff.at, 2.4), { ink: handoff.ink, family: FAM, size: 30, x: W - M, y: H - M + 16, handle: handoff.handle, align: "right" });
      K.grain(g, t, 0.06, seed, 12, "overlay");
    },
  };
}
/** 전체를 30초 안으로(박자 비율은 그대로). */
function fit(cards: VCard[], Tt: number, starts: number[], max = 29.6) {
  const k = Tt > max ? max / Tt : 1;
  for (const c of cards) { c.t0 *= k; c.t1 *= k; for (const s of c.slugs) { s.on *= k; if (s.move) s.move.delay *= k; } for (const r of c.rules) r.on *= k; }
  for (let i = 0; i < starts.length; i++) starts[i] *= k;
  return Tt * k;
}

// =====================================================================================
// 장부(명령줄 도구)
// =====================================================================================
function makeLedger(work: GenreWork, seed: number, FAM: string, MONO: string, LB: Lbl, T: Tools) {
  const { layout } = v2tools(T);
  const BEAT = 0.6, HB = BEAT / 2;
  const q = (t: number) => Math.ceil(t / HB - 1e-6) * HB;
  const cards: VCard[] = [];
  let Tt = 0;
  const open = (bg = PAPER, o: { push?: number; anchor?: [number, number] } = {}): VCard => { const c: VCard = { t0: Tt, t1: Tt, bg, slugs: [], rules: [], push: o.push == null ? 0.014 : o.push, anchor: o.anchor || [M, M], ruled: bg === PAPER }; cards.push(c); return c; };
  const close = (c: VCard, dur: number) => { Tt = q(Tt + dur); c.t1 = Tt; };
  const S = (c: VCard, o: Partial<VSlug> & { txt: string; x: number; y: number; size: number }) => { const s: VSlug = { stretch: "semi-condensed", weight: 800, color: c.bg === INK ? PAPER : INK, on: 0, ...o }; c.slugs.push(s); return s; };
  const RL = (c: VCard, o: Partial<VRule> & { x0: number; x1: number; y: number }) => { const r: VRule = { h: 3, color: c.bg === INK ? PAPER : INK, on: 0, draw: 0, ...o }; c.rules.push(r); return r; };
  const loss = (s: string) => /waste|lost|eaten|rework|fail|낭비|샌|먹은|실패|재작업|날린/i.test(s);
  const strike = (c: VCard, y: number, size: number, on: number) => RL(c, { x0: M - 10, x1: W - M + 10, y: y - size * 0.34, h: Math.max(5, size * 0.09), on, draw: 0.45, over: true });
  const lines = (c: VCard, lay: Line[], on0: number) => { let on = on0; lay.forEach((L) => { S(c, { ...L, on, slam: true }); on += readT(L.txt); }); return on; };
  const fitTo = (txt: string, size: number, weight: number, stretch: CanvasFontStretch, maxW: number) => Math.min(size, (maxW / Math.max(1, T.widthOf(txt, size, weight, stretch))) * size);
  let handoff: { at: number; ink: string; handle: string } | null = null;
  const starts: number[] = [];

  work.scenes.forEach((s, si) => {
    starts[si] = Tt;
    if (s.kind === "hook") {
      const c = open(PAPER, { anchor: [W - M, H - M] });
      S(c, { txt: norm(s.label), x: M, y: M + 40, size: 48, weight: 700 });
      const v = s.value + (s.data === "sample" ? "*" : "");
      const f = T.fill(v, W * 0.62, 470, 900, 3, 7);
      S(c, { txt: v, x: W - M, y: H - M - 96, size: Math.min(f.size, 500), stretch: f.stretch, weight: 900, align: "right", slam: true });
      RL(c, { x0: M, x1: W - M, y: H - M - 64, h: 5 }); RL(c, { x0: M, x1: W - M, y: H - M - 50, h: 5 });
      if (s.data === "sample") S(c, { txt: LB.fnFigure, x: M, y: H - M + 4, size: 26, fam: MONO, weight: 400, stretch: "normal" });
      close(c, 1.7);
      const c2 = open(PAPER);
      S(c2, { txt: s.value, x: W - M, y: M + 74, size: 92, stretch: "normal", weight: 900, align: "right" });
      RL(c2, { x0: W - M - 230, x1: W - M, y: M + 96, h: 4 });
      const lay = layout(phrases(s.line, 14).map(up), { x: M, y: M + 150, w: W - 2 * M - 200, h: H - 2 * M - 150, cap: 230, lh: 0.95, stretch: "condensed" });
      close(c2, lines(c2, lay, 0) + 0.5);
    } else if (s.kind === "story") {
      const c = open(PAPER);
      const A = layout(phrases(s.line, 20).map(up), { x: M, y: M, w: W - 2 * M, h: 380, cap: 210, lh: 0.95, stretch: "condensed" });
      let e = lines(c, A, 0);
      if (s.line2) {
        const yb = A[A.length - 1].y + 70;
        RL(c, { x0: M, x1: W - M, y: yb - 30, h: 3, on: e, draw: 0.4 });
        const B = layout(phrases(s.line2, 22).map(up), { x: M, y: yb, w: W - 2 * M - 200, h: H - M - yb, cap: 150, lh: 0.95, stretch: "condensed" });
        e = lines(c, B, e + 0.2);
      }
      close(c, e + 0.35);
    } else if (s.kind === "flow") {
      // 흐름은 장부의 줄 — 마지막 줄이 결산
      const c = open(PAPER);
      const n = s.nodes.length, top = M - 10, rowH = (H - 2 * M - 110) / n;
      const lay = layout(s.nodes.map(up), { x: M + 90, y: 0, w: W - 2 * M - 90, h: 9999, cap: rowH * 0.66 });
      const sz = lay[0].size;
      s.nodes.forEach((nd, i) => {
        const yb = top + rowH * (i + 1) - rowH * 0.24;
        const on = i * BEAT;
        if (i) S(c, { txt: "→", x: M, y: yb, size: sz * 0.8, stretch: "normal", weight: 700, on });
        S(c, { txt: up(nd), x: M + 90, y: yb, size: sz, weight: i === n - 1 ? 900 : 800, on, slam: true });
        RL(c, { x0: M, x1: W - M, y: top + rowH * (i + 1), h: i === n - 1 ? 5 : 2, on, draw: 0.3 });
        if (i === n - 1) RL(c, { x0: M, x1: W - M, y: top + rowH * (i + 1) + 12, h: 5, on, draw: 0.3 });
      });
      const on = n * BEAT + 0.2;
      S(c, { txt: norm(s.line), x: M, y: H - M + 8, size: fitTo(norm(s.line), 46, 600, "semi-condensed", W - 2 * M), weight: 600, on, slam: true });
      close(c, on + readT(s.line) + 0.3);
    } else if (s.kind === "terminal") {
      const c = open(INK, { push: 0.008 });
      S(c, { txt: "$ " + s.command, x: M, y: M + 30, size: 38, fam: MONO, weight: 700, stretch: "normal" });
      if (s.data === "sample") S(c, { txt: LB.sampleRun, x: W - M, y: M + 30, size: 28, fam: MONO, weight: 400, stretch: "normal", align: "right", color: "#8d8d8a" });
      const y0 = M + 150, rowH = Math.min(98, (H - 2 * M - 230) / Math.max(1, s.output.length));
      let on = 0.6;
      s.output.forEach((o, i) => {
        const m = o.match(/^([^:]+):\s*(.*)$/);
        const lab = m ? m[1] : o, val = m ? m[2] : "";
        const y = y0 + i * rowH;
        const big = /\(\d+%\)/.test(val);
        S(c, { txt: lab, x: M, y, size: 34, fam: MONO, weight: big ? 700 : 400, stretch: "normal", on });
        if (val) S(c, { txt: val, x: W - M, y: y + 6, size: big ? 96 : 66, weight: 900, stretch: big ? "normal" : "semi-condensed", align: "right", on, slam: true });
        RL(c, { x0: M, x1: W - M, y: y + 28, h: 2, color: "rgba(243,243,241,0.24)", on });
        if (loss(lab)) strike(c, y, 60, on + 0.55);
        on += i === 0 ? 0.5 : big ? 1.0 : 0.6;
      });
      S(c, { txt: up(s.line), x: M, y: H - M + 4, size: fitTo(up(s.line), 46, 800, "semi-condensed", W - 2 * M), weight: 800, on: on + 0.3, slam: true });
      close(c, on + 0.3 + readT(s.line) + 0.3);
    } else if (s.kind === "stats") {
      const c = open(PAPER);
      const st = s.stats;
      const vu = (x: { value: string; unit: string }) => x.value + (x.unit === "%" ? "%" : x.unit ? (isWide(Array.from(x.unit)[0]) ? "" : " ") + x.unit : "");
      // 남은 몫이 한 장을 차지하고, 손실은 작게 적고 줄을 긋는다
      const f0 = T.fill(vu(st[0]), W * 0.48, 330, 900, 3, 7), s0 = Math.min(f0.size, 360);
      let on = 0.2;
      S(c, { txt: up(st[0].label), x: M, y: 400, size: fitTo(up(st[0].label), 62, 800, "semi-condensed", W - 2 * M - 760), weight: 800, on, slam: true });
      S(c, { txt: vu(st[0]), x: W - M, y: 420, size: s0, stretch: f0.stretch, weight: 900, align: "right", on, slam: true });
      RL(c, { x0: M, x1: W - M, y: 452, h: 5, on, draw: 0.3 }); RL(c, { x0: M, x1: W - M, y: 466, h: 5, on, draw: 0.3 });
      on += 1.0;
      st.slice(1).forEach((x, i) => {
        const y = 590 + i * 112;
        S(c, { txt: up(x.label), x: M, y, size: fitTo(up(x.label), 52, 700, "semi-condensed", W - 2 * M - 400), weight: 700, on, slam: true });
        S(c, { txt: vu(x), x: W - M, y: y + 8, size: 100, weight: 900, stretch: "semi-condensed", align: "right", on, slam: true });
        RL(c, { x0: M, x1: W - M, y: y + 34, h: 2, on });
        if (loss(x.label)) strike(c, y, 70, on + 0.5);
        on += 0.75;
      });
      if (s.data === "sample") S(c, { txt: LB.fnFigures, x: M, y: H - M + 4, size: 26, fam: MONO, weight: 400, stretch: "normal", on: 0 });
      if (s.data === "measured" && s.source) S(c, { txt: LB.source + s.source, x: M, y: H - M + 4, size: 26, fam: MONO, weight: 400, stretch: "normal", on: 0 });
      const L0 = layout([norm(s.line)], { x: M, y: M - 6, w: W - 2 * M, h: 120, cap: 72, weight: 800 });
      S(c, { ...L0[0], on: on + 0.2, slam: true });
      close(c, on + 0.2 + readT(s.line) + 0.3);
    } else if (s.kind === "ending") {
      const c = open(PAPER, { push: 0.02, anchor: [M, H * 0.5] });
      const nm = up(s.name);
      const f = T.fill(nm, W - 2 * M, 300, 900, 1, 6);
      const sz = Math.min(f.size, 330), yb = H * 0.48;
      S(c, { txt: nm, x: M - sz * 0.02, y: yb, size: sz, stretch: f.stretch, weight: 900, slam: true });
      RL(c, { x0: M, x1: W - M, y: yb + 34, h: 6, on: 0.3, draw: 0.45 });
      let on = 0.7;
      S(c, { txt: norm(s.line), x: M, y: yb + 130, size: fitTo(norm(s.line), 52, 800, "semi-condensed", W - 2 * M), weight: 800, on, slam: true });
      on += readT(s.line);
      if (s.line2) S(c, { txt: norm(s.line2), x: M, y: yb + 200, size: fitTo(norm(s.line2), 52, 500, "semi-condensed", W - 2 * M), weight: 500, on, slam: true });
      on += readT(s.line2 || "");
      close(c, on + 1.2);
      handoff = { at: 0, ink: INK, handle: work.handle };
    } else {
      // 이 체계에 맞는 자리가 없는 장면(알림·목록·이야기): 장부의 한 줄로 적는다
      const c = open(PAPER);
      const txt = s.kind === "alert" ? [s.title, s.body, s.line, s.line2].join(" — ") : s.kind === "items" ? s.items.map((i) => i.label + " " + i.value).join(", ") + " — " + s.line : "";
      const lay = layout(phrases(txt, 22), { x: M, y: M, w: W - 2 * M, h: H - 2 * M, cap: 120, lh: 1.05 });
      close(c, lines(c, lay, 0) + 0.3);
    }
  });
  const duration = fit(cards, Tt, starts);
  if (handoff) (handoff as { at: number }).at = duration - 2.4;
  return film(cards, { seed, duration, starts, handoff, FAM, T });
}

// =====================================================================================
// 두 장소(생활 도구) — 맥(어두운 쪽)과 폰(밝은 쪽)
// =====================================================================================
function makeSplit(work: GenreWork, seed: number, FAM: string, LB: Lbl, T: Tools) {
  const { layout } = v2tools(T);
  const BEAT = 0.625, HB = BEAT / 2;
  const q = (t: number) => Math.ceil(t / HB - 1e-6) * HB;
  const ACC = work.accent || "#ff9f0a";
  const cards: VCard[] = [];
  let Tt = 0, D = 1000;
  const open = (split: number): VCard => { const c: VCard = { t0: Tt, t1: Tt, bg: PAPER, split, from: D, slugs: [], rules: [], push: 0, anchor: [0, 0] }; D = split; cards.push(c); return c; };
  const wait = (c: VCard) => (Math.abs((c.split ?? 0) - (c.from ?? 0)) > 60 ? 0.42 : 0);
  const close = (c: VCard, dur: number) => { Tt = q(Tt + dur); c.t1 = Tt; };
  const S = (c: VCard, o: Partial<VSlug> & { txt: string; x: number; y: number; size: number }) => { const s: VSlug = { stretch: "semi-condensed", weight: 800, on: 0, ...o }; if (!s.color && s.side) s.color = s.side === "L" ? PAPER : INK; c.slugs.push(s); return s; };
  const RL = (c: VCard, o: Partial<VRule> & { x0: number; x1: number; y: number; color: string }) => { const r: VRule = { h: 3, on: 0, draw: 0, ...o }; c.rules.push(r); return r; };
  const L0 = (split: number) => ({ x: M, w: split - 2 * M }), R0 = (split: number) => ({ x: split + M, w: W - split - 2 * M });
  const lines = (c: VCard, lay: Line[], on0: number, o: Partial<VSlug>) => { let on = on0; lay.forEach((L) => { S(c, { ...L, on, slam: true, ...o }); on += readT(L.txt); }); return on; };
  let handoff: { at: number; ink: string; handle: string } | null = null;
  const starts: number[] = [];

  work.scenes.forEach((s, si) => {
    starts[si] = Tt;
    if (s.kind === "story" || s.kind === "hook") {
      // 집: 맥 쪽이 첫 줄을 쥐고, 경계가 밀리면 밖(폰 쪽)에서 묻는다
      const c = open(1000);
      const a = L0(1000);
      const first = s.kind === "story" ? s.line : s.label + " " + s.value;
      const A = layout(phrases(first, 14), { x: a.x, y: M + 10, w: a.w, h: H - 2 * M - 20, cap: 190, lh: 1.02 });
      close(c, lines(c, A, wait(c), { side: "L" }) + 0.25);
      const second = s.kind === "story" ? s.line2 : s.line;
      if (second) {
        const c2 = open(560);
        const b = R0(560);
        const B = layout(phrases(second, 14), { x: b.x, y: H * 0.3, w: b.w, h: H * 0.7 - M, cap: 190, lh: 1.02 });
        close(c2, lines(c2, B, wait(c2), { side: "R" }) + 0.3);
      }
    } else if (s.kind === "flow" && s.nodes.length >= 3 && s.nodes.length <= 4 && s.nodes.some((n) => /encrypt|암호/i.test(n))) {
      // 맥은 어두운 쪽, 폰은 밝은 쪽, 가운데 낱말이 경계를 건넌다
      const c = open(800);
      const w0 = wait(c);
      const n = s.nodes;
      const fa = T.fill(n[0], 800 - 2 * M, 300, 900, 2, 6), sa = Math.min(fa.size, 300);
      S(c, { txt: n[0], x: M - sa * 0.03, y: M + sa * 0.74, size: sa, stretch: fa.stretch, weight: 900, side: "L", on: w0, slam: true });
      const last = n[n.length - 1];
      const fb = T.fill(last, W - 800 - 2 * M, 240, 900, 2, 6), sb = Math.min(fb.size, 240);
      S(c, { txt: last, x: W - M, y: H - M - 110, size: sb, stretch: fb.stretch, weight: 900, side: "R", align: "right", on: w0 + 0.4, slam: true });
      const mid = n.slice(1, -1).join(" · ");
      const sm = Math.min(112, (W * 0.42 / Math.max(1, T.widthOf(mid, 100, 900, "semi-condensed"))) * 100), mw = T.widthOf(mid, sm, 900, "semi-condensed");
      const go = w0 + 0.9, travel = 1.3;
      S(c, { txt: mid, x: M, y: H * 0.5, size: sm, weight: 900, color: ACC, on: go, move: { x0: M, x1: W - M - mw, delay: 0.25, dur: travel }, slam: true });
      let on = go;
      const ph = twoPhrases(s.line);
      const fitSide = (txt: string, w: number) => Math.min(44, (w / Math.max(1, T.widthOf(txt, 100, 700, "semi-condensed"))) * 100);
      if (ph.length === 2) {
        // 앞 구절은 상태가 맥을 떠날 때, 뒤 구절은 폰에 닿을 때
        S(c, { txt: ph[0], x: M, y: H - M + 6, size: fitSide(ph[0], 800 - 2 * M), weight: 700, side: "L", on: go, slam: true });
        on = go + 0.25 + travel;
        S(c, { txt: ph[1], x: 800 + M, y: H - M + 6, size: fitSide(ph[1], W - 800 - 2 * M), weight: 700, side: "R", on, slam: true });
        on += readT(ph[1]);
      } else {
        on = go + 0.25 + travel;
        const B = layout(phrases(s.line, 24), { x: 800 + M, y: H - M - 110, w: W - 800 - 2 * M, h: 120, cap: 44, weight: 700, lh: 1.1 });
        on = lines(c, B, on, { side: "R" });
      }
      close(c, on + 0.3);
    } else if (s.kind === "flow") {
      // 맥에서 일어나는 차례(왼쪽, 위에서 아래로), 그 풀이는 폰 쪽
      const c = open(1080);
      const a = L0(1080), b = R0(1080);
      const n = s.nodes.length, rowH = (H - 2 * M) / n;
      const A = layout(s.nodes.map((nd) => norm(nd)), { x: a.x + 90, y: 0, w: a.w - 90, h: 9999, cap: rowH * 0.62 });
      let on = wait(c);
      A.forEach((L, i) => {
        const y = M + rowH * (i + 1) - rowH * 0.3;
        if (i) S(c, { txt: "→", x: a.x, y, size: L.size * 0.8, stretch: "normal", weight: 700, side: "L", on });
        S(c, { ...L, y, side: "L", on, slam: true, color: i === n - 1 ? ACC : PAPER });
        on += BEAT;
      });
      const B = layout(phrases(s.line, 16), { x: b.x, y: H * 0.42, w: b.w, h: H * 0.58 - M, cap: 64, lh: 1.12 });
      close(c, lines(c, B, on + 0.1, { side: "R" }) + 0.3);
    } else if (s.kind === "alert") {
      // 호출은 폰 쪽에 떨어지고 떤다
      const c = open(380);
      const w0 = wait(c);
      const b = R0(380);
      RL(c, { x0: b.x - 30, x1: W + 40, y: 230, h: 330, color: ACC, side: "R", on: w0, buzz: true });
      S(c, { txt: norm(s.title), x: b.x + 20, y: 320, size: 52, weight: 700, color: INK, side: "R", on: w0, buzz: true });
      const fb = layout([norm(s.body)], { x: b.x + 20, y: 360, w: b.w - 60, h: 160, cap: 130, weight: 900 });
      S(c, { ...fb[0], color: INK, side: "R", on: w0, slam: true, buzz: true });
      if (s.data === "sample") S(c, { txt: LB.sampleAlert, x: b.x, y: H - M, size: 28, weight: 600, side: "R", on: w0 });
      close(c, w0 + readT(s.title + " " + s.body) + 0.3);
      const c2 = open(380);
      const B = layout(phrases(s.line, 20), { x: b.x, y: M + 10, w: b.w, h: H * 0.62, cap: 170, lh: 1.04 });
      close(c2, lines(c2, B, 0, { side: "R" }) + 0.15);
      if (s.line2) {
        const c3 = open(1040);
        const a = L0(1040);
        const A = layout(phrases(s.line2, 16), { x: a.x, y: H * 0.42, w: a.w, h: H * 0.58 - M, cap: 140, lh: 1.04 });
        close(c3, lines(c3, A, wait(c3), { side: "L" }) + 0.3);
      }
    } else if (s.kind === "items") {
      // 폰 화면: 값들이 밝은 쪽에 쌓이고, 설명은 집에 남는다
      const c = open(560);
      const w0 = wait(c);
      const b = R0(560), a = L0(560);
      const n = s.items.length, rowH = (H - 2 * M - 30) / n;
      const A = layout(phrases(s.line, 16), { x: a.x, y: M + 10, w: a.w, h: H - 2 * M, cap: 70, lh: 1.08 });
      const capEnd = lines(c, A, w0, { side: "L", color: ACC });
      let on = w0 + 0.6;
      s.items.forEach((it, i) => {
        const y = M + rowH * (i + 1) - rowH * 0.2;
        if (it.value.trim() === "✓") S(c, { txt: "", check: true, x: b.x + 6, y, size: rowH * 0.8, color: INK, side: "R", on });
        else S(c, { txt: it.value, x: b.x, y, size: Math.min(rowH * 0.78, (280 / Math.max(1, T.widthOf(it.value, 100, 900, "normal"))) * 100), weight: 900, stretch: "normal", side: "R", color: it.alarm ? (work.alarm || ACC) : INK, on, slam: true });
        S(c, { txt: norm(it.label), x: b.x + 300, y, size: Math.min(48, rowH * 0.34, ((b.w - 300) / Math.max(1, T.widthOf(norm(it.label), 100, 700, "semi-condensed"))) * 100), weight: 700, side: "R", on, slam: true });
        RL(c, { x0: b.x, x1: W - M, y: y + rowH * 0.16, h: 2, color: "rgba(13,13,13,0.25)", side: "R", on });
        on += 0.56;
      });
      if (s.data === "sample") S(c, { txt: LB.sampleReadings, x: W - M, y: H - M + 34, size: 24, weight: 600, side: "R", align: "right", on: w0 });
      close(c, Math.max(on + 0.8, capEnd + 0.4));
    } else if (s.kind === "ending") {
      // 이름은 두 곳에 걸친다
      const c = open(800);
      const w0 = wait(c);
      const f = T.fill(s.name, W - 2 * M, 320, 900, 1, 6), sz = Math.min(f.size, 330);
      S(c, { txt: s.name, x: M - sz * 0.02, y: H * 0.5, size: sz, stretch: f.stretch, weight: 900, two: true, colL: PAPER, colR: INK, on: w0, slam: true });
      let on = w0 + 0.5;
      const A = layout(phrases(s.line, 24), { x: M, y: H * 0.5 + 70, w: 800 - 2 * M, h: 130, cap: 50, lh: 1.1 });
      on = lines(c, A, on, { side: "L" });
      if (s.line2) {
        const B = layout(phrases(s.line2, 24), { x: 800 + M, y: H * 0.5 + 70, w: W - 800 - 2 * M, h: 130, cap: 50, lh: 1.1 });
        on = lines(c, B, on, { side: "R" });
      }
      close(c, on + 1.2);
      handoff = { at: 0, ink: INK, handle: work.handle };
    } else {
      // 명령·숫자 장면: 맥 쪽에서 일어나 폰 쪽에 숫자로 남는다
      const c = open(D);
      const b = R0(D);
      const txt = s.kind === "terminal" ? [s.command, ...s.output, s.line].join(" — ") : s.kind === "stats" ? s.stats.map((x) => x.value + x.unit + " " + x.label).join(", ") + " — " + s.line : "";
      const B = layout(phrases(txt, 20), { x: b.x, y: M, w: b.w, h: H - 2 * M, cap: 100, lh: 1.05 });
      close(c, lines(c, B, 0, { side: "R" }) + 0.3);
    }
  });
  const duration = fit(cards, Tt, starts);
  if (handoff) (handoff as { at: number }).at = duration - 2.4;
  return film(cards, { seed, duration, starts, handoff, FAM, T });
}

export const kinetic: Genre = {
  id: "kinetic",
  name: "Kinetic type",
  ko: "키네틱 타이포",
  koIdea: "박자에 맞춰 글자가 꽂히는 타이틀 시퀀스 — 작품마다 제 주제로 짠 글자 체계(라벨·장부·두 장소)",
  enIdea: "A title sequence where type lands on the beat — each work gets a type system built from its subject (labels, a ledger, two places)",
  family: "C",
  fonts: ["anybody", "spaceMono"],
  make(work, { seed, fonts }) {
    const FAM = fonts.anybody, MONO = fonts.spaceMono;
    const LB: Lbl = LABEL[work.locale];
    const T = tools(FAM);
    const sys = pickSys(work);
    if (sys === "bars") return makeBars(work, seed, FAM, MONO, LB, T);
    if (sys === "ledger") return makeLedger(work, seed, FAM, MONO, LB, T);
    return makeSplit(work, seed, FAM, LB, T);
  },
};
