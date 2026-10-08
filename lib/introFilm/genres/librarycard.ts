// 도서관 카드 — 작품을 도서관 책 한 권의 서류로(필름 실험실 2라운드, 2026-10-08).
// 세계의 규칙: 사서가 하지 않을 움직임은 없다. 카드는 손으로 놓인다(빨리 와서 길게 내려앉고, 살짝 돈 각도가 풀린다),
// 글은 타자로 친다(Cutive Mono, 한 글자씩 고르지 않은 박자, 두 색 리본: 명령은 빨강), 메모는 손글씨(펜이 지나가며 24fps),
// 장면마다 고무 날짜 도장이 쿵 찍힌다(카드가 튀고 잉크는 고르지 않다).
// 장면의 자리: 갈고리 = 목록 카드(청구기호는 작품 id에서, 주제어는 흐름의 마디, 갈고리 값은 번호 도장, 한 줄은 연필 메모) ·
// 이야기 = 독자 쪽지 · 흐름 = 회람표(차례로 체크) · 터미널 = 타자 친 서가 목록 카드(명령은 빨간 리본) · 항목 = 대출 카드 ·
// 경고 = 빨간 상자 도장이 찍힌 알림 · 수치 = 대출 기록 · 끝 = 책 뒤표지: 반납일 쪽지에 영상의 모든 도장, 카드가 주머니로 돌아간다.
// 예시 자료 = 견본 고무도장(서평용 책에 찍듯).
// 그리는 비용: 내려앉은 카드 더미는 장면이 바뀔 때 한 번 오프스크린 한 장에 굽고, 매 프레임엔 지금 카드만 그린다.
import type { FlatScene, Genre, GenreWork } from "./types";
import * as K from "./kit";

type Mk = (w: number, h: number) => HTMLCanvasElement;
type Rect = { x: number; y: number; w: number; h: number };
type Style = "cascade" | "stack" | "fan";
type Sc<K2 extends FlatScene["kind"]> = Extract<FlatScene, { kind: K2 }>;

const LABEL = {
  en: { routing: "ROUTING SLIP", routeOrder: "Please route in the order below", note: "Note: ", shelf: "SHELF LIST", author: "AUTHOR", title: "TITLE", dateDue: "DATE DUE", issued: "ISSUED TO", noteCol: "NOTE", notice: "NOTICE", item: "Item", noteRow: "Note", circ: "CIRCULATION RECORD", source: "Source: ", sample: "SAMPLE COPY", bookCard: "BOOK CARD", property: "PROPERTY OF", keep: "Please keep this card in the pocket", by: (h: string) => " / by " + h + ".", film: (n: number) => "1 film (" + n + " scenes).", tracingTitle: "I. Title." },
  ko: { routing: "회람표", routeOrder: "아래 순서대로 돌려 주세요", note: "메모: ", shelf: "서가 목록", author: "저자", title: "서명", dateDue: "반납 예정일", issued: "대출자", noteCol: "비고", notice: "알림", item: "자료", noteRow: "비고", circ: "대출 기록", source: "출처: ", sample: "견본", bookCard: "대출 카드", property: "소장처", keep: "이 카드는 주머니에 꽂아 두세요", by: (h: string) => " / " + h + " 지음.", film: (n: number) => "영상 1편(" + n + "장면).", tracingTitle: "I. 서명." },
};

const isWide = (c: string) => {
  const n = c.codePointAt(0) || 0;
  return (n >= 0x1100 && n <= 0x115f) || (n >= 0x2e80 && n <= 0xa4cf) || (n >= 0xac00 && n <= 0xd7a3) || (n >= 0xf900 && n <= 0xfaff) || (n >= 0xff00 && n <= 0xff60) || (n >= 0xffe0 && n <= 0xffe6) || n >= 0x1f300;
};
const readLen = (s: string) => Array.from(s).reduce((a, c) => a + (isWide(c) ? 1.7 : 1), 0);
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const SLIDE = K.ease.bezier(0.22, 0.9, 0.18, 1); // 손이 카드를 놓듯: 빨리 와서 길게 내려앉는다
const CAM = K.ease.bezier(0.3, 0, 0.12, 1);
const WIDE_ADV = 1.65; // 타자기 한 칸에 한글은 1.65칸

/** 제목 "이름 · 한 줄 소개" → 이름과 소개. */
function splitTitle(t: string): { name: string; pitch: string } {
  for (const sep of [" · ", " — ", " | "]) { const i = t.indexOf(sep); if (i > 0) return { name: t.slice(0, i).trim(), pitch: t.slice(i + sep.length).trim() }; }
  return { name: t.trim(), pitch: "" };
}
/** 작품 모양으로 책상 위 카드 놓임을 고른다 — 명령 출력이 있으면 비스듬히 줄지어, 갈고리 없이 시작하면 한자리에 쌓아, 아니면 펼쳐 놓는다. */
function pickStyle(work: GenreWork): Style {
  const kinds = work.scenes.map((s) => s.kind);
  if (kinds.includes("terminal")) return "cascade";
  if (!kinds.includes("hook")) return "stack";
  return "fan";
}

type Img = { c: HTMLCanvasElement; w: number; h: number };
type Ch = { ch: string; x: number; y: number; t: number; dy: number; a: number };
type Stat =
  | { k: "print"; s: string; x: number; y: number; size: number; w: number; col: string; align: CanvasTextAlign }
  | { k: "rule"; x0: number; y0: number; x1: number; y1: number; col: string; lw: number }
  | { k: "box"; x: number; y: number; w: number; h: number; col: string; lw: number }
  | { k: "fill"; x: number; y: number; w: number; h: number; col: string; pocket?: boolean };
type Dyn =
  | { k: "type"; chars: Ch[]; size: number; col: string; t0: number; t1: number }
  | { k: "hand"; segs: { s: string; x: number; y: number; w: number; t0: number; t1: number; rot: number }[]; size: number; col: string; w: number; t0: number; t1: number }
  | { k: "stamp"; img: Img; x: number; y: number; rot: number; sc: number; t0: number; t1: number }
  | { k: "tick"; x: number; y: number; size: number; t0: number; t1: number }
  | { k: "uline"; x0: number; x1: number; y: number; t0: number; t1: number; sd: number };
type Card = {
  w: number; h: number; stock: string; stat: Stat[]; dyn: Dyn[]; hole: boolean; torn: boolean; lines: number | null; kind: string;
  focus?: Rect; pos: { x: number; y: number; rot: number }; from: { dx: number; dy: number; rot: number }; arrive: number;
  pre?: HTMLCanvasElement; full?: HTMLCanvasElement | null; live: Dyn[]; done: number;
  bookCard?: { x: number; y: number; w: number; h: number; t0: number; d: number; drop: number };
};
type Shot = { c: Card; t0: number; wide?: boolean; to: { x: number; y: number; z: number }; from: { x: number; y: number; z: number }; d: number };

export const librarycard: Genre = {
  id: "librarycard",
  name: "Library card",
  ko: "도서관 카드",
  koIdea: "작품을 도서관 책 한 권의 서류로 — 목록 카드가 타자로 찍히고, 장면마다 반납일 도장이 쿵 찍히고, 끝에 카드가 책 주머니로 돌아가는 영화",
  enIdea: "The work as one library book's paperwork — a typed catalogue card, a date-due stamp for every scene, and the card going back in the pocket",
  family: "B",
  fonts: ["cutiveMono", "kalam", "oswald"],
  make(work, { seed, fonts }) {
    const TYPE = fonts.cutiveMono, HAND = fonts.kalam, PRINT = fonts.oswald;
    const L_ = LABEL[work.locale];
    const KO = work.locale === "ko";
    const HS = KO ? 1.12 : 1; // 한글 손글씨 글꼴은 같은 크기에서 작아 보인다
    const mk: Mk = (w, h) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
    const R = K.rng(seed);
    const style = pickStyle(work);
    const S = work.scenes;
    const acc = work.accent;
    const mx = mk(8, 8).getContext("2d")!;
    const { name, pitch } = splitTitle(work.title);
    const dateAt = (n: number) => {
      let m = 9, d = 8 + n, y = 2026;
      while (d > MDAYS[m]) { d -= MDAYS[m]; m++; if (m > 11) { m = 0; y++; } }
      return KO ? `${y}.${String(m + 1).padStart(2, "0")}.${String(d).padStart(2, "0")}` : MON[m] + " " + String(d).padStart(2, "0") + " " + y;
    };

    // ---------- 색 ----------
    const C = {
      cascade: { ground: "#2d473c", stock: "#f2f3ef", tint2: "#e4ece6", rule: "#c64a3d", blue: "#8aa6cf", type: "#222328", ribbon: "#b2281f", stamp: "#4b3a8c", hand: "#4c4e55", handW: 400, alarm: "#c0302a", print: "#3c3f45", board: "#20362c", pocketP: "#e9ece7" },
      stack: { ground: K.mix(acc || "#ff9f0a", "#000000", 0.12), stock: "#eaeff3", tint2: "#f2f3f1", rule: "#d05b2a", blue: "#7f9fc4", type: "#1f2126", ribbon: "#c0261c", stamp: "#23272f", hand: "#2340a0", handW: 400, alarm: "#d8352b", print: "#2f3339", board: K.mix(acc || "#ff9f0a", "#000000", 0.32), pocketP: "#f1f2ef" },
      fan: { ground: "#56626b", stock: "#f4f5f3", tint2: "#eef1f3", rule: "#d0443f", blue: "#93a9c2", type: "#1d1f23", ribbon: "#b8261e", stamp: K.mix(acc || "#f18600", "#000000", 0.05), hand: "#1b1d22", handW: 700, alarm: work.alarm || "#e23a4a", print: "#33373c", board: "#2c3338", pocketP: "#f2f3f1" },
    }[style];

    // ---------- 종이·도장 미리 그리기 ----------
    const RS = 1.4; // 카드 캐시 해상도(카메라는 1.42배까지)
    const fibre = mk(256, 256);
    { const x = fibre.getContext("2d")!, r = K.rng(seed + 3); for (let i = 0; i < 1400; i++) { x.fillStyle = `rgba(60,50,40,${0.015 + r() * 0.035})`; x.fillRect(r() * 256, r() * 256, 1 + r() * 3, 0.8); } }
    const groundTile = mk(512, 512);
    {
      const x = groundTile.getContext("2d")!, r = K.rng(seed + 9);
      x.fillStyle = C.ground; x.fillRect(0, 0, 512, 512);
      if (style === "stack") { // 책 천(버크럼) 결
        for (let i = 0; i < 512; i += 3) { x.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.05})`; x.fillRect(0, i, 512, 1); x.fillStyle = `rgba(255,255,255,${0.02 + r() * 0.03})`; x.fillRect(i, 0, 1, 512); }
      } else if (style === "cascade") { // 리놀륨 얼룩
        for (let i = 0; i < 2600; i++) { x.fillStyle = `rgba(${r() < 0.5 ? "255,255,255" : "0,0,0"},${0.02 + r() * 0.04})`; const s = 2 + r() * 9; x.beginPath(); x.ellipse(r() * 512, r() * 512, s, s * (0.4 + r() * 0.6), r() * 3, 0, Math.PI * 2); x.fill(); }
      } else { // 쇠 책상, 헤어라인
        for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(255,255,255,${0.015 + r() * 0.03})`; x.fillRect(r() * 512, r() * 512, 40 + r() * 160, 1); }
      }
    }
    const inkify = (c: HTMLCanvasElement, sd: number, strength = 0.5) => {
      const x = c.getContext("2d", { willReadFrequently: true })!, im = x.getImageData(0, 0, c.width, c.height), d = im.data, r = K.rng(sd);
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        const px = (i / 4) % c.width, py = Math.floor(i / 4 / c.width);
        const n = K.noise(px * 0.018 + py * 0.011, sd) * 0.45 + K.noise(py * 0.04 - px * 0.006, sd + 1) * 0.3;
        d[i + 3] = d[i + 3] * K.clamp(0.72 + n * strength + (r() - 0.5) * 0.5);
      }
      x.putImageData(im, 0, 0);
    };
    const stampCache = new Map<string, Img>();
    // 고무도장: 줄 [{s,size,w}], 테두리 none|box|double → 카드 단위 {c,w,h}
    const stampImg = (key: string, lines: { s: string; size: number; w?: number }[], border: "none" | "box" | "double", ink: string): Img => {
      const k = key + ink;
      const hit = stampCache.get(k);
      if (hit) return hit;
      const sc = 2;
      let w = 0, h = 0;
      lines.forEach((l) => { mx.font = K.font(l.size, PRINT, l.w || 600); w = Math.max(w, mx.measureText(l.s).width); h += l.size * 1.02; });
      const padX = border === "none" ? 6 : 22, padY = border === "none" ? 4 : 14;
      const Wd = w + padX * 2, Ht = h + padY * 2;
      const c = mk(Wd * sc, Ht * sc), x = c.getContext("2d")!;
      x.scale(sc, sc);
      x.strokeStyle = x.fillStyle = ink;
      if (border !== "none") { x.lineWidth = 4; x.beginPath(); x.roundRect(3, 3, Wd - 6, Ht - 6, 6); x.stroke(); }
      if (border === "double") { x.lineWidth = 1.6; x.beginPath(); x.roundRect(9, 9, Wd - 18, Ht - 18, 3); x.stroke(); }
      let y = padY;
      x.textAlign = "center";
      lines.forEach((l) => { y += l.size * 0.86; x.font = K.font(l.size, PRINT, l.w || 600); x.fillText(l.s, Wd / 2, y); y += l.size * 0.16; });
      inkify(c, K.hash(k) % 9999, 0.9);
      const out = { c, w: Wd, h: Ht };
      stampCache.set(k, out);
      return out;
    };

    // ---------- 타자기 ----------
    const tSize = 29;
    mx.font = K.font(tSize, TYPE, 400);
    const ADV = mx.measureText("M").width;
    const colLen = (s: string) => Array.from(s).reduce((a, c) => a + (isWide(c) ? WIDE_ADV : 1), 0);
    const colsOf = (w: number, size = tSize) => Math.floor(w / ((ADV * size) / tSize));
    /** 칸 단위 줄바꿈 — 한글은 1.65칸, 띄어쓰기로 끊고 낱말이 줄보다 길면 글자로 끊는다. */
    const wrapCols = (text: string, cols: number) => {
      const out: string[] = [];
      let cur = "";
      for (let w of String(text).split(/\s+/)) {
        if (!w) continue;
        const nx = cur ? cur + " " + w : w;
        if (colLen(nx) <= cols) { cur = nx; continue; }
        if (cur) { out.push(cur); cur = ""; }
        while (colLen(w) > cols) {
          const ch = Array.from(w);
          let k = ch.length - 1;
          while (k > 1 && colLen(ch.slice(0, k).join("")) > cols) k--;
          out.push(ch.slice(0, k).join(""));
          w = ch.slice(k).join("");
        }
        cur = w;
      }
      if (cur) out.push(cur);
      return out;
    };
    /** 손글씨·인쇄 글꼴 줄바꿈(글자 단위 대비). */
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

    // ---------- 카드 ----------
    const cards: Card[] = [];
    const thunks: { t: number; c: Card }[] = [];
    let T = 0;
    const newCard = (w: number, h: number, o: { stock?: string; hole?: boolean; torn?: boolean; lines?: number; kind?: string } = {}): Card => {
      const c: Card = { w, h, stock: o.stock || C.stock, stat: [], dyn: [], hole: !!o.hole, torn: !!o.torn, lines: o.lines || null, kind: o.kind || "card", pos: { x: 0, y: 0, rot: 0 }, from: { dx: 0, dy: 0, rot: 0 }, arrive: 0, live: [], done: 0 };
      cards.push(c);
      return c;
    };
    const P = (c: Card, s: string, x: number, y: number, size = 22, o: { w?: number; col?: string; align?: CanvasTextAlign } = {}) => c.stat.push({ k: "print", s, x, y, size, w: o.w || 500, col: o.col || C.print, align: o.align || "left" });
    const RL = (c: Card, x0: number, y0: number, x1: number, y1: number, col: string, lw = 1.5) => c.stat.push({ k: "rule", x0, y0, x1, y1, col, lw });
    const BOX = (c: Card, x: number, y: number, w: number, h: number, col: string, lw = 1.5) => c.stat.push({ k: "box", x, y, w, h, col, lw });
    // 타자: 끝 시각을 돌려준다(t0가 과거면 이미 쳐져 있다)
    const TY = (c: Card, text: string, x: number, y: number, t0: number, o: { size?: number; cols?: number; nowrap?: boolean; cps?: number; col?: string; lh?: number } = {}) => {
      const size = o.size || tSize, adv = (ADV * size) / tSize;
      const lines = o.nowrap ? [text] : wrapCols(text, o.cols || colsOf(c.w - x - 40, size));
      const chars: Ch[] = [];
      let t = t0;
      const cps = (o.cps || 42) * (KO ? 0.7 : 1);
      lines.forEach((ln, li) => {
        const cs = Array.from(ln);
        let cx = x;
        cs.forEach((ch, i) => {
          const wide = isWide(ch);
          chars.push({ ch, x: cx + (wide ? adv * 0.06 : 0), y: y + li * size * (o.lh || 1.32), t, dy: (R() - 0.5) * 1.6, a: 0.78 + R() * 0.22 });
          cx += wide ? adv * WIDE_ADV : adv;
          t += (1 / cps) * (0.55 + R() * 0.9) + (ch === " " ? 0.01 : 0) + (/[.,:;?]/.test(ch) && (cs[i + 1] === " " || i === cs.length - 1) ? 0.06 : 0);
        });
        t += 0.1; // 줄 바꾸기
      });
      c.dyn.push({ k: "type", chars, size, col: o.col || C.type, t0, t1: t });
      return { t1: t, lines: lines.length, h: lines.length * size * (o.lh || 1.32) };
    };
    // 손글씨: 펜이 지나가며 드러난다(24fps로 끊는다)
    const HW = (c: Card, text: string, x: number, y: number, t0: number, o: { size?: number; w?: number; maxW?: number; cps?: number; lh?: number; col?: string } = {}) => {
      const size = (o.size || 34) * HS, wt = o.w || C.handW;
      const lines = wrapW(text, K.font(size, HAND, wt), o.maxW || c.w - x - 36);
      mx.font = K.font(size, HAND, wt);
      let t = t0;
      const segs = lines.map((ln, li) => { const w = mx.measureText(ln).width; const d = readLen(ln) / (o.cps || 30); const s = { s: ln, x, y: y + li * (o.lh || size * 1.16), w, t0: t, t1: t + d, rot: (R() - 0.5) * 0.02 }; t += d + 0.12; return s; });
      c.dyn.push({ k: "hand", segs, size, col: o.col || C.hand, w: wt, t0, t1: t });
      return { t1: t, h: lines.length * (o.lh || size * 1.16), lines: lines.length };
    };
    const ST = (c: Card, img: Img, x: number, y: number, t0: number, rot = 0, sc = 1) => { c.dyn.push({ k: "stamp", img, x, y, rot, sc, t0, t1: t0 + 0.1 }); thunks.push({ t: t0, c }); return t0 + 0.12; };
    const TICK = (c: Card, x: number, y: number, t0: number, size = 30) => { c.dyn.push({ k: "tick", x, y, size, t0, t1: t0 + 0.28 }); return t0 + 0.3; };
    const ULINE = (c: Card, x0: number, x1: number, y: number, t0: number) => { c.dyn.push({ k: "uline", x0, x1, y, t0, t1: t0 + 0.4, sd: R() * 100 }); return t0 + 0.42; };
    const dateStamp = (days: number, ink: string = C.stamp, size = 24) => stampImg("d" + days + "|" + size, [{ s: dateAt(days), size, w: 600 }], "none", ink);
    const sampleStamp = (ink: string = C.stamp) => stampImg("sample", [{ s: L_.sample, size: KO ? 34 : 30, w: 600 }], "box", ink);
    const isSample = (s: FlatScene) => s.data === "sample";
    // 주제어: 흐름의 마디(없으면 항목·수치 이름) — 목록 카드 아래 추적 표목
    const flow0 = S.find((s): s is Sc<"flow"> => s.kind === "flow");
    const items0 = S.find((s): s is Sc<"items"> => s.kind === "items");
    const stats0 = S.find((s): s is Sc<"stats"> => s.kind === "stats");
    const subjects = (flow0 ? flow0.nodes : items0 ? items0.items.map((i) => i.label) : stats0 ? stats0.stats.map((x) => x.label) : []).slice(0, 3);
    // 청구기호: 놓임 방식에 따른 분류 번호 + 작품 id에서 저자 기호
    const h = K.hash(work.id);
    const cls = { cascade: "005.3", stack: "004.16", fan: "621.39" }[style];
    const latin = name.replace(/[^a-z]/gi, "");
    const callNo = [cls + String(h % 10), (Array.from(name)[0] || "X").toUpperCase() + (100 + (h % 899)) + (latin[1] ? latin[1].toLowerCase() : "")];

    // ---------- 장면 → 카드 ----------
    const ARR = 0.9;
    let dayN = 0;
    const sceneDates: number[] = [];
    const addDate = () => { const d = dayN; sceneDates.push(d); dayN += 6 + Math.floor(R() * 10); return d; };
    const unitOf = (st: { value: string; unit: string }) => st.value + (st.unit === "%" ? "%" : st.unit ? (st.unit[0] === "/" || isWide(st.unit[0]) ? st.unit : " " + st.unit) : "");
    const build = (s: FlatScene, t: number, first: boolean, fi: number): number => {
      switch (s.kind) {
        case "hook": {
          const c = newCard(1000, 600, { hole: true, kind: "catalogue" });
          RL(c, 0, 92, 1000, 92, C.rule, 2); RL(c, 150, 0, 150, 600, C.rule, 1.4); RL(c, 182, 92, 182, 600, C.blue, 1);
          const pre = first ? -9 : t;
          TY(c, callNo[0], 30, 140, pre, { nowrap: true, size: 27 }); TY(c, callNo[1], 30, 176, pre, { nowrap: true, size: 27 });
          TY(c, work.handle + ".", 160, 72, pre, { nowrap: true });
          const tl = TY(c, name + (pitch ? " : " + pitch : "") + L_.by(work.handle), 196, 140, pre, { cols: 42 });
          TY(c, L_.film(S.length), 196, 140 + tl.h + 4, pre, { nowrap: true });
          const y = 140 + tl.h + 4 + 62;
          const lab = TY(c, s.label + " :", 196, y, first ? 0.05 : t, { cps: 30, cols: 40 });
          const v = stampImg("hook" + s.value, [{ s: s.value, size: 104, w: 600 }], "none", s.alarm ? C.alarm : C.stamp);
          const tt = ST(c, v, 186, y + 12 + (lab.lines - 1) * 38, lab.t1 + 0.25, -0.03 + (R() - 0.5) * 0.03);
          const d = addDate();
          const hw = HW(c, s.line, 196 + v.w + 40, y + 64 + (lab.lines - 1) * 38, tt + 0.15, { size: 34, maxW: 760 - v.w - 40 - 30 });
          ST(c, dateStamp(d, C.stamp, 22), 790, 556, hw.t1 + 0.1, -0.04);
          // 추적 표목은 두 줄 안에: 넘치면 주제어를 줄인다
          let tr: string[] = [];
          for (let n = subjects.length; n >= 0; n--) { tr = wrapCols(subjects.slice(0, n).map((g, i) => i + 1 + ". " + g + ".").concat(L_.tracingTitle).join(" "), colsOf(560, 24)); if (tr.length <= 2) break; }
          tr.slice(0, 2).forEach((ln, i) => TY(c, ln, 196, 540 - (Math.min(2, tr.length) - 1 - i) * 30, pre, { nowrap: true, size: 24 }));
          if (isSample(s)) ST(c, sampleStamp(), 770, 22, hw.t1 + 0.15, 0.06);
          return Math.max(hw.t1 + (isSample(s) ? 0.4 : 0.3), t + 2.5);
        }
        case "story": {
          const l1 = wrapW(s.line, K.font(40 * HS, HAND, 700), 660), l2 = wrapW(s.line2, K.font(34 * HS, HAND, C.handW), 660);
          const c = newCard(780, 120 + (l1.length + l2.length) * 50 + 70, { torn: true, lines: 50, stock: "#f6f7f5", kind: "slip" });
          RL(c, 64, 0, 64, c.h, C.rule, 1.2);
          const a = HW(c, s.line, 84, 92, first ? -9 : t + 0.05, { size: 40, cps: 26, w: 700, lh: 50, maxW: 660 });
          const b = HW(c, s.line2, 84, 92 + a.lines * 50, first ? 0.1 : a.t1 + 0.15, { size: 34, cps: 26, lh: 50, maxW: 660 });
          const d = addDate();
          ST(c, dateStamp(d, C.stamp, 22), 560, c.h - 44, b.t1 + 0.12, -0.05);
          return b.t1 + 0.65;
        }
        case "flow": {
          const c = newCard(620, 840, { stock: fi ? "#e6ecf4" : "#e3eee5", kind: "route" });
          P(c, L_.routing, 40, 86, 46, { w: 600 });
          P(c, L_.routeOrder, 40, 124, 22, { w: 500 });
          RL(c, 40, 142, 580, 142, C.print, 2);
          const n = s.nodes.length, top = 200, gap = Math.min(86, (560 - top + 60) / n);
          let tt = first ? 0.1 : t + 0.1;
          s.nodes.forEach((nd, i) => {
            const y = top + i * gap;
            BOX(c, 40, y - 30, 34, 34, C.print, 2);
            TY(c, wrapCols(nd, 26)[0] || "", 96, y, -9, { nowrap: true });
            RL(c, 96, y + 16, 580, y + 16, "rgba(0,0,0,0.18)", 1);
            tt = TICK(c, 42, y - 28, tt, 34) + 0.1 + Math.min(0.18, readLen(nd) / 90);
          });
          const ly = top + n * gap + 20;
          const tl = TY(c, L_.note + s.line, 40, ly, tt + 0.05, { cols: 30, cps: 52 });
          const d = addDate();
          ST(c, dateStamp(d, C.stamp, 24), 360, ly + tl.h + 20, tl.t1 + 0.1, 0.04);
          c.focus = { x: 0, y: 0, w: c.w, h: Math.min(c.h, ly + tl.h + 70) };
          return tl.t1 + 0.7;
        }
        case "terminal": {
          const nL = wrapCols(s.line, 44).length;
          const c = newCard(1000, 124 + 52 + s.output.length * tSize * 1.32 + 22 + nL * tSize * 1.32 + 70, { kind: "shelflist" });
          RL(c, 0, 70, 1000, 70, C.blue, 1.2); RL(c, 120, 0, 120, c.h, C.rule, 1.2);
          P(c, L_.shelf, 140, 50, 24, { w: 600 });
          let tt = t + 0.05;
          const cm = TY(c, "$ " + s.command, 140, 124, tt, { col: C.ribbon, cps: 34, nowrap: true });
          tt = cm.t1 + 0.12;
          let y = 124 + 52;
          let keyY: number | null = null;
          for (const o of s.output) {
            const m = o.match(/^(.*?):\s*(.*)$/);
            let ln = o;
            if (m) { const room = 44 - colLen(m[2]) - colLen(m[1]) - 1; ln = m[1] + " " + ".".repeat(Math.max(2, Math.floor(room))) + " " + m[2]; }
            const r_ = TY(c, ln, 140, y, tt, { cps: 125, nowrap: true });
            if (/survived|살아남/i.test(o)) keyY = y;
            tt = r_.t1 - 0.08;
            y += tSize * 1.32;
          }
          if (keyY !== null) tt = ULINE(c, 138, 140 + 44 * ADV, keyY + 9, tt + 0.1) + 0.1;
          const lt = TY(c, s.line, 140, y + 22, tt + 0.1, { cps: 50, cols: 44 });
          const d = addDate();
          ST(c, dateStamp(d, C.stamp, 24), 790, c.h - 40, lt.t1 + 0.08, -0.03);
          if (isSample(s)) ST(c, sampleStamp(), 720, 18, lt.t1 + 0.35, 0.05);
          return lt.t1 + 0.75;
        }
        case "items": {
          const c = newCard(640, 900, { kind: "bookcard" });
          P(c, L_.author, 30, 54, 18, { w: 500 }); P(c, L_.title, 30, 104, 18, { w: 500 });
          TY(c, work.handle, 120, 56, -9, { nowrap: true, size: 26 }); TY(c, wrapCols(name, 26)[0] || name, 120, 106, -9, { nowrap: true, size: 26 });
          RL(c, 20, 124, 620, 124, C.print, 2);
          P(c, L_.dateDue, 34, 156, 18, { w: 600 }); P(c, L_.issued, 222, 156, 18, { w: 600 }); P(c, L_.noteCol, 500, 156, 18, { w: 600 });
          RL(c, 20, 168, 620, 168, C.print, 1.5); RL(c, 210, 124, 210, 880, C.print, 1); RL(c, 488, 124, 488, 880, C.print, 1);
          const rh = 70;
          for (let yy = 168 + rh; yy < 880; yy += rh) RL(c, 20, yy, 620, yy, "rgba(0,0,0,0.2)", 1);
          let tt = t + 0.1;
          const d0 = addDate();
          s.items.slice(0, 9).forEach((it, i) => {
            const yy = 168 + i * rh + 48;
            const ink = it.alarm ? C.alarm : C.hand;
            ST(c, dateStamp(d0 + i, it.alarm ? C.alarm : C.stamp, 21), 32, yy - 30, tt, (R() - 0.5) * 0.05);
            const lab = wrapW(it.label, K.font(30 * HS, HAND, C.handW), 260)[0] || "";
            const a = HW(c, lab, 222, yy, tt + 0.08, { size: 30, cps: 48, col: ink, maxW: 2000 });
            const b = HW(c, it.value === "✓" ? "OK ✓" : it.value, 500, yy, a.t1 + 0.03, { size: 32, cps: 22, col: ink, w: 700, maxW: 2000 });
            tt = b.t1 + 0.04;
          });
          const ly = 168 + Math.min(9, s.items.length) * rh + 48;
          const l = HW(c, s.line, 222, ly, tt + 0.1, { size: 30, cps: 42, maxW: 380 });
          if (isSample(s)) ST(c, sampleStamp(), 330, ly + l.h - 6, l.t1 + 0.12, -0.06);
          c.focus = { x: 0, y: 20, w: c.w, h: ly + l.h + 40 };
          return l.t1 + 0.75;
        }
        case "alert": {
          const c = newCard(1000, 600, { stock: style === "stack" ? "#f6e3e0" : "#f3e4e6", kind: "notice" });
          P(c, L_.notice, 40, 78, 48, { w: 600 });
          P(c, L_.item, 40, 300, 22); P(c, L_.noteRow, 40, 420, 22);
          RL(c, 120, 304, 960, 304, "rgba(0,0,0,0.35)", 1.4); RL(c, 120, 424, 960, 424, "rgba(0,0,0,0.35)", 1.4); RL(c, 120, 504, 960, 504, "rgba(0,0,0,0.35)", 1.4);
          const big = stampImg("alert" + s.title, [{ s: KO ? s.title : s.title.toUpperCase(), size: 62, w: 600 }], "double", C.alarm);
          const tt = ST(c, big, 260, 120, t + 0.25, -0.035);
          const b = TY(c, wrapCols(s.body, 46)[0] || "", 130, 294, tt + 0.2, { cps: 44, nowrap: true });
          const l1 = HW(c, s.line, 130, 412, b.t1 + 0.12, { size: 36, cps: 32, maxW: 820 });
          const l2 = HW(c, s.line2 || "", 130, 492, l1.t1 + 0.06, { size: 36, cps: 32, maxW: 820 });
          const d = addDate();
          ST(c, dateStamp(d, C.stamp, 24), 720, 64, l2.t1 + 0.08, 0.03);
          if (isSample(s)) ST(c, sampleStamp(), 700, 520, l2.t1 + 0.3, -0.04);
          return l2.t1 + 0.75;
        }
        case "stats": {
          const c = newCard(960, 640, { kind: "circ" });
          P(c, L_.circ, 40, 70, 34, { w: 600 });
          TY(c, wrapCols(name, 22)[0] || name, 520, 68, -9, { nowrap: true, size: 25 });
          RL(c, 30, 90, 930, 90, C.print, 2.4);
          let tt = t + 0.1;
          const rowY = [180, 300, 380, 460];
          s.stats.slice(0, 4).forEach((st, i) => {
            const y = rowY[i];
            RL(c, 30, y + 22, 930, y + 22, "rgba(0,0,0,0.22)", 1);
            const a = TY(c, wrapCols(st.label, 28)[0] || "", 50, y, tt, { nowrap: true, cps: 52, size: i ? 29 : 32 });
            const b = HW(c, unitOf(st), 560, y + (i ? 2 : 14), a.t1 + 0.04, { size: i ? 40 : 76, cps: i ? 16 : 9, w: 700, maxW: 2000 });
            tt = b.t1 + (i ? 0.04 : 0.3);
          });
          RL(c, 30, 500, 930, 500, C.print, 2.4);
          const l = TY(c, s.line, 50, 548, tt + 0.05, { cps: 50, cols: 48 });
          if (s.source) TY(c, L_.source + s.source, 50, 604, -9, { nowrap: true, size: 22 });
          const d = addDate();
          ST(c, dateStamp(d, C.stamp, 24), 730, 600, l.t1 + 0.08, -0.04);
          if (isSample(s)) ST(c, sampleStamp(), 660, 112, l.t1 + 0.3, 0.05);
          return l.t1 + 0.75;
        }
        default:
          return t;
      }
    };

    // 책상 위 놓임(놓임 방식마다) — 더미가 영상의 기억이다
    const place = (i: number) => {
      if (style === "cascade") return { x: i * 300 + (R() - 0.5) * 40, y: i * 210 + (R() - 0.5) * 30, rot: (R() - 0.5) * 0.06 };
      if (style === "stack") return { x: (R() - 0.5) * 70, y: (R() - 0.5) * 50, rot: (i % 2 ? 0.05 : -0.04) + (R() - 0.5) * 0.03 };
      return { x: i * 520, y: (i % 2 ? 110 : -90) + (R() - 0.5) * 40, rot: (i % 2 ? 0.05 : -0.06) + (R() - 0.5) * 0.02 };
    };
    const dirs = { cascade: [[1, 0.6], [0.7, 1]], stack: [[1, -0.2], [-1, 0.25], [0.2, 1]], fan: [[0.4, 1], [0.3, -1]] }[style];

    const shotsRaw: { c: Card; t0: number; wide?: boolean }[] = [];
    const starts: number[] = S.map(() => 0);
    let flowN = 0, built = 0;
    S.forEach((s, si) => {
      if (s.kind === "ending") return;
      const first = built === 0;
      const tStart = first ? 0 : T + 0.55;
      const end = build(s, tStart, first, s.kind === "flow" ? flowN++ : 0);
      built++;
      const c = cards[cards.length - 1];
      c.pos = place(cards.length - 1);
      const dv = dirs[(cards.length - 1) % dirs.length];
      c.from = { dx: dv[0] * 1500, dy: dv[1] * 1000, rot: c.pos.rot + (dv[0] > 0 ? 0.12 : -0.12) };
      c.arrive = first ? -5 : T;
      starts[si] = first ? 0 : T;
      shotsRaw.push({ c, t0: first ? 0 : T });
      T = Math.max(end, tStart + 1.6);
    });

    // 끝: 책 뒤표지 — 반납일 쪽지에 모든 도장, 카드가 주머니로 돌아간다
    const ending = S.find((s): s is Sc<"ending"> => s.kind === "ending");
    const eName = ending?.name || name, eLine = ending?.line || pitch, eLine2 = ending?.line2 || "";
    const board = newCard(1120, 700, { stock: C.board, kind: "board" });
    board.stat.push({ k: "fill", x: 30, y: 30, w: 1060, h: 640, col: style === "stack" ? "#f1f0ea" : "#eef0ec" });
    board.stat.push({ k: "fill", x: 70, y: 60, w: 380, h: 580, col: "#f7f8f5" });
    P(board, L_.dateDue, 260, 108, 36, { w: 600, align: "center" });
    RL(board, 90, 124, 430, 124, C.print, 2);
    for (let y = 170; y < 630; y += 46) RL(board, 90, y, 430, y, "rgba(0,0,0,0.18)", 1);
    const pocket = { k: "fill" as const, x: 510, y: 420, w: 540, h: 250, col: C.pocketP, pocket: true };
    board.stat.push(pocket);
    const tB = T;
    S.forEach((s, si) => { if (s.kind === "ending") starts[si] = tB; });
    const nCards = cards.length - 1;
    board.pos = style === "cascade" ? { x: nCards * 300 - 140, y: (nCards - 1) * 210 + 160, rot: -0.02 } : style === "stack" ? { x: 30, y: 20, rot: 0.015 } : { x: (nCards - 1) * 520 + 80, y: 0, rot: 0.02 };
    board.from = { dx: 0, dy: 1400, rot: 0.05 };
    board.arrive = tB;
    sceneDates.slice(0, 10).forEach((d, i) => board.dyn.push({ k: "stamp", img: dateStamp(d, C.stamp, 26), x: 130 + (R() - 0.5) * 16, y: 132 + i * 46, rot: (R() - 0.5) * 0.06, sc: 1, t0: -9, t1: -9 }));
    const lastY = 132 + Math.min(10, sceneDates.length) * 46;
    // 대출 카드(이름 + 끝 두 줄)는 이미 쳐진 채 돌아와 주머니로 내려간다
    const bookTypes: Dyn[] = [];
    {
      const tmp = newCard(1, 1);
      cards.pop();
      const nameT = TY(tmp, eName, 572, 168, -9, { cols: 18, size: 40 });
      const l1 = TY(tmp, eLine, 572, 168 + nameT.h + 8, -9, { cols: 24, size: 28 });
      TY(tmp, eLine2, 572, 168 + nameT.h + 8 + l1.h + 2, -9, { cols: 24, size: 28 });
      bookTypes.push(...tmp.dyn);
    }
    const stampT = tB + ARR + 0.35;
    ST(board, dateStamp(dayN, C.stamp, 26), 130, lastY, stampT, 0.03);
    const sinkT = stampT + 0.45;
    board.bookCard = { x: 550, y: 90, w: 460, h: 520, t0: sinkT, d: 0.9, drop: 58 };
    const handoffStart = sinkT + 0.5 + Math.max(0, readLen(eLine + eLine2) / 26 - 2.6);
    const duration = handoffStart + 2.4;
    shotsRaw.push({ c: board, t0: tB, wide: true });

    // ---------- 카드 미리 그리기(pre = 내려앉기 전에 끝난 것까지, full = 전부) ----------
    const drawPaper = (x: CanvasRenderingContext2D, c: Card) => {
      if (c.kind === "board") { x.fillStyle = c.stock; x.fillRect(0, 0, c.w, c.h); return; }
      x.fillStyle = c.stock;
      if (c.torn) {
        x.beginPath(); x.moveTo(0, 10);
        for (let xx = 0; xx <= c.w; xx += 14) x.lineTo(xx, 4 + K.rand(seed, xx, 3) * 10);
        x.lineTo(c.w, c.h); x.lineTo(0, c.h); x.closePath(); x.fill();
      } else { x.beginPath(); x.roundRect(0, 0, c.w, c.h, 10); x.fill(); }
      x.save(); x.globalCompositeOperation = "multiply"; const pat = x.createPattern(fibre, "repeat"); if (pat) { x.fillStyle = pat; x.fillRect(0, 0, c.w, c.h); } x.restore();
      if (c.lines) { x.fillStyle = C.blue; for (let y = 100; y < c.h - 10; y += c.lines) x.fillRect(0, y, c.w, 1.2); }
      if (c.hole) { x.fillStyle = "rgba(0,0,0,0.55)"; x.beginPath(); x.arc(c.w / 2, c.h - 30, 15, 0, Math.PI * 2); x.fill(); }
    };
    const drawStat = (x: CanvasRenderingContext2D, e: Stat) => {
      if (e.k === "print") { x.font = K.font(e.size, PRINT, e.w); x.fillStyle = e.col; x.textAlign = e.align; x.fillText(e.s, e.x, e.y); x.textAlign = "left"; }
      else if (e.k === "rule") { x.strokeStyle = e.col; x.lineWidth = e.lw; x.beginPath(); x.moveTo(e.x0, e.y0); x.lineTo(e.x1, e.y1); x.stroke(); }
      else if (e.k === "box") { x.strokeStyle = e.col; x.lineWidth = e.lw; x.strokeRect(e.x, e.y, e.w, e.h); }
      else {
        x.fillStyle = "rgba(0,0,0,0.18)"; x.fillRect(e.x + 4, e.y + 6, e.w, e.h);
        x.fillStyle = e.col; x.fillRect(e.x, e.y, e.w, e.h);
        x.save(); x.globalCompositeOperation = "multiply"; const pat = x.createPattern(fibre, "repeat"); if (pat) { x.fillStyle = pat; x.fillRect(e.x, e.y, e.w, e.h); } x.restore();
        if (e.pocket) {
          x.fillStyle = "rgba(0,0,0,0.12)"; x.beginPath(); x.moveTo(e.x, e.y); x.lineTo(e.x + e.w * 0.5, e.y + 46); x.lineTo(e.x + e.w, e.y); x.lineTo(e.x + e.w, e.y + 6); x.lineTo(e.x + e.w * 0.5, e.y + 52); x.lineTo(e.x, e.y + 6); x.fill();
          x.font = K.font(24, PRINT, 500); x.fillStyle = C.print; x.fillText(L_.property, e.x + 40, e.y + 118);
          x.fillRect(e.x + 40, e.y + 182, e.w - 80, 1.5);
          x.font = K.font(19, PRINT, 500); x.fillText(L_.keep, e.x + 40, e.y + 222);
        }
      }
    };
    const drawDyn = (x: CanvasRenderingContext2D, e: Dyn, t: number) => {
      if (t < e.t0) return;
      if (e.k === "type") {
        x.font = K.font(e.size, TYPE, 400); x.fillStyle = e.col;
        for (const ch of e.chars) {
          if (ch.t > t) break;
          x.globalAlpha = ch.a;
          x.fillText(ch.ch, ch.x, ch.y + ch.dy);
          x.fillText(ch.ch, ch.x + 0.7, ch.y + ch.dy); // 두 번 쳐진 리본의 무게
        }
        x.globalAlpha = 1;
      } else if (e.k === "hand") {
        x.font = K.font(e.size, HAND, e.w); x.fillStyle = e.col;
        for (const sg of e.segs) {
          if (t < sg.t0) break;
          const k = K.clamp((K.step(t, 24) - sg.t0) / (sg.t1 - sg.t0));
          if (k <= 0) continue;
          x.save();
          x.translate(sg.x, sg.y); x.rotate(sg.rot);
          if (k < 1) { x.beginPath(); x.rect(-4, -e.size * 1.1, sg.w * k + 4, e.size * 1.6); x.clip(); }
          x.fillText(sg.s, 0, 0);
          x.restore();
        }
      } else if (e.k === "stamp") {
        const k = K.clamp((t - e.t0) / 0.1);
        const sc = e.sc * (1 + (1 - K.ease.outQuart(k)) * 0.14);
        x.save();
        x.translate(e.x + e.img.w / 2, e.y + e.img.h / 2); x.rotate(e.rot); x.scale(sc, sc);
        x.globalAlpha = K.clamp(k * 2.5) * 0.92;
        x.globalCompositeOperation = "multiply";
        x.drawImage(e.img.c, -e.img.w / 2, -e.img.h / 2, e.img.w, e.img.h);
        x.restore();
      } else if (e.k === "tick") {
        const k = K.clamp((K.step(t, 24) - e.t0) / 0.28);
        const s = e.size;
        x.strokeStyle = C.hand; x.lineWidth = 4; x.lineCap = "round"; x.lineJoin = "round";
        x.beginPath(); x.moveTo(e.x + s * 0.12, e.y + s * 0.55);
        const p1 = [e.x + s * 0.42, e.y + s * 0.88], p2 = [e.x + s * 1.05, e.y - s * 0.15];
        if (k < 0.35) x.lineTo(K.lerp(e.x + s * 0.12, p1[0], k / 0.35), K.lerp(e.y + s * 0.55, p1[1], k / 0.35));
        else { x.lineTo(p1[0], p1[1]); const q = (k - 0.35) / 0.65; x.lineTo(K.lerp(p1[0], p2[0], q), K.lerp(p1[1], p2[1], q)); }
        x.stroke(); x.lineCap = "butt";
      } else {
        const k = K.clamp((K.step(t, 24) - e.t0) / 0.4);
        x.strokeStyle = C.hand; x.lineWidth = 3; x.globalAlpha = 0.85;
        x.beginPath();
        const n = 30;
        for (let i = 0; i <= n * k; i++) { const xx = K.lerp(e.x0, e.x1, i / n); x.lineTo(xx, e.y + K.noise(i * 0.4, e.sd) * 2.2 + (i / n) * 3); }
        x.stroke(); x.globalAlpha = 1;
      }
    };
    for (const c of cards) {
      const base = mk(c.w * RS, c.h * RS), bx = base.getContext("2d")!;
      bx.scale(RS, RS); drawPaper(bx, c); for (const e of c.stat) drawStat(bx, e);
      c.done = Math.max(c.arrive + ARR, ...c.dyn.map((e) => e.t1)) + 0.05;
      if (c.kind !== "board") {
        const full = mk(c.w * RS, c.h * RS), fx = full.getContext("2d")!;
        fx.drawImage(base, 0, 0); fx.scale(RS, RS);
        for (const e of c.dyn) drawDyn(fx, e, 1e9);
        c.full = full;
      } else { c.full = null; c.done = 1e9; }
      const px = base.getContext("2d")!;
      c.live = [];
      for (const e of c.dyn) { if (e.t1 < (c.arrive > 0 ? c.arrive : 0)) drawDyn(px, e, 1e9); else c.live.push(e); }
      c.pre = base;
    }
    // 끝 장면의 대출 카드와 주머니 앞판
    const bc = board.bookCard!;
    const bcCanvas = mk(bc.w * RS, bc.h * RS);
    {
      const x = bcCanvas.getContext("2d")!;
      x.scale(RS, RS);
      x.fillStyle = C.tint2; x.beginPath(); x.roundRect(0, 0, bc.w, bc.h, 8); x.fill();
      x.save(); x.globalCompositeOperation = "multiply"; const pat = x.createPattern(fibre, "repeat"); if (pat) { x.fillStyle = pat; x.fillRect(0, 0, bc.w, bc.h); } x.restore();
      x.fillStyle = C.rule; x.fillRect(0, 34, bc.w, 2);
      x.font = K.font(16, PRINT, 500); x.fillStyle = C.print; x.fillText(L_.bookCard, 16, 26);
      x.translate(-bc.x, -bc.y);
      for (const e of bookTypes) drawDyn(x, e, 1e9);
    }
    const pocketCanvas = mk(pocket.w * RS, pocket.h * RS);
    { const x = pocketCanvas.getContext("2d")!; x.scale(RS, RS); x.translate(-pocket.x, -pocket.y); drawStat(x, pocket); }

    // ---------- 카메라 ----------
    const fitOf = (c: Card) => {
      const f = c.focus || { x: 0, y: 0, w: c.w, h: c.h };
      const z = c.kind === "board" ? Math.min(1600 / (f.w + 90), 900 / (f.h + 70)) : Math.min(1.42, 1600 / (f.w + 240), 900 / (f.h + 130));
      const cx = f.x + f.w / 2 - c.w / 2, cy = f.y + f.h / 2 - c.h / 2, cr = Math.cos(c.pos.rot), sr = Math.sin(c.pos.rot);
      return { x: c.pos.x + c.w / 2 + cx * cr - cy * sr, y: c.pos.y + c.h / 2 + cx * sr + cy * cr, z };
    };
    const shots: Shot[] = [];
    shotsRaw.forEach((s, i) => { const to = fitOf(s.c); shots.push({ ...s, to, from: i ? shots[i - 1].to : to, d: ARR + 0.05 }); });
    const drift = (dt: number) => 1 + 0.024 * K.ease.outCubic(K.clamp(dt / 4.5));
    const shotAt = (t: number) => { let i = 0; for (let j = 0; j < shots.length; j++) if (t >= shots[j].t0) i = j; return i; };
    const camAt = (t: number) => {
      const i = shotAt(t), s = shots[i];
      if (t < s.t0 + s.d && i > 0) {
        const fromZ = s.from.z * drift(s.t0 - shots[i - 1].t0 - shots[i - 1].d);
        const k = CAM(K.seg(t, s.t0, s.d));
        return { x: K.lerp(s.from.x, s.to.x, k), y: K.lerp(s.from.y, s.to.y, k), z: Math.exp(K.lerp(Math.log(fromZ), Math.log(s.to.z), k)) };
      }
      const out = { ...s.to, z: s.to.z * drift(t - s.t0 - (i ? s.d : 0)) };
      if (s.wide) out.z *= 1 - 0.035 * K.ease.outCubic(K.seg(t, handoffStart - 0.6, 2.4));
      return out;
    };

    // ---------- 카드 자세 ----------
    const pose = (c: Card, t: number) => {
      const k = c.arrive < 0 ? 1 : SLIDE(K.seg(t, c.arrive, ARR));
      const rk = c.arrive < 0 ? 1 : K.ease.spring(t - c.arrive, 0.8, 0.22);
      let jolt = 0;
      for (const th of thunks) if (th.c === c && t >= th.t && t < th.t + 0.16) jolt += (1 - (t - th.t) / 0.16) * 2.2;
      return { x: c.pos.x + c.from.dx * (1 - k), y: c.pos.y + c.from.dy * (1 - k) + jolt, rot: K.lerp(c.from.rot, c.pos.rot, K.clamp(rk, 0, 1.2)) };
    };
    const drawBookCard = (g: CanvasRenderingContext2D, t: number) => {
      const k = K.ease.outCubic(K.seg(t, bc.t0, bc.d));
      g.save();
      g.translate(0, bc.drop * k);
      g.fillStyle = "rgba(0,0,0,0.2)"; g.fillRect(bc.x + 4, bc.y + 6, bc.w, bc.h);
      g.drawImage(bcCanvas, bc.x, bc.y, bc.w, bc.h);
      g.restore();
      g.drawImage(pocketCanvas, pocket.x, pocket.y, pocket.w, pocket.h);
      // 넘김 줄: 주머니의 "소장처" 줄에 타자로
      const hp = K.seg(t, handoffStart, 2.4);
      if (hp > 0) K.handoff(g, hp, { ink: C.type, family: TYPE, size: 28, x: pocket.x + 40, y: pocket.y + 172, handle: work.handle });
    };
    const drawCard = (g: CanvasRenderingContext2D, c: Card, t: number) => {
      if (t < c.arrive) return;
      const p = pose(c, t);
      g.save();
      g.translate(p.x + c.w / 2, p.y + c.h / 2); g.rotate(p.rot); g.translate(-c.w / 2, -c.h / 2);
      const lift = c.arrive < 0 ? 0 : 1 - K.seg(t, c.arrive + ARR * 0.5, ARR * 0.6);
      g.fillStyle = `rgba(0,0,0,${0.22 + lift * 0.1})`; g.fillRect(5 + lift * 18, 8 + lift * 24, c.w, c.h);
      if (t >= c.done && c.full) g.drawImage(c.full, 0, 0, c.w, c.h);
      else {
        g.drawImage(c.pre!, 0, 0, c.w, c.h);
        for (const e of c.live) drawDyn(g, e, t);
      }
      if (c.bookCard) drawBookCard(g, t);
      g.restore();
    };

    // ---------- 내려앉은 더미: 장면(샷)마다 한 장으로 굽는다 ----------
    // 샷 i 동안 카드 0..i-1은 움직이지 않는다(내용도 다 끝났다). 그 둘레(앞 샷과 이번 샷의 화면 + 여유)를 월드 좌표로 굽는다.
    const viewOf = (v: { x: number; y: number; z: number }, m = 1.14): Rect => { const w = (1600 / v.z) * m, hh = (900 / v.z) * m; return { x: v.x - w / 2, y: v.y - hh / 2, w, h: hh }; };
    const unionR = (a: Rect, b: Rect): Rect => { const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y); return { x: x0, y: y0, w: Math.max(a.x + a.w, b.x + b.w) - x0, h: Math.max(a.y + a.h, b.y + b.h) - y0 }; };
    const regions = shots.map((s, i) => {
      const r = i ? unionR(viewOf(s.to), viewOf(s.from)) : viewOf(s.to);
      const sc = Math.min(1.42, Math.max(s.to.z, i ? s.from.z : 0));
      return { r, sc };
    });
    const maxW = Math.max(...regions.map((q) => q.r.w * q.sc)), maxH = Math.max(...regions.map((q) => q.r.h * q.sc));
    const pile = mk(maxW, maxH);
    const pileX = pile.getContext("2d")!;
    // 지금 카드도 단계에 따라 굽는다: 0 = 움직이는 중(전부 그때그때) · 1 = 내려앉음(종이·인쇄만 굽고 글·도장은 그때그때) · 2 = 끝남(전부 굽는다)
    let pileFor = "";
    const settledAt = (c: Card) => (c.arrive < 0 ? -1e9 : c.arrive + 1.3);
    const restPose = (c: Card) => { const p = pose(c, 1e9); return { x: p.x, y: p.y, rot: p.rot }; };
    const bakePile = (i: number, mode: number) => {
      const { r, sc } = regions[i];
      pileX.setTransform(1, 0, 0, 1, 0, 0);
      pileX.clearRect(0, 0, pile.width, pile.height);
      pileX.setTransform(sc, 0, 0, sc, -r.x * sc, -r.y * sc);
      const pat = pileX.createPattern(groundTile, "repeat");
      if (pat) { pileX.fillStyle = pat; pileX.fillRect(r.x, r.y, r.w, r.h); }
      const tSettled = shots[i].t0 + 0.001;
      for (let j = 0; j < i; j++) drawCard(pileX, cards[j], Math.max(tSettled, cards[j].done));
      const c = cards[i];
      if (mode === 2) drawCard(pileX, c, Math.max(c.done, settledAt(c)));
      else if (mode === 1) {
        const p = restPose(c);
        pileX.save();
        pileX.translate(p.x + c.w / 2, p.y + c.h / 2); pileX.rotate(p.rot); pileX.translate(-c.w / 2, -c.h / 2);
        pileX.fillStyle = "rgba(0,0,0,0.22)"; pileX.fillRect(5, 8, c.w, c.h);
        pileX.drawImage(c.pre!, 0, 0, c.w, c.h);
        pileX.restore();
      }
      pileFor = i + ":" + mode;
    };

    return {
      duration,
      starts,
      render(g, t) {
        const cam = camAt(t);
        const i = shotAt(t);
        const c = cards[i];
        const mode = c.full && t >= c.done && t >= settledAt(c) ? 2 : t >= settledAt(c) ? 1 : 0;
        if (pileFor !== i + ":" + mode) bakePile(i, mode);
        let sh = 0;
        for (const th of thunks) if (t >= th.t && t < th.t + 0.12) sh += (1 - (t - th.t) / 0.12) * 1.6;
        g.fillStyle = C.ground; g.fillRect(0, 0, K.W, K.H);
        g.save();
        g.translate(K.W / 2, K.H / 2 + sh);
        g.scale(cam.z, cam.z);
        g.translate(-cam.x, -cam.y);
        const { r, sc } = regions[i];
        g.drawImage(pile, 0, 0, r.w * sc, r.h * sc, r.x, r.y, r.w, r.h);
        if (mode === 0) drawCard(g, c, t);
        else if (mode === 1) {
          const p = restPose(c);
          g.save();
          g.translate(p.x + c.w / 2, p.y + c.h / 2); g.rotate(p.rot); g.translate(-c.w / 2, -c.h / 2);
          for (const e of c.live) drawDyn(g, e, t);
          if (c.bookCard) drawBookCard(g, t);
          g.restore();
        }
        g.restore();
        K.grain(g, t, 0.045, seed, 12, "overlay");
      },
    };
  },
};
