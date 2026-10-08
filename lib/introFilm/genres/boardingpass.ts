// 탑승권 — 작품이 비행편이 된다(필름 실험실 2차, 2026-10-08). 항공사가 미리 찍어 둔 탑승권(색띠·양식 칸·보안 무늬)이
// 뚜껑 연 24핀 도트 프린터에 물려 있고, 쇠막대를 탄 헤드가 빈칸에 작품의 내용을 점으로 두드려 넣는다(왕복 인쇄).
// 세계의 규칙: 잉크는 두 가지(미리 찍힌 항공사 색 + 리본 검정, 리본의 빨간 절반이 경고), 글자는 늘 핀 점으로만(화면에
// 글꼴을 그대로 쓰지 않는다), 모든 칸은 채워지기 전부터 양식에 있다, 예시 자료는 점으로 메운 덩어리 속 빈 글자,
// 탑승구 변경은 종이를 거꾸로 먹여 '정시'를 X로 지운다, 끝은 절취선에서 꼬리표를 찢는 것.
// 움직임 문법: 곡선 = 기계(헤드는 일정 속도, 줄바꿈은 계단식, 긴 급지는 비대칭) · 끊기 = 헤드가 점 열 단위로만 드러낸다 ·
// 전환 = 종이 급지 + 카메라가 다음 칸으로 미끄러짐 · 글자 등장 = 왕복 핀 타격(큰 숫자는 몇 띠로 나눠).
import type { FlatScene, Genre, GenreWork } from "./types";
import * as K from "./kit";

const LABEL = {
  en: {
    pass: "Boarding pass", passenger: "Name of passenger", flight: "Flight", seq: "Seq", status: "Status",
    onTime: "On time", changed: "Changed", remarks: "Remarks", routing: "Routing", connection: "Connection",
    from: "From", via: "Via", to: "To", agent: "Agent entry", manifest: "Manifest", notice: "Notice",
    boarding: "Boarding", gate: "Gate", seat: "Seat", sample: "SAMPLE", source: "Source: ",
    charter: "Charter · Boarding pass", keep: "Keep the stub until you land",
  },
  ko: {
    pass: "탑승권", passenger: "승객 성명", flight: "편명", seq: "순번", status: "운항 상태",
    onTime: "정시", changed: "변경", remarks: "비고", routing: "여정", connection: "연결편",
    from: "출발", via: "경유", to: "도착", agent: "카운터 입력", manifest: "적재 목록", notice: "안내",
    boarding: "탑승", gate: "탑승구", seat: "좌석", sample: "예시", source: "출처: ",
    charter: "전세기 · 탑승권", keep: "도착할 때까지 꼬리표를 보관하세요",
  },
};

// ---- 한글은 넓고, 읽는 데 더 걸린다 ----
const isWide = (c: string) => {
  const n = c.codePointAt(0) || 0;
  return (n >= 0x1100 && n <= 0x115f) || (n >= 0x2e80 && n <= 0xa4cf) || (n >= 0xac00 && n <= 0xd7a3) || (n >= 0xf900 && n <= 0xfaff) || (n >= 0xff00 && n <= 0xff60) || (n >= 0xffe0 && n <= 0xffe6);
};
const hasWide = (s: string) => Array.from(s).some(isWide);
const readLen = (s: string) => Array.from(s).reduce((a, c) => a + (isWide(c) ? 1.7 : 1), 0);
const readHold = (chars: number, min = 1.1) => Math.max(min, chars / 17 + 0.45);
const clean = (s: unknown) => String(s == null ? "" : s).replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/✓/g, "OK");

/** 제목 "이름 · 한 줄 소개" → 이름. */
function nameOf(t: string): string {
  for (const sep of [" · ", " — ", " | "]) { const i = t.indexOf(sep); if (i > 0) return t.slice(0, i).trim(); }
  return t.trim();
}

// ---- Interleaved 2 of 5(실제 부호화, 숫자만) ----
const I25 = ["nnwwn", "wnnnw", "nwnnw", "wwnnn", "nnwnw", "wnwnn", "nwwnn", "nnnww", "wnnwn", "nwnwn"];
function i2of5(digits: string): number[] {
  let ds = digits.replace(/\D/g, "") || "0";
  if (ds.length % 2) ds = "0" + ds;
  const out = [1, 1, 1, 1];
  for (let i = 0; i < ds.length; i += 2) {
    const a = I25[+ds[i]], b = I25[+ds[i + 1]];
    for (let k = 0; k < 5; k++) out.push(a[k] === "w" ? 3 : 1, b[k] === "w" ? 3 : 1);
  }
  out.push(3, 1, 1);
  return out;
}

// ---- 공항 세 글자 부호: 이름을 로마자로 옮긴 뒤 IATA처럼 줄인다(김포 → GMP 식). 바코드·부호는 늘 ASCII ----
const INI = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
const MED = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
const FIN = ["", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "l", "l", "l", "p", "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "t"];
const roman = (s: string) => Array.from(s).map((c) => {
  const n = (c.codePointAt(0) || 0) - 0xac00;
  if (n < 0 || n > 11171) return c;
  return INI[Math.floor(n / 588)] + MED[Math.floor((n % 588) / 28)] + FIN[n % 28];
}).join("");
const STOP = new Set(["on", "my", "the", "a", "an", "of", "to", "that", "what", "or", "not", "and", "is", "for", "in", "one", "new", "it", "nae", "uri", "je", "jeo"]);
function code3(name: string): string {
  const words = roman(clean(name)).replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const sig = words.filter((w) => !STOP.has(w.toLowerCase()));
  const cons = (w: string) => w.slice(1).replace(/[aeiouAEIOU]/g, "");
  let c: string;
  if (sig.length >= 3) c = sig.slice(0, 3).map((w) => w[0]).join("");
  else if (sig.length === 2) c = sig[0][0] + (cons(sig[0])[0] || sig[0][1] || "X") + sig[1][0];
  else { const w = sig[0] || words[0] || "XXX"; c = w.length <= 3 ? w : (w[0] + cons(w) + w.slice(1)).slice(0, 3); }
  return c.toUpperCase().padEnd(3, "X");
}

type Form = "classic" | "regional" | "charter";
function pickForm(work: GenreWork, seed: number): Form {
  const kinds = work.scenes.map((s) => s.kind);
  const pctItems = work.scenes.some((s) => s.kind === "items" && s.items.length > 0 && s.items.every((it) => /^\s*[\d.,]+\s*%\s*$/.test(it.value)));
  if (pctItems) return "charter";
  if (kinds.includes("terminal")) return "classic";
  if (!kinds.includes("hook")) return "regional";
  return (["classic", "regional", "charter"] as const)[seed % 3];
}

type Spec = { cap: number; p: number; lh?: number };
type Pass = {
  d: number[]; p: number; red: boolean; bold: boolean; rad: number;
  x0: number; x1: number; y0: number; y1: number; line: number; speed: number;
  dir: number; t0: number; t1: number; placed: boolean;
  bx: number; by: number; bw: number; bh: number; c: HTMLCanvasElement | null;
};
type PassList = Pass[] & { w?: number };
type FormEl =
  | { t: "label"; s: string; x: number; y: number; size: number; w: number; ink: string }
  | { t: "rule"; x: number; y: number; w: number }
  | { t: "vrule"; x: number; y: number; h: number }
  | { t: "box"; x: number; y: number; w: number; h: number }
  | { t: "leg"; x0: number; x1: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };
type Job = { si: number; kind: FlatScene["kind"]; passes: Pass[]; tag?: Pass[]; read: number; rect: Rect; handoffY?: number };
type Cam = { x: number; y: number; z: number };
type Seg = { t0: number; t1: number; a: number; b: number; big?: boolean; strike?: boolean };
type CamSeg = { t0: number; t1: number; a: Cam; b: Cam; push: boolean };

export const boardingpass: Genre = {
  id: "boardingpass",
  name: "Boarding pass",
  ko: "탑승권",
  koIdea: "작품이 비행편이 되고, 도트 프린터가 탑승권 빈칸을 한 줄씩 두드려 채운 뒤 탑승 때 꼬리표를 찢어 주는 영화",
  enIdea: "The work becomes a flight: a dot-matrix printer strikes it into a boarding pass field by field, then the stub is torn at the gate",
  family: "D",
  fonts: ["encodeSemiCond", "robotoMono"],
  make(work, { seed, fonts }) {
    const SANS = fonts.encodeSemiCond;
    const DOTF = fonts.robotoMono; // 점으로 바꿀 때만 쓴다
    const L = LABEL[work.locale];
    const KO = work.locale === "ko";
    const RES = 2;
    const mk = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
    const R = K.rng(seed);
    const title = nameOf(work.title);

    // ---------- 핀 점 표본기: 아무 글자 → 24핀 점 자리 ----------
    const sampC = mk(4096, 480);
    const sx = sampC.getContext("2d", { willReadFrequently: true })!;
    const gcache = new Map<string, { pts: number[]; w: number }>();
    const SK = 6;
    const glyphs = (text: string, cap: number, weight: number) => {
      const key = text + "|" + cap + "|" + weight;
      const hit = gcache.get(key);
      if (hit) return hit;
      const size = (cap * SK) / 0.698;
      sx.font = K.font(size, DOTF, weight);
      const tw = sx.measureText(text).width;
      const base = Math.ceil((size * 0.95) / SK) * SK + SK;
      const Wd = Math.min(4092, Math.ceil((tw + 2 * SK) / SK) * SK), Hd = Math.min(476, Math.ceil((base + size * 0.32 + SK) / SK) * SK);
      sx.clearRect(0, 0, Wd + SK, Hd + SK);
      sx.fillStyle = "#000"; sx.textBaseline = "alphabetic";
      sx.fillText(text, SK, base);
      const d = sx.getImageData(0, 0, Wd, Hd).data;
      const pts: number[] = [], cols = Wd / SK, rows = Hd / SK, br = base / SK;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        let s = 0;
        for (let yy = 0; yy < SK; yy++) { const o = ((j * SK + yy) * Wd + i * SK) * 4 + 3; for (let xx = 0; xx < SK; xx++) s += d[o + xx * 4]; }
        if (s / (SK * SK * 255) > 0.38) pts.push(i - 1, j - br);
      }
      const r = { pts, w: tw / SK };
      gcache.set(key, r);
      return r;
    };
    /** 인쇄 폭(카드 단위). */
    const widthOf = (s: string, spec: Spec, weight = 700) => { sx.font = K.font((spec.cap * SK) / 0.698, DOTF, weight); return (sx.measureText(clean(s)).width / SK) * spec.p; };
    /** 한글은 24점 한글 모드처럼 더 촘촘한 점으로 — 같은 크기, 1.5배 해상도. */
    const resOf = (spec: Spec, wide: boolean): Spec => (wide ? { cap: spec.cap * 1.5, p: spec.p / 1.5, lh: spec.lh } : spec);
    /** 폭에 맞춰 띄어쓰기로 끊고, 한 낱말이 넘치면 글자로 끊는다. */
    const wrapW = (text: string, w: number, spec: Spec, weight = 700): string[] => {
      const out: string[] = [];
      let cur = "";
      for (let word of clean(text).split(/\s+/)) {
        if (!word) continue;
        const nx = cur ? cur + " " + word : word;
        if (widthOf(nx, spec, weight) <= w) { cur = nx; continue; }
        if (cur) { out.push(cur); cur = ""; }
        while (widthOf(word, spec, weight) > w && word.length > 1) {
          const ch = Array.from(word);
          let k = ch.length - 1;
          while (k > 1 && widthOf(ch.slice(0, k).join(""), spec, weight) > w) k--;
          out.push(ch.slice(0, k).join(""));
          word = ch.slice(k).join("");
        }
        cur = word;
      }
      if (cur) out.push(cur);
      return out;
    };

    const form: Form = pickForm(work, seed);
    const STY = {
      classic: { stock: "#f1f3f2", ground: "#1b1e22", rod: "#a7adb3", carriage: "#2b2e33", tilt: -0.9 },
      regional: { stock: "#e2eaef", ground: "#3a4047", rod: "#b4b9be", carriage: "#24272b", tilt: 0.7 },
      charter: { stock: "#f4f4f1", ground: "#8c9393", rod: "#d1d4d6", carriage: "#33373c", tilt: -0.5 },
    }[form];
    const LIV = work.accent || "#1d3b8f";
    const livL = K.oklch(LIV)[0];
    const onLivery = livL > 0.62 ? "#15171a" : STY.stock;
    const labelInk = livL < 0.55 ? LIV : "#3e4852";
    const INK = [22, 24, 31];
    const REDHEX = work.alarm || "#c8242f";
    const RED = K.rgb(REDHEX);

    const SM: Spec = { cap: 10, p: 2.0, lh: KO ? 37 : 34 };
    const MD: Spec = { cap: 11, p: 3.1, lh: KO ? 64 : 50 };

    // ---------- 카드 짜임 ----------
    const PAD = 46, MW = 1240, SW = 430, GUT = 34;
    let mainX: number, stubX: number, perfX: number, cardW: number, top0: number;
    if (form === "classic") { mainX = PAD; perfX = mainX + MW + GUT; stubX = perfX + GUT; cardW = stubX + SW + PAD - 10; top0 = 96 + 22; }
    else if (form === "regional") { mainX = 118 + PAD; perfX = mainX + MW + GUT; stubX = perfX + GUT; cardW = stubX + SW + PAD - 10; top0 = 34 + 22; }
    else { stubX = PAD; perfX = stubX + SW + GUT; mainX = perfX + GUT; cardW = mainX + MW + PAD; top0 = 112 + 18; }

    const formEls: FormEl[] = [];
    const jobs: Job[] = [];
    const pre: Pass[] = [];
    const flight = (() => {
      const words = roman(title).replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
      const w0 = words[0] || "NF";
      const letters = (words.length > 1 ? w0[0] + words[1][0] : w0[0] + (w0.slice(1).replace(/[aeiouAEIOU]/g, "")[0] || w0[1] || "X")).toUpperCase();
      const hk = work.scenes.find((s) => s.kind === "hook");
      let num = hk && hk.kind === "hook" ? String(hk.value).replace(/\D/g, "") : "";
      if (!num) num = String(100 + Math.floor(R() * 800));
      return { code: letters + " " + num.padStart(3, "0").slice(0, 4), digits: (num.padStart(3, "0") + String(Math.floor(R() * 90 + 10)) + "001").slice(0, 8) };
    })();

    // ---------- 점 → 인쇄 줄(pass) ----------
    const passes: Pass[] = [];
    const tdots = (s: string, spec: Spec, x: number, base: number, weight = 700, align?: "r" | "c") => {
      const gl = glyphs(clean(s), spec.cap, weight);
      const width = gl.w * spec.p;
      let ox = x;
      if (align === "r") ox = x - width; else if (align === "c") ox = x - width / 2;
      const out = new Array<number>(gl.pts.length);
      for (let i = 0; i < gl.pts.length; i += 2) { out[i] = ox + (gl.pts[i] + 0.5) * spec.p; out[i + 1] = base + (gl.pts[i + 1] + 0.5) * spec.p; }
      return { d: out, w: width };
    };
    type PO = { red?: boolean; bold?: boolean; band?: number; speed?: number; rad?: number };
    const toPasses = (d: number[], spec: Spec, o: PO = {}): Pass[] => {
      if (!d.length) return [];
      let y0 = 1e9, y1 = -1e9;
      for (let i = 1; i < d.length; i += 2) { y0 = Math.min(y0, d[i]); y1 = Math.max(y1, d[i]); }
      const bandH = (o.band || 99) * spec.p;
      const out: Pass[] = [];
      for (let by = y0; by <= y1; by += bandH) {
        const dd: number[] = [];
        for (let i = 0; i < d.length; i += 2) if (d[i + 1] >= by - 0.01 && d[i + 1] < by + bandH - 0.01) dd.push(d[i], d[i + 1]);
        if (!dd.length) continue;
        let x0 = 1e9, x1 = -1e9, yy0 = 1e9, yy1 = -1e9;
        for (let i = 0; i < dd.length; i += 2) { x0 = Math.min(x0, dd[i]); x1 = Math.max(x1, dd[i]); yy0 = Math.min(yy0, dd[i + 1]); yy1 = Math.max(yy1, dd[i + 1]); }
        const ps: Pass = {
          d: dd, p: spec.p, red: !!o.red, bold: !!o.bold, rad: o.rad || 0.5, x0: x0 - spec.p, x1: x1 + spec.p, y0: yy0, y1: yy1, line: (yy0 + yy1) / 2,
          speed: o.speed || (spec.p > 5 ? 820 : spec.p > 3 ? 1450 : 2200), dir: 1, t0: 0, t1: 0, placed: false, bx: 0, by: 0, bw: 0, bh: 0, c: null,
        };
        passes.push(ps);
        out.push(ps);
      }
      return out;
    };
    const textPass = (s: string, spec: Spec, x: number, base: number, o: PO & { weight?: number; align?: "r" | "c" } = {}): PassList => {
      const sp = resOf(spec, hasWide(s));
      const td = tdots(s, sp, x, base, o.weight || 700, o.align);
      const ps: PassList = toPasses(td.d, sp, { ...o, band: o.band ? Math.round(o.band * (sp.cap / spec.cap)) : undefined });
      ps.w = td.w;
      return ps;
    };
    // 반전 인쇄 꼬리표: 점으로 꽉 채운 덩어리 속에 낱말만 비운다
    const tagPass = (word: string, xRight: number, top: number) => {
      const spec = resOf({ cap: 9, p: 2.5 }, hasWide(word));
      const gl = glyphs(word, spec.cap, 700);
      const padX = 5, padTop = Math.round(spec.cap * 0.45), rowsBelow = Math.round(spec.cap * 0.35);
      const cols = Math.ceil(gl.w) + padX * 2, rowsAbove = Math.round(spec.cap * (hasWide(word) ? 1.15 : 1)) + padTop;
      const hole = new Set<string>();
      for (let i = 0; i < gl.pts.length; i += 2) hole.add(gl.pts[i] + padX + "," + gl.pts[i + 1]);
      const d: number[] = [], x0 = xRight - cols * spec.p, base = top + rowsAbove * spec.p;
      for (let r = -rowsAbove; r < rowsBelow; r++) for (let c = 0; c < cols; c++) {
        if (hole.has(c + "," + r)) continue;
        d.push(x0 + (c + 0.5) * spec.p, base + (r + 0.5) * spec.p);
      }
      return toPasses(d, spec, { speed: 900, rad: 0.66 });
    };

    // ---------- 양식 + 장면 종류별 내용 ----------
    const lab = (s: string, x: number, y: number, o: { size?: number; w?: number; ink?: string } = {}) => formEls.push({ t: "label", s, x, y, size: o.size || 19, w: o.w || 500, ink: o.ink || labelInk });
    const hair = (x: number, y: number, w: number) => formEls.push({ t: "rule", x, y, w });
    const box = (x: number, y: number, w: number, h: number) => formEls.push({ t: "box", x, y, w, h });
    const zoneLabel = (s: string, x: number, y: number, o?: { size?: number; w?: number; ink?: string }) => lab(s, x, y + 16, o);
    const mcx = mk(8, 8).getContext("2d")!;
    const sansW = (s: string, size: number) => { mcx.font = K.font(size, SANS, 500); return mcx.measureText(s).width; };
    const sansWrap = (s: string, size: number, maxW: number) => { mcx.font = K.font(size, SANS, 500); return K.wrap(mcx, s, maxW); };

    // A줄 — 비행편 줄(영화 시작 전에 이미 찍혀 있다)
    const status = (() => {
      const y = top0, cols = [0, 0.36, 0.56, 0.74];
      const names = [L.passenger, L.flight, L.seq, L.status];
      const vals = ["@" + work.handle, flight.code, "001", L.onTime];
      let st = { x: 0, y: 0, w: 0, line: top0 };
      cols.forEach((c, i) => {
        const x = mainX + c * MW;
        lab(names[i], x, y + 16, { size: 17 });
        const ps = textPass(vals[i], SM, x, y + 46, { bold: i === 0 });
        pre.push(...ps);
        if (i === 3) st = { x, y, w: ps.w || 0, line: ps[0] ? ps[0].line : y + 40 };
      });
      hair(mainX, y + 66, MW);
      return st;
    })();

    let stubY = top0;
    lab(L.passenger, stubX, stubY + 16, { size: 17 });
    pre.push(...textPass("@" + work.handle, SM, stubX, stubY + 46, { bold: true }));
    lab(L.flight, stubX + SW * 0.62, stubY + 16, { size: 17 });
    pre.push(...textPass(flight.code, SM, stubX + SW * 0.62, stubY + 46));
    hair(stubX, stubY + 66, SW);
    stubY += 88;

    const wideSpan = (sp: Spec, s: string) => hasWide(s) ? resOf(sp, true) : sp;
    const B = {
      hook(s: Extract<FlatScene, { kind: "hook" }>, x: number, y: number, w: number, job: Job) {
        zoneLabel(clean(s.label), x, y, { size: 21 });
        const w15 = widthOf(s.value, { cap: 15, p: 7 });
        const cap = Math.max(8, Math.min(15, Math.floor((15 * w) / Math.max(1, w15))));
        const Hs = { cap, p: 7 };
        const base = y + 34 + cap * Hs.p;
        const hero = textPass(s.value, Hs, x - 4, base, { bold: true, red: !!s.alarm, band: 8 });
        job.passes.push(...hero);
        let yy = base + 24;
        for (const ln of wrapW(s.line, w, SM)) { yy += SM.lh!; job.passes.push(...textPass(ln, SM, x, yy, { bold: true })); }
        if (s.data === "sample") job.tag = tagPass(L.sample, Math.min(x + w, x + (hero.w || 0) + 200), y + 2);
        job.read = readLen(s.label + s.value + s.line);
        return yy - y + 14;
      },
      story(s: Extract<FlatScene, { kind: "story" }>, x: number, y: number, w: number, job: Job) {
        zoneLabel(L.remarks, x, y);
        let yy = y + 26;
        for (const ln of wrapW(s.line, w, MD)) { yy += MD.lh! - 6; job.passes.push(...textPass(ln, MD, x, yy, { bold: true })); }
        yy += 6;
        for (const ln of wrapW(s.line2, w, SM)) { yy += SM.lh!; job.passes.push(...textPass(ln, SM, x, yy)); }
        job.read = readLen(s.line + s.line2);
        return yy - y + 16;
      },
      flow(s: Extract<FlatScene, { kind: "flow" }>, x: number, y: number, w: number, job: Job, nth: number) {
        zoneLabel(nth ? L.connection : L.routing, x, y);
        const n = s.nodes.length, slot = w / n;
        const C = { cap: 12, p: 3.2 };
        const yc = y + 40;
        s.nodes.forEach((_, i) => {
          lab(i === 0 ? L.from : i === n - 1 ? L.to : L.via, x + i * slot, yc + 2, { size: 15 });
          if (i < n - 1) formEls.push({ t: "leg", x0: x + i * slot + widthOf("MMM", C) + 18, x1: x + (i + 1) * slot - 18, y: yc + 22 + C.cap * C.p * 0.5 });
        });
        // 부호: 왼쪽→오른쪽 한 번에 — 여정이 헤드가 지나가는 순서로 읽힌다
        const cd: number[] = [];
        s.nodes.forEach((nd, i) => { cd.push(...tdots(code3(nd), C, x + i * slot, yc + 22 + C.cap * C.p).d); });
        job.passes.push(...toPasses(cd, C, { bold: true, speed: 1250 }));
        // 부호 아래 정류장 이름 — 최대 두 줄, 줄마다 한 번 훑기(한글이 있으면 그 줄은 촘촘한 점)
        const wide = s.nodes.some(hasWide);
        const SP = wideSpan(SM, wide ? "가" : "");
        const rows: number[][] = [[], []];
        let yy = yc + 22 + C.cap * C.p + 8;
        s.nodes.forEach((nd, i) => {
          wrapW(nd, slot - 18, SM).slice(0, 2).forEach((ln, r) => rows[r].push(...tdots(ln, SP, x + i * slot, yy + (r + 1) * SM.lh!).d));
        });
        rows.forEach((d) => { if (d.length) job.passes.push(...toPasses(d, SP)); });
        yy += (rows[1].length ? 2 : 1) * SM.lh! + 8;
        for (const ln of wrapW(s.line, w, SM)) { yy += SM.lh!; job.passes.push(...textPass(ln, SM, x, yy)); }
        job.read = readLen(s.nodes.join(" ") + s.line) * 0.8;
        return yy - y + 14;
      },
      terminal(s: Extract<FlatScene, { kind: "terminal" }>, x: number, y: number, w: number, job: Job) {
        zoneLabel(L.agent, x, y);
        let yy = y + 24;
        const put = (t: string, bold: boolean) => { for (const ln of wrapW(t, w, SM)) { yy += SM.lh! - 2; job.passes.push(...textPass(ln, SM, x, yy, { bold, speed: 2900 })); } };
        put("> " + s.command, true);
        for (const o of s.output) put(o, /survived|살아남/i.test(o));
        yy += 6;
        put(s.line, true);
        if (s.data === "sample") job.tag = tagPass(L.sample, x + w, y + 2);
        job.read = readLen(s.command + s.output.join(" ") + s.line) * 0.7;
        return yy - y + 14;
      },
      items(s: Extract<FlatScene, { kind: "items" }>, x: number, y: number, w: number, job: Job) {
        zoneLabel(L.manifest, x, y);
        const n = s.items.length, gap = 12, bw = (w - gap * (n - 1)) / n, bh = 104, by = y + (s.data === "sample" ? (KO ? 52 : 42) : 32);
        const V = { cap: 11, p: 3.1 };
        const vd: number[] = [], rd: number[] = [];
        s.items.forEach((it, i) => {
          const bx = x + i * (bw + gap);
          box(bx, by, bw, bh);
          sansWrap(clean(it.label), 16, bw - 22).slice(0, 2).forEach((ln, r) => lab(ln, bx + 12, by + 26 + r * 20, { size: 16 }));
          const val = clean(it.value);
          const sp = wideSpan(V, val);
          (it.alarm ? rd : vd).push(...tdots(val, sp, bx + 12, by + bh - 14).d);
        });
        // 모든 칸을 한 번에 훑고, 경고 값은 리본의 빨간 절반으로 한 번 더
        const anyWide = s.items.some((it) => hasWide(it.value));
        const VS = wideSpan(V, anyWide ? "가" : "");
        job.passes.push(...toPasses(vd, VS, { bold: true, speed: 1150 }));
        if (rd.length) job.passes.push(...toPasses(rd, VS, { bold: true, red: true, speed: 900 }));
        let yy = by + bh + 8;
        for (const ln of wrapW(s.line, w, SM)) { yy += SM.lh!; job.passes.push(...textPass(ln, SM, x, yy, { bold: true })); }
        if (s.data === "sample") job.tag = tagPass(L.sample, x + w, y + 2);
        job.read = readLen(s.items.map((it) => it.label + it.value).join(" ") + s.line) * 0.6;
        return yy - y + 14;
      },
      alert(s: Extract<FlatScene, { kind: "alert" }>, x: number, y: number, w: number, job: Job) {
        zoneLabel(L.notice, x, y, { ink: REDHEX, w: 700 });
        let yy = y + 26 + SM.lh!;
        job.passes.push(...textPass(s.title, SM, x, yy, { bold: true, red: true }));
        const w13 = widthOf(s.body, { cap: 13, p: 3.2 });
        const capB = Math.max(9, Math.min(13, Math.floor((13 * w) / Math.max(1, w13))));
        const Bd = { cap: capB, p: 3.2, lh: Math.round(capB * 3.2 * (KO ? 1.6 : 1.45)) };
        yy += 6;
        for (const ln of wrapW(s.body, w, Bd)) { yy += Bd.lh; job.passes.push(...textPass(ln, Bd, x, yy, { bold: true })); }
        yy += 4;
        for (const ln of wrapW(s.line, w, SM)) { yy += SM.lh!; job.passes.push(...textPass(ln, SM, x, yy, { bold: true })); }
        if (s.line2) for (const ln of wrapW(s.line2, w, SM)) { yy += SM.lh!; job.passes.push(...textPass(ln, SM, x, yy)); }
        if (s.data === "sample") job.tag = tagPass(L.sample, x + w, y + 2);
        job.read = readLen(s.title + s.body + s.line + (s.line2 || ""));
        return yy - y + 14;
      },
      stats(s: Extract<FlatScene, { kind: "stats" }>, x: number, y: number, w: number, job: Job) {
        const V = { cap: 12, p: 4.4 };
        let yy = y + (s.data === "sample" ? (KO ? 54 : 46) : 22);
        s.stats.forEach((st, i) => {
          const bh = i === 0 ? 118 : 96;
          box(x, yy, w, bh);
          lab(clean(st.label), x + 12, yy + 24, { size: 16 });
          const u = st.unit || "";
          const unit = u === "%" ? "%" : u && (u[0] === "/" || isWide(Array.from(u)[0])) ? u : u ? " " + u : "";
          const spec = i === 0 ? V : { cap: 10, p: 3.9 };
          job.passes.push(...textPass(st.value + unit, spec, x + 12, yy + bh - 14, { bold: true, band: 8 }));
          yy += bh + 8;
        });
        if (s.source) { yy += SM.lh! - 8; job.passes.push(...textPass(L.source + s.source, SM, x, yy)); }
        for (const ln of wrapW(s.line, w, SM)) { yy += SM.lh!; job.passes.push(...textPass(ln, SM, x, yy, { bold: true })); }
        if (s.data === "sample") job.tag = tagPass(L.sample, x + w, y + 2);
        job.read = readLen(s.stats.map((st) => st.label + st.value).join(" ") + s.line) * 0.7;
        return yy - y + 14;
      },
      ending(s: Extract<FlatScene, { kind: "ending" }>, x: number, y: number, w: number, job: Job) {
        zoneLabel(L.boarding, x, y);
        const nm = clean(s.name);
        const w12 = widthOf(nm, { cap: 12, p: 3.3 });
        const cap = Math.max(8, Math.min(12, Math.floor((12 * w) / Math.max(1, w12))));
        const N = { cap, p: 3.3, lh: Math.round(cap * 3.3 * (hasWide(nm) ? 1.6 : 1.4)) };
        let yy = y + 22;
        for (const ln of wrapW(nm, w, N)) { yy += N.lh; job.passes.push(...textPass(ln, N, x, yy, { bold: true })); }
        yy += 4;
        for (const ln of wrapW(s.line, w, SM)) { yy += SM.lh!; job.passes.push(...textPass(ln, SM, x, yy, { bold: true })); }
        for (const ln of wrapW(s.line2, w, SM)) { yy += SM.lh!; job.passes.push(...textPass(ln, SM, x, yy)); }
        // 바코드도 핀 열로 친다(숫자만 부호화)
        yy += 18;
        const mods = i2of5(flight.digits);
        const total = mods.reduce((a, b) => a + b, 0), mw = Math.min(3.2, (w - 10) / total);
        const d: number[] = [];
        let bx = x, bar = true;
        for (const m of mods) { if (bar) for (let c = 0; c < m; c++) for (let r = 0; r < 32; r++) d.push(bx + (c + 0.5) * mw, yy + r * 2.0); bx += m * mw; bar = !bar; }
        job.passes.push(...toPasses(d, { cap: 1, p: mw }, { speed: 1300, rad: 0.72 }));
        yy += 32 * 2.0 + 6;
        job.handoffY = yy + 40;
        job.read = readLen(s.line + s.line2 + s.name) * 0.8;
        return yy - y + 60;
      },
    };
    const build = (s: FlatScene, x: number, y: number, w: number, job: Job, nth: number): number => {
      switch (s.kind) {
        case "hook": return B.hook(s, x, y, w, job);
        case "story": return B.story(s, x, y, w, job);
        case "flow": return B.flow(s, x, y, w, job, nth);
        case "terminal": return B.terminal(s, x, y, w, job);
        case "items": return B.items(s, x, y, w, job);
        case "alert": return B.alert(s, x, y, w, job);
        case "stats": return B.stats(s, x, y, w, job);
        case "ending": return B.ending(s, x, y, w, job);
      }
    };
    const newJob = (si: number, kind: FlatScene["kind"]): Job => ({ si, kind, passes: [], read: 10, rect: { x: 0, y: 0, w: 1, h: 1 } });

    // ---------- 본권(두 단)과 꼬리표 배치 ----------
    const colW = (MW - 40) / 2;
    type Z = { si: number; s: FlatScene; span: number; nth: number };
    const mainList: Z[] = [], stubList: Z[] = [];
    let flowN = 0;
    work.scenes.forEach((s, si) => {
      if (s.kind === "stats" || s.kind === "ending") { stubList.push({ si, s, span: 1, nth: 0 }); return; }
      let span = 1, nth = 0;
      if (s.kind === "flow") { nth = flowN++; span = s.nodes.every((nd) => wrapW(nd, colW / s.nodes.length - 18, SM).length <= 2) ? 1 : 2; }
      else if (s.kind === "items") span = 2;
      else if (s.kind === "terminal") span = [s.command, ...s.output].every((l) => widthOf("> " + l, SM) <= colW) ? 1 : 2;
      mainList.push({ si, s, span, nth });
    });
    let my = top0 + 66 + 26;
    for (let i = 0; i < mainList.length;) {
      const a = mainList[i], b = mainList[i + 1];
      const pair = a.span === 1 && !!b && b.span === 1;
      const row = pair ? [a, b] : [a];
      let h = 0;
      row.forEach((z, k) => {
        const w = pair ? colW : MW;
        const x = mainX + (pair ? k * (colW + 40) : 0);
        const job = newJob(z.si, z.s.kind);
        const hh = build(z.s, x, my, w, job, z.nth);
        // 실제로 찍힌 폭만 잡는다(짧은 숫자에 카메라가 헐렁하지 않게)
        let cw = 0;
        for (const ps of job.passes) cw = Math.max(cw, ps.x1 - x);
        for (const ps of job.tag || []) cw = Math.max(cw, ps.x1 - x);
        job.rect = { x, y: my, w: Math.min(w, Math.max(cw + 30, 520)), h: hh };
        jobs[z.si] = job;
        h = Math.max(h, hh);
      });
      if (pair) formEls.push({ t: "vrule", x: mainX + colW + 20, y: my + 4, h: h - 10 });
      my += h + 24;
      if (i + row.length < mainList.length) hair(mainX, my - 14, MW);
      i += row.length;
    }
    // 수치가 없으면 꼬리표에 탑승구·좌석 칸
    if (!stubList.some((z) => z.s.kind === "stats")) {
      const bw = (SW - 12) / 2;
      const gate = String.fromCharCode(65 + Math.floor(R() * 6)) + (2 + Math.floor(R() * 30));
      let firstNum = "";
      for (const s of work.scenes) {
        if (s.kind === "hook") firstNum = String(s.value).replace(/\D/g, "");
        else if (s.kind === "items" && s.items[0]) firstNum = String(s.items[0].value).replace(/\D/g, "");
        if (firstNum) break;
      }
      const seat = (firstNum || "14").slice(0, 2) + "ABCDEF"[Math.floor(R() * 6)];
      ([[L.gate, gate], [L.seat, seat]] as const).forEach(([l, v], i) => {
        const bx = stubX + i * (bw + 12);
        box(bx, stubY, bw, 104);
        lab(l, bx + 12, stubY + 24, { size: 16 });
        pre.push(...textPass(v, { cap: 12, p: 4.2 }, bx + 12, stubY + 104 - 16, { bold: true }));
      });
      stubY += 104 + 30;
    }
    let endZ: Z | null = null;
    for (const z of stubList) {
      if (z.s.kind === "ending") { endZ = z; continue; }
      const job = newJob(z.si, z.s.kind);
      const hh = build(z.s, stubX, stubY, SW, job, 0);
      job.rect = { x: stubX, y: stubY, w: SW, h: hh };
      jobs[z.si] = job;
      stubY += hh + 18;
    }
    let endH = 0;
    if (endZ) {
      const np = passes.length, nf = formEls.length;
      endH = build(endZ.s, stubX, 0, SW, newJob(-1, "ending"), 0);
      passes.length = np; formEls.length = nf;
    }
    const footPad = form === "charter" ? 46 : 14;
    const cardH = Math.max(my + 10 + (form === "charter" ? 40 : 0), stubY + endH + footPad);
    // 꼬리표에 남는 자리 → 꼬리표 제 몫의 출발·도착
    const fl = work.scenes.find((s) => s.kind === "flow");
    if (fl && fl.kind === "flow" && fl.nodes.length > 1 && cardH - footPad - endH - stubY >= 150) {
      const C = { cap: 14, p: 3.4 };
      stubY += Math.max(0, (cardH - footPad - endH - stubY - 150) * 0.45);
      const a0 = code3(fl.nodes[0]), a1 = code3(fl.nodes[fl.nodes.length - 1]);
      lab(L.from, stubX, stubY + 18, { size: 16 });
      lab(L.to, stubX + SW * 0.55, stubY + 18, { size: 16 });
      pre.push(...textPass(a0, C, stubX, stubY + 30 + C.cap * C.p, { bold: true }));
      pre.push(...textPass(a1, C, stubX + SW * 0.55, stubY + 30 + C.cap * C.p, { bold: true }));
      formEls.push({ t: "leg", x0: stubX + widthOf("MMM", C) + 16, x1: stubX + SW * 0.55 - 16, y: stubY + 30 + C.cap * C.p * 0.5 });
      stubY += 30 + C.cap * C.p + 30;
      hair(stubX, stubY - 12, SW);
    }
    let endY = stubY;
    if (endZ) {
      endY = cardH - footPad - endH;
      const job = newJob(endZ.si, "ending");
      const hh = build(endZ.s, stubX, endY, SW, job, 0);
      job.rect = { x: stubX, y: endY, w: SW, h: hh };
      jobs[endZ.si] = job;
    }

    // ---------- 시간표 ----------
    const feedSegs: Seg[] = [], headSegs: Seg[] = [], camSegs: CamSeg[] = [];
    let T = 0, curY = status.line, curX = mainX;
    let cam: Cam = { x: cardW / 2, y: cardH / 2, z: 1 };
    const frameOf = (r: Rect, zMax = 1.75): Cam => {
      const z = K.clamp(Math.min(1480 / (r.w + 150), 780 / (r.h + 190)), 0.82, zMax);
      return { x: r.x + r.w / 2, y: r.y + r.h / 2 + 34, z };
    };
    const camTo = (target: Cam, t0: number, dur: number) => { camSegs.push({ t0, t1: t0 + dur, a: cam, b: target, push: false }); cam = target; };
    const camPush = (t0: number, dur: number, amt: number) => { const b = { ...cam, z: cam.z * (1 + amt) }; camSegs.push({ t0, t1: t0 + dur, a: cam, b, push: true }); cam = b; };
    const feed = (y: number, t0: number) => {
      const d = Math.abs(y - curY);
      if (d < 0.5) return t0;
      const dur = d < 90 ? 0.05 + d / 1500 : 0.3 + d / 1700;
      feedSegs.push({ t0, t1: t0 + dur, a: curY, b: y, big: d >= 90 });
      curY = y;
      return t0 + dur;
    };
    const headTo = (x: number, t0: number) => {
      const d = Math.abs(x - curX);
      if (d < 0.5) return t0;
      const dur = 0.05 + d / 3800;
      headSegs.push({ t0, t1: t0 + dur, a: curX, b: x });
      curX = x;
      return t0 + dur;
    };
    const strike = (ps: Pass, t0: number) => {
      // 논리 탐색: 헤드에 가까운 끝에서 시작한다
      ps.dir = Math.abs(curX - ps.x0) <= Math.abs(curX - ps.x1) ? 1 : -1;
      const s0 = ps.dir > 0 ? ps.x0 : ps.x1, s1 = ps.dir > 0 ? ps.x1 : ps.x0;
      const tf = feed(ps.line, t0), th = headTo(s0, t0);
      const ta = Math.max(tf, th) + 0.02;
      const dur = Math.abs(s1 - s0) / ps.speed;
      headSegs.push({ t0: ta, t1: ta + dur, a: s0, b: s1, strike: true });
      curX = s1;
      ps.t0 = ta; ps.t1 = ta + dur; ps.placed = true;
      return ta + dur;
    };

    let t = 0;
    for (const ps of pre) t = strike(ps, t);
    T = t;
    let tStart = 0;
    const sceneAt: number[] = [];
    work.scenes.forEach((s, n) => {
      const job = jobs[n];
      const target = frameOf(job.rect, job.kind === "stats" || job.kind === "ending" ? 1.6 : 1.75);
      sceneAt[n] = T;
      if (n === 0) cam = target;
      if (s.kind === "alert") {
        // 탑승구 변경: 상태 칸으로 거꾸로 먹여, 옛 상태를 빨간 X로 지우고 새 상태를 쓴다
        const fr = frameOf({ x: status.x - 40, y: status.y - 10, w: 420, h: 90 }, 1.9);
        camTo(fr, T, 1.05);
        const xw = widthOf("X", SM);
        const xs = "X".repeat(Math.max(2, Math.ceil(status.w / xw)));
        const ov = textPass(xs, SM, status.x, status.y + 46, { bold: true, red: true });
        const nw = textPass(L.changed, SM, status.x + Math.max(status.w, (ov.w || 0)) + 14, status.y + 46, { bold: true, red: true });
        let tt = T + 0.55;
        for (const ps of [...ov, ...nw]) tt = strike(ps, tt);
        T = tt + 0.5;
        camTo(target, T, 1.0);
        T += 0.55;
      } else if (n > 0) {
        const dist = Math.hypot(target.x - cam.x, target.y - cam.y);
        const dur = K.clamp(0.9 + dist / 2600, 0.95, 1.35);
        camTo(target, T, dur);
        T += dur * 0.45;
      }
      let tt = T;
      const all = (job.tag || []).concat(job.passes);
      all.forEach((ps, k) => {
        tt = strike(ps, tt);
        if (ps.speed <= 820 && k < all.length - 1) tt += 0.06; // 큰 띠: 꺾을 때 헤드가 잠깐 쉰다
      });
      if (n === 0) {
        // 첫 화면엔 첫 장면이 마지막 줄만 빼고 이미 찍혀 있다(헤드가 치는 중)
        const last = job.passes[job.passes.length - 1];
        tStart = last ? last.t0 + Math.min(0.1, (last.t1 - last.t0) * 0.25) : tt;
      }
      // 한 덩어리가 끝나면 헤드는 글자에서 비켜나고 종이가 조금 올라간다 — 멈춤 동안 칸 전체가 읽힌다
      if (job.kind !== "ending") {
        const r = job.rect;
        const right = r.x + r.w + 110, left = r.x - 110;
        headTo(K.clamp(Math.abs(curX - right) < Math.abs(curX - left) ? right : left, 40, cardW - 40), tt + 0.05);
        feed(Math.min(cardH - 20, r.y + r.h + 26), tt + 0.1);
      }
      const printT = job.passes.reduce((a, ps) => a + (ps.t1 - ps.t0), 0);
      let hold = Math.max(job.kind === "ending" ? 0.6 : 1.1, readHold(job.read) - printT * 0.9 - 0.5);
      if (job.kind === "terminal") hold = Math.max(hold, 2.4);
      if (job.kind === "hook") hold = Math.max(hold, 1.6);
      if (job.kind === "stats") hold = Math.max(hold, 1.9);
      hold = Math.min(hold, job.kind === "terminal" ? 2.6 : job.kind === "ending" ? 0.5 : KO ? 2.3 : 2.0);
      camPush(tt, hold + 0.4, 0.035);
      T = tt + hold;
    });
    // 배출: 헤드는 쉼 자리로, 종이가 빠져나가고(막대가 카드 밖으로) 카메라가 물러난다
    const tEj = T;
    headTo(form === "charter" ? -320 : cardW + 320, tEj);
    feed(cardH + 340, tEj + 0.25);
    camTo({ x: cardW / 2, y: cardH / 2 + 10, z: Math.min(1460 / cardW, 800 / cardH) }, tEj + 0.15, 1.3);
    const tTear = tEj + 1.6;
    camTo(frameOf({ x: stubX - 40, y: endY - 230, w: SW + 80, h: cardH - endY + 230 }, 1.3), tTear + 0.3, 1.25);
    const handStart = tTear + 0.65;
    const sh = (arr: { t0: number; t1: number }[]) => arr.forEach((s) => { s.t0 -= tStart; s.t1 -= tStart; });
    sh(feedSegs); sh(headSegs); sh(camSegs);
    for (const ps of passes) if (ps.placed) { ps.t0 -= tStart; ps.t1 -= tStart; }
    const TEAR = tTear - tStart, HAND = handStart - tStart;
    const duration = HAND + 2.5;
    const starts = work.scenes.map((_, i) => Math.max(0, (sceneAt[i] ?? 0) - tStart));
    const endJob = jobs[work.scenes.findIndex((s) => s.kind === "ending")];

    // ---------- 줄마다 점 그림(방향이 정해진 뒤) ----------
    passes.forEach((ps, i) => {
      if (!ps.placed) return;
      const p = ps.p, mis = ps.dir < 0 ? 0.3 * p : 0; // 왕복 인쇄의 어긋남
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (let k = 0; k < ps.d.length; k += 2) { x0 = Math.min(x0, ps.d[k]); x1 = Math.max(x1, ps.d[k]); y0 = Math.min(y0, ps.d[k + 1]); y1 = Math.max(y1, ps.d[k + 1]); }
      ps.bx = x0 - p * 1.4; ps.by = y0 - p * 1.4; ps.bw = x1 - x0 + p * 3.4; ps.bh = y1 - y0 + p * 2.8;
      const c = mk(ps.bw * RES, ps.bh * RES), x = c.getContext("2d")!;
      const ink = ps.red ? RED : INK;
      const r = K.rng(seed + i * 131);
      const ns = (seed % 97) + i;
      for (let k = 0; k < ps.d.length; k += 2) {
        const dx = (ps.d[k] - ps.bx + mis + (r() - 0.5) * 0.18 * p) * RES, dy = (ps.d[k + 1] - ps.by + (r() - 0.5) * 0.14 * p) * RES;
        const a = K.clamp(0.84 + 0.1 * K.noise(ps.d[k] * 0.004, ns) + (r() - 0.5) * 0.16, 0.55, 0.98);
        const rad = p * ps.rad * (0.9 + r() * 0.2) * RES;
        x.fillStyle = `rgba(${ink[0]},${ink[1]},${ink[2]},${a.toFixed(3)})`;
        x.beginPath(); x.arc(dx, dy, rad, 0, Math.PI * 2); x.fill();
        if (ps.bold) { x.beginPath(); x.arc(dx + 0.42 * p * RES, dy, rad * 0.94, 0, Math.PI * 2); x.fill(); }
      }
      ps.c = c;
    });
    const live = passes.filter((ps) => ps.c).sort((a, b) => a.t0 - b.t0);

    // ---------- 보안 무늬(본권에 오프셋으로 찍힌 잔물결) ----------
    const tint = (() => {
      const sc = 0.5, c = mk(cardW * sc, cardH * sc), x = c.getContext("2d")!;
      x.strokeStyle = livL > 0.62 ? "rgba(96,122,138,0.16)" : K.rgba(LIV, 0.13);
      x.lineWidth = 0.8;
      const ph = R() * 10;
      for (let yy = -20; yy < cardH + 20; yy += 9) {
        x.beginPath();
        for (let xx = 0; xx <= cardW; xx += 12) {
          const v = yy + Math.sin(xx * 0.011 + yy * 0.05 + ph) * 7 + Math.sin(xx * 0.003 + ph * 2) * 10;
          if (xx === 0) x.moveTo(xx * sc, v * sc); else x.lineTo(xx * sc, v * sc);
        }
        x.stroke();
      }
      return c;
    })();

    // ---------- 시간 → 상태 ----------
    const bzMove = K.ease.bezier(0.42, 0, 0.12, 1);
    const bzFeed = K.ease.bezier(0.5, 0, 0.18, 1);
    const evalSegs = (segs: Seg[], tt: number, init: number, f: (s: Seg, k: number) => number) => {
      let v = init;
      for (const s of segs) {
        if (tt < s.t0) break;
        v = tt >= s.t1 ? s.b : f(s, (tt - s.t0) / Math.max(1e-6, s.t1 - s.t0));
      }
      return v;
    };
    const railAt = (tt: number) => evalSegs(feedSegs, tt, feedSegs.length ? feedSegs[0].a : top0, (s, k) => (s.big ? K.lerp(s.a, s.b, bzFeed(k)) : K.lerp(s.a, s.b, Math.floor(K.ease.outCubic(k) * 4) / 4)));
    const headAt = (tt: number) => evalSegs(headSegs, tt, headSegs.length ? headSegs[0].a : mainX, (s, k) => (s.strike ? K.lerp(s.a, s.b, k) : K.lerp(s.a, s.b, K.ease.outCubic(k))));
    const striking = (tt: number) => headSegs.some((s) => s.strike && tt >= s.t0 && tt < s.t1);
    const camAt = (tt: number): Cam => {
      let c = camSegs.length ? camSegs[0].a : cam;
      for (const s of camSegs) {
        if (tt < s.t0) break;
        if (tt >= s.t1) { c = s.b; continue; }
        const k = (tt - s.t0) / (s.t1 - s.t0);
        const e = s.push ? K.ease.outCubic(k) : bzMove(k);
        // 확대는 로그 공간에서 — 밀고 당김이 고르게 느껴진다
        c = { x: K.lerp(s.a.x, s.b.x, e), y: K.lerp(s.a.y, s.b.y, e), z: Math.exp(K.lerp(Math.log(s.a.z), Math.log(s.b.z), e)) };
      }
      return c;
    };

    // ---------- 그리기 ----------
    const rr = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
    const fitSans = (s: string, size: number, maxW: number) => { let z = size; while (z > 14 && sansW(s, z) > maxW) z -= 2; return z; };
    const titleSz = { classic: fitSans(title, 44, MW - sansW(L.pass, 22) - 60), regional: fitSans(title, 46, cardH - 80), charter: fitSans(title, 50, MW - sansW(L.charter, 21) - 60) };
    const drawForm = (g: CanvasRenderingContext2D) => {
      g.fillStyle = LIV;
      g.textBaseline = "alphabetic";
      if (form === "classic") {
        g.fillRect(0, 0, cardW, 96);
        g.fillStyle = onLivery;
        g.font = K.font(titleSz.classic, SANS, 700); g.textAlign = "left"; g.fillText(title, mainX, 62);
        g.font = K.font(22, SANS, 500); g.textAlign = "right"; g.fillText(L.pass, mainX + MW, 60);
        g.textAlign = "left"; g.fillText(L.pass, stubX, 60);
      } else if (form === "regional") {
        g.fillRect(0, 0, 118, cardH);
        g.fillRect(118, 0, cardW - 118, 12);
        g.save(); g.translate(76, cardH - 40); g.rotate(-Math.PI / 2);
        g.fillStyle = onLivery; g.font = K.font(titleSz.regional, SANS, 700); g.textAlign = "left"; g.fillText(title, 0, 0);
        g.restore();
        g.fillStyle = "#3e4852"; g.font = K.font(20, SANS, 500); g.textAlign = "right"; g.fillText(L.pass, mainX + MW, 38);
        g.textAlign = "left"; g.fillText(L.pass, stubX, 38);
      } else {
        g.fillRect(0, 0, cardW, 14);
        g.fillRect(0, cardH - 30, cardW, 30);
        g.fillStyle = "#1c1f23"; g.font = K.font(titleSz.charter, SANS, 700); g.textAlign = "left"; g.fillText(title, mainX, 82);
        g.fillStyle = LIV; g.fillRect(mainX, 96, 64, 6);
        g.fillStyle = "#3e4852"; g.font = K.font(21, SANS, 500); g.textAlign = "right"; g.fillText(L.charter, mainX + MW, 80);
        g.textAlign = "left"; g.fillText(L.pass, stubX, 80);
        g.fillStyle = onLivery; g.font = K.font(17, SANS, 500); g.fillText(L.keep, mainX, cardH - 10);
      }
      g.textAlign = "left";
      for (const f of formEls) {
        if (f.t === "label") { g.fillStyle = f.ink; g.font = K.font(f.size, SANS, f.w); g.fillText(f.s, f.x, f.y); }
        else if (f.t === "rule") { g.fillStyle = K.rgba(LIV, 0.45); g.fillRect(f.x, f.y, f.w, 1.6); }
        else if (f.t === "vrule") { g.fillStyle = K.rgba(LIV, 0.3); g.fillRect(f.x, f.y, 1.4, f.h); }
        else if (f.t === "box") { g.strokeStyle = K.rgba(LIV, livL > 0.62 ? 0.9 : 0.65); g.lineWidth = 1.8; rr(g, f.x, f.y, f.w, f.h, 6); g.stroke(); }
        else if (f.t === "leg") {
          if (f.x1 - f.x0 < 20) continue;
          g.fillStyle = K.rgba(LIV, 0.75);
          for (let xx = f.x0; xx < f.x1 - 14; xx += 10) g.fillRect(xx, f.y, 5, 1.8);
          g.beginPath(); g.moveTo(f.x1 - 10, f.y - 6); g.lineTo(f.x1, f.y + 0.9); g.lineTo(f.x1 - 10, f.y + 7.8); g.lineWidth = 1.8; g.strokeStyle = K.rgba(LIV, 0.75); g.stroke();
        }
      }
    };
    const drawInk = (g: CanvasRenderingContext2D, tt: number, xa: number, xb: number) => {
      for (const ps of live) {
        if (tt < ps.t0) break;
        const c = ps.c!;
        if (ps.bx + ps.bw < xa || ps.bx > xb) continue;
        if (tt >= ps.t1) { g.drawImage(c, ps.bx, ps.by, ps.bw, ps.bh); continue; }
        const k = (tt - ps.t0) / (ps.t1 - ps.t0);
        let hx = ps.dir > 0 ? K.lerp(ps.x0, ps.x1, k) : K.lerp(ps.x1, ps.x0, k);
        hx = ps.x0 + Math.floor((hx - ps.x0) / ps.p) * ps.p; // 핀은 열 단위로만 친다
        if (ps.dir > 0) { const w = K.clamp(hx - ps.bx, 0, ps.bw); if (w > 0.5) g.drawImage(c, 0, 0, w * RES, c.height, ps.bx, ps.by, w, ps.bh); }
        else { const w = K.clamp(ps.bx + ps.bw - hx, 0, ps.bw); if (w > 0.5) g.drawImage(c, c.width - w * RES, 0, w * RES, c.height, ps.bx + ps.bw - w, ps.by, w, ps.bh); }
      }
    };
    const tornEdge = (g: CanvasRenderingContext2D, x: number, y0: number, y1: number, side: number) => {
      const n = Math.ceil((y1 - y0) / 7);
      for (let i = 0; i <= n; i++) {
        const yy = side > 0 ? y0 + ((y1 - y0) * i) / n : y1 - ((y1 - y0) * i) / n;
        g.lineTo(x + (K.rand(7, i) - 0.5) * 5 + side * 1.5, yy);
      }
    };
    type Part = "all" | "main" | "stub";
    const cardPath = (g: CanvasRenderingContext2D, part: Part) => {
      const r = 14;
      g.beginPath();
      if (part === "all") { g.roundRect(0, 0, cardW, cardH, r); return; }
      const leftPart = (form === "charter") === (part === "stub");
      if (leftPart) {
        g.moveTo(r, 0); g.lineTo(perfX, 0);
        tornEdge(g, perfX, 0, cardH, 1);
        g.lineTo(r, cardH); g.arcTo(0, cardH, 0, cardH - r, r); g.lineTo(0, r); g.arcTo(0, 0, r, 0, r);
      } else {
        g.moveTo(perfX, 0); g.lineTo(cardW - r, 0); g.arcTo(cardW, 0, cardW, r, r); g.lineTo(cardW, cardH - r); g.arcTo(cardW, cardH, cardW - r, cardH, r);
        g.lineTo(perfX, cardH);
        tornEdge(g, perfX, 0, cardH, -1);
      }
      g.closePath();
    };
    const drawCard = (g: CanvasRenderingContext2D, tt: number, part: Part) => {
      g.save();
      for (let k = 1; k <= 3; k++) { g.translate(4, 5); cardPath(g, part); g.fillStyle = "rgba(0,0,0,0.1)"; g.fill(); }
      g.restore();
      cardPath(g, part);
      g.save();
      g.clip();
      g.fillStyle = STY.stock; g.fillRect(0, 0, cardW, cardH);
      const mx0 = form === "charter" ? perfX : 0, mx1 = form === "charter" ? cardW : perfX;
      g.save(); g.beginPath(); g.rect(mx0, 0, mx1 - mx0, cardH); g.clip();
      g.drawImage(tint, 0, 0, cardW, cardH);
      g.restore();
      drawForm(g);
      const left = (form === "charter") === (part === "stub");
      drawInk(g, tt, part === "all" || left ? -1e9 : perfX, part === "all" || !left ? 1e9 : perfX);
      g.restore();
      if (part === "all") {
        // 절취선: 뚫린 구멍으로 프린터 바닥이 보인다
        g.fillStyle = STY.ground;
        for (let yy = 10; yy < cardH - 6; yy += 11) { g.beginPath(); g.arc(perfX, yy, 2.4, 0, Math.PI * 2); g.fill(); }
      }
    };
    const drawCarriage = (g: CanvasRenderingContext2D, tt: number, ly: number, hx: number) => {
      const X0 = -3000, X1 = cardW + 3000;
      g.fillStyle = "rgba(0,0,0,0.09)"; g.fillRect(X0, ly + 72, X1 - X0, 14);
      g.fillStyle = STY.rod; g.fillRect(X0, ly + 60, X1 - X0, 10);
      g.fillStyle = "rgba(255,255,255,0.4)"; g.fillRect(X0, ly + 61, X1 - X0, 1.5);
      g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(X0, ly + 68, X1 - X0, 2);
      g.strokeStyle = "#7b8288"; g.lineWidth = 13;
      g.beginPath(); g.moveTo(hx + 40, ly + 116); g.bezierCurveTo(hx + 40, ly + 210, hx + 300, ly + 214, cardW + 2600, ly + 170); g.stroke();
      g.strokeStyle = "rgba(0,0,0,0.22)"; g.lineWidth = 2; g.stroke();
      const y = ly + (striking(tt) ? K.noise(tt * 55, 3) * 0.7 : 0);
      g.fillStyle = "rgba(0,0,0,0.22)"; rr(g, hx - 58, y + 36, 140, 86, 9); g.fill();
      g.fillStyle = STY.carriage; rr(g, hx - 70, y + 22, 140, 86, 9); g.fill();
      g.fillStyle = "rgba(255,255,255,0.07)"; rr(g, hx - 61, y + 40, 122, 56, 5); g.fill();
      g.fillStyle = "rgba(0,0,0,0.35)"; for (let k = 0; k < 4; k++) g.fillRect(hx - 40 + k * 22, y + 62, 14, 3);
      g.fillStyle = "#5a5f66"; for (const s of [-58, 58]) { g.beginPath(); g.arc(hx + s, y + 100, 3.2, 0, Math.PI * 2); g.fill(); }
      // 리본이 캐리지 앞머리를 가로질러 헤드 밑을 지난다
      g.fillStyle = "#0b0c0e"; g.fillRect(hx - 66, y + 22, 132, 8);
      g.fillStyle = "#a6acb2"; rr(g, hx - 16, y - 3, 32, 30, 3); g.fill();
      g.fillStyle = "rgba(0,0,0,0.33)"; for (let k = -11; k <= 11; k += 5.5) g.fillRect(hx + k - 1, y + 5, 2, 16);
      g.fillStyle = "#e4e7e9"; g.fillRect(hx - 16, y - 3, 32, 3);
    };

    return {
      duration,
      starts,
      render(g, tt) {
        g.fillStyle = STY.ground; g.fillRect(0, 0, K.W, K.H);
        const c = camAt(tt);
        const ly = railAt(tt), hx = headAt(tt);
        g.save();
        g.translate(800, 450);
        g.rotate((STY.tilt * Math.PI) / 180);
        g.scale(c.z, c.z);
        g.translate(-c.x, -c.y);
        const sk = striking(tt) ? K.noise(tt * 47, 9) * 0.35 : 0;
        if (tt < TEAR) {
          // 준비: 찢기 직전, 직원이 쥔 손에 절취선이 살짝 꺾인다
          const bend = K.ease.outCubic(K.seg(tt, TEAR - 0.45, 0.45)) * (form === "charter" ? 1 : -1);
          g.save(); g.translate(0, sk);
          if (bend) { g.translate(perfX, cardH / 2); g.rotate(bend * 0.006); g.translate(-perfX, -cardH / 2); }
          drawCard(g, tt, "all"); g.restore();
        } else {
          const k = tt - TEAR;
          const dir = form === "charter" ? 1 : -1;
          // 찢기: 절취선에서 짧게 당기고, 본권이 미끄러져 나간다
          const tug = K.clamp(k / 0.16);
          const go = K.ease.bezier(0.55, 0, 0.2, 1)(K.seg(k, 0.14, 1.1));
          g.save();
          g.translate(dir * (6 * Math.sin(tug * Math.PI) + go * (MW + 900)), go * 40);
          g.translate(perfX, cardH / 2); g.rotate(dir * go * 0.08); g.translate(-perfX, -cardH / 2);
          drawCard(g, tt, "main");
          g.restore();
          const settle = K.ease.spring(Math.max(0, k - 0.05), 0.7, 0.2);
          g.save();
          g.translate(stubX + SW / 2, cardH / 2); g.rotate(-dir * 0.012 * settle); g.translate(-stubX - SW / 2, -cardH / 2);
          drawCard(g, tt, "stub");
          const hp = K.seg(tt, HAND, 2.5);
          if (hp > 0 && endJob && endJob.handoffY) K.handoff(g, hp, { ink: "rgb(" + INK.join(",") + ")", family: SANS, size: 24, x: stubX, y: endJob.handoffY, handle: work.handle });
          g.restore();
        }
        if (ly < cardH + 330) drawCarriage(g, tt, ly, hx);
        g.restore();
        K.grain(g, tt, 0.045, seed, 12, "overlay");
      },
    };
  },
};
