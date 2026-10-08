// 카세트 믹스테이프 — 작품을 믹스테이프로 만든다(필름 실험실 2라운드, 2026-10-08).
// 세계의 규칙: 카세트 라벨엔 훅(테이프의 "이름"), 펼친 J카드엔 장면이 곡 목록으로 적힌다 — 만든 사람의 펜으로
// (타자기 + 라벨기 · 사인펜 + 매직 · 모눈종이에 볼펜). 목록은 "곡 길이" 칸에 값이 들어간 트랙들, 흐름은 이어지는 메들리,
// 경고는 카드에 철썩 붙는 경고 스티커, 수치는 J카드에 인쇄된 "레벨" 칸에 손으로, 끝은 등면(스파인)에 쓰는 이름.
// 릴은 테이프가 도는 동안(첫 곡 ~ 마지막 곡)만 돌고 멈출 땐 서서히 선다.
// 움직임: 손글씨 12fps 계단·타자 24fps·라벨기 한 글자씩, 카메라는 빨리 출발해 길게 내려앉는 0.9~1.3초 미끄럼(펜을 따라 내려감),
// 빠른 것은 스티커 붙이기 하나.
import type { FlatScene, Genre, GenreFonts, GenreWork } from "./types";
import * as K from "./kit";

const RS = 2;      // 글자·스티커 래스터 배율
const PS = 1.5;    // J카드 래스터 배율
const CS = 2;      // 카세트 래스터 배율

// J카드 펼친 모양(세계 단위): [날개][등면][A면][B면]
const FLAP = 150, SPINE = 110, PW = 640, CH = 1000;
const AX = FLAP + SPINE, BX = AX + PW, CW = BX + PW;
const CAS_W = 640, CAS_H = 408;

// J카드·라벨에 인쇄된 말 — 영상의 언어로.
const LABEL = {
  en: {
    sideA: "Side A", sideB: "Side B", no: "no.", title: "title", minutes: "minutes", grade: "normal position · type I",
    levels: "levels", source: "source", sampleValues: "* sample values", sampleOutput: "* sample output", sampleFigures: "* sample figures", sampleFigure: "* sample figure",
    sideOne: "side one", sideTwo: "side two", specCli: "C60  ·  normal", specUtil: "60 min", specHw: "C-60  type I",
  },
  ko: {
    sideA: "A면", sideB: "B면", no: "번호", title: "곡명", minutes: "분", grade: "노멀 포지션 · 타입 I",
    levels: "레벨", source: "출처", sampleValues: "* 예시 값", sampleOutput: "* 예시 출력", sampleFigures: "* 예시 수치", sampleFigure: "* 예시 수치",
    sideOne: "앞면", sideTwo: "뒷면", specCli: "C60  ·  노멀", specUtil: "60분", specHw: "C-60  타입 I",
  },
};

// ---- 한글은 읽는 데 더 든다 ----
const isWide = (c: string) => {
  const n = c.codePointAt(0) || 0;
  return (n >= 0x1100 && n <= 0x115f) || (n >= 0x2e80 && n <= 0xa4cf) || (n >= 0xac00 && n <= 0xd7a3) || (n >= 0xf900 && n <= 0xfaff) || (n >= 0xff00 && n <= 0xff60) || (n >= 0xffe0 && n <= 0xffe6) || n >= 0x1f300;
};
const readLen = (s: string) => { let n = 0; for (const c of s) n += isWide(c) ? 1.7 : 1; return n; };

/** 제목 "이름 · 한 줄 소개" → 이름과 소개. */
function splitTitle(t: string): { name: string; pitch: string } {
  for (const sep of [" · ", " — ", " | "]) {
    const i = t.indexOf(sep);
    if (i > 0) return { name: t.slice(0, i).trim(), pitch: t.slice(i + sep.length).trim() };
  }
  return { name: t.trim(), pitch: "" };
}

type Maker = "cli" | "utility" | "hardware";
/** 만든 사람(테이프의 얼굴)을 내용으로 고른다 — 터미널이 있으면 타자기, % 목록이면 모눈종이 DIY, 훅이 없으면 사인펜. */
function pickMaker(work: GenreWork, seed: number): Maker {
  const kinds = work.scenes.map((s) => s.kind);
  const pctItems = work.scenes.some((s) => s.kind === "items" && s.items.length > 0 && s.items.every((it) => /^\s*[\d.,]+\s*%\s*$/.test(it.value)));
  if (pctItems) return "hardware";
  if (kinds.includes("terminal")) return "cli";
  if (!kinds.includes("hook")) return "utility";
  return (["cli", "utility", "hardware"] as const)[seed % 3];
}

type PenKind = "type" | "hand" | "dymo";
type Pen = { kind: PenKind; fam: string; w: number; size: number; ink: string; cps: number; tape?: string; letter?: string };
type Pens = { body: Pen; main: Pen; note: Pen; num: Pen; key: Pen; label: Pen; head: Pen; hero: Pen; spine: Pen };
type Shell = { body: string; inner: string; tint: string; clear: boolean; label: string; labelPrint: string; stripe: string | null };
type Style = {
  key: Maker; desk: string; rot: number; card: string; print: string; lines: "none" | "ruled" | "grid";
  shell: Shell; cas: { x: number; y: number; rot: number }; pens: Pens;
  stroke: string; alarm: string; sticker: "rect" | "round"; numFmt: (s: string, i: number) => string; lh: number;
  accent: string; handoffInk: string; handoffFont: string; printFam: string;
};

function styleFor(work: GenreWork, key: Maker, F: GenreFonts): Style {
  const alarm = work.alarm || "#c8283a";
  const PRINT = F.archivoNarrow;
  if (key === "cli") {
    const T = (size: number, w: number, ink: string, cps: number): Pen => ({ kind: "type", fam: F.courierPrime, w, size, ink, cps });
    const D = (size: number, cps: number): Pen => ({ kind: "dymo", fam: PRINT, w: 700, size, ink: "#eceeea", tape: "#17181b", letter: "#eceeea", cps });
    return {
      key, desk: "#1b1e22", rot: -1.1, card: "#f1f2ef", print: "#2a2c31", lines: "none",
      shell: { body: "#24262a", inner: "#121315", tint: "rgba(18,19,22,0.38)", clear: false, label: "#eff0ec", labelPrint: "#2a2c31", stripe: null },
      cas: { x: -360, y: 330, rot: -0.11 },
      pens: {
        body: T(25, 400, "#1d1e22", 34), main: T(27, 700, "#1d1e22", 28), note: T(21, 400, "#b1252d", 40),
        num: T(25, 700, "#1d1e22", 30), key: T(25, 700, "#b1252d", 30), label: T(22, 400, "#1d1e22", 30),
        head: D(27, 12), hero: D(68, 6), spine: D(40, 11),
      },
      stroke: "#b1252d", alarm, sticker: "rect", numFmt: (s, i) => s + i + ".", lh: 1.42, accent: "#b1252d",
      handoffInk: "#1d1e22", handoffFont: F.courierPrime, printFam: PRINT,
    };
  }
  if (key === "utility") {
    const a = work.accent || "#ff9f0a";
    const Kp = (size: number, w: number, ink: string, cps: number, fam = F.kalam): Pen => ({ kind: "hand", fam, w, size, ink, cps });
    const numInk = K.mix(a, "#000000", 0.18);
    return {
      key, desk: "#1f2e44", rot: 1.4, card: "#f6f6f4", print: a, lines: "ruled",
      shell: { body: a, inner: K.mix(a, "#000000", 0.55), tint: K.rgba(a, 0.22), clear: false, label: "#f7f7f5", labelPrint: K.mix(a, "#000000", 0.1), stripe: a },
      cas: { x: CW + 360, y: 300, rot: 0.085 },
      pens: {
        body: Kp(31, 400, "#1b2236", 21), main: Kp(34, 700, "#1b2236", 18), note: Kp(25, 400, "#5b616d", 28),
        num: Kp(30, 400, numInk, 14, F.permanentMarker), key: Kp(32, 700, alarm, 18), label: Kp(24, 400, "#1b2236", 24),
        head: Kp(32, 400, "#17181b", 14, F.permanentMarker), hero: Kp(74, 400, "#17181b", 8, F.permanentMarker),
        spine: Kp(54, 400, "#17181b", 11, F.permanentMarker),
      },
      stroke: numInk, alarm, sticker: "round", numFmt: (s, i) => s + i, lh: 1.5, accent: a,
      handoffInk: "#1b2236", handoffFont: F.kalam, printFam: PRINT,
    };
  }
  const a = work.accent || "#f18600";
  const blue = "#24409a";
  const Dp = (size: number, w: number, ink: string, cps: number, fam = F.architectsDaughter): Pen => ({ kind: "hand", fam, w, size, ink, cps });
  return {
    key, desk: "#24463b", rot: -0.7, card: "#f7f8f8", print: "#9fb3c4", lines: "grid",
    shell: { body: "rgba(214,224,230,0.42)", inner: "rgba(40,50,58,0.18)", tint: "rgba(220,230,236,0.10)", clear: true, label: "#f7f8f6", labelPrint: "#58616b", stripe: a },
    cas: { x: 430, y: 1205, rot: 0.045 },
    pens: {
      body: Dp(29, 400, blue, 21), main: Dp(32, 700, blue, 18), note: Dp(23, 400, "#5f646c", 28),
      num: Dp(29, 700, K.mix(a, "#000000", 0.15), 16), key: Dp(31, 700, alarm, 18), label: Dp(24, 400, blue, 22),
      head: Dp(34, 700, blue, 15), hero: Dp(84, 700, blue, 8, F.kalam),
      spine: Dp(52, 700, blue, 12),
    },
    stroke: blue, alarm, sticker: "rect", numFmt: (s, i) => s + "-" + i, lh: 1.5, accent: a,
    handoffInk: blue, handoffFont: F.architectsDaughter, printFam: PRINT,
  };
}

type Mk = (w: number, h: number) => HTMLCanvasElement;
type Ink = { c: HTMLCanvasElement; W: number; H: number; base: number; padX: number; cx: number[]; n: number; tw: number; pen: Pen; str: string; vertical?: boolean };
type TextItem = { type: "text"; tx: Ink; x: number; y: number; rot: number; gap?: number; cps: number; pre?: boolean; num?: boolean; spine?: boolean; t0: number; dur: number };
type Poly = { pts: [number, number][]; cum: number[] };
type StrokeItem = { type: "stroke"; polys: Poly[]; L: number; ink: string; width: number; gap?: number; dur0?: number; t0: number; dur: number };
type StickerItem = { type: "sticker"; c: HTMLCanvasElement; w: number; h: number; x: number; y: number; rot: number; gap?: number; t0: number; dur: number };
type Item = TextItem | StrokeItem | StickerItem;
type Printed = { kind: "box"; x: number; y: number; w: number; h: number; title: string } | { kind: "meter"; x: number; y: number; w: number; h: number; n: number } | { kind: "label"; s: string; x: number; y: number };
type Plan = { si: number; side?: "A" | "B"; onLabel?: boolean; items: Item[]; bbox: { x0: number; y0: number; x1: number; y1: number }; kind: FlatScene["kind"] };

export const cassette: Genre = {
  id: "cassette",
  name: "Mixtape cassette",
  ko: "카세트",
  koIdea: "작품을 믹스테이프로 — 라벨엔 훅, J카드엔 장면이 곡 목록으로 적히고, 테이프가 돌 때만 릴이 돈다",
  enIdea: "The work as a mixtape — the hook on the label, the scenes written as a tracklist on the J-card, reels turning only while it plays",
  family: "A",
  fonts: ["courierPrime", "archivoNarrow", "kalam", "permanentMarker", "architectsDaughter"],
  make(work, { seed, fonts }) {
    const T = LABEL[work.locale];
    const mk: Mk = (w, h) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
    const mc = mk(8, 8).getContext("2d")!;
    const maker = pickMaker(work, seed);
    const st = styleFor(work, maker, fonts);
    // 한글 손글씨(개구체)는 같은 크기에서 작고 가늘다 — 조금 키우고, 매직 펜은 굵은 획으로
    if (work.locale === "ko") for (const k of Object.keys(st.pens) as (keyof Pens)[]) {
      const pn = st.pens[k];
      if (pn.kind === "hand") st.pens[k] = { ...pn, size: Math.round(pn.size * 1.12), w: pn.fam === fonts.permanentMarker ? 700 : pn.w };
    }
    const { name: titleName, pitch } = splitTitle(work.title);
    const PRINT = st.printFam;

    // ---------------- 잉크 글자(미리 그려 두고, 쓰는 만큼 드러낸다) ----------------
    const inkText = (str0: string, pen: Pen, sd: number): Ink => {
      const str = String(str0);
      const chars = Array.from(str);
      mc.font = K.font(pen.size, pen.fam, pen.w);
      const cx: number[] = [];
      let acc = "";
      for (const ch of chars) { acc += ch; cx.push(mc.measureText(acc).width); }
      const tw = cx.length ? cx[cx.length - 1] : 0;
      const dymo = pen.kind === "dymo";
      const padX = dymo ? Math.round(pen.size * 0.5) : 8;
      const H = dymo ? pen.size * 1.46 : pen.size * 1.8;
      const base = dymo ? H * 0.5 + pen.size * 0.35 : pen.size * 1.2;
      const W = tw + padX * 2 + 4;
      const c = mk(W * RS, H * RS), x = c.getContext("2d")!;
      x.scale(RS, RS);
      const r = K.rng(sd);
      if (dymo) {
        // 라벨기 테이프: 평평한 테이프, 아래 입술은 어둡게, 끝은 비스듬히 잘림
        x.fillStyle = pen.tape!;
        x.beginPath(); x.moveTo(2, 1); x.lineTo(W - 2, 0); x.lineTo(W - 1, H - 1); x.lineTo(1, H); x.closePath(); x.fill();
        x.fillStyle = "rgba(255,255,255,0.07)"; x.fillRect(2, 2, W - 4, H * 0.28);
        x.fillStyle = "rgba(0,0,0,0.25)"; x.fillRect(2, H - 4, W - 4, 3);
      }
      const slope = (r() - 0.5) * (pen.kind === "hand" ? 0.018 : 0.004);
      x.font = K.font(pen.size, pen.fam, pen.w);
      x.textBaseline = "alphabetic";
      chars.forEach((ch, i) => {
        if (ch === " ") return;
        const px = padX + (i ? cx[i - 1] : 0);
        let jy = 0, jr = 0, js = 1, a = 1, jx = 0;
        if (pen.kind === "hand") { jy = (r() - 0.5) * pen.size * 0.06 + px * slope; jr = (r() - 0.5) * 0.07; js = 1 + (r() - 0.5) * 0.06; a = 0.86 + r() * 0.14; }
        else if (pen.kind === "type") { jy = (r() - 0.5) * 1.6; jx = (r() - 0.5) * 0.9; a = 0.6 + r() * 0.4; }
        else { jy = (r() - 0.5) * 1.2; jx = (r() - 0.5) * 1.0; }
        x.save();
        x.translate(px + jx, base + jy);
        x.rotate(jr); x.scale(js, js);
        if (dymo) {
          x.fillStyle = "rgba(0,0,0,0.55)"; x.fillText(ch, 1.2, 1.4);
          x.fillStyle = pen.letter!; x.globalAlpha = 0.93; x.fillText(ch, 0, 0);
        } else {
          x.fillStyle = pen.ink; x.globalAlpha = a; x.fillText(ch, 0, 0);
        }
        x.restore();
      });
      if (pen.kind !== "dymo") {
        // 리본·펜 결: 잉크 알파에 얼룩
        const im = x.getImageData(0, 0, c.width, c.height), d = im.data, rr = K.rng(sd + 5);
        const amt = pen.kind === "type" ? 0.5 : 0.22;
        for (let i = 3; i < d.length; i += 4) if (d[i]) d[i] = d[i] * (1 - amt * rr() * rr());
        x.putImageData(im, 0, 0);
      }
      return { c, W, H, base, padX, cx, n: chars.length, tw, pen, str };
    };
    /** 세로쓰기(한글 등면 이름) — 글자를 바로 세워 위에서 아래로 쌓는다. cx = 글자마다 끝나는 높이. */
    const inkVertical = (str0: string, pen: Pen, sd: number): Ink => {
      const chars = Array.from(String(str0));
      const step = pen.size * 1.08, gapS = pen.size * 0.45;
      const cx: number[] = [];
      let y = 0;
      for (const ch of chars) { y += ch === " " ? gapS : step; cx.push(y); }
      const padX = 8, Wd = pen.size * 1.5, Hd = y + padX * 2 + pen.size * 0.3;
      const c = mk(Wd * RS, Hd * RS), x = c.getContext("2d")!;
      x.scale(RS, RS);
      const r = K.rng(sd);
      x.textAlign = "center"; x.textBaseline = "alphabetic";
      x.font = K.font(pen.size, pen.fam, pen.w);
      chars.forEach((ch, i) => {
        if (ch === " ") return;
        const yb = padX + cx[i] - step * 0.16;
        x.save();
        x.translate(Wd / 2 + (r() - 0.5) * 3, yb + (r() - 0.5) * 2); x.rotate((r() - 0.5) * 0.06);
        if (pen.kind === "dymo") { x.fillStyle = "rgba(0,0,0,0.55)"; x.fillText(ch, 1.2, 1.4); x.fillStyle = pen.letter!; }
        else { x.fillStyle = pen.ink; x.globalAlpha = 0.88 + r() * 0.12; }
        x.fillText(ch, 0, 0);
        x.restore();
      });
      if (pen.kind === "dymo") {
        const t = mk(Wd * RS, Hd * RS), tx = t.getContext("2d")!;
        tx.fillStyle = pen.tape!; tx.fillRect(0, 0, t.width, t.height);
        tx.drawImage(c, 0, 0);
        return { c: t, W: Wd, H: Hd, base: 0, padX, cx, n: chars.length, tw: Hd, pen, str: chars.join(""), vertical: true };
      }
      return { c, W: Wd, H: Hd, base: 0, padX, cx, n: chars.length, tw: Hd, pen, str: chars.join(""), vertical: true };
    };
    /** 띄어쓰기로 줄바꿈 — 한 낱말이 폭보다 길면 글자로 끊는다(한국어·긴 명령어). */
    const wrapPen = (text: string, pen: Pen, maxW: number): string[] => {
      mc.font = K.font(pen.size, pen.fam, pen.w);
      const out: string[] = [];
      let cur = "";
      for (const w of String(text).split(/\s+/)) {
        const nx = cur ? cur + " " + w : w;
        if (mc.measureText(nx).width <= maxW) { cur = nx; continue; }
        if (cur) out.push(cur);
        if (mc.measureText(w).width <= maxW) { cur = w; continue; }
        let part = "";
        for (const ch of Array.from(w)) { if (mc.measureText(part + ch).width > maxW && part) { out.push(part); part = ch; } else part += ch; }
        cur = part;
      }
      if (cur) out.push(cur);
      return out;
    };
    const textW = (s: string, pen: Pen) => { mc.font = K.font(pen.size, pen.fam, pen.w); return mc.measureText(s).width; };

    // ---------------- 손 획(화살표·동그라미·체크·레벨 채우기) ----------------
    const stroke = (polys: [number, number][][], ink: string, width: number, sd: number, wob = 1.4): Omit<StrokeItem, "t0" | "dur"> => {
      const out: Poly[] = [];
      let L = 0;
      polys.forEach((pl, pi) => {
        const pts: [number, number][] = [];
        for (let i = 0; i < pl.length - 1; i++) {
          const [x0, y0] = pl[i], [x1, y1] = pl[i + 1];
          const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 6));
          for (let k = 0; k < n; k++) {
            const u = k / n;
            pts.push([x0 + (x1 - x0) * u + K.noise((pts.length + pi * 50) * 0.21, sd + 1) * wob, y0 + (y1 - y0) * u + K.noise((pts.length + pi * 50) * 0.21, sd + 2) * wob]);
          }
        }
        const last = pl[pl.length - 1];
        pts.push([last[0], last[1]]);
        const cum = [L];
        for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(L); }
        out.push({ pts, cum });
      });
      return { type: "stroke", polys: out, L, ink, width };
    };
    const drawStroke = (g: CanvasRenderingContext2D, it: StrokeItem, k: number) => {
      const lim = it.L * k;
      g.save();
      g.strokeStyle = it.ink; g.lineWidth = it.width; g.lineCap = "round"; g.lineJoin = "round";
      g.globalAlpha = 0.9;
      for (const pl of it.polys) {
        if (pl.cum[0] > lim) break;
        g.beginPath(); g.moveTo(pl.pts[0][0], pl.pts[0][1]);
        for (let i = 1; i < pl.pts.length; i++) {
          if (pl.cum[i] > lim) { const f = (lim - pl.cum[i - 1]) / Math.max(1e-6, pl.cum[i] - pl.cum[i - 1]); g.lineTo(K.lerp(pl.pts[i - 1][0], pl.pts[i][0], f), K.lerp(pl.pts[i - 1][1], pl.pts[i][1], f)); break; }
          g.lineTo(pl.pts[i][0], pl.pts[i][1]);
        }
        g.stroke();
      }
      g.restore();
    };
    const arrowDown = (x: number, y0: number, y1: number): [number, number][][] => [[[x, y0], [x + 2, (y0 + y1) / 2], [x, y1]], [[x - 9, y1 - 12], [x, y1], [x + 9, y1 - 11]]];
    const ellipse = (cx: number, cy: number, rx: number, ry: number, sd: number): [number, number][][] => {
      const pts: [number, number][] = [], a0 = -2.4 + K.rand(sd, 1) * 0.6, turns = 1.12;
      for (let i = 0; i <= 40; i++) { const a = a0 + (i / 40) * Math.PI * 2 * turns; const rr = 1 + i * 0.002; pts.push([cx + Math.cos(a) * rx * rr, cy + Math.sin(a) * ry * rr]); }
      return [pts];
    };
    const tick = (x: number, y: number, s: number): [number, number][][] => [[[x, y - s * 0.35], [x + s * 0.32, y], [x + s, y - s * 0.95]]];

    // ---------------- 경고 스티커 ----------------
    const fitFont = (x: CanvasRenderingContext2D, s: string, maxW: number, size: number, w: number) => { let z = size; for (; z > 14; z -= 2) { x.font = K.font(z, PRINT, w); if (x.measureText(s).width <= maxW) break; } return z; };
    const buildSticker = (sc: Extract<FlatScene, { kind: "alert" }>) => {
      const ink = st.alarm;
      if (st.sticker === "round") {
        const D = 300, c = mk((D + 20) * RS, (D + 20) * RS), x = c.getContext("2d")!;
        x.scale(RS, RS); x.translate(D / 2 + 10, D / 2 + 10);
        x.fillStyle = "#fbfbfa"; x.beginPath(); x.arc(0, 0, D / 2, 0, Math.PI * 2); x.fill();
        x.fillStyle = ink; x.beginPath(); x.arc(0, 0, D / 2 - 9, 0, Math.PI * 2); x.fill();
        x.strokeStyle = "rgba(255,255,255,0.85)"; x.lineWidth = 3; x.beginPath(); x.arc(0, 0, D / 2 - 22, 0, Math.PI * 2); x.stroke();
        x.fillStyle = "#ffffff"; x.textAlign = "center";
        x.font = K.font(56, PRINT, 700); x.fillText("!", 0, -62);
        fitFont(x, sc.title, 220, 34, 700); x.fillText(sc.title, 0, -10);
        const pen: Pen = { kind: "type", size: 30, fam: PRINT, w: 500, ink: "#fff", cps: 1 };
        const ls = wrapPen(sc.body, pen, 210).slice(0, 3);
        x.font = K.font(30, PRINT, 500);
        ls.forEach((l, i) => x.fillText(l, 0, 32 + i * 34));
        return { c, w: D + 20, h: D + 20 };
      }
      const W = 520, Hh = 168, c = mk((W + 20) * RS, (Hh + 20) * RS), x = c.getContext("2d")!;
      x.scale(RS, RS); x.translate(10, 10);
      x.fillStyle = "#fbfbfa"; x.beginPath(); x.roundRect(0, 0, W, Hh, 16); x.fill();
      x.fillStyle = ink; x.beginPath(); x.roundRect(8, 8, W - 16, Hh - 16, 10); x.fill();
      x.fillStyle = "#ffffff"; x.beginPath(); x.moveTo(70, 34); x.lineTo(118, 122); x.lineTo(22, 122); x.closePath(); x.fill();
      x.fillStyle = ink; x.font = K.font(56, PRINT, 700); x.textAlign = "center"; x.fillText("!", 70, 114);
      x.textAlign = "left"; x.fillStyle = "#ffffff";
      fitFont(x, sc.title, W - 170, 40, 700); x.fillText(sc.title, 142, 74);
      fitFont(x, sc.body, W - 170, 32, 500); x.fillText(sc.body, 142, 120);
      return { c, w: W + 20, h: Hh + 20 };
    };

    // ---------------- 배치: 장면 → 카드·라벨 위의 글자들 ----------------
    const R = K.rng(seed + 31);
    const P = st.pens;
    const items: Item[] = [];
    const label: Item[] = [];
    const printed: Printed[] = [];
    const scenes = work.scenes;
    const first = scenes[0];
    const end = scenes[scenes.length - 1];
    const plan: Plan[] = [];
    let sid = 0;
    let spineItem: TextItem | null = null;
    const TX = (str: string, pen: Pen, x: number, y: number, o: Partial<TextItem> = {}): TextItem => {
      const tx = inkText(str, pen, seed + 101 + (sid++) * 13);
      return { type: "text", tx, x: x + (pen.kind === "hand" ? (R() - 0.5) * 6 : 0), y, rot: pen.kind === "hand" ? (R() - 0.5) * 0.016 : (R() - 0.5) * 0.004, cps: pen.cps, t0: 0, dur: 0, ...o };
    };
    const S = (polys: [number, number][][], w = 3, o: { ink?: string; gap?: number; dur?: number } = {}): StrokeItem =>
      ({ ...stroke(polys, o.ink || st.stroke, w, seed + 300 + (sid++) * 7), gap: o.gap, dur0: o.dur, t0: 0, dur: 0 });
    const bb = (its: Item[]) => {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const it of its) {
        if (it.type === "text") { x0 = Math.min(x0, it.x); x1 = Math.max(x1, it.x + it.tx.tw); y0 = Math.min(y0, it.y - it.tx.pen.size); y1 = Math.max(y1, it.y + it.tx.pen.size * 0.3); }
        else if (it.type === "sticker") { x0 = Math.min(x0, it.x - it.w / 2); x1 = Math.max(x1, it.x + it.w / 2); y0 = Math.min(y0, it.y - it.h / 2); y1 = Math.max(y1, it.y + it.h / 2); }
        else for (const pl of it.polys) for (const p of pl.pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
      }
      return { x0, y0, x1, y1 };
    };

    // ---- 카세트 라벨: 훅(없으면 이름 + 소개) ----
    {
      const L: Item[] = [];
      if (first.kind === "hook") {
        const ly0 = maker === "hardware" ? -128 : -150;
        const lab = wrapPen(first.label, P.label, 250);
        lab.forEach((l, i) => L.push(TX(l, P.label, -262, ly0 + i * P.label.size * 1.25, { pre: true })));
        const heroPen = first.alarm ? { ...P.hero, ink: st.alarm, tape: st.alarm } : P.hero;
        const hp = textW(first.value, heroPen) > 300 ? { ...heroPen, size: Math.floor(heroPen.size * 300 / textW(first.value, heroPen)) } : heroPen;
        const hv = TX(first.value, hp, 0, hp.kind === "dymo" ? -100 : -86, { pre: true });
        hv.x = 268 - hv.tx.tw - (hp.kind === "dymo" ? hv.tx.padX : 0);
        L.push(hv);
        wrapPen(first.line, P.label, 520).slice(0, 2).forEach((l, i) => L.push(TX(l, P.label, -262, 54 + i * 26, { gap: i ? 0.12 : 0.45 })));
        if (first.data === "sample") L.push(TX(T.sampleFigure, { ...P.note, size: 19 }, -262, ly0 + lab.length * P.label.size * 1.25 + 4, { gap: 0.3 }));
      } else {
        const tp = P.hero.kind === "dymo" ? P.head : { ...P.hero, size: 62 };
        const tpen = textW(titleName, tp) > 520 ? { ...tp, size: Math.floor(tp.size * 520 / textW(titleName, tp)) } : tp;
        L.push(TX(titleName, tpen, -262, -100, { pre: true }));
        if (pitch) wrapPen(pitch, P.label, 470).slice(0, 2).forEach((l, i) => L.push(TX(l, P.label, -262, 54 + i * 26, { gap: i ? 0.12 : 0.45 })));
      }
      label.push(...L);
      plan.push({ si: 0, onLabel: true, items: L, bbox: bb(L), kind: first.kind });
    }

    // ---- J카드 ----
    type Side = { s: "A" | "B"; px: number; y: number; n: number };
    const sides: Side[] = [{ s: "A", px: AX, y: 150, n: 0 }, { s: "B", px: BX, y: 150, n: 0 }];
    const left = (sd: Side) => sd.px + 44, right = (sd: Side) => sd.px + PW - 44;
    const numW = maker === "cli" ? 62 : 74;
    const LH = (pen: Pen) => pen.size * st.lh;
    const nextNo = (sd: Side) => st.numFmt(sd.s, ++sd.n);
    const mid = scenes.slice(first.kind === "hook" ? 1 : 0, scenes.length - 1);
    const nA = Math.ceil(mid.length / 2);

    const place = (sc: FlatScene, sd: Side): Item[] => {
      const its: Item[] = [];
      const x0 = left(sd), tx = x0 + numW, maxW = right(sd) - tx;
      let y = sd.y;
      const num = (yy: number, gap?: number) => its.push(TX(nextNo(sd), P.num, x0, yy, { gap: gap === undefined ? 0.12 : gap * 0.6, num: true }));
      const lines = (txt: string, pen: Pen, xx: number, mw: number, gap = 0.16) => {
        wrapPen(txt, pen, mw).forEach((l, i) => { y += i ? LH(pen) : 0; its.push(TX(l, pen, xx, y, { gap: i ? 0.1 : gap })); });
      };
      const note = (txt: string, gap = 0.25) => { y += LH(P.note) * 1.05; lines(txt, P.note, tx, maxW, gap); };
      y += P.main.size;
      if (sc.kind === "story" || sc.kind === "hook") {
        num(y, 0);
        if (sc.kind === "hook") { lines(sc.label + " — " + sc.value, P.main, tx, maxW, 0.12); y += LH(P.body) * 1.02; lines(sc.line, P.body, tx, maxW, 0.3); }
        else { lines(sc.line, P.main, tx, maxW, 0.12); y += LH(P.body) * 1.02; lines(sc.line2, P.body, tx, maxW, 0.3); }
      } else if (sc.kind === "flow") {
        sc.nodes.forEach((n, i) => {
          if (i) {
            its.push(S(arrowDown(x0 - 14, y - P.body.size * 0.5, y + LH(P.body) * 1.05 - P.body.size + 4), 2.6, { gap: 0.1, dur: 0.32 }));
            y += LH(P.body) * 1.05 + 4;
          }
          num(y, i ? 0.08 : 0);
          const pen = i === sc.nodes.length - 1 ? P.main : P.body;
          const lns = wrapPen(n, pen, maxW);
          lns.forEach((l, k) => { if (k) y += LH(pen); its.push(TX(l, pen, tx, y, { gap: 0.1 })); });
        });
        note(sc.line, 0.3);
      } else if (sc.kind === "items") {
        sc.items.forEach((it, i) => {
          if (i) y += LH(P.body) * 1.02;
          num(y, i ? 0.1 : 0);
          const valW = it.value === "✓" ? 40 : textW(it.value, it.alarm ? P.key : P.body);
          const lp = textW(it.label, P.body) > maxW - valW - 24 ? { ...P.body, size: Math.max(18, Math.floor(P.body.size * (maxW - valW - 24) / textW(it.label, P.body))) } : P.body;
          its.push(TX(it.label, lp, tx, y, { gap: 0.08 }));
          if (it.value === "✓") its.push(S(tick(right(sd) - 40, y - 4, 34), 3.4, { gap: 0.14, dur: 0.28 }));
          else {
            const pen = it.alarm ? P.key : P.body;
            const vt = TX(it.value, pen, 0, y, { gap: 0.14 });
            vt.x = right(sd) - vt.tx.tw;
            its.push(vt);
            if (it.alarm) its.push(S(ellipse(vt.x + vt.tx.tw / 2, y - pen.size * 0.32, vt.tx.tw * 0.68 + 14, pen.size * 0.72, seed + i), 3, { ink: st.alarm, gap: 0.12, dur: 0.42 }));
          }
        });
        note(sc.line, 0.3);
      } else if (sc.kind === "terminal") {
        num(y, 0);
        const hp = textW(sc.command, P.head) > maxW - 10 ? { ...P.head, size: Math.max(16, Math.floor(P.head.size * (maxW - 10) / textW(sc.command, P.head))) } : P.head;
        its.push(TX(sc.command, hp, tx - (hp.kind === "dymo" ? hp.size * 0.5 : 0), y + 2, { gap: 0.12, rot: -0.012 }));
        y += LH(P.body) * 1.25;
        const dotW = textW(".", P.body);
        sc.output.forEach((o, i) => {
          if (i) y += LH(P.body);
          const mm = o.match(/^(.*?):\s*(.*)$/);
          const key = /survived|살아남/i.test(o);
          const pen = key ? P.key : P.body;
          let s = o;
          if (mm) {
            const l = mm[1], r = mm[2];
            const room = maxW - textW(l + "  " + r, pen);
            s = room > dotW * 2 ? l + " " + ".".repeat(Math.floor(room / dotW)) + " " + r : l + ": " + r;
          }
          if (textW(s, pen) > maxW) { wrapPen(o, pen, maxW).forEach((l, k) => { if (k) y += LH(pen); its.push(TX(l, pen, tx, y, { gap: k ? 0.05 : i ? 0.08 : 0.25 })); }); }
          else its.push(TX(s, pen, tx, y, { gap: i ? 0.08 : 0.25 }));
        });
        y += LH(P.body) * 0.4;
        note(sc.line, 0.3);
      } else if (sc.kind === "alert") {
        num(y + 10, 0);
        const sk = buildSticker(sc);
        const rot = (R() < 0.5 ? -1 : 1) * (0.05 + R() * 0.04);
        its.push({ type: "sticker", ...sk, x: tx + sk.w / 2 - 8 + (st.sticker === "round" ? 40 : -14), y: y - P.main.size + sk.h / 2 - 6, rot, gap: 0.35, t0: 0, dur: 0 });
        y += sk.h - P.main.size + 6 + LH(P.body) * (st.sticker === "rect" ? 0.9 : 0.45);
        y += LH(P.body) * 0.55;
        lines(sc.line, P.main, tx, maxW, 0.4);
        if (sc.line2) { y += LH(P.body); lines(sc.line2, P.body, tx, maxW, 0.18); }
      } else if (sc.kind === "stats") {
        // J카드에 인쇄된 "레벨" 칸을 손으로 채운다
        const bx = x0 - 6, bw = right(sd) - x0 + 12, by = y - P.main.size - 4;
        const rows: { y: number; frac: number; x: number; w: number; big?: boolean }[] = [];
        let yy = by + 40;
        sc.stats.forEach((s0, i) => {
          const v = s0.value + (s0.unit === "%" ? "%" : "");
          const unit = s0.unit && s0.unit !== "%" ? s0.unit.replace(/^\//, "/ ") : "";
          if (i === 0) {
            yy += 10;
            its.push(TX(s0.label, P.body, x0 + 14, yy + 6, { gap: 0 }));
            yy += P.hero.size * (P.hero.kind === "dymo" ? 1.38 : 1.0) + 14;
            const hv = TX(v, P.hero, x0 + 10, yy, { gap: 0.15 });
            its.push(hv);
            if (unit) its.push(TX(unit, P.main, x0 + 24 + hv.tx.tw + (P.hero.kind === "dymo" ? hv.tx.padX * 2 : 0), yy, { gap: 0.08 }));
            const hx1 = x0 + 10 + hv.tx.tw + (P.hero.kind === "dymo" ? hv.tx.padX * 2 : 0) + 34;
            if (s0.unit === "%") rows.push({ y: yy - P.hero.size * 0.36, frac: parseFloat(s0.value) / 100, x: hx1, w: right(sd) - 16 - hx1, big: true });
            yy += 26;
          } else {
            yy += LH(P.body) * 1.05;
            its.push(TX(s0.label, P.body, x0 + 14, yy, { gap: 0.18 }));
            const vt = TX(v + (unit ? " " + unit : ""), P.main, 0, yy, { gap: 0.1 });
            vt.x = right(sd) - 16 - vt.tx.tw;
            its.push(vt);
            if (s0.unit === "%") { yy += P.body.size * 0.75; rows.push({ y: yy, frac: parseFloat(s0.value) / 100, x: x0 + 14, w: Math.min(320, right(sd) - x0 - 30) }); yy += 6; }
          }
        });
        // 레벨 칸은 인쇄돼 있고, 값만큼 손으로 빗금친다
        for (const rw of rows) {
          const n = 10, cw = rw.w / n, hh = rw.big ? 26 : 18;
          printed.push({ kind: "meter", x: rw.x, y: rw.y - hh / 2, w: rw.w, h: hh, n });
          const fill = Math.round(K.clamp(rw.frac) * n);
          if (fill > 0) {
            const pts: [number, number][] = [];
            for (let k = 0; k < fill; k++) { const xa = rw.x + k * cw + 4, xb = xa + cw - 8; pts.push([xa, rw.y + hh / 2 - 4], [xb, rw.y - hh / 2 + 4], [xb, rw.y + hh / 2 - 4]); }
            its.push(S([pts], 2.4, { gap: 0.12, dur: 0.12 + fill * 0.09 }));
          }
        }
        yy += 18;
        if (sc.source) {
          yy += LH(P.note) * 1.1;
          printed.push({ kind: "label", s: T.source, x: x0 + 14, y: yy });
          its.push(TX(sc.source, P.note, x0 + 92, yy, { gap: 0.25 }));
        }
        if (sc.data === "sample") { yy += LH(P.note) * 1.05; its.push(TX(T.sampleFigures, P.note, x0 + 14, yy, { gap: 0.25 })); }
        yy += 22;
        printed.push({ kind: "box", x: bx, y: by, w: bw, h: yy - by, title: T.levels });
        y = yy + LH(P.body) * 0.2;
        y += LH(P.main) * 0.9;
        lines(sc.line, P.main, x0 + 4, right(sd) - x0 - 4, 0.3);
      }
      if (sc.data === "sample" && sc.kind !== "stats") {
        y += LH(P.note) * 1.0;
        its.push(TX(sc.kind === "terminal" ? T.sampleOutput : T.sampleValues, P.note, tx, y, { gap: 0.2 }));
      }
      sd.y = y + LH(P.body) * 0.7 + 34;
      return its;
    };

    mid.forEach((sc, i) => {
      const sd = i < nA ? sides[0] : sides[1];
      const its = place(sc, sd);
      items.push(...its);
      plan.push({ si: scenes.indexOf(sc), side: sd.s, items: its, bbox: bb(its), kind: sc.kind });
    });
    // 넘침 막기: 한 면이 카드 밖으로 나가면 그 면의 글자를 위로 조인다
    for (const sd of sides) {
      const lim = CH - (sd.s === "B" ? 190 : 50);
      if (sd.y > lim) {
        const k = (lim - 150) / (sd.y - 150);
        for (const p of plan) if (p.side === sd.s) for (const it of p.items) { if (it.type === "text" || it.type === "sticker") it.y = 150 + (it.y - 150) * k; else for (const pl of it.polys) for (const q of pl.pts) q[1] = 150 + (q[1] - 150) * k; }
        for (const pr of printed) if (pr.x > sd.px && pr.x < sd.px + PW) { pr.y = 150 + (pr.y - 150) * k; if (pr.kind !== "label") pr.h *= k; }
        for (const p of plan) if (p.side === sd.s) p.bbox = bb(p.items);
        sd.y = lim;
      }
    }

    // ---- 끝: B면 아래 맺음말, 그리고 등면에 이름 ----
    if (end.kind === "ending") {
      const sd = sides[1];
      const its: Item[] = [];
      let y = Math.max(sd.y, CH - 175);
      const x0 = left(sd);
      its.push(S([[[x0, y - 30], [right(sd) - 160, y - 34]]], 2, { gap: 0.1, dur: 0.3, ink: P.body.ink }));
      y += 6;
      wrapPen(end.line, P.main, PW - 88).forEach((l, i) => { if (i) y += LH(P.main); its.push(TX(l, P.main, x0, y, { gap: i ? 0.1 : 0.2 })); });
      y += LH(P.body);
      wrapPen(end.line2, P.body, PW - 88).forEach((l, i) => { if (i) y += LH(P.body); its.push(TX(l, P.body, x0, y, { gap: i ? 0.1 : 0.22 })); });
      items.push(...its);
      plan.push({ si: scenes.length - 1, side: "B", items: its, bbox: bb(its), kind: "ending" });
      let sp = P.spine;
      const nm0 = end.name || titleName;
      const tw = textW(nm0, sp);
      if (tw > CH - 200) sp = { ...sp, size: Math.floor(sp.size * (CH - 200) / tw) };
      let nm: TextItem;
      if (Array.from(nm0).some(isWide)) {
        // 한글 이름은 등면에 세로로 쌓아 쓴다(옆으로 눕히지 않는다)
        let vp = { ...P.spine, size: Math.min(P.spine.size, 72) };
        const need = Array.from(nm0).length * vp.size * 1.08;
        if (need > CH - 220) vp = { ...vp, size: Math.floor(vp.size * (CH - 220) / need) };
        const vt = inkVertical(nm0, vp, seed + 707);
        nm = { type: "text", tx: vt, x: FLAP + SPINE / 2 - vt.W / 2, y: 110, rot: 0, cps: vp.cps, gap: 0, spine: true, t0: 0, dur: 0 };
      } else {
        nm = TX(nm0, sp, 0, CH - 90, { rot: -Math.PI / 2, gap: 0, spine: true });
        nm.x = FLAP + SPINE / 2 + (sp.kind === "dymo" ? nm.tx.base - nm.tx.H / 2 : sp.size * 0.36);
      }
      items.push(nm);
      spineItem = nm;
    }

    // ---------------- J카드 래스터(인쇄 + 접힌 자국 + 인쇄된 칸) ----------------
    const card = (() => {
      const c = mk((CW + 8) * PS, (CH + 8) * PS), x = c.getContext("2d")!;
      x.scale(PS, PS);
      x.fillStyle = st.card; x.fillRect(0, 0, CW, CH);
      const pr = st.print;
      if (st.lines === "ruled") {
        x.fillStyle = K.rgba(pr, 0.28);
        for (const px of [AX, BX]) for (let y = 196; y < CH - 30; y += 50) x.fillRect(px + 30, y, PW - 60, 1.4);
      } else if (st.lines === "grid") {
        for (const px of [0, AX, BX]) {
          const w = px === 0 ? FLAP + SPINE : PW;
          for (let gx = 0; gx <= w; gx += 20) { x.fillStyle = K.rgba(pr, gx % 100 === 0 ? 0.42 : 0.2); x.fillRect(px + gx, 0, gx % 100 === 0 ? 1.4 : 1, CH); }
          for (let gy = 0; gy <= CH; gy += 20) { x.fillStyle = K.rgba(pr, gy % 100 === 0 ? 0.42 : 0.2); x.fillRect(px, gy, w, gy % 100 === 0 ? 1.4 : 1); }
        }
      }
      for (const [i, px] of [AX, BX].entries()) {
        const side = i ? T.sideB : T.sideA;
        if (maker === "utility") {
          x.fillStyle = pr; x.fillRect(px, 0, PW, 104);
          x.fillStyle = "#ffffff"; x.font = K.font(44, PRINT, 700); x.fillText(side, px + 44, 70);
          x.font = K.font(20, PRINT, 500); x.textAlign = "right"; x.fillText(T.title, px + PW - 44, 70); x.textAlign = "left";
        } else if (maker === "cli") {
          x.fillStyle = pr; x.font = K.font(40, PRINT, 700); x.fillText(side, px + 44, 84);
          x.fillRect(px + 44, 104, PW - 88, 3);
          x.font = K.font(19, PRINT, 500); x.fillText(T.no, px + 44, 132); x.fillText(T.title, px + 44 + 62, 132);
        } else {
          x.fillStyle = st.accent; x.fillRect(px + 40, 52, 120, 56);
          x.fillStyle = "#ffffff"; x.font = K.font(38, PRINT, 700); x.fillText(i ? "B" : "A", px + 54, 93);
          x.fillStyle = "#58616b"; x.font = K.font(24, PRINT, 500); x.fillText(i ? T.sideTwo : T.sideOne, px + 176, 92);
        }
      }
      // 날개: 테이프 등급 인쇄
      x.save();
      x.fillStyle = maker === "hardware" ? st.accent : pr;
      x.fillRect(0, 0, FLAP, 18);
      if (maker !== "cli") x.fillRect(0, CH - 18, FLAP, 18);
      x.font = K.font(84, PRINT, 700); x.textAlign = "center";
      x.fillStyle = maker === "hardware" ? "#58616b" : pr;
      x.fillText("60", FLAP / 2, 150);
      x.font = K.font(20, PRINT, 500); x.fillText(T.minutes, FLAP / 2, 180);
      x.translate(FLAP / 2 + 8, CH * 0.62); x.rotate(-Math.PI / 2);
      x.font = K.font(22, PRINT, 500); x.fillText(T.grade, 0, 0);
      x.restore();
      x.strokeStyle = K.rgba(maker === "hardware" ? "#58616b" : pr, 0.55); x.lineWidth = 2;
      x.strokeRect(FLAP + 12, 30, SPINE - 24, CH - 60);
      for (const fx of [FLAP, AX, BX]) { x.fillStyle = "rgba(0,0,0,0.10)"; x.fillRect(fx - 1, 0, 2, CH); x.fillStyle = "rgba(255,255,255,0.6)"; x.fillRect(fx + 1, 0, 1.5, CH); }
      const pInk = maker === "hardware" ? "#58616b" : pr;
      for (const p of printed) {
        x.strokeStyle = pInk; x.fillStyle = pInk;
        if (p.kind === "box") {
          x.lineWidth = 2; x.strokeRect(p.x, p.y, p.w, p.h);
          x.font = K.font(20, PRINT, 500);
          const tw = x.measureText(p.title).width;
          x.fillStyle = st.card; x.fillRect(p.x + 14, p.y - 12, tw + 14, 24);
          x.fillStyle = pInk; x.fillText(p.title, p.x + 21, p.y + 7);
        } else if (p.kind === "meter") {
          x.lineWidth = 1.6;
          for (let k = 0; k < p.n; k++) x.strokeRect(p.x + (p.w / p.n) * k + 1, p.y, p.w / p.n - 2, p.h);
        } else {
          x.font = K.font(20, PRINT, 500); x.fillText(p.s, p.x, p.y);
        }
      }
      const im = x.getImageData(0, 0, c.width, c.height), d = im.data, r = K.rng(seed + 9);
      for (let i = 0; i < d.length; i += 4) { const v = (r() - 0.5) * 7; d[i] += v; d[i + 1] += v; d[i + 2] += v; }
      x.putImageData(im, 0, 0);
      return c;
    })();

    // ---------------- 카세트 래스터(창·톱니 구멍을 뚫은 앞 껍데기) ----------------
    const cas = (() => {
      const sh = st.shell;
      const c = mk((CAS_W + 20) * CS, (CAS_H + 20) * CS), x = c.getContext("2d")!;
      x.scale(CS, CS); x.translate(CAS_W / 2 + 10, CAS_H / 2 + 10);
      const shellPath = () => { x.beginPath(); x.roundRect(-CAS_W / 2, -CAS_H / 2, CAS_W, CAS_H, 18); };
      shellPath(); x.fillStyle = sh.body; x.fill();
      x.strokeStyle = sh.clear ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.35)"; x.lineWidth = 3; shellPath(); x.stroke();
      x.strokeStyle = sh.clear ? "rgba(60,70,78,0.35)" : "rgba(255,255,255,0.10)"; x.lineWidth = 2;
      x.beginPath(); x.roundRect(-CAS_W / 2 + 7, -CAS_H / 2 + 7, CAS_W - 14, CAS_H - 14, 13); x.stroke();
      x.fillStyle = sh.clear ? "rgba(200,212,220,0.35)" : K.mix(sh.body.startsWith("#") ? sh.body : "#888888", "#000000", 0.14);
      x.beginPath(); x.moveTo(-230, 112); x.lineTo(230, 112); x.lineTo(258, CAS_H / 2 - 2); x.lineTo(-258, CAS_H / 2 - 2); x.closePath(); x.fill();
      x.strokeStyle = sh.clear ? "rgba(60,70,78,0.4)" : "rgba(0,0,0,0.3)"; x.lineWidth = 2; x.stroke();
      x.fillStyle = sh.label;
      x.beginPath(); x.roundRect(-296, -188, 592, 284, 12); x.fill();
      if (sh.stripe) {
        x.fillStyle = sh.stripe;
        if (maker === "hardware") { x.fillRect(-296, -178, 592, 9); x.fillRect(-296, -164, 592, 4); }
        else x.fillRect(-296, 70, 592, 26);
      }
      x.fillStyle = sh.labelPrint; x.strokeStyle = sh.labelPrint;
      x.lineWidth = 2; x.strokeRect(-282, -52, 54, 78);
      x.font = K.font(56, PRINT, 700); x.textAlign = "center"; x.fillText("A", -255, 10); x.textAlign = "left";
      x.globalAlpha = 0.35; x.fillRect(-270, -66, 540, 1.5); x.fillRect(-270, 62, 540, 1.2); x.globalAlpha = 1;
      x.font = K.font(19, PRINT, 500); x.textAlign = "right";
      x.fillText(maker === "cli" ? T.specCli : maker === "utility" ? T.specUtil : T.specHw, 282, maker === "utility" ? -10 : 26); x.textAlign = "left";
      for (const [sx, sy] of [[-296, -186], [296, -186], [-296, 186], [296, 186], [0, 150]]) {
        const px = sx * 0.94, py = sy * (sy > 0 && sx === 0 ? 1 : 0.93);
        x.fillStyle = sh.clear ? "#9aa3a9" : "rgba(0,0,0,0.45)"; x.beginPath(); x.arc(px, py, 8, 0, Math.PI * 2); x.fill();
        x.strokeStyle = sh.clear ? "#59636b" : "rgba(255,255,255,0.25)"; x.lineWidth = 1.6;
        x.beginPath(); x.moveTo(px - 5, py); x.lineTo(px + 5, py); x.moveTo(px, py - 5); x.lineTo(px, py + 5); x.stroke();
      }
      x.globalCompositeOperation = "destination-out";
      for (const hx of [-196, 196]) { x.beginPath(); x.arc(hx, 172, 9, 0, Math.PI * 2); x.fill(); }
      x.fillRect(-46, 186, 92, 18);
      x.beginPath(); x.roundRect(-160, -58, 320, 86, 10); x.fill();
      for (const hx of [-134, 134]) { x.beginPath(); x.arc(hx, -15, 30, 0, Math.PI * 2); x.fill(); }
      x.globalCompositeOperation = "source-over";
      x.strokeStyle = sh.labelPrint; x.globalAlpha = 0.6; x.lineWidth = 2; x.beginPath(); x.roundRect(-166, -64, 332, 98, 13); x.stroke(); x.globalAlpha = 1;
      const im = x.getImageData(0, 0, c.width, c.height), d = im.data, r = K.rng(seed + 3);
      for (let i = 0; i < d.length; i += 4) if (d[i + 3]) { const v = (r() - 0.5) * 6; d[i] += v; d[i + 1] += v; d[i + 2] += v; }
      x.putImageData(im, 0, 0);
      return c;
    })();

    const R2 = K.rng(seed + 55);
    const casX = st.cas.x, casY = st.cas.y, casRot = st.cas.rot;
    const toWorld = (lx: number, ly: number): [number, number] => [casX + lx * Math.cos(casRot) - ly * Math.sin(casRot), casY + lx * Math.sin(casRot) + ly * Math.cos(casRot)];

    // ---------------- 일정(필름이 ~29초에 들도록 쓰는 속도만 올린다; 머무름은 사람 속도) ----------------
    type Cam = { x: number; y: number; z: number };
    type CamSeg = { t0: number; t1: number; from: Cam; to: Cam; slow?: boolean };
    let cams: CamSeg[] = [], Tm = 0, playAt = 0, stopAt = 0, handoffStart = 0, duration = 0;
    let over: Cam = { x: 0, y: 0, z: 1 };
    const sceneStart: number[] = [];
    const sceneText = (sc: FlatScene): string => {
      switch (sc.kind) {
        case "hook": return [sc.label, sc.value, sc.line].join(" ");
        case "story": return sc.line + " " + sc.line2;
        case "items": return sc.items.map((q) => q.label + " " + q.value).join(" ") + " " + sc.line;
        case "flow": return sc.nodes.join(" ") + " " + sc.line;
        case "terminal": return sc.command + " " + sc.output.join(" ") + " " + sc.line;
        case "alert": return [sc.title, sc.body, sc.line, sc.line2].join(" ");
        case "stats": return sc.stats.map((q) => q.label + " " + q.value).join(" ") + " " + sc.line;
        case "ending": return [sc.line, sc.line2, sc.name].join(" ");
      }
    };
    const readOf = (sc: FlatScene) => readLen(sceneText(sc));
    const camFor = (b: Plan["bbox"]): Cam => {
      const bw = b.x1 - b.x0 + 140, bh = b.y1 - b.y0 + 150;
      const z = K.clamp(Math.min(1450 / bw, 760 / bh), 1.12, 1.5);
      const off = (maker === "utility" ? -1 : 1) * 70 / z;
      const cy = bh * z > 780 ? b.y0 + (450 - 130) / z : (b.y0 + b.y1) / 2 + 10;
      return { x: (b.x0 + b.x1) / 2 + off, y: cy, z };
    };
    // 점 줄(리더)은 타자기에서 한 번에 달려 나온다 — 읽는 시간에 넣지 않는다
    const neff = (it: TextItem) => it.tx.n - (it.tx.str.split(".").length - 1) * 0.8 + (Array.from(it.tx.str).filter(isWide).length * 0.5);
    const run = (spd: number, hf: number) => {
      cams = []; Tm = 0;
      const writeDur = (it: Item) => {
        if (it.type === "text") return it.num ? 0.16 : (neff(it) / (it.cps * 1.6)) / spd + (it.tx.pen.kind === "dymo" ? 0.1 : 0);
        if (it.type === "stroke") return (it.dur0 || 0.35) / Math.sqrt(spd);
        return 0.24;
      };
      const moveTo = (to: Cam, minD = 0.92) => {
        const from = cams[cams.length - 1].to;
        const dist = Math.hypot((to.x - from.x) * to.z, (to.y - from.y) * to.z) + Math.abs(Math.log(to.z / from.z)) * 900;
        const d = K.clamp(minD + dist / 3200, minD, 1.3);
        cams.push({ t0: Tm, t1: Tm + d, from, to });
        Tm += d * 0.72;   // 카메라가 길게 내려앉는 동안 펜이 출발한다
      };
      const itY = (it: Item): [number, number] => {
        if (it.type === "text") return [it.y - it.tx.pen.size, it.y + it.tx.pen.size * 0.3];
        if (it.type === "sticker") return [it.y - it.h / 2, it.y + it.h / 2];
        let a = 1e9, b = -1e9;
        for (const q of it.polys) for (const p of q.pts) { a = Math.min(a, p[1]); b = Math.max(b, p[1]); }
        return [a, b];
      };
      const sched = (its: Item[], follow = false) => {
        for (const it of its) {
          if (it.type === "text" && it.pre) { it.t0 = -10; it.dur = 0; continue; }
          if (follow && !(it.type === "text" && it.spine)) {
            const c = cams[cams.length - 1].to, [ya, yb] = itY(it);
            const sb = 450 + (yb - c.y) * c.z, sa = 450 + (ya - c.y) * c.z;
            if (sb > 810 || sa < 70) {
              const ny = sb > 810 ? c.y + (sb - 900 * 0.6) / c.z : c.y - (130 - sa) / c.z;
              Tm += 0.1;
              moveTo({ x: c.x, y: ny, z: c.z }, 0.9);
              Tm += 0.08;
            }
          }
          Tm += (it.gap === undefined ? 0.15 : it.gap) * 0.6 / spd; it.t0 = Tm; it.dur = writeDur(it); Tm += it.dur;
        }
      };
      // 장면 0: 라벨 근접(첫 화면에 이미 적혀 있다)
      const [cwx, cwy] = toWorld(0, -30);
      const casCam = { x: cwx, y: cwy + 6, z: 1.82 };
      cams.push({ t0: -1, t1: 0, from: casCam, to: casCam });
      sceneStart.length = 0;
      sceneStart[0] = 0;
      Tm = 0.1;
      sched(plan[0].items);
      Tm += K.clamp(0.5 + readOf(work.scenes[0]) * 0.01, 1.0, 1.5);
      playAt = Tm - 0.3;
      Tm += 0.1;
      const midPlans = plan.filter((p) => !p.onLabel && p.kind !== "ending");
      midPlans.forEach((p, k) => {
        const sc = work.scenes[p.si];
        if (p.si !== 0) sceneStart[p.si] = Tm;
        const c = cams[cams.length - 1].to, b = p.bbox;
        const fits = k > 0 && 450 + (b.y0 - 40 - c.y) * c.z > 60 && 450 + (b.y1 + 20 - c.y) * c.z < 820 && Math.abs((b.x0 + b.x1) / 2 - c.x) * c.z < 420;
        if (!fits) moveTo(camFor(p.bbox)); else Tm += 0.25;
        const w0 = Tm;
        sched(p.items, true);
        // 장면은 읽는 데 걸리는 만큼(≤ 20자/초, 한글은 1.7배) 화면에 머문다
        let hold = K.clamp((readOf(sc) / 20 - (Tm - w0)) * hf, 0.55, 2.2);
        if (sc.kind === "stats" || sc.kind === "terminal") hold = Math.max(hold, 1.8);
        if (k === midPlans.length - 1) hold = Math.max(hold, sc.kind === "stats" ? 3.0 : 1.6);
        Tm += hold;
      });
      const pe = plan.find((p) => p.kind === "ending");
      if (pe) {
        sceneStart[pe.si] = Tm;
        moveTo(camFor(pe.bbox));
        Tm += 0.1;
        sched(pe.items, true);
      }
      Tm += 0.7;
      // 테이프 전체로 물러난다 — 물러나는 동안 등면에 이름이 적힌다
      const allX0 = Math.min(-10, casX - 360), allX1 = Math.max(CW + 10, casX + 360), allY0 = Math.min(-10, casY - 240), allY1 = Math.max(CH + 10, casY + 240);
      const overZ = Math.min(1460 / (allX1 - allX0), 760 / (allY1 - allY0));
      over = { x: (allX0 + allX1) / 2, y: (allY0 + allY1) / 2 + 12 / overZ, z: overZ };
      cams.push({ t0: Tm, t1: Tm + 1.9, from: cams[cams.length - 1].to, to: over, slow: true });
      if (spineItem) { spineItem.t0 = Tm + 0.5; spineItem.dur = neff(spineItem) / (spineItem.cps * 1.3); }
      stopAt = Math.max(Tm + 1.3, spineItem ? spineItem.t0 + spineItem.dur + 0.05 : 0);
      Tm = Math.max(Tm + 1.9, stopAt) + 0.05;
      handoffStart = Tm;
      duration = handoffStart + 2.4;
    };
    let wspd = 1, hf = 1;
    run(wspd, hf);
    for (let k = 0; k < 10 && duration > 29.6; k++) { if (wspd < 2.05) wspd = Math.min(2.05, wspd * (1 + (duration - 29) / 25)); else hf *= 0.85; run(wspd, hf); }
    const starts = work.scenes.map((_, i) => Math.max(0, sceneStart[i] ?? 0));

    // 넘김: 책상 위 마스킹테이프 한 조각(마지막 화면 오른쪽 아래)
    const scr2w = (sx: number, sy: number): [number, number] => {
      const rot = (st.rot * Math.PI) / 180;
      const x = (sx - 800) / over.z, y = (sy - 450) / over.z;
      const c = Math.cos(-rot), s = Math.sin(-rot);
      return [x * c - y * s + over.x, x * s + y * c + over.y];
    };
    const hoSize = 30 / over.z;
    mc.font = K.font(hoSize, st.handoffFont, 500);
    const hoW = mc.measureText("nookframe.com/@" + work.handle).width + 40 / over.z;
    const [hx, hy] = scr2w(1600 - 70 - hoW * over.z, 900 - 44);
    const tapeRot = (R2() - 0.5) * 0.04;

    // ---- 릴: 재생하는 동안만, 감긴 양에 따라 다른 속도로 ----
    const V = 300;
    const playFrac = (t: number) => K.clamp((t - playAt) / Math.max(1, stopAt - playAt));
    const spdAt = (t: number) => (t < playAt ? 0 : t < playAt + 0.7 ? K.ease.outCubic((t - playAt) / 0.7) : t < stopAt ? 1 : t < stopAt + 0.9 ? 1 - K.ease.outCubic((t - stopAt) / 0.9) : 0);
    const rL = (t: number) => K.lerp(86, 60, playFrac(t)), rR = (t: number) => K.lerp(48, 72, playFrac(t));
    const HZ = 120, NS = Math.ceil(duration * HZ) + 2;
    const angL = new Float32Array(NS), angR = new Float32Array(NS);
    for (let i = 1; i < NS; i++) { const t = i / HZ, s = spdAt(t) * V / HZ; angL[i] = angL[i - 1] + s / rL(t); angR[i] = angR[i - 1] + s / rR(t); }
    const ang = (arr: Float32Array, t: number) => { const f = K.clamp(t * HZ, 0, NS - 1.001), i = Math.floor(f); return arr[i] + (arr[i + 1] - arr[i]) * (f - i); };

    // ---- 카메라 ----
    const ezMove = K.ease.bezier(0.3, 0, 0.12, 1), ezPull = K.ease.bezier(0.45, 0, 0.1, 1);
    const camAt = (t: number): Cam => {
      let c = cams[0].to, settled = -1;
      for (const cm of cams) {
        if (t < cm.t0) break;
        if (t <= cm.t1) { const k = (cm.slow ? ezPull : ezMove)((t - cm.t0) / (cm.t1 - cm.t0)); return { x: K.lerp(cm.from.x, cm.to.x, k), y: K.lerp(cm.from.y, cm.to.y, k), z: Math.exp(K.lerp(Math.log(cm.from.z), Math.log(cm.to.z), k)) }; }
        c = cm.to; settled = cm.t1;
      }
      // 머무는 동안에도 아주 작은 숨: 도착 뒤 천천히 다가간다
      const push = K.ease.outCubic(K.seg(t, Math.max(0, settled), 5)) * 0.03;
      return { x: c.x, y: c.y, z: c.z * (1 + push) };
    };

    // ---- 그리기 ----
    const drawText = (g: CanvasRenderingContext2D, it: TextItem, t: number) => {
      if (t < it.t0) return;
      const tx = it.tx, pk = tx.pen.kind;
      if (tx.vertical) {
        let h = tx.H;
        if (it.dur > 0 && t < it.t0 + it.dur) { const i = Math.floor(K.clamp((K.step(t, 12) - it.t0) / it.dur) * tx.n); h = tx.padX + (i ? tx.cx[i - 1] : 0) + tx.pen.size * 0.3; }
        if (h <= 1) return;
        if (pk === "dymo") { g.fillStyle = "rgba(0,0,0,0.22)"; g.fillRect(it.x + 3, it.y + 4, tx.W, h); }
        g.drawImage(tx.c, 0, 0, tx.W * RS, h * RS, it.x, it.y, tx.W, h);
        return;
      }
      let w = tx.W;
      if (it.dur > 0 && t < it.t0 + it.dur) {
        const ts = pk === "hand" ? K.step(t, 12) : pk === "type" ? K.step(t, 24) : t;
        const p = K.clamp((ts - it.t0) / it.dur) * tx.n;
        const i = Math.floor(p), f = pk === "hand" ? p - i : 0;
        const a = i ? tx.cx[i - 1] : 0, b = tx.cx[Math.min(tx.n - 1, i)];
        w = tx.padX + a + (b - a) * f + (pk === "dymo" ? tx.padX * 0.6 : 0);
        if (w <= 0.5) return;
      }
      g.save();
      g.translate(it.x - tx.padX, it.y);
      if (it.rot) { g.translate(tx.padX, 0); g.rotate(it.rot); g.translate(-tx.padX, 0); }
      if (pk === "dymo") { g.fillStyle = "rgba(0,0,0,0.22)"; g.fillRect(3, -tx.base + 4, w, tx.H); }
      g.drawImage(tx.c, 0, 0, w * RS, tx.H * RS, 0, -tx.base, w, tx.H);
      g.restore();
    };
    const drawItem = (g: CanvasRenderingContext2D, it: Item, t: number) => {
      if (it.type === "text") { drawText(g, it, t); return; }
      if (t < it.t0) return;
      if (it.type === "stroke") { drawStroke(g, it, K.clamp((K.step(t, 12) - it.t0) / Math.max(1e-3, it.dur))); return; }
      const k = t - it.t0;
      const e = K.ease.outQuart(K.clamp(k / 0.2));
      const sc = 1 + (1 - e) * 0.2;
      const lift = (1 - e) * 16;
      const wob = (1 - K.ease.spring(k, 0.5, 0.3)) * 0.05;
      g.save();
      g.translate(it.x, it.y); g.rotate(it.rot + wob);
      g.globalAlpha = K.clamp(k / 0.05);
      g.fillStyle = "rgba(0,0,0,0.18)";
      if (st.sticker === "round") { g.beginPath(); g.arc(4 + lift, 6 + lift, it.w / 2 - 10, 0, Math.PI * 2); g.fill(); }
      else { g.beginPath(); g.roundRect(-it.w / 2 + 14 + lift, -it.h / 2 + 16 + lift, it.w - 20, it.h - 20, 14); g.fill(); }
      g.scale(sc, sc);
      g.drawImage(it.c, -it.w / 2, -it.h / 2, it.w, it.h);
      g.restore();
    };
    const drawReel = (g: CanvasRenderingContext2D, hx0: number, hy0: number, r: number, a: number) => {
      g.fillStyle = "#3a2a22"; g.beginPath(); g.arc(hx0, hy0, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "rgba(255,240,225,0.07)"; g.lineWidth = 1.5;
      for (const f of [0.55, 0.78]) { g.beginPath(); g.arc(hx0, hy0, 28 + (r - 28) * f, 0, Math.PI * 2); g.stroke(); }
      g.save(); g.translate(hx0, hy0); g.rotate(a);
      g.fillStyle = "#ecebe7"; g.beginPath(); g.arc(0, 0, 27, 0, Math.PI * 2); g.arc(0, 0, 16, 0, Math.PI * 2, true); g.fill("evenodd");
      for (let k = 0; k < 6; k++) { g.rotate(Math.PI / 3); g.fillRect(-2.6, 9, 5.2, 8); }
      g.fillStyle = "#b9b6ae"; g.fillRect(-2, -27, 4, 9);
      g.restore();
    };
    const drawCassette = (g: CanvasRenderingContext2D, t: number) => {
      g.save();
      g.translate(casX, casY); g.rotate(casRot);
      g.fillStyle = "rgba(0,0,0,0.16)";
      for (let k = 1; k <= 3; k++) { g.beginPath(); g.roundRect(-CAS_W / 2 + 5 * k, -CAS_H / 2 + 7 * k, CAS_W, CAS_H, 18); g.fill(); }
      g.fillStyle = st.shell.inner;
      if (st.shell.clear) { g.beginPath(); g.roundRect(-CAS_W / 2, -CAS_H / 2, CAS_W, CAS_H, 18); g.fill(); }
      else { g.beginPath(); g.roundRect(-165, -62, 330, 94, 12); g.arc(-134, -15, 32, 0, Math.PI * 2); g.arc(134, -15, 32, 0, Math.PI * 2); g.fill(); }
      if (st.shell.clear) {
        // 투명 껍데기: 릴 사이를 지나는 테이프와 가이드까지 보인다
        g.strokeStyle = "#3a2a22"; g.lineWidth = 3;
        g.beginPath(); g.moveTo(-134 - rL(t) * 0.7, -15 + rL(t) * 0.7); g.lineTo(-220, 150); g.lineTo(220, 150); g.lineTo(134 + rR(t) * 0.7, -15 + rR(t) * 0.7); g.stroke();
        g.fillStyle = "#c9ced2"; for (const gx of [-220, 220, -150, 150]) { g.beginPath(); g.arc(gx, 152, 7, 0, Math.PI * 2); g.fill(); }
      }
      drawReel(g, -134, -15, rL(t), ang(angL, t));
      drawReel(g, 134, -15, rR(t), ang(angR, t));
      if (!st.shell.clear) { g.fillStyle = st.shell.tint; g.beginPath(); g.roundRect(-160, -58, 320, 86, 10); g.fill(); }
      g.drawImage(cas, -CAS_W / 2 - 10, -CAS_H / 2 - 10, CAS_W + 20, CAS_H + 20);
      for (const it of label) drawItem(g, it, t);
      g.restore();
    };
    const drawDesk = (g: CanvasRenderingContext2D) => {
      if (maker !== "hardware") return;
      // 재단 매트 격자
      g.fillStyle = "rgba(170,215,190,0.16)";
      for (let x = -1500; x <= 3200; x += 50) g.fillRect(x, -1200, x % 250 === 0 ? 2.2 : 1.1, 3800);
      for (let y = -1200; y <= 2600; y += 50) g.fillRect(-1500, y, 4700, y % 250 === 0 ? 2.2 : 1.1);
    };

    return {
      duration,
      starts,
      render(g, t) {
        g.fillStyle = st.desk; g.fillRect(0, 0, K.W, K.H);
        const cm = camAt(t);
        g.save();
        g.translate(800, 450);
        g.scale(cm.z, cm.z);
        g.rotate((st.rot * Math.PI) / 180);
        g.translate(-cm.x, -cm.y);
        drawDesk(g);
        g.fillStyle = "rgba(0,0,0,0.13)";
        for (let k = 1; k <= 3; k++) g.fillRect(5 * k, 7 * k, CW, CH);
        g.drawImage(card, 0, 0, CW + 8, CH + 8);
        for (const it of items) drawItem(g, it, t);
        drawCassette(g, t);
        const hp = K.seg(t, handoffStart, 2.4);
        if (hp > 0) {
          const k = K.ease.outQuart(K.clamp(hp / 0.08));
          g.save();
          g.translate(hx, hy); g.rotate(-(st.rot * Math.PI) / 180 + tapeRot);
          g.globalAlpha = k;
          g.fillStyle = "rgba(0,0,0,0.2)"; g.fillRect(4 / over.z, -hoSize * 1.05 + 5 / over.z, hoW, hoSize * 1.6);
          g.fillStyle = "#e9e9e4"; g.fillRect(0, -hoSize * 1.05, hoW, hoSize * 1.6);
          g.globalAlpha = 1;
          K.handoff(g, hp, { ink: st.handoffInk, family: st.handoffFont, size: hoSize, x: 20 / over.z, y: 0, handle: work.handle });
          g.restore();
        }
        g.restore();
        K.grain(g, t, 0.045, seed, 12, "overlay");
      },
    };
  },
};
