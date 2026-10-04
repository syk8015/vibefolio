// 터미널 — 진짜 테마의 터미널 한 세션을 화면 가득(필름 실험실 G01, 2026-10-04).
// 세계의 규칙: 실제 테마(Solarized·Tomorrow·Gruvbox), 또렷한 칸, 상자 선은 요즘 터미널처럼 칸 위에 직접 그린다,
// 빛 번짐·주사선 없음. 움직임: 곡선 없음(모두 즉시)·60fps·장면 넘김은 Ctrl-L 지우기와 Cmd± 글자 확대 계단
// (터미널의 유일한 "카메라")·글자는 사람이 치거나(씨앗 박자·몰아치기·오타 하나와 지우기) 줄 단위 출력으로 온다.
// 한글은 터미널처럼 두 칸을 차지한다(칸 수는 모두 표시 폭으로 센다).
import type { FlatScene, Genre, GenreWork } from "./types";
import * as K from "./kit";

const W = 1600, H = 900;
type Theme = { bg: string; fg: string; dim: string; hi: string; red: string; green: string; yellow: string; blue: string; magenta: string; cyan: string; orange: string };
type ThemeName = "solarized" | "tomorrow" | "gruvbox";
const THEMES: Record<ThemeName, Theme> = {
  solarized: { bg: "#002b36", fg: "#93a1a1", dim: "#586e75", hi: "#eee8d5", red: "#dc322f", green: "#859900", yellow: "#b58900", blue: "#268bd2", magenta: "#d33682", cyan: "#2aa198", orange: "#cb4b16" },
  tomorrow: { bg: "#ffffff", fg: "#4d4d4c", dim: "#8e908c", hi: "#1d1f21", red: "#c82829", green: "#718c00", yellow: "#c99a00", blue: "#4271ae", magenta: "#8959a8", cyan: "#3e999f", orange: "#f5871f" },
  gruvbox: { bg: "#282828", fg: "#ebdbb2", dim: "#928374", hi: "#fbf1c7", red: "#fb4934", green: "#b8bb26", yellow: "#fabd2f", blue: "#83a598", magenta: "#d3869b", cyan: "#8ec07c", orange: "#fe8019" },
};
type Ink = keyof Theme;
const ANSI: Ink[] = ["red", "green", "yellow", "blue", "magenta", "cyan", "orange"];
const BOX = "─│┌┐└┘├┤┬┴┼╭╮╰╯█▏▎▍▌▋▊▉▶";
const LADDER = [1, 1.25, 1.5, 1.75, 2, 2.4, 3, 3.6, 4.4, 5.2];

// 정직 표시·출처 — 영상의 언어로.
const LABEL = {
  en: { sample: "   (sample)", notReal: "  sample data — not a real account", differ: "sample data — your numbers will differ", readings: "  (sample readings)", event: "(sample event)", source: "source: " },
  ko: { sample: "   (예시)", notReal: "  예시 자료 — 실제 계정 아님", differ: "예시 자료 — 실제 숫자는 다를 수 있음", readings: "  (예시 값)", event: "(예시 알림)", source: "출처: " },
};

// ---- 표시 폭(한글·한자·전각 = 두 칸) ----
const isWide = (c: string) => {
  const n = c.codePointAt(0) || 0;
  return (n >= 0x1100 && n <= 0x115f) || (n >= 0x2e80 && n <= 0xa4cf) || (n >= 0xac00 && n <= 0xd7a3) || (n >= 0xf900 && n <= 0xfaff) || (n >= 0xff00 && n <= 0xff60) || (n >= 0xffe0 && n <= 0xffe6) || n >= 0x1f300;
};
const dw = (s: string) => { let n = 0; for (const c of s) n += isWide(c) ? 2 : 1; return n; };
const padEndW = (s: string, n: number) => s + " ".repeat(Math.max(0, n - dw(s)));
const padStartW = (s: string, n: number) => " ".repeat(Math.max(0, n - dw(s))) + s;
const readLen = (s: string) => { let n = 0; for (const c of s) n += isWide(c) ? 1.7 : 1; return n; };

const slugify = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** 칸 수 n 안에서 띄어쓰기로 줄바꿈 — 한 낱말이 n보다 길면 글자로 끊는다. */
const wrapGreedy = (text: string, n: number) => {
  const out: string[] = [];
  let cur = "";
  for (let w of String(text).split(/\s+/)) {
    if (!w) continue;
    if (cur && dw(cur + " " + w) > n) { out.push(cur); cur = ""; }
    else if (cur) { cur = cur + " " + w; continue; }
    while (dw(w) > n) {
      let k = 0, acc = 0;
      const ch = Array.from(w);
      while (k < ch.length && acc + dw(ch[k]) <= n) { acc += dw(ch[k]); k++; }
      out.push(ch.slice(0, Math.max(1, k)).join(""));
      w = ch.slice(Math.max(1, k)).join("");
    }
    cur = w;
  }
  if (cur) out.push(cur);
  return out;
};
/** 줄 수는 그대로, 줄 길이는 고르게. */
const wrapWords = (text: string, n: number) => {
  const base = wrapGreedy(text, n);
  if (base.length < 2) return base;
  let best = base, score = 1e9;
  for (let m = n; m >= Math.floor(n * 0.55); m--) {
    const w = wrapGreedy(text, m);
    if (w.length !== base.length) break;
    const lens = w.map(dw), sc = Math.max(...lens) - Math.min(...lens);
    if (sc < score) { score = sc; best = w; }
  }
  return best;
};

// ---- 사람의 타자 박자(씨앗) ----
function cadence(text: string[], cps: number, rng: () => number): number[] {
  const out: number[] = [];
  let t = 0, burst = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], prev = text[i - 1];
    let d = (1 / cps) * (0.5 + rng() * 0.95);
    if (burst > 0) { d *= 0.55; burst--; } else if (rng() < 0.12) burst = 2 + Math.floor(rng() * 4);
    if (c === " ") d *= 1.2;
    if (prev === " " && rng() < 0.16) d += 0.08 + rng() * 0.2; // 다음 낱말로 손을 뻗는 틈
    if (/[A-Z0-9—\-:,.'"?%$]/.test(c)) d *= 1.35;
    if (isWide(c)) d *= 1.7; // 한글 한 글자 = 자판 두세 번
    t += d;
    out.push(t);
  }
  return out;
}

type WorkKind = "cli" | "utility" | "hardware";
/** 내용으로 작품의 성격을 읽는다 — 명령 출력이 있으면 CLI, 보드·센서가 보이면 하드웨어, 아니면 생활 도구. */
function workKind(work: GenreWork): WorkKind {
  if (work.scenes.some((s) => s.kind === "terminal")) return "cli";
  const nodes = work.scenes.flatMap((s) => (s.kind === "flow" ? s.nodes : []));
  if (nodes.some((n) => /esp32|arduino|pico|raspberry|board|sensor|보드|센서/i.test(n))) return "hardware";
  if (work.scenes.some((s) => s.kind === "items" && s.items.length > 0 && s.items.every((it) => /%\s*$/.test(it.value)))) return "hardware";
  return "utility";
}

type Cell = { c: string; w: number; s: Ink | "bg"; at: number; end: number; b: boolean; inv: Ink | null };
type Line = { at: number; ch: Cell[]; first: number };
type Zoom = { at: number; z: number; ax: number; ay: number; sx: number; sy: number };
type Screen = { at: number; lines: Line[]; zooms: Zoom[]; bells: number[] };
type Span = [string, Ink | "bg", { b?: boolean; inv?: Ink }?];

export const terminal: Genre = {
  id: "terminal",
  name: "Terminal cinema",
  ko: "터미널",
  koIdea: "진짜 테마의 터미널 한 세션 — 사람이 치고, 프로그램이 내놓은 출력이 주인공",
  enIdea: "One honest terminal session in a real theme — a person types, the program's output is the star",
  family: "A",
  fonts: ["plexMono", "redhatMono", "firaCode"],
  make(work, { seed, fonts }) {
    const T = LABEL[work.locale];
    const kind = workKind(work);
    // ---------- 작품마다 세계 고르기 ----------
    const pick: ThemeName = ({ cli: "solarized", utility: "tomorrow", hardware: "gruvbox" } as const)[kind];
    const th = THEMES[pick];
    const FAM = { solarized: fonts.plexMono, tomorrow: fonts.redhatMono, gruvbox: fonts.firaCode }[pick];
    const F = { solarized: 30, tomorrow: 30, gruvbox: 28 }[pick];
    // 저장소 이름처럼: 제목 앞부분(· 앞)을 슬러그로, 끝의 흔한 낱말(hub·app…)은 떼어 둘째 창 이름으로
    const headTitle = work.title.split(/ · | — | \| /)[0];
    const boardM = work.scenes.flatMap((s) => (s.kind === "flow" ? s.nodes : [])).map((n) => n.match(/esp32|arduino|pico|raspberry[- ]?pi|[a-z0-9-]*board/i)).find(Boolean);
    const board = boardM ? boardM[0].toLowerCase().replace(/\s+/g, "-") : "device";
    const ending = work.scenes.find((s) => s.kind === "ending");
    let slugParts = slugify(headTitle).split("-").filter(Boolean);
    if (!slugParts.length && ending) slugParts = slugify(ending.name).split("-").filter(Boolean);
    if (!slugParts.length) slugParts = [board === "device" ? "app" : board];
    let tail = "";
    if (slugParts.length > 1 && /^(hub|app|tool|bot)$/.test(slugParts[slugParts.length - 1])) tail = slugParts.pop() || "";
    const slug = slugParts.join("-");
    const accentKey: Ink = work.accent ? ANSI.reduce<Ink>((b, k) => (K.snap(work.accent, [th[b], th[k]]) === th[k] ? k : b), "cyan") : "yellow";
    const alarmKey: Ink = "red";
    const tmuxBar = pick === "tomorrow"; // 생활 도구: tmux 안, 아래에 상태 줄

    const mc = document.createElement("canvas").getContext("2d")!;
    mc.font = K.font(F, FAM, 400);
    const CW = mc.measureText("M").width;
    const LH = Math.round(F * 1.46);
    const PADX = 58, PADY = 46;
    const HZ = 1.5; // 넘김 프롬프트의 확대
    const rowsFor = (z: number) => Math.floor((H - PADY * 2 - (tmuxBar ? LH * z : 0)) / (LH * z));
    const PROMPT: [string, Ink][] = {
      solarized: [["$ ", "blue"]] as [string, Ink][],
      tomorrow: [["~ % ", "fg"]] as [string, Ink][],
      gruvbox: [[(slug.split("-").filter((w) => !/^(home|my|the|app|monitor|tool|bot)$/.test(w))[0] || slug.split("-")[0]), "cyan"], [" → ", "green"]] as [string, Ink][],
    }[pick];
    const promptLen = PROMPT.reduce((n, p) => n + dw(p[0]), 0);
    const cmdFor = (k: "hook" | "flow" | "stats" | "items") => {
      if (kind === "cli") return { hook: slug, flow: slug + " --explain", stats: slug + " summary", items: slug + " status" }[k];
      if (kind === "hardware") return { hook: `curl -s ${board}.local/now`, flow: "cat docs/wiring.txt", stats: "npm run stats", items: `curl -s ${board}.local/rooms` }[k];
      return { hook: slug + " status", flow: "cat docs/how-it-works.txt", stats: "npm run stats", items: slug + " status" }[k];
    };

    // ---------- 세션 만들기(영상이 18~30초가 되도록 속도를 바꿔 다시 만든다) ----------
    function build(SP: number) {
      const rng = K.rng(seed);
      const screens: Screen[] = [];
      let sc!: Screen, ln: Line | null = null, Tt = 0, pending: Line | null = null;
      let typoLeft = 1;
      let curZ = 1, curCam = { z: 1, ax: 0, ay: 0, sx: PADX, sy: PADY };
      const newScreen = (at: number) => { sc = { at, lines: [], zooms: [], bells: [] }; screens.push(sc); ln = null; };
      const newLine = (at: number): Line => { const l: Line = { at, ch: [], first: at }; sc.lines.push(l); ln = l; return l; };
      const cur = () => ln || newLine(Tt);
      const put = (text: string, s: Ink | "bg", at: number, o: { b?: boolean; inv?: Ink } = {}) => { const l = cur(); for (const c of text) l.ch.push({ c, w: isWide(c) ? 2 : 1, s, at, end: 1e9, b: !!o.b, inv: o.inv || null }); };
      const prompt = (at: number) => {
        if (pending && pending === sc.lines[sc.lines.length - 1]) { ln = pending; pending = null; return; }
        newLine(at); for (const [tx, s] of PROMPT) put(tx, s, at);
      };
      const type = (text: string, s: Ink, cps: number, o: { b?: boolean; typo?: boolean } = {}) => {
        const chars = Array.from(text);
        const ts = cadence(chars, cps * SP, rng);
        let off = 0, typoAt = -1;
        if (typoLeft > 0 && o.typo !== false && chars.length > 14) {
          const m = [...text.matchAll(/[a-z]{5,}/g)];
          if (m.length) { const w = m[Math.floor(rng() * m.length)]; typoAt = Array.from(text.slice(0, w.index || 0)).length + 2 + Math.floor(rng() * 2); typoLeft--; }
        }
        const l = cur();
        for (let i = 0; i < chars.length; i++) {
          if (i === typoAt) {
            const wrong = "qwertyuiopasdfghjklzxcvbnm"[Math.floor(rng() * 26)];
            const a = Tt + ts[i] + off;
            l.ch.push({ c: wrong, w: 1, s, at: a, end: a + 0.22 + rng() * 0.1, b: !!o.b, inv: null });
            off += 0.36 + rng() * 0.1;
          }
          l.ch.push({ c: chars[i], w: isWide(chars[i]) ? 2 : 1, s, at: Tt + ts[i] + off, end: 1e9, b: !!o.b, inv: null });
        }
        Tt += ts[ts.length - 1] + off;
      };
      const out = (spans: Span[], at: number) => { newLine(at); for (const sp of spans) put(sp[0], sp[1], at, sp[2] || {}); };
      const zoomTo = (at: number, z: number, ax: number, ay: number, sx: number, sy: number) => sc.zooms.push({ at, z, ax, ay, sx, sy });
      // Cmd± 누르기: 정해진 계단, 사람의 고르지 않은 간격; 기준 칸은 A→B로 옮겨 간다
      const zoomSteps = (from: number, to: number, ax: number, ay: number, sxA: number, syA: number, sxB: number, syB: number) => {
        const steps = LADDER.filter((z) => (from < to ? z > from && z < to : z < from && z > to));
        if (from > to) steps.reverse();
        steps.push(to);
        steps.forEach((z, k) => {
          const u = (k + 1) / steps.length;
          zoomTo(Tt, z, ax, ay, K.lerp(sxA, sxB, u), K.lerp(syA, syB, u));
          Tt += 0.085 + rng() * 0.07;
        });
        curZ = to;
        curCam = { z: to, ax, ay, sx: sxB, sy: syB };
      };
      const goHome = (z: number) => {
        if (z !== curZ || curCam.ax !== 0 || curCam.ay !== 0) {
          if (z === curZ) { zoomTo(Tt, z, 0, 0, PADX, PADY); curCam = { z, ax: 0, ay: 0, sx: PADX, sy: PADY }; }
          else zoomSteps(curZ, z, 0, 0, PADX, PADY, PADX, PADY);
        }
      };
      const fitZoom = (rows: number, cols: number, maxZ: number) => {
        let best = 1;
        for (const z of LADDER) if (z <= maxZ && rows * LH * z <= H - PADY * 2 - (tmuxBar ? LH * z : 0) && cols * CW * z <= W - PADX * 1.6) best = z;
        return best;
      };
      const rowOf = (line: Line) => sc.lines.indexOf(line);
      const read = (chars: number) => { Tt += Math.max(0.9, chars / 20 + 0.4) / Math.sqrt(SP); };
      const clearAt = () => { newScreen(Tt); zoomTo(Tt, curZ, 0, 0, PADX, PADY); curCam = { z: curZ, ax: 0, ay: 0, sx: PADX, sy: PADY }; prompt(Tt); pending = ln; };
      // 긴 생각은 사람들이 쓰듯 주석 두 줄이 된다
      const CMAX = 32;
      const comment = (text: string, cps = 24) => {
        wrapWords(text, CMAX).forEach((part, k) => {
          prompt(Tt); Tt += (k ? 0.1 : 0.14 + rng() * 0.16) / SP; type("# " + part, "dim", cps); Tt += 0.1;
        });
      };
      const cw = (text: string) => Math.max(...wrapWords(text, CMAX).map(dw)) + 2 + promptLen + 1;
      const cn = (text: string) => wrapWords(text, CMAX).length;
      // 명령: 첫 낱말과 두어 글자를 치고 Tab이 나머지를 채운다(zsh)
      const command = (text: string, cps = 24) => {
        prompt(Tt); Tt += (0.14 + rng() * 0.16) / SP;
        const sp1 = text.indexOf(" ");
        const cut = sp1 < 0 ? text.length : Math.min(text.length, sp1 + 3);
        type(text.slice(0, cut), "hi", cps, { typo: false });
        let rest = text.slice(cut);
        while (rest.length) {
          const nx = rest.indexOf(" ", 1);
          const chunk = nx < 0 || rest.length < 10 ? rest : rest.slice(0, nx + 3);
          Tt += (0.12 + rng() * 0.12) / SP;
          put(chunk, "hi", Tt);
          rest = rest.slice(chunk.length);
        }
        Tt += 0.16 + rng() * 0.1;
      };
      const note = (text: string, n: number) => { out([], Tt); wrapWords(text, n).forEach((l, k) => out([["  " + l, "hi"]], Tt + k * 0.03)); Tt += 0.1; };

      const scenes = work.scenes;
      const marks: number[] = [];
      newScreen(-20);
      scenes.forEach((s: FlatScene, si) => {
        marks.push(Tt);
        if (s.kind === "hook") {
          // 영상 직전에 돌린 명령: 첫 화면은 값에 5배로 다가간 장면
          prompt(-6); for (const ch of cmdFor("hook")) put(ch, "hi", -6);
          out([], -5); out([], -5);
          const lab = "  " + s.label + "   ";
          const valCol = dw(lab);
          out([[lab, "fg"], [s.value, s.alarm ? alarmKey : accentKey, { b: true }], [s.data === "sample" ? T.sample : "", "dim"]], -5);
          const hookRow = sc.lines.length - 1;
          const z0 = 5.2;
          const sx0 = W * (0.46 + K.rand(seed, 3) * 0.12) - (dw(s.value) * CW * z0) / 2;
          const sy0 = H * 0.36;
          zoomTo(-5, z0, valCol, hookRow, sx0, sy0);
          Tt = (1.25 + Math.min(0.6, readLen(s.label) / 50)) / SP;
          const lineLen = dw(lab) + dw(s.value) + 11;
          const zEnd = fitZoom(hookRow + 1 + cn(s.line), Math.max(lineLen, cw(s.line)), 2.4);
          zoomSteps(z0, zEnd, valCol, hookRow, sx0, sy0, PADX + valCol * CW * zEnd, PADY + hookRow * LH * zEnd);
          zoomTo(Tt, zEnd, 0, 0, PADX, PADY);
          curCam = { z: zEnd, ax: 0, ay: 0, sx: PADX, sy: PADY };
          Tt += 0.3 / SP;
          comment(s.line, 25);
          Tt += 0.8 / SP;
        } else if (s.kind === "story") {
          const z = fitZoom(cn(s.line) + cn(s.line2 || "") + 1, Math.max(cw(s.line), cw(s.line2 || "")), 2.4);
          if (si === 0) {
            // 영상은 문장 한가운데서 연다: 첫 주석이 t = 0에 반쯤 쳐져 있다
            zoomTo(-5, z, 0, 0, PADX, PADY); curZ = z; curCam = { z, ax: 0, ay: 0, sx: PADX, sy: PADY };
            Tt = -0.5;
            wrapWords(s.line, CMAX).forEach((part, k) => { prompt(k ? Tt : -4); Tt += k ? 0.15 : 0; type("# " + part, "dim", 22, { typo: false }); Tt += 0.1; });
          } else {
            if (sc.lines.length + cn(s.line) + cn(s.line2 || "") > rowsFor(z)) clearAt();
            goHome(z);
            Tt += 0.25 / SP;
            comment(s.line, 23);
          }
          Tt += (0.3 + rng() * 0.2) / SP;
          if (s.line2) comment(s.line2, 22);
          Tt += 1.1 / SP;
        } else if (s.kind === "flow") {
          clearAt();
          const n = s.nodes;
          const total = n.reduce((a, x) => a + dw(x) + 4, 0) + (n.length - 1) * 5 + 2;
          const horiz = total <= 62;
          const stairW = Math.max(...n.map((x, i) => dw(x) + i * 4 + 4));
          const width = Math.max(horiz ? total : stairW, dw(cmdFor("flow")) + promptLen + 1);
          const noteN = Math.max(30, width - 4);
          const rowsNeed = (horiz ? 4 : n.length + 1) + 2 + wrapWords(s.line, noteN).length;
          const z = fitZoom(rowsNeed, width + 1, 2);
          goHome(z);
          command(cmdFor("flow"));
          Tt += 0.2 / SP;
          if (horiz) {
            out([], Tt);
            const rowsB = [newLine(Tt), newLine(Tt), newLine(Tt)];
            let tt = Tt;
            n.forEach((name, k) => {
              const at = tt + (k === 0 ? 0 : (0.22 + rng() * 0.3 + (k === n.length - 1 ? 0.25 : 0)) / SP);
              const kc: Ink = k === n.length - 1 ? accentKey : "fg";
              ln = rowsB[0]; put(k === 0 ? "  " : "     ", "fg", at); put("┌" + "─".repeat(dw(name) + 2) + "┐", kc, at);
              ln = rowsB[1]; put(k === 0 ? "  " : " ──▶ ", "dim", at); put("│ ", kc, at); put(name, k === n.length - 1 ? accentKey : "hi", at, { b: true }); put(" │", kc, at);
              ln = rowsB[2]; put(k === 0 ? "  " : "     ", "fg", at); put("└" + "─".repeat(dw(name) + 2) + "┘", kc, at);
              tt = at;
            });
            Tt = tt + 0.4 / SP;
          } else {
            n.forEach((name, k) => {
              Tt += (k === 0 ? 0.05 : 0.16 + rng() * 0.3) / SP;
              const pad = "  " + "    ".repeat(Math.max(0, k - 1));
              out([[pad + (k === 0 ? "" : "└─▶ "), "dim"], [name, k === n.length - 1 ? accentKey : "hi", { b: true }]], Tt);
            });
            Tt += 0.3 / SP;
          }
          note(s.line, noteN);
          read(readLen(s.line) + 6);
        } else if (s.kind === "terminal") {
          clearAt();
          const lw = Math.max(...s.output.map((o) => dw((o.match(/^([^:]+:)/) || ["", o])[1]))) + 3;
          const width = Math.max(promptLen + dw(s.command) + 1, ...s.output.map((o) => dw(o) + 6));
          const z = fitZoom(s.output.length + 6, width, 2);
          goHome(z);
          command(s.command, 22);
          Tt += (0.25 + rng() * 0.15) / SP; // 프로그램이 생각한다
          s.output.forEach((o, k) => {
            if (k > 0) Tt += (k === 1 ? 0.05 : rng() < 0.4 ? 0.26 + rng() * 0.2 : 0.03 + rng() * 0.05) / SP; // 출력은 고르지 않은 덩어리로 온다
            const m = o.match(/^([^:]+:)(\s*)(.*)$/);
            if (m) {
              const hot = /\(\d+%\)/.test(m[3]);
              const waste = /waste|fail|lost|낭비|실패|손실/i.test(m[1]);
              out([["  " + padEndW(m[1], lw), "fg"], [m[3], hot ? accentKey : waste ? "red" : "hi", { b: true }]], Tt);
            } else out([["  " + o, "fg"]], Tt);
          });
          if (s.data === "sample") out([[T.notReal, "dim"]], Tt + 0.12);
          Tt += 0.3 / SP;
          note(s.line, Math.max(30, width - 4));
          read(readLen(s.line) + 16);
        } else if (s.kind === "stats") {
          clearAt();
          const st = s.stats;
          const lw = Math.max(...st.map((x) => dw(x.label))) + 2;
          const vs0 = (x: { value: string; unit: string }) => x.value + (x.unit === "%" || x.unit.startsWith("/") || isWide(Array.from(x.unit)[0] || "") ? "" : " ") + x.unit;
          const vw = Math.max(...st.map((x) => dw(vs0(x)))) + 1;
          const bars = st.every((x) => x.unit === "%");
          const bw = bars ? 10 : 0;
          const top = "╭" + "─".repeat(lw + 1) + "┬" + "─".repeat(vw + 2) + (bars ? "┬" + "─".repeat(bw + 2) : "") + "╮";
          const bot = "╰" + "─".repeat(lw + 1) + "┴" + "─".repeat(vw + 2) + (bars ? "┴" + "─".repeat(bw + 2) : "") + "╯";
          const z = fitZoom(st.length + 8, Math.max(top.length + 3, promptLen + dw(cmdFor("stats")) + 1), 1.75);
          goHome(z);
          command(cmdFor("stats"));
          Tt += (0.3 + rng() * 0.2) / SP;
          out([["  " + top, "dim"]], Tt);
          st.forEach((x, k) => {
            const vs = padStartW(vs0(x), vw);
            const spans: Span[] = [["  │ ", "dim"], [padEndW(x.label, lw), "fg"], ["│ ", "dim"], [vs + " ", k === 0 ? accentKey : "hi", { b: true }], ["│", "dim"]];
            if (bars) {
              const v = (parseFloat(x.value) / 100) * bw;
              const full = Math.floor(v), frac = Math.round((v - full) * 8);
              const bar = "█".repeat(full) + (frac > 0 ? "▏▎▍▌▋▊▉"[frac - 1] : "");
              spans.push([" " + bar.padEnd(bw + 1, " "), k === 0 ? accentKey : "dim"], ["│", "dim"]);
            }
            out(spans, Tt + (k ? 0.01 : 0));
          });
          out([["  " + bot, "dim"]], Tt);
          out([["  " + (s.source ? T.source + s.source : s.data === "sample" ? T.differ : ""), "dim"]], Tt);
          Tt += 0.6 / SP;
          // 표가 화면을 채울 때까지 Cmd+(프롬프트는 위로 밀려난다)
          const noteL = wrapWords(s.line, Math.max(30, top.length - 2));
          const zh = fitZoom(st.length + 5 + noteL.length, top.length + 3, 3);
          if (zh > curZ) zoomSteps(curZ, zh, 0, 0, PADX, PADY, PADX, PADY);
          Tt += 0.25 / SP;
          note(s.line, Math.max(30, top.length - 2));
          read(readLen(s.line) + 14);
        } else if (s.kind === "items" && kind === "hardware") {
          clearAt();
          const it = s.items;
          const lw = Math.max(...it.map((x) => dw(x.label))) + 2;
          const pct = it.every((x) => /%$/.test(x.value));
          const width = Math.max(9 + lw + 7 + (pct ? 16 : 0), promptLen + 28);
          const z = fitZoom(it.length + 4, width, 2);
          goHome(z);
          command("pio device monitor", 22);
          Tt += 0.3 / SP;
          out([["--- Terminal on /dev/cu.usbserial · 115200 8-N-1", "dim"]], Tt);
          Tt += (0.4 + rng() * 0.2) / SP;
          const rowsAvail = rowsFor(z) - 3;
          let sec = 8;
          const readings = it.length + Math.max(0, rowsAvail - it.length - 2);
          for (let k = 0; k < readings; k++) {
            const x = it[k % it.length];
            const base = parseFloat(x.value) || 0;
            const v = k < it.length ? x.value : (base + (rng() - 0.5) * 0.4).toFixed(1) + "%";
            const stamp = `21:47:${String(sec).padStart(2, "0")}`;
            const spans: Span[] = [[stamp + " ", "dim"], [padEndW(x.label.toLowerCase(), lw), "fg"], [padStartW(v, 6), x.alarm ? alarmKey : "hi", { b: true }]];
            if (pct) spans.push(["  " + "█".repeat(Math.round((base / 100) * 14)), x.alarm ? alarmKey : "dim"]);
            out(spans, Tt);
            // 센서 한 바퀴는 몰아서 오고, 보드는 다음 1분을 기다린다
            Tt += ((k + 1) % it.length === 0 ? 0.55 + rng() * 0.3 : 0.06 + rng() * 0.12) / SP;
            if ((k + 1) % it.length === 0) sec += 1;
          }
          Tt += 0.6 / SP;
          out([["^C", "fg"]], Tt);
          Tt += 0.15;
          if (s.data === "sample") out([[T.readings, "dim"]], Tt);
          comment(s.line, 24);
          Tt += 1.0 / SP;
        } else if (s.kind === "items") {
          clearAt();
          const it = s.items;
          const lw = Math.max(...it.map((x) => dw(x.label))) + 3;
          const pct = it.every((x) => /%$/.test(x.value));
          const width = Math.max(lw + 8 + (pct ? 20 : 0), promptLen + dw(cmdFor("items")) + 1);
          const z = fitZoom(it.length + 6, width, 2);
          goHome(z);
          command(cmdFor("items"));
          Tt += (0.25 + rng() * 0.3) / SP;
          it.forEach((x, k) => {
            const spans: Span[] = [["  " + padEndW(x.label, lw), "fg"], [padStartW(x.value, 5), x.alarm ? alarmKey : "hi", { b: true }]];
            if (pct) {
              const v = Math.round((parseFloat(x.value) / 100) * 14);
              spans.push(["  " + "█".repeat(v), x.alarm ? alarmKey : "dim"]);
            }
            out(spans, Tt + (k === 0 ? 0 : 0.02));
          });
          if (s.data === "sample") out([[T.readings, "dim"]], Tt + 0.1);
          Tt += 0.2;
          note(s.line, Math.max(28, width - 4));
          read(readLen(s.line) + 10);
        } else if (s.kind === "alert") {
          clearAt();
          const logCmd = kind === "hardware" ? `tail -f logs/${board}.log` : `tail -f ~/.${slug}/events.log`;
          const stamp = "21:47:05";
          const evLen = stamp.length + 2 + dw(s.title) + 2 + dw(s.body);
          const z1 = fitZoom(5 + cn(s.line) + cn(s.line2 || ""), Math.max(promptLen + logCmd.length + 1, evLen + 1, cw(s.line), cw(s.line2 || "")), 2);
          goHome(z1);
          command(logCmd, 23);
          Tt += (0.55 + rng() * 0.3) / SP; // 조용하다가… 떨어진다
          out([[stamp + "  ", "dim"], [s.title + "  ", "hi", { b: true }], [s.body, alarmKey, { b: true }]], Tt);
          const evLine = sc.lines[sc.lines.length - 1];
          if (s.data === "sample") out([[" ".repeat(stamp.length + 2) + T.event, "dim"]], Tt);
          sc.bells.push(Tt);
          Tt += 0.6 / SP;
          // 사건으로 밀고 들어간다: 주인공 순간
          const er = rowOf(evLine);
          const heroCol = stamp.length + 2, heroLen = dw(s.title) + 2 + dw(s.body);
          const zHero = LADDER.filter((x) => x <= Math.min(3.6, (W - PADX * 2) / (heroLen * CW))).pop() || 1;
          if (zHero >= z1 + 0.4) {
            zoomSteps(curZ, zHero, heroCol, er, PADX + heroCol * CW * z1, PADY + er * LH * z1, PADX, H * 0.42);
            Tt += Math.max(1.4, (readLen(s.title) + 2 + readLen(s.body)) / 18) / SP;
            zoomSteps(zHero, z1, heroCol, er, PADX, H * 0.42, PADX + heroCol * CW * z1, PADY + er * LH * z1);
          } else Tt += Math.max(1.2, (readLen(s.title) + 2 + readLen(s.body)) / 20) / SP;
          zoomTo(Tt, z1, 0, 0, PADX, PADY); curCam = { z: z1, ax: 0, ay: 0, sx: PADX, sy: PADY };
          out([["^C", "fg"]], Tt);
          Tt += 0.25 / SP;
          comment(s.line, 22);
          if (s.line2) { Tt += 0.3 / SP; comment(s.line2, 22); }
          Tt += 1.0 / SP;
        } else if (s.kind === "ending") {
          clearAt();
          const z = fitZoom(7, Math.max(promptLen + 16, dw(s.line) + 4, dw(s.line2 || "") + 4, dw(s.name) + 6), 2.4);
          goHome(z);
          command("glow README.md", 18);
          Tt += 0.25 / SP;
          out([], Tt);
          out([["  ", "fg"], [" " + s.name + " ", "bg", { b: true, inv: accentKey }]], Tt);
          out([], Tt);
          out([["  " + s.line, "hi"]], Tt + 0.05);
          if (s.line2) out([["  " + s.line2, "fg"]], Tt + 0.08);
          Tt += 0.2;
          prompt(Tt + 0.1);
          read(readLen(s.name) + readLen(s.line + (s.line2 || "")) * 0.5);
        }
      });
      // 넘김: Cmd−로 보통 크기로 돌아와 새 프롬프트에 주소를 친다
      const handAt = Tt;
      zoomSteps(curZ, HZ, 0, 0, PADX, PADY, PADX, PADY);
      prompt(Tt + 0.1);
      const handLine = cur();
      put("open ", "hi", Tt + 0.2);
      const handType = Tt + 0.35;
      const duration = handAt + 2.4;
      for (const s of screens) for (const l of s.lines) l.first = l.ch.length ? Math.min(...l.ch.map((c) => c.at)) : l.at;
      return { screens, duration, handLine, handType, lastScreen: sc, marks };
    }

    let sp = 1, film = build(1);
    for (let k = 0; k < 6 && (film.duration > 29.2 || film.duration < 19); k++) {
      sp *= ((film.duration - 2.4) / (film.duration > 29.2 ? 26.4 : 20)) * (k ? 1.03 : 1);
      film = build(sp);
    }
    const { screens, duration, handLine, handType, lastScreen, marks } = film;
    const starts = marks.map((m) => Math.max(0, m));

    const col = (k: Ink | "bg") => (k === "bg" ? th.bg : th[k] || th.fg);
    // 넓은 글자(한글)와 대체 글꼴에서 온 기호(→·)의 폭을 미리 잰다 — 제 칸 안에 맞춰 놓는다
    const wideW = new Map<string, number>();
    for (const s of screens) for (const l of s.lines) for (const c of l.ch) {
      if (c.w !== 2 && c.c.charCodeAt(0) < 128) continue;
      const key = (c.b ? "b" : "r") + c.c;
      if (!wideW.has(key)) { mc.font = K.font(F, FAM, c.b ? 600 : 400); wideW.set(key, mc.measureText(c.c).width); }
    }

    function drawBoxChar(g: CanvasRenderingContext2D, c: string, x: number, y: number, cw: number, lh: number) {
      const mx = x + cw / 2, my = y + lh / 2, lw = Math.max(1.2, cw * 0.085);
      const Hl = (a: number, b: number) => g.fillRect(a, my - lw / 2, b - a, lw);
      const Vl = (a: number, b: number) => g.fillRect(mx - lw / 2, a, lw, b - a);
      const arc = (cx: number, cy: number, a0: number, a1: number) => { g.lineWidth = lw; g.strokeStyle = g.fillStyle; g.beginPath(); g.arc(cx, cy, cw / 2, a0, a1); g.stroke(); };
      switch (c) {
        case "─": Hl(x, x + cw + 0.5); break;
        case "│": Vl(y, y + lh + 0.5); break;
        case "┌": Hl(mx - lw / 2, x + cw + 0.5); Vl(my - lw / 2, y + lh + 0.5); break;
        case "┐": Hl(x, mx + lw / 2); Vl(my - lw / 2, y + lh + 0.5); break;
        case "└": Hl(mx - lw / 2, x + cw + 0.5); Vl(y, my + lw / 2); break;
        case "┘": Hl(x, mx + lw / 2); Vl(y, my + lw / 2); break;
        case "╭": arc(x + cw, my + cw / 2, Math.PI, Math.PI * 1.5); Vl(my + cw / 2, y + lh + 0.5); break;
        case "╮": arc(x, my + cw / 2, Math.PI * 1.5, Math.PI * 2); Vl(my + cw / 2, y + lh + 0.5); break;
        case "╰": arc(x + cw, my - cw / 2, Math.PI * 0.5, Math.PI); Vl(y, my - cw / 2); break;
        case "╯": arc(x, my - cw / 2, 0, Math.PI * 0.5); Vl(y, my - cw / 2); break;
        case "├": Vl(y, y + lh + 0.5); Hl(mx, x + cw + 0.5); break;
        case "┤": Vl(y, y + lh + 0.5); Hl(x, mx); break;
        case "┬": Hl(x, x + cw + 0.5); Vl(my, y + lh + 0.5); break;
        case "┴": Hl(x, x + cw + 0.5); Vl(y, my); break;
        case "┼": Hl(x, x + cw + 0.5); Vl(y, y + lh + 0.5); break;
        case "█": g.fillRect(x, y + lh * 0.2, cw + 0.6, lh * 0.6); break;
        case "▶": g.beginPath(); g.moveTo(x + cw * 0.15, my - lh * 0.18); g.lineTo(x + cw * 0.85, my); g.lineTo(x + cw * 0.15, my + lh * 0.18); g.fill(); break;
        default: {
          const k = "▏▎▍▌▋▊▉".indexOf(c);
          if (k >= 0) g.fillRect(x, y + lh * 0.2, (cw * (k + 1)) / 8, lh * 0.6);
        }
      }
    }

    function drawLine(g: CanvasRenderingContext2D, l: Line, t: number, y0: number, maxCols: number) {
      let x = 0, n = 0, run = "", runS: Ink | "bg" = "fg", runB = false, runX = 0;
      const flush = () => {
        if (!run) return;
        g.fillStyle = col(runS);
        g.font = K.font(F, FAM, runB ? 600 : 400);
        g.fillText(run, runX, y0);
        run = "";
      };
      for (const c of l.ch) {
        if (c.at > t || t >= c.end) continue;
        if (n + c.w > maxCols) break;
        const cwx = CW * c.w;
        if (c.inv) { flush(); g.fillStyle = col(c.inv); g.fillRect(x, y0 - LH * 0.74, cwx + 0.6, LH); }
        if (BOX.includes(c.c)) {
          flush();
          g.fillStyle = col(c.s);
          drawBoxChar(g, c.c, x, y0 - LH * 0.74, CW, LH);
        } else if (c.w === 2 || (c.c.charCodeAt(0) >= 128 && (wideW.get((c.b ? "b" : "r") + c.c) || 0) > CW * 1.05)) {
          // 두 칸 글자(또는 칸보다 넓게 온 기호): 고정폭 격자를 지키려고 한 자씩 제 칸 가운데에
          flush();
          g.fillStyle = col(c.s);
          g.font = K.font(F, FAM, c.b ? 600 : 400);
          const mw = wideW.get((c.b ? "b" : "r") + c.c) || cwx;
          if (mw > cwx) { g.save(); g.translate(x, y0); g.scale(cwx / mw, 1); g.fillText(c.c, 0, 0); g.restore(); }
          else g.fillText(c.c, x + (cwx - mw) / 2, y0);
        } else {
          if (runS !== c.s || runB !== c.b || c.inv || !run) { flush(); runS = c.s; runB = c.b; runX = x; }
          run += c.c;
          if (c.inv) flush();
        }
        x += cwx; n += c.w;
      }
      flush();
      return x;
    }

    return {
      duration,
      starts,
      render(g, t) {
        g.fillStyle = th.bg;
        g.fillRect(0, 0, W, H);
        g.textBaseline = "alphabetic";
        g.textAlign = "left";
        let S = screens[0];
        for (const s of screens) if (s.at <= t) S = s;
        let cam = { z: 1, ax: 0, ay: 0, sx: PADX, sy: PADY };
        for (const z of S.zooms) if (z.at <= t) cam = z;
        const vis = S.lines.filter((l) => l.first <= t);
        const scroll = cam.z === 1 ? Math.max(0, vis.length - rowsFor(1)) : 0;
        const barH = tmuxBar ? LH * cam.z : 0;
        g.save();
        g.beginPath(); g.rect(0, 0, W, H - barH); g.clip();
        g.translate(cam.sx, cam.sy);
        g.scale(cam.z, cam.z);
        g.translate(-cam.ax * CW, -(cam.ay + scroll) * LH);
        let curL: { x: number; y: number; l: Line } | null = null;
        const maxCols = Math.floor((W - PADX) / (CW * cam.z)) + cam.ax + 2;
        vis.forEach((l, i) => {
          const y = i * LH + LH * 0.76;
          curL = { x: drawLine(g, l, t, y, maxCols), y, l };
        });
        // 커서: 치는 동안은 꽉 차 있고, 쉬면 530ms로 깜빡인다
        const c0 = curL as { x: number; y: number; l: Line } | null;
        if (c0) {
          const typed = c0.l.ch.filter((c) => c.at <= t);
          let idle = t - (typed.length ? Math.max(...typed.map((c) => c.at)) : c0.l.first);
          let cx = c0.x;
          if (c0.l === handLine && t >= handType) {
            const url = "nookframe.com/@" + work.handle;
            const p = K.clamp((t - handType) / (duration - handType));
            const nn = Math.round(K.clamp(p / 0.55) * url.length);
            cx += nn * CW;
            idle = nn < url.length ? 0 : (p - 0.55) * (duration - handType);
          }
          if (idle < 0.5 || Math.floor((idle - 0.5) / 0.53) % 2 === 1) {
            g.fillStyle = th.fg; g.globalAlpha = 0.8;
            g.fillRect(cx, c0.y - LH * 0.74, CW, LH * 0.98);
            g.globalAlpha = 1;
          }
        }
        g.restore();

        // 넘김: 새 프롬프트가 주소를 친다 — 이 테마의 잉크와 글꼴로
        if (S === lastScreen && t >= handType) {
          const i = vis.indexOf(handLine);
          if (i >= 0) {
            K.handoff(g, K.clamp((t - handType) / (duration - handType)), {
              ink: th.hi, family: FAM, size: F * cam.z,
              x: cam.sx + (promptLen + 5) * CW * cam.z, y: cam.sy + ((i - scroll) * LH + LH * 0.76) * cam.z, handle: work.handle,
            });
          }
        }

        // tmux 상태 줄(생활 도구) — 칸 격자의 일부라 글자와 함께 커진다
        if (tmuxBar) {
          g.fillStyle = th.green;
          g.fillRect(0, H - barH, W, barH);
          g.fillStyle = "#000";
          g.font = K.font(F * cam.z, FAM, 400);
          const sec = 5 + Math.floor(t);
          const right = `21:${String(47 + Math.floor(sec / 60)).padStart(2, "0")} 04-Oct `;
          const left = `[${slug}] 0:zsh*` + (cam.z < 1.6 ? `  1:${tail || "edit"}-` : "");
          g.fillText(left, 4, H - barH * 0.27);
          g.textAlign = "right";
          g.fillText(right, W - 4, H - barH * 0.27);
          g.textAlign = "left";
        }
        // 화면 깜빡 벨: 화면 전체가 ~90ms 뒤집힌다
        for (const b of S.bells) {
          if (t >= b && t < b + 0.09) { g.save(); g.globalCompositeOperation = "difference"; g.fillStyle = "#ffffff"; g.fillRect(0, 0, W, H); g.restore(); }
        }
      },
    };
  },
};
