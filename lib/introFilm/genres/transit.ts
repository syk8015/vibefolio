// 지하철 표지 — 작품이 한 노선을 따라 달린다. 장면마다 역에 서서 승강장 표지판을 읽고, 역과 역 사이는 진짜로 달린다
// (필름 실험실 G36 → 2차 수정 transit-v2, 2026-10-08). 떠날 때 카메라가 창에서 객차 안으로 물러나 노선도가 나아가고,
// LED·LCD 안내가 "다음 역"으로 바뀌고, 손잡이가 열차의 가감속대로 흔들리고, 터널 등이 창밖으로 흐른다. 닿을 때는 다음 승강장이
// 창 안으로 감속해 들어오고 카메라가 다시 창으로 다가가 표지판이 화면이 된다.
// 움직임 문법: 곡선 = 열차 물리(거듭제곱 제동·출발, 등속 주행) · 계단 = 카메라 60fps, 안내판 갈아 쓰기 24fps ·
// 전환 = 달리기(창 ⇄ 객차 이동) · 글자 등장 = 표지판이 미끄러져 와서 선다.
import type { FlatScene, Genre, GenreWork } from "./types";
import * as K from "./kit";

type Ctx = CanvasRenderingContext2D;
const W = K.W, H = K.H;
const LINE_INKS = ["#00933c", "#ff6319", "#fccc0a", "#ee352e", "#0039a6", "#b933ad"];

// 틀이 스스로 그리는 표시 — 영상의 언어로, 지하철의 말로.
const LABEL = {
  en: { readings: "Sample readings", figures: "Sample figures", run: "sample run", notice: "Sample notice", source: "Source: ", next: "NEXT", last: "LAST STOP", lcdNow: "Now", lcdNext: "Next", lcdLast: "Last stop" },
  ko: { readings: "예시 측정값", figures: "예시 수치", run: "예시 실행", notice: "예시 안내문", source: "출처: ", next: "다음 역", last: "종착역", lcdNow: "이번 역", lcdNext: "다음 역", lcdLast: "종착역" },
};

// ---- 한글은 두 칸 폭(읽는 시간도 더 든다) ----
const isWide = (c: string) => {
  const n = c.codePointAt(0) || 0;
  return (n >= 0x1100 && n <= 0x115f) || (n >= 0x2e80 && n <= 0xa4cf) || (n >= 0xac00 && n <= 0xd7a3) || (n >= 0xf900 && n <= 0xfaff) || (n >= 0xff00 && n <= 0xff60) || (n >= 0xffe0 && n <= 0xffe6) || n >= 0x1f300;
};
const readLen = (s: string) => Array.from(s).reduce((a, c) => a + (isWide(c) ? 1.7 : 1), 0);

type Loose = {
  kind: FlatScene["kind"]; label?: string; value?: string; line?: string; line2?: string; title?: string; body?: string; command?: string; name?: string;
  source?: string; data?: "sample" | "measured"; alarm?: boolean; nodes?: string[]; output?: string[];
  items?: { value: string; label: string; alarm?: boolean }[]; stats?: { value: string; unit: string; label: string }[];
};
type SysId = "band" | "panel" | "hang";
type Sys = { wall: string; grout: string; sign: string; text: string; dim: string; wallText: string; plate: string; plateText: string; pillar: string; pillarEdge: string; alarm: string; tunnel: string; lamp: string };

// three sign systems — picked from what the work is
const SYSTEMS: Record<SysId, Sys> = {
  band: { // black-band signs on white subway tile
    wall: "#dfe2e0", grout: "#c8cdcb", sign: "#141414", text: "#ffffff", dim: "#a8adab",
    wallText: "#141414", plate: "#ffffff", plateText: "#141414", pillar: "#262a29", pillarEdge: "#3a403e",
    alarm: "#ee352e", tunnel: "#060606", lamp: "#f3e3b5",
  },
  panel: { // flush white panels with a line stripe, on board-formed concrete
    wall: "#3b3e42", grout: "#33363a", sign: "#f1f2ee", text: "#151515", dim: "#5d6063",
    wallText: "#f1f2ee", plate: "#f1f2ee", plateText: "#151515", pillar: "#202225", pillarEdge: "#2c2f33",
    alarm: "#ee352e", tunnel: "#050506", lamp: "#e9eef2",
  },
  hang: { // yellow signs hung from the ceiling, charcoal hall
    wall: "#1d1f22", grout: "#25282c", sign: "#ffc72c", text: "#111111", dim: "#5a4710",
    wallText: "#ffc72c", plate: "#2b2e32", plateText: "#ffc72c", pillar: "#0e0f10", pillarEdge: "#17191b",
    alarm: "#e3202b", tunnel: "#040404", lamp: "#ffd98a",
  },
};

type Car = {
  k: number; X: number; Y: number; r: number; wall: string; lower: string; ceil: string; light: string; gasket: string; seat: string | null; seatTop: string | null; rib: boolean;
  pole: string; poleHi: string; mapBg: string; mapInk: string; disp: "led" | "lcd"; dispBg: string; dispOn: string; dispOff: string; strap: string; handle: string;
  door: { x: number; w: number } | null; pole1: number; card: { x: number; y: number; w: number; h: number; bg: string; ink: string };
};
// the car you ride in — one interior per sign system (car coords = screen when the camera is pulled back)
const CARS: Record<SysId, Car> = {
  // stainless-and-graphite car, green bench (the line), amber LED, white car-card on the right
  band: { k: 0.6, X: 320, Y: 262, r: 22, wall: "#3b4146", lower: "#30353a", ceil: "#2a2e32", light: "#eef0ec", gasket: "#15181a", seat: null, seatTop: null, rib: true,
    pole: "#a7aeb2", poleHi: "#e3e6e7", mapBg: "#f7f7f5", mapInk: "#141414", disp: "led", dispBg: "#0b0b0b", dispOn: "#ffab2e", dispOff: "#241c12", strap: "#15171a", handle: "#f2f2ef",
    door: null, pole1: 186, card: { x: 1338, y: 300, w: 236, h: 300, bg: "#f7f7f5", ink: "#141414" } },
  // bright modern car, benches in the app's own colour, an LCD line display, car-card on the left
  panel: { k: 0.62, X: 304, Y: 262, r: 40, wall: "#e9ecee", lower: "#dbe0e3", ceil: "#f4f5f6", light: "#ffffff", gasket: "#2a2e33", seat: null, seatTop: null, rib: false,
    pole: "#b6bcc0", poleHi: "#f4f5f6", mapBg: "#ffffff", mapInk: "#151515", disp: "lcd", dispBg: "#0f1d2b", dispOn: "#ffffff", dispOff: "#8da3b8", strap: "#c9ced2", handle: "#ffffff",
    door: null, pole1: 1386, card: { x: 30, y: 300, w: 236, h: 300, bg: "#151515", ink: "#ffffff" } },
  // older steel-blue car: a door at the left, yellow grab rails, red LED
  hang: { k: 0.54, X: 650, Y: 276, r: 14, wall: "#4a5359", lower: "#3e464c", ceil: "#353c41", light: "#f2f0e6", gasket: "#0c0d0e", seat: "#24282c", seatTop: "#3a4046", rib: false,
    pole: "#ffc72c", poleHi: "#ffe08a", mapBg: "#ffc72c", mapInk: "#111111", disp: "led", dispBg: "#0a0a0a", dispOn: "#ff3b2f", dispOff: "#260d0b", strap: "#111111", handle: "#ffc72c",
    door: { x: 54, w: 300 }, pole1: 372, card: { x: 410, y: 330, w: 206, h: 280, bg: "#111111", ink: "#ffc72c" } },
};

/** 작품의 모양에서 표지 체계를 고른다: 터미널 → 검은 띠(뉴욕식), 퍼센트 측정값·경고 훅 → 노란 매단 표지, 나머지 → 흰 판. */
function pickSystem(work: GenreWork): SysId {
  const sc = work.scenes;
  if (sc.some((s) => s.kind === "terminal")) return "band";
  const pct = sc.some((s) => s.kind === "items" && s.items.length > 0 && s.items.every((it) => /^\s*[\d.,]+\s*%\s*$/.test(it.value)));
  if (pct || sc.some((s) => s.kind === "hook" && s.alarm)) return "hang";
  return "panel";
}
/** 제목 "이름 · 한 줄 소개" → 이름과 소개. */
function splitTitle(t: string): { name: string; pitch: string } {
  for (const sep of [" · ", " — ", " | "]) {
    const i = t.indexOf(sep);
    if (i > 0) return { name: t.slice(0, i).trim(), pitch: t.slice(i + sep.length).trim() };
  }
  return { name: t.trim(), pitch: "" };
}
/** short station name: whole words up to n reading-width (Hangul counts wider); no dangling little words. */
function short(raw: string, n = 22): string {
  let s = String(raw).trim();
  if (/^[A-Z0-9 %$'’.,:-]+$/.test(s) && s.length > 3) s = s.toLowerCase().replace(/(^|\s)([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase());
  if (readLen(s) <= n) return s;
  const words = s.split(/\s+/);
  let r = "";
  for (const w of words) { const nx = r ? r + " " + w : w; if (readLen(nx) > n && r) break; r = nx; }
  if (readLen(r) > n) { let c = ""; for (const ch of Array.from(r)) { if (readLen(c + ch) > n) break; c += ch; } r = c; }
  r = r.replace(/[,.:;—–-]+$/, "");
  const small = /\s(is|not|a|an|the|to|my|and|on|of|it|in|at|or|for|but)$/i;
  while (small.test(r)) r = r.replace(small, "");
  return r;
}
function stationName(s: Loose, n: number): string {
  const m: Record<string, string | undefined> = {
    hook: s.label, story: s.line, flow: s.nodes && s.nodes[s.nodes.length - 1], terminal: s.command && s.command.split(" ").slice(0, 2).join(" "),
    items: s.items && s.items.length ? s.items[0].label + " +" + (s.items.length - 1) : undefined, alert: s.title, stats: s.stats && s.stats[0] ? s.stats[0].label : undefined, ending: s.name,
  };
  return short(m[s.kind] || s.kind, n);
}

function rrect(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function arrow(c: Ctx, x: number, y: number, s: number, dir: number, col: string) { // wayfinding arrow, drawn not typed
  c.save(); c.translate(x, y); c.rotate((dir * Math.PI) / 4); c.fillStyle = col;
  c.beginPath();
  c.moveTo(s * 0.5, 0); c.lineTo(0, -s * 0.5); c.lineTo(-s * 0.04, -s * 0.36); c.lineTo(s * 0.25, -s * 0.085);
  c.lineTo(-s * 0.5, -s * 0.085); c.lineTo(-s * 0.5, s * 0.085); c.lineTo(s * 0.25, s * 0.085);
  c.lineTo(-s * 0.04, s * 0.36); c.lineTo(0, s * 0.5); c.closePath(); c.fill(); c.restore();
}

function wallCanvas(sysId: SysId, S: Sys, seed: number): HTMLCanvasElement {
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const c = cv.getContext("2d")!;
  c.fillStyle = S.wall; c.fillRect(0, 0, W, H);
  const r = K.rng(seed + 11);
  if (sysId === "band") { // 3x6 subway tile, slightly uneven grout
    c.fillStyle = S.grout;
    for (let y = 0; y < H; y += 44) c.fillRect(0, y, W, 2);
    for (let row = 0, y = 0; y < H; y += 44, row++) for (let x = (row % 2) * 44; x < W + 88; x += 88) c.fillRect(x, y, 2, 44);
    for (let i = 0; i < 70; i++) { c.fillStyle = K.rgba("#7f8a86", 0.04 + r() * 0.05); c.fillRect(Math.floor(r() * 19) * 88 + (r() > 0.5 ? 44 : 0), Math.floor(r() * 21) * 44 + 2, 86, 42); }
    c.fillStyle = "#c2c7c5"; c.fillRect(0, H - 70, W, 70); // dado band at the floor line
    c.fillStyle = "#b5bbb8"; c.fillRect(0, H - 70, W, 3);
  } else if (sysId === "panel") { // board-formed concrete: plank lines + tie holes
    for (let y = 0; y < H; y += 75) { c.fillStyle = K.rgba("#000000", 0.12); c.fillRect(0, y, W, 2); }
    for (let i = 0; i < 2600; i++) { c.fillStyle = K.rgba(r() > 0.5 ? "#ffffff" : "#000000", 0.03 + r() * 0.04); c.fillRect(r() * W, r() * H, 1 + r() * 3, 1 + r() * 2); }
    for (let x = 100; x < W; x += 400) for (let y = 112; y < H; y += 300) { c.fillStyle = "#2b2e31"; c.beginPath(); c.arc(x, y, 7, 0, 7); c.fill(); }
  } else { // dark hall, low ceiling soffit with a light slot
    c.fillStyle = "#141518"; c.fillRect(0, 0, W, 64);
    c.fillStyle = "#3a3c3f"; c.fillRect(0, 60, W, 4);
    for (let i = 0; i < 1800; i++) { c.fillStyle = K.rgba("#ffffff", 0.012 + r() * 0.02); c.fillRect(r() * W, 64 + r() * H, 1 + r() * 2, 1 + r() * 2); }
    c.fillStyle = "#26292d"; c.fillRect(0, H - 90, W, 90);
  }
  return cv;
}

type Stn = { s: Loose; i: number; A: number; stop: number; D: number; end: number; tun: number; last: boolean; P: number; x0: number; flip: boolean; pillar: number | null; dy: number; fi: number };

export const transit: Genre = {
  id: "transit",
  name: "Transit wayfinding",
  ko: "지하철 표지",
  koIdea: "작품이 한 노선을 따라 달리고, 장면마다 역에 멈춰 표지판을 읽고, 역 사이에선 객차 안에서 노선도와 다음 역 안내를 보는 영화",
  enIdea: "The work rides one subway line: every scene is a station sign, and between stations you ride the car — line map, next-stop display, tunnel lights",
  family: "D",
  fonts: ["overpass", "overpassMono"],
  make(work, { seed, fonts }) {
    const F = fonts.overpass, M = fonts.overpassMono;
    const T = LABEL[work.locale];
    const font = (s: number, w: number = 700, fam: string = F) => K.font(s, fam, w);
    // Overpass draws U+00B7 (middle dot) with zero width — use its bullet instead, which reads the same at sign sizes
    const dot = (s: string) => s.replace(/\u00b7/g, "\u2022");
    const fit = (c: Ctx, raw: string, fam: string, wt: number, maxW: number, maxS: number, minS = 28) => {
      const text = dot(raw);
      let s = maxS;
      c.font = K.font(s, fam, wt);
      while (s > minS && c.measureText(text).width > maxW) { s -= 2; c.font = K.font(s, fam, wt); }
      return s;
    };
    /** word wrap on spaces; a word wider than the line breaks between letters (long Korean phrases). */
    const wrapLines = (c: Ctx, raw: string, maxW: number): string[] => {
      const text = dot(raw);
      const out: string[] = [];
      for (const ln of K.wrap(c, text, maxW)) {
        if (c.measureText(ln).width <= maxW) { out.push(ln); continue; }
        let cur = "";
        for (const ch of Array.from(ln)) { if (cur && c.measureText(cur + ch).width > maxW) { out.push(cur); cur = ch; } else cur += ch; }
        if (cur) out.push(cur);
      }
      return out;
    };
    const tx = (c: Ctx, s: string, x: number, y: number, size: number, col: string, wt = 700, fam = F, align: CanvasTextAlign = "left") => {
      c.font = font(size, wt, fam); c.fillStyle = col; c.textAlign = align; c.fillText(dot(s), x, y); c.textAlign = "left";
    };

    const sysId = pickSystem(work);
    const S = SYSTEMS[sysId];
    // accent policy: the white-panel system adopts the app's own colour; the others snap to transit inks
    const line = sysId === "panel" && work.accent ? work.accent : K.snap(work.accent, LINE_INKS);
    const lineOn = sysId === "hang" ? "#111111" : line; // yellow system: route colour is the black on yellow
    const lineTx = K.oklch(lineOn)[0] > 0.72 ? "#111" : "#fff";
    const { name: workName, pitch: titlePitch } = splitTitle(work.title);
    const letter = (() => {
      const cap = workName.slice(1).search(/[A-Z]/);
      if (cap >= 0) return workName[cap + 1];
      const words = workName.split(/\s+/);
      return (words.length > 1 ? Array.from(words[1])[0] : Array.from(workName)[0] || "N").toUpperCase();
    })();
    const square = sysId === "hang";
    const wall = wallCanvas(sysId, S, seed);
    const scratch = document.createElement("canvas"); scratch.width = W; scratch.height = H;
    const sx = scratch.getContext("2d")!;
    const R = (i: number, j: number) => K.rand(seed, i, j);

    function bullet(c: Ctx, x: number, y: number, r: number, col: string, label: string, tcol: string, sq: boolean) {
      c.fillStyle = col;
      if (sq) { rrect(c, x - r, y - r, r * 2, r * 2, r * 0.22); c.fill(); }
      else { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
      if (label) {
        c.fillStyle = tcol; c.textAlign = "center"; c.textBaseline = "middle";
        c.font = font(r * (isWide(label) ? 1.05 : 1.25), 700); c.fillText(label, x, y + r * 0.08);
        c.textAlign = "left"; c.textBaseline = "alphabetic";
      }
    }
    function pill(c: Ctx, x: number, y: number, h: number, col: string, label: string, tcol: string, size: number) { // right-aligned value pill
      c.font = font(size, 700);
      const w = Math.max(h, c.measureText(label).width + h * 0.7);
      c.fillStyle = col; rrect(c, x - w, y - h / 2, w, h, h / 2); c.fill();
      c.fillStyle = tcol; c.textAlign = "center"; c.textBaseline = "middle";
      c.fillText(label, x - w / 2, y + size * 0.06); c.textAlign = "left"; c.textBaseline = "alphabetic";
      return w;
    }

    // ---------- timing: hold from reading load; every gap between stations is a ride ----------
    const sc: Loose[] = work.scenes;
    const chars = (s: Loose) => readLen([s.label, s.value, s.line, s.line2, s.title, s.body, s.command, s.name, s.source,
      ...(s.nodes || []), ...(s.output || []), ...(s.items || []).map((x) => x.label + x.value), ...(s.stats || []).map((x) => x.label + x.value)]
      .filter(Boolean).join(" "));
    const extra: Record<string, number> = { hook: 0.6, story: 0.2, flow: 1.2, terminal: 1.0, items: 0.7, alert: 0.5, stats: 0.6, ending: 0 };
    const names = sc.map((s) => stationName(s, work.locale === "ko" ? 14 : 22)); // a station name is a few words, in either language
    let holds = sc.map((s) => K.clamp(chars(s) / 19 + 0.6 + (extra[s.kind] || 0), 2.0, 6.0));
    // train physics: braking ARR s into a stop, pulling away for DEP s, cruising between (power curves, never symmetric)
    const ARR = 1.0, DEP = 0.85, PA = 2.4, PD = 2.1;
    const VC = (1.3 * W * PA) / ARR; // cruise speed, px/s in window coords: the platform enters 1.3 widths out
    const PULL = 0.75, PUSH = 0.85; // camera: step back from the window into the car / lean back into the window
    // rides differ: one is an express (long tunnel), the rest are short hops
    const longRide = 1 + Math.floor(R(5, 5) * Math.max(1, sc.length - 2));
    const tun = sc.map((_, i) => (i + 1 === longRide ? 0.95 : 0.26 + R(i, 3) * 0.32));
    const st: Stn[] = [];
    const build = () => {
      st.length = 0; let t0 = -0.62; // in medias res: the train is already braking at t = 0
      sc.forEach((s, i) => {
        const A = t0, stop = A + ARR, last = i === sc.length - 1;
        const D = stop + holds[i] + (last ? 2.7 : 0);
        st.push({ s, i, A, stop, D, end: D + DEP, tun: tun[i], last, P: 0, x0: 0, flip: false, pillar: null, dy: 0, fi: 0 });
        t0 = D + DEP + tun[i];
      });
      return st[st.length - 1].D;
    };
    const wKey: Record<string, number> = { terminal: 1.5, alert: 1.3, items: 1.1 };
    const keyScore = holds.map((h, i) => h * (wKey[sc[i].kind] || 1));
    const keyI = keyScore.indexOf(Math.max(...keyScore)); // the one long hold (≥ 4 s) of the film
    holds[keyI] = Math.max(4.0, holds[keyI]);
    let kk = 0;
    while (build() > 29.3 && kk++ < 120) holds = holds.map((h, i) => (i === keyI ? Math.max(4.0, h * 0.97) : Math.max(1.9, h * 0.96)));
    const duration = st[st.length - 1].D;
    const starts = st.map((X) => Math.max(0, X.A));

    // track position x(t) in window px — one continuous function, so lamps, platforms and straps all agree
    let acc = 0;
    st.forEach((X) => {
      X.x0 = acc;
      X.P = acc + (VC * ARR) / PA;
      acc = X.P + (VC * DEP) / PD + VC * X.tun;
    });
    const xAt = (t: number) => {
      let X = st[0];
      for (const q of st) if (t >= q.A) X = q;
      if (t < X.A) return X.x0 - VC * (X.A - t);
      if (t < X.stop) return X.P - ((VC * ARR) / PA) * Math.pow(1 - (t - X.A) / ARR, PA);
      if (t < X.D || X.last) return X.P;
      if (t < X.end) return X.P + ((VC * DEP) / PD) * Math.pow((t - X.D) / DEP, PD);
      return X.P + (VC * DEP) / PD + VC * (t - X.end);
    };
    const vAt = (t: number) => (xAt(t) - xAt(t - 1 / 60)) * 60; // px/s

    // composition seeds per station
    let flowCount = 0;
    st.forEach((x) => {
      x.flip = R(x.i, 7) > 0.5;
      x.pillar = R(x.i, 8) < 0.55 ? (R(x.i, 9) > 0.5 ? W - 64 : -86) : null;
      x.dy = Math.round((R(x.i, 10) - 0.5) * 60);
      if (x.s.kind === "flow") x.fi = flowCount++;
    });

    // ---------- signs ----------
    function signPanel(c: Ctx, x: number, y: number, w: number, h: number) {
      if (sysId === "band") {
        c.fillStyle = S.sign; c.fillRect(x, y, w, h);
        c.fillStyle = "#ffffff"; c.fillRect(x, y + 14, w, 3); // the white rule along the top of a black band
      } else if (sysId === "panel") {
        c.fillStyle = "rgba(0,0,0,0.35)"; c.fillRect(x + 6, y + 8, w, h); // flush-mount shadow gap
        c.fillStyle = S.sign; c.fillRect(x, y, w, h);
        c.fillStyle = line; c.fillRect(x, y, 22, h); // the line stripe runs down the leading edge
        c.fillStyle = "#b9bbb6";
        for (const [px, py] of [[x + 44, y + 18], [x + w - 18, y + 18], [x + 44, y + h - 18], [x + w - 18, y + h - 18]]) { c.beginPath(); c.arc(px, py, 4, 0, 7); c.fill(); }
      } else {
        c.strokeStyle = "#55595e"; c.lineWidth = 3;
        for (const cx of [x + 60, x + w - 60]) { c.beginPath(); c.moveTo(cx, 64); c.lineTo(cx, y); c.stroke(); }
        c.fillStyle = S.sign; rrect(c, x, y, w, h, 10); c.fill();
        c.fillStyle = "rgba(0,0,0,0.18)"; c.fillRect(x, y + h - 6, w, 6);
      }
    }
    function plate(c: Ctx, x: number, y: number, text: string) { // a small screwed-on information plate — the medium's "sample" mark
      c.font = font(30, 700);
      const w = c.measureText(text).width + 44;
      c.fillStyle = S.plate; c.fillRect(x, y, w, 56);
      c.strokeStyle = S.plateText; c.lineWidth = 2; c.strokeRect(x + 6, y + 6, w - 12, 44);
      c.fillStyle = S.plateText; c.fillText(text, x + 22, y + 39);
      return w;
    }
    const sampleWord = sysId === "hang" ? T.readings : T.figures;
    const ruleCol = sysId === "band" ? "#ffffff" : "#000000";

    const draw: Record<FlatScene["kind"], (c: Ctx, s: Loose, X: Stn, u: number, dur: number) => void> = {
      hook(c, s, X) {
        const x = X.flip ? 420 : 96, y = 150 + X.dy, w = 1084, h = 560;
        signPanel(c, x, y, w, h);
        const pad = sysId === "panel" ? 76 : 56;
        bullet(c, x + pad + 34, y + 96, 34, lineOn, letter, lineTx, square);
        const label = s.label || "", value = s.value || "", ln = s.line || "";
        tx(c, label, x + pad + 92, y + 112, fit(c, label, F, 700, w - pad - 140, 46), S.text);
        const vs = fit(c, value, F, 900, w - pad * 2, 290);
        if (s.alarm) {
          c.font = font(vs, 900); const vw = c.measureText(value).width;
          c.fillStyle = S.alarm; rrect(c, x + pad - 18, y + 150, vw + 52, vs * 0.86, 18); c.fill();
          tx(c, value, x + pad + 8, y + 150 + vs * 0.76, vs, "#ffffff", 900);
        } else tx(c, value, x + pad - 8, y + 150 + vs * 0.76, vs, S.text, 900);
        tx(c, ln, x + pad, y + h - 62, fit(c, ln, F, 400, w - pad * 2, 46), S.text, 400);
        if (s.data === "sample") plate(c, X.flip ? 96 : x + w + 36, y + h - 56, sampleWord);
      },
      story(c, s, X) {
        const y = 230 + X.dy, h = 380;
        signPanel(c, sysId === "hang" ? 140 : 0, y, sysId === "hang" ? W - 280 : W, h);
        const x0 = sysId === "hang" ? 236 : 210;
        arrow(c, x0 - 60, y + 112, 92, 0, S.text);
        c.font = font(62, 700);
        const s1 = wrapLines(c, s.line || "", W - x0 - 190).length > 2 ? 54 : 62;
        c.font = font(s1, 700);
        const L1 = wrapLines(c, s.line || "", W - x0 - 190).slice(0, 3);
        L1.forEach((l, i) => tx(c, l, x0 + 40, y + 135 + i * s1 * 1.12, s1, S.text, 700));
        const y2 = y + 135 + L1.length * s1 * 1.12 + 34;
        tx(c, s.line2 || "", x0 + 40, y2, fit(c, s.line2 || "", F, 400, W - x0 - 230, 44), S.dim, 400);
      },
      flow(c, s, X, u, dur) {
        const vertical = X.fi % 2 === 1;
        const nodes = s.nodes || [];
        const n = nodes.length;
        const runT = Math.max(1.2, dur - 1.1);
        // train progress with a short dwell at each station
        const pr = K.clamp(u / runT) * (n - 1);
        const seg = Math.max(0, Math.min(n - 2, Math.floor(pr))), f = pr - seg;
        const pos = n <= 1 ? 0 : seg + K.ease.bezier(0.45, 0, 0.25, 1)(K.clamp(f / 0.82));
        if (!vertical) {
          const x = 60, y = 150 + X.dy * 0.5, w = W - 120, h = 560;
          signPanel(c, x, y, w, h);
          const ly = y + 350, x0 = x + 170, x1 = x + w - 420;
          const sxs = nodes.map((_, i) => x0 + (x1 - x0) * (i / Math.max(1, n - 1)));
          const pX = K.lerp(sxs[0], sxs[n - 1], pos / Math.max(1, n - 1));
          c.lineCap = "round";
          c.strokeStyle = K.rgba(ruleCol, 0.18); c.lineWidth = 26;
          c.beginPath(); c.moveTo(sxs[0], ly); c.lineTo(sxs[n - 1], ly); c.stroke();
          c.strokeStyle = lineOn; c.beginPath(); c.moveTo(sxs[0], ly); c.lineTo(pX, ly); c.stroke();
          nodes.forEach((nm, i) => {
            const passed = pos >= i - 0.02;
            c.fillStyle = passed ? lineOn : S.sign; c.beginPath(); c.arc(sxs[i], ly, 25, 0, 7); c.fill();
            c.strokeStyle = passed ? lineOn : K.rgba(ruleCol, 0.45); c.lineWidth = 6; c.stroke();
            c.fillStyle = sysId === "hang" ? S.sign : "#ffffff"; c.beginPath(); c.arc(sxs[i], ly, 11, 0, 7); c.fill();
            c.save(); c.translate(sxs[i] + 6, ly - 52); c.rotate(-Math.PI / 4.4);
            c.font = font(40, passed ? 700 : 400); c.fillStyle = passed ? S.text : S.dim; c.fillText(nm, 0, 0); c.restore();
          });
          c.fillStyle = S.text; rrect(c, pX - 30, ly - 10, 60, 20, 10); c.fill(); // the train: a short car riding the line
          const fs = fit(c, s.line || "", F, 700, w - 220, 44, 24);
          tx(c, s.line || "", x + 110, y + h - 70, fs, S.text, 700);
        } else {
          const x = 96, y = 96, w = W - 192, h = 708;
          signPanel(c, x, y, w, h);
          const lx = x + 230, y0 = y + 300, y1 = y + h - 90;
          const sy = nodes.map((_, i) => y0 + (y1 - y0) * (i / Math.max(1, n - 1)));
          const pY = K.lerp(sy[0], sy[n - 1], pos / Math.max(1, n - 1));
          c.font = font(48, 700);
          const hs = wrapLines(c, s.line || "", w - 260).length > 2 ? 40 : 48;
          c.font = font(hs, 700);
          wrapLines(c, s.line || "", w - 260).slice(0, 3).forEach((l, i) => tx(c, l, x + 130, y + 104 + i * hs * 1.15, hs, S.text));
          c.lineCap = "round";
          c.strokeStyle = K.rgba("#000000", 0.16); c.lineWidth = 26;
          c.beginPath(); c.moveTo(lx, sy[0]); c.lineTo(lx, sy[n - 1]); c.stroke();
          c.strokeStyle = lineOn; c.beginPath(); c.moveTo(lx, sy[0]); c.lineTo(lx, pY); c.stroke();
          nodes.forEach((nm, i) => {
            const passed = pos >= i - 0.02;
            c.fillStyle = passed ? lineOn : S.sign; c.beginPath(); c.arc(lx, sy[i], 25, 0, 7); c.fill();
            c.strokeStyle = passed ? lineOn : K.rgba("#000000", 0.4); c.lineWidth = 6; c.stroke();
            c.fillStyle = "#ffffff"; c.beginPath(); c.arc(lx, sy[i], 11, 0, 7); c.fill();
            tx(c, nm, lx + 70, sy[i] + 17, 50, passed ? S.text : S.dim, passed ? 700 : 400);
          });
          c.fillStyle = S.text; rrect(c, lx - 10, pY - 30, 20, 60, 10); c.fill();
        }
      },
      terminal(c, s, X) {
        const x = 96, y = 112 + Math.max(0, X.dy), w = W - 192;
        const rows = (s.output || []).map((o) => { const k = o.lastIndexOf(": "); return k > 0 ? [o.slice(0, k), o.slice(k + 2)] : [o, ""]; });
        const rh = 84, h = 150 + rows.length * rh + 30;
        signPanel(c, x, y, w, h);
        const pad = sysId === "panel" ? 76 : 56;
        bullet(c, x + pad + 30, y + 82, 30, lineOn, letter, lineTx, square);
        tx(c, s.command || "", x + pad + 84, y + 96, fit(c, s.command || "", M, 700, w - pad - 400, 42), S.text, 700, M);
        if (s.data === "sample") tx(c, T.run, x + w - 56, y + 94, 30, S.dim, 400, F, "right");
        rows.forEach(([a, b], i) => {
          const ry = y + 150 + i * rh;
          c.fillStyle = K.rgba(ruleCol, 0.16); c.fillRect(x + pad, ry, w - pad - 56, 2);
          const hot = /surviv/i.test(a);
          if (hot) { c.fillStyle = lineOn; c.beginPath(); c.arc(x + pad + 14, ry + rh / 2 + 1, 12, 0, 7); c.fill(); }
          tx(c, a, x + pad + 46, ry + 56, 42, S.text, hot ? 700 : 400);
          tx(c, b, x + w - 56, ry + 56, 42, S.text, 700, M, "right");
        });
        tx(c, s.line || "", x, Math.min(H - 96, y + h + 76), fit(c, s.line || "", F, 700, w, 44), S.wallText, 700);
      },
      items(c, s, X) {
        const items = s.items || [];
        const n = items.length, rh = 104, w = 1060;
        c.font = font(46, 700);
        const hd = wrapLines(c, s.line || "", w - 120).slice(0, 2);
        const hh = 60 + hd.length * 54, h = hh + n * rh + 24;
        const x = X.flip ? W - 96 - w : 96, y = Math.max(76, (H - h) / 2 + X.dy * 0.4);
        signPanel(c, x, y, w, h);
        const pad = sysId === "panel" ? 76 : 50;
        hd.forEach((l, i) => tx(c, l, x + pad, y + 78 + i * 54, 46, S.text));
        const dirs = [6, 0, 7, 2, 1, 4];
        items.forEach((it, i) => {
          const ry = y + hh + i * rh;
          c.fillStyle = K.rgba(ruleCol, 0.16); c.fillRect(x + pad, ry, w - pad * 2, 2);
          arrow(c, x + pad + 34, ry + rh / 2 + 2, 56, dirs[(i + Math.floor(R(X.i, 21) * 6)) % dirs.length], S.text);
          c.font = font(40, 700);
          const pw = Math.max(70, c.measureText(it.value).width + 49);
          tx(c, it.label, x + pad + 96, ry + rh / 2 + 17, fit(c, it.label, F, 700, w - pad * 2 - 130 - pw, 46), S.text, 700);
          pill(c, x + w - pad, ry + rh / 2 + 1, 70, it.alarm ? S.alarm : lineOn, it.value, it.alarm ? "#fff" : lineTx, 40);
        });
        if (s.data === "sample") plate(c, X.flip ? 96 : x + w + 40, y + h - 56, sampleWord);
      },
      alert(c, s, X) {
        // a posted service notice: paper sheet in a frame on the wall
        const pw = 760, ph = 600;
        const px = X.flip ? 140 : W - 140 - pw, py = 120 + Math.max(0, X.dy);
        c.fillStyle = sysId === "band" ? "#9aa29f" : "#16181b"; c.fillRect(px - 18, py - 18, pw + 36, ph + 36);
        c.fillStyle = "#fbfbf8"; c.fillRect(px, py, pw, ph);
        const band = /likely|warn|fail|주의|경고|실패/i.test((s.title || "") + (s.body || "")) ? S.alarm : sysId === "hang" ? "#111" : line;
        c.fillStyle = band; c.fillRect(px, py, pw, 120);
        tx(c, s.title || "", px + 48, py + 80, fit(c, s.title || "", F, 700, pw - 96, 52), K.oklch(band)[0] > 0.72 ? "#111" : "#fff");
        let bs = 64;
        c.font = font(bs, 900);
        let bl = wrapLines(c, s.body || "", pw - 96);
        if (bl.length > 2) { bs = 50; c.font = font(bs, 900); bl = wrapLines(c, s.body || "", pw - 96).slice(0, 3); }
        bl.forEach((l, i) => tx(c, l, px + 48, py + 220 + i * bs * 1.16, bs, "#111", 900));
        const yy = py + 220 + bl.length * bs * 1.16 + 30;
        c.fillStyle = "#d4d6d2"; c.fillRect(px + 48, yy - 10, pw - 96, 3);
        tx(c, s.line || "", px + 48, yy + 54, fit(c, s.line || "", F, 700, pw - 96, 42), "#111", 700);
        if (s.line2) tx(c, s.line2, px + 48, yy + 104, fit(c, s.line2, F, 400, pw - 96, 40), "#4a4d50", 400);
        if (s.data === "sample") tx(c, T.notice, px + pw - 40, py + ph - 26, 28, "#6b6e70", 400, F, "right");
        // a direction sign on the other side keeps the wall a station, not a poster
        const sx0 = X.flip ? W - 96 - 380 : 96;
        signPanel(c, sx0, py + 40, 380, 150);
        arrow(c, sx0 + (sysId === "panel" ? 96 : 76), py + 115, 64, X.flip ? 0 : 4, S.text);
        bullet(c, sx0 + 200, py + 115, 34, lineOn, letter, lineTx, square);
      },
      stats(c, s, X) {
        const stats = s.stats || [];
        const gap = 30, top = 200 + X.dy * 0.5;
        const sizes = stats.map((_, i) => (i === 0 ? 220 : 150));
        const ws = stats.map((st2, i) => {
          c.font = font(sizes[i], 900); const vw = c.measureText(st2.value).width;
          c.font = font(sizes[i] * 0.4, 700); const uw = c.measureText(st2.unit).width;
          c.font = font(38, 400); const lw = c.measureText(st2.label).width;
          return Math.max(vw + uw + 24, lw) + 120;
        });
        const sum = ws.reduce((a, b) => a + b, 0) + gap * (ws.length - 1);
        const k = Math.min(1, (W - 192) / sum);
        let x = 96;
        stats.forEach((st2, i) => {
          const w = ws[i] * k, h = 400, sz = sizes[i] * k, y = top + (i === 0 ? 0 : 60);
          signPanel(c, x, y, w, i === 0 ? h + 60 : h);
          const ix = x + (sysId === "panel" ? 70 : 50);
          tx(c, st2.value, ix, y + 70 + sz * 0.78, sz, S.text, 900);
          c.font = font(sz, 900); const vw = c.measureText(st2.value).width;
          tx(c, st2.unit, ix + vw + 10, y + 70 + sz * 0.78, sz * 0.4, S.text, 700);
          tx(c, st2.label, ix, y + (i === 0 ? h + 60 : h) - 52, fit(c, st2.label, F, 400, w - 100, 38, 22), S.text, 400);
          x += w + gap;
        });
        tx(c, s.line || "", 96, top - 60, fit(c, s.line || "", F, 700, W - 192, 44), S.wallText, 700);
        const foot = s.source ? T.source + s.source : s.data === "sample" ? sampleWord : "";
        if (foot) plate(c, 96, H - 132, foot);
      },
      ending(c, s) {
        const y = 180, h = 400;
        const x = sysId === "hang" ? 120 : 0, w = sysId === "hang" ? W - 240 : W;
        signPanel(c, x, y, w, h);
        const x0 = x + (sysId === "panel" ? 130 : 110);
        bullet(c, x0 + 48, y + 150, 48, lineOn, letter, lineTx, square);
        const nm = s.name || "";
        const ns = fit(c, nm, F, 900, w - (x0 - x) - 380, 150);
        tx(c, nm, x0 + 130, y + 150 + ns * 0.36, ns, S.text, 900);
        tx(c, s.line || "", x0 + 130, y + 300, fit(c, s.line || "", F, 700, w - 400, 44), S.text, 700);
        tx(c, s.line2 || "", x0 + 130, y + 352, fit(c, s.line2 || "", F, 400, w - 400, 40), S.dim, 400);
        arrow(c, x + w - 110, y + 150, 80, 0, S.text);
      },
    };

    function station(c: Ctx, X: Stn, u: number) {
      c.drawImage(wall, 0, 0);
      draw[X.s.kind](c, X.s, X, u, X.D - X.stop);
    }

    // ---------- the tunnel, seen through the window ----------
    function tunnel(g: Ctx, x: number, vpx: number) {
      g.fillStyle = S.tunnel; g.fillRect(0, 0, W, H);
      const sm = Math.min(1000, Math.abs(vpx) * 1.3 * 4.2); // streak = how far a lamp travels while the shutter is open
      g.fillStyle = "#151617"; g.fillRect(0, 520, W, 6);
      g.fillStyle = "#1b1c1d"; g.fillRect(0, 548, W, 3);
      const L = 520, lxs = -x * 1.3;
      for (let k = -1; k < W / L + 2; k++) {
        const lx = (((lxs % L) + L) % L) + (k - 1) * L;
        g.fillStyle = K.rgba(S.lamp, 0.95); g.fillRect(lx, 188, 34 + sm, 8);
        g.fillStyle = K.rgba(S.lamp, 0.5); g.fillRect(lx + 210, 742, 26 + sm * 0.8, 5);
      }
    }

    // the view out of the window: whichever platform is near, else tunnel
    function windowView(g: Ctx, t: number) {
      const x = xAt(t), v = x - xAt(t - 1 / 60); // px per frame
      let X = st[0], best = 1e12;
      for (const q of st) { const d = Math.abs(q.P - x); if (d < best) { best = d; X = q; } }
      let o = X.P - x;
      const stopped = t >= X.stop && (t < X.D || X.last);
      if (stopped) o += -6 * K.ease.outCubic(K.seg(t, X.stop, 1.6)) + K.noise(t * 0.9, seed) * 0.8; // last creep + suspension
      tunnel(g, x, v);
      if (Math.abs(o) > W * 1.4) return;
      sx.setTransform(1, 0, 0, 1, 0, 0);
      station(sx, X, t - X.stop);
      const N = Math.abs(v) > 6 ? Math.min(10, 2 + Math.floor(Math.abs(v) / 18)) : 1;
      for (let k2 = 0; k2 < N; k2++) {
        g.globalAlpha = 1 / (k2 + 1);
        g.drawImage(scratch, o + (N > 1 ? v * 0.5 * (k2 / (N - 1)) : 0), 0);
      }
      g.globalAlpha = 1;
      if (X.pillar != null) {
        const px = X.pillar + (o + 6) * 1.55;
        const smr = Math.abs(v) * 1.55 * 0.5;
        g.fillStyle = S.pillar; g.fillRect(px - smr, 0, 150 + smr, H);
        g.fillStyle = S.pillarEdge; g.fillRect(px + 140, 0, 10, H);
      }
    }

    // ---------- the car interior (static parts pre-rendered once, window cut out) ----------
    const CAR = CARS[sysId];
    const WX = CAR.X, WY = CAR.Y, WW = W * CAR.k, WH = H * CAR.k;
    const FX = WX / (1 - CAR.k), FY = WY / (1 - CAR.k); // fixed point of the dolly: window ⇄ full frame
    const seatCol = CAR.seat || line;
    const seatTop = CAR.seatTop || K.mix(line, "#ffffff", 0.3);
    const carCv = document.createElement("canvas"); carCv.width = W; carCv.height = H;
    {
      const c = carCv.getContext("2d")!;
      c.fillStyle = CAR.wall; c.fillRect(0, 0, W, H);
      if (CAR.rib) { c.fillStyle = K.rgba("#ffffff", 0.05); for (let x = 0; x < W; x += 18) c.fillRect(x, 60, 6, H); } // stainless ribbing
      c.fillStyle = CAR.ceil; c.fillRect(0, 0, W, 56);
      c.fillStyle = CAR.light; c.fillRect(0, 8, W, 16); // the strip light along the ceiling
      c.fillStyle = CAR.lower; c.fillRect(0, WY + WH + 18, W, H);
      c.fillStyle = K.rgba("#000000", 0.12);
      for (const sx2 of [WX - 36, WX + WW + 36]) c.fillRect(sx2, 56, 2, H);
      if (CAR.door) { // a closed leaf with its own dark glass and the warning strip
        const d = CAR.door;
        c.fillStyle = "#2b3135"; c.fillRect(d.x - 14, 120, d.w + 28, H);
        c.fillStyle = "#59636a"; c.fillRect(d.x, 134, d.w, H);
        c.fillStyle = "#0b0c0d"; rrect(c, d.x + 42, 196, d.w - 84, 430, 14); c.fill();
        c.fillStyle = K.rgba("#ffffff", 0.06); c.fillRect(d.x + 42, 196, d.w - 84, 60);
        c.fillStyle = "#1a1d20"; c.fillRect(d.x + d.w / 2 - 3, 134, 6, H);
        c.fillStyle = CAR.pole; c.fillRect(d.x + 30, 666, d.w - 60, 12);
      }
      // bench under the window — in the line's colour unless the car says otherwise
      const sy = WY + WH + 44;
      c.fillStyle = seatCol; rrect(c, WX - 30, sy, WW + 60, H - sy + 40, 26); c.fill();
      c.fillStyle = seatTop; c.fillRect(WX - 10, sy + 16, WW + 20, 6);
      for (let k = 1; k < 4; k++) { c.fillStyle = K.rgba("#000000", 0.2); c.fillRect(WX + (WW * k) / 4 - 1, sy + 30, 3, H); }
      // window gasket + cut-out
      c.fillStyle = CAR.gasket; rrect(c, WX - 14, WY - 14, WW + 28, WH + 28, CAR.r + 12); c.fill();
      c.globalCompositeOperation = "destination-out";
      rrect(c, WX, WY, WW, WH, CAR.r); c.fill();
      c.globalCompositeOperation = "source-over";
      c.fillStyle = CAR.pole; c.fillRect(0, 34, W, 9); // ceiling rail the straps hang from
      c.fillStyle = CAR.poleHi; c.fillRect(0, 35, W, 2);
      c.fillStyle = CAR.pole; c.fillRect(CAR.pole1, 43, 24, H); // vertical grab pole
      c.fillStyle = CAR.poleHi; c.fillRect(CAR.pole1 + 6, 43, 4, H);
      // a car-card: the work advertises itself to the passengers (its name + its own pitch)
      const cd = CAR.card;
      const pitch = titlePitch || sc[0].line || (sc.find((s) => s.kind === "ending")?.line ?? "");
      c.fillStyle = K.rgba("#000000", 0.3); c.fillRect(cd.x + 5, cd.y + 6, cd.w, cd.h);
      c.fillStyle = cd.bg; c.fillRect(cd.x, cd.y, cd.w, cd.h);
      c.fillStyle = sysId === "hang" ? CAR.pole : line; c.fillRect(cd.x, cd.y, cd.w, 12);
      c.fillStyle = cd.ink; c.textBaseline = "alphabetic";
      c.font = font(30, 900);
      const tl = wrapLines(c, workName, cd.w - 36).slice(0, 3);
      tl.forEach((l, i) => c.fillText(l, cd.x + 18, cd.y + 58 + i * 34));
      c.font = font(24, 700);
      const maxL = Math.floor((cd.h - 70 - tl.length * 34 - 30) / 30);
      wrapLines(c, pitch, cd.w - 36).slice(0, maxL).forEach((l, i) => c.fillText(l, cd.x + 18, cd.y + 70 + tl.length * 34 + 22 + i * 30));
      // the map panel and the display above the window
      c.fillStyle = K.rgba("#000000", 0.25); c.fillRect(WX + 6, WY - 220, WW, 128);
      c.fillStyle = CAR.mapBg; c.fillRect(WX, WY - 226, WW, 128);
      c.fillStyle = CAR.dispBg; c.fillRect(WX, WY - 88, WW, 62);
    }
    // straps hang from the rail outside the map span; they swing with the train's acceleration
    const straps = sysId === "band" ? [90, 1440] : sysId === "panel" ? [140, 1480] : [130, 280];

    // next-station display: LED dot matrix (pre-rendered per message) or an LCD line
    const ko = work.locale === "ko";
    const DISP_W = WW - 40, DISP_H = 50;
    const ledPitch = ko ? 3.5 : 3.9; // Korean needs a row or two more to stay legible
    const ledCols = Math.floor(DISP_W / ledPitch), ledRows = Math.floor(DISP_H / ledPitch);
    const ledCache = new Map<string, HTMLCanvasElement>();
    const ledCanvas = (msg: string) => {
      const hit = ledCache.get(msg);
      if (hit) return hit;
      const tc = document.createElement("canvas"); tc.width = ledCols; tc.height = ledRows;
      const x = tc.getContext("2d", { willReadFrequently: true })!;
      x.fillStyle = "#fff"; x.font = K.font(ko ? 13 : 11, M, ko ? 400 : 700); // Hangul at bold weight closes up into blobs on a 13-row matrix x.textBaseline = "alphabetic";
      x.fillText(msg, 1, ledRows - 2);
      const d = x.getImageData(0, 0, ledCols, ledRows).data;
      const out = document.createElement("canvas"); out.width = Math.ceil(DISP_W); out.height = Math.ceil(DISP_H);
      const o = out.getContext("2d")!;
      o.fillStyle = CAR.dispOn;
      for (let j = 0; j < ledRows; j++) for (let i = 0; i < ledCols; i++) if (d[(j * ledCols + i) * 4 + 3] > 120) { o.beginPath(); o.arc(i * ledPitch + ledPitch / 2, j * ledPitch + ledPitch / 2, ledPitch * 0.38, 0, 7); o.fill(); }
      ledCache.set(msg, out);
      return out;
    };
    const ledOff = (() => {
      const out = document.createElement("canvas"); out.width = Math.ceil(DISP_W); out.height = Math.ceil(DISP_H);
      const o = out.getContext("2d")!; o.fillStyle = CAR.dispOff;
      for (let j = 0; j < ledRows; j++) for (let i = 0; i < ledCols; i++) { o.beginPath(); o.arc(i * ledPitch + ledPitch / 2, j * ledPitch + ledPitch / 2, ledPitch * 0.3, 0, 7); o.fill(); }
      return out;
    })();
    const msgFor = (i: number) => (i === sc.length - 1 ? T.last : T.next) + "  " + names[i].toUpperCase();
    if (CAR.disp === "led") sc.forEach((_, i) => { ledCanvas(msgFor(i)); ledCanvas(names[i].toUpperCase()); });

    function drawDisplay(g: Ctx, t: number, ride: Stn) {
      const dx = WX + 20, dy = WY - 82;
      // the announcement changes a beat after the doors close, as a column wipe at 24 fps
      const q = K.clamp(K.step(t - ride.D - 0.22, 24) / 0.5);
      const nextI = ride.i + 1;
      if (CAR.disp === "led") {
        g.drawImage(ledOff, dx, dy);
        const cur = ledCanvas(msgFor(nextI)), prev = ledCanvas(names[ride.i].toUpperCase());
        const cut = Math.round(q * ledCols) * ledPitch;
        if (cut < DISP_W) g.drawImage(prev, cut, 0, DISP_W - cut, DISP_H, dx + cut, dy, DISP_W - cut, DISP_H);
        if (cut > 0) g.drawImage(cur, 0, 0, cut, DISP_H, dx, dy, cut, DISP_H);
      } else {
        const lab = nextI === sc.length - 1 ? T.lcdLast : T.lcdNext;
        const drawMsg = (a: string, b: string) => {
          g.fillStyle = CAR.dispOff; g.font = font(26, 400); g.fillText(a, dx + 8, dy + 36);
          const lw = g.measureText(a).width;
          g.fillStyle = CAR.dispOn; g.font = font(34, 700); g.fillText(b, dx + 26 + lw, dy + 37);
        };
        const cut = dx + q * DISP_W;
        g.save(); g.beginPath(); g.rect(cut, dy - 4, DISP_W + dx - cut + 10, DISP_H + 8); g.clip(); drawMsg(T.lcdNow, names[ride.i]); g.restore();
        g.save(); g.beginPath(); g.rect(dx - 10, dy - 4, cut - dx + 10, DISP_H + 8); g.clip(); drawMsg(lab, names[nextI]); g.restore();
      }
    }

    function drawMap(g: Ctx, t: number, ride: Stn) {
      const n = sc.length, mx0 = WX + 70, mx1 = WX + WW - 70, my = WY - 160;
      const sxp = (i: number) => mx0 + ((mx1 - mx0) * i) / Math.max(1, n - 1);
      const x = xAt(t);
      const a = st[ride.i], b = st[ride.i + 1];
      const q = ride.i + K.clamp((x - a.P) / (b.P - a.P));
      const ink = CAR.mapInk, lc = sysId === "hang" ? "#111111" : line;
      g.lineCap = "round";
      g.strokeStyle = K.rgba(ink, 0.18); g.lineWidth = 12;
      g.beginPath(); g.moveTo(mx0, my); g.lineTo(mx1, my); g.stroke();
      g.strokeStyle = lc; g.beginPath(); g.moveTo(mx0, my); g.lineTo(mx0 + ((mx1 - mx0) * q) / Math.max(1, n - 1), my); g.stroke();
      const slot = ((mx1 - mx0) / Math.max(1, n - 1)) * 2 - 24; // labels alternate above/below, so each has two slots of room
      for (let i = 0; i < n; i++) {
        const px = sxp(i), passed = q >= i - 0.001, next = i === ride.i + 1;
        g.fillStyle = passed ? lc : CAR.mapBg; g.beginPath(); g.arc(px, my, next ? 15 : 12, 0, 7); g.fill();
        g.strokeStyle = passed || next ? lc : K.rgba(ink, 0.45); g.lineWidth = 5; g.stroke();
        if (passed) { g.fillStyle = CAR.mapBg; g.beginPath(); g.arc(px, my, 4.5, 0, 7); g.fill(); }
        const above = i % 2 === 0;
        const fsz = fit(g, names[i], F, next ? 900 : 400, slot, next ? 22 : 19, 14);
        g.font = font(fsz, next ? 900 : 400);
        g.fillStyle = next ? ink : K.rgba(ink, passed ? 0.5 : 0.75);
        g.textAlign = i === 0 ? "left" : i === n - 1 ? "right" : "center";
        const lx = i === 0 ? px - 14 : i === n - 1 ? px + 14 : px;
        g.fillText(names[i], lx, above ? my - 28 : my + 44);
        g.textAlign = "left";
      }
      const tx0 = mx0 + ((mx1 - mx0) * q) / Math.max(1, n - 1); // the train itself on the diagram
      g.fillStyle = ink; rrect(g, tx0 - 20, my - 8, 40, 16, 8); g.fill();
    }

    function drawStraps(g: Ctx, t: number) {
      // swing = lagged acceleration: lean back when pulling away, forward when braking
      const a = (vAt(t - 0.12) - vAt(t - 0.42)) / VC;
      const sway = K.noise(t * 1.3, seed + 4) * 0.03 * Math.min(1, Math.abs(vAt(t)) / VC);
      const th = K.clamp(a, -1, 1) * 0.26 + sway;
      straps.forEach((sxp, k) => {
        g.save();
        g.translate(sxp, 40);
        g.rotate(th * (1 - k * 0.12));
        g.fillStyle = CAR.strap; g.fillRect(-5, 0, 10, 118);
        g.strokeStyle = CAR.handle; g.lineWidth = 9; g.lineJoin = "round";
        if (sysId === "panel") { g.beginPath(); g.arc(0, 150, 30, 0, 7); g.stroke(); }
        else { g.beginPath(); g.moveTo(-28, 172); g.lineTo(28, 172); g.lineTo(0, 118); g.closePath(); g.stroke(); }
        g.restore();
      });
    }

    // camera scale c ∈ [k, 1]: 1 = the window is the frame (platform), k = we see the car
    const pullE = K.ease.bezier(0.3, 0, 0.12, 1), pushE = K.ease.bezier(0.45, 0, 0.1, 1);
    const logLerp = (a: number, b: number, p: number) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * p);
    function camAt(t: number): { c: number; ride: Stn | null } {
      let ride: Stn | null = null;
      for (const X of st) if (!X.last && t >= X.D && t < st[X.i + 1].stop) ride = X;
      if (!ride) return { c: 1, ride: null };
      const nx = st[ride.i + 1];
      const cPull = logLerp(1, CAR.k, pullE(K.seg(t, ride.D - 0.05, PULL)));
      const cPush = logLerp(CAR.k, 1, pushE(K.seg(t, nx.stop - PUSH, PUSH)));
      return { c: Math.max(cPull, cPush), ride };
    }

    const lastSt = st[st.length - 1];
    return {
      duration,
      starts,
      render(g, t) {
        const { c, ride } = camAt(t);
        // ride shake: track joints every ~900 px of travel, scaled by speed
        const sp = Math.min(1, Math.abs(vAt(t)) / VC);
        const xx = xAt(t), jt = ((xx % 900) + 900) % 900;
        const bump = sp * (Math.exp(-jt / 70) * 2.2 + K.noise(t * 7, seed + 9) * 0.7);
        if (!ride || c >= 0.9995) {
          g.save(); g.translate(0, bump);
          windowView(g, t);
          g.restore();
        } else {
          g.fillStyle = CAR.wall; g.fillRect(0, 0, W, H);
          g.save();
          g.translate(0, bump);
          const s = c / CAR.k;
          g.translate(FX, FY); g.scale(s, s); g.translate(-FX, -FY);
          g.save();
          rrect(g, WX - 2, WY - 2, WW + 4, WH + 4, CAR.r); g.clip();
          g.translate(WX, WY); g.scale(CAR.k, CAR.k);
          windowView(g, t);
          g.restore();
          // the glass: the car's own strip light and the grab pole reflected, faint and still while the tunnel races
          const refl = K.clamp(((1 - c) / (1 - CAR.k)) * 1.6);
          g.fillStyle = K.rgba(CAR.light, 0.13 * refl); g.fillRect(WX, WY + 26, WW, 12);
          g.fillStyle = K.rgba(CAR.light, 0.06 * refl); g.fillRect(WX + WW * 0.62, WY, 26, WH);
          g.drawImage(carCv, 0, 0);
          drawMap(g, t, ride);
          drawDisplay(g, t, ride);
          drawStraps(g, t);
          g.restore();
        }
        if (t >= lastSt.stop) {
          const hp = K.seg(t, duration - 2.4, 2.4);
          if (hp > 0) K.handoff(g, hp, { ink: S.wallText, family: F, size: 34, x: sysId === "hang" ? 120 : 110, y: H - 140, handle: work.handle });
        }
      },
    };
  },
};
