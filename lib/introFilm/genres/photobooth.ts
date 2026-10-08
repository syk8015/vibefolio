// 포토부스 — 작품이 옛 사진 부스 앞에 선다(필름 실험실 2라운드, 2026-10-08).
// 세계의 규칙: 부스의 불 켜진 간판이 첫 장면(부스가 그 이름을 단다), 나머지 장면은 부스 카메라 앞의 포즈 하나씩 —
// 팻말·펠트 글자판·줄에 꽂은 색인 카드·노트북·폰·센서 기기·심사위원 점수판 — 플래시가 터지고, 슬롯에서 한 컷씩 나와
// 공기 중에서 현상된다. 예시 수치는 띠 가장자리에 부스 주인의 "예시" 도장. 끝은 부스가 꼬리글(끝 장면)을 찍고 띠를 잘라
// 떨어뜨린 뒤, 다 된 띠를 따라 천천히 훑는 인서트.
// 움직임: 포즈마다 짧은 플래시 한 번, 모터 급지 24fps 계단, 현상 2.3초(어두운 톤부터), 카메라는 간판→슬롯 한 번 기울고
// 현상하는 동안 천천히 다가가기, 떨어짐은 중력, 끝은 자르기(컷).
import type { FlatScene, Genre, GenreWork } from "./types";
import * as K from "./kit";

const FS = 2;                        // 사진 래스터 배율
const FW = 520, FH = 400, GAP = 26, BORD = 34, FOOT = 330;
const SW = FW + BORD * 2;

// 부스가 스스로 찍고 붙이는 말 — 영상의 언어로.
const LABEL = {
  en: { photos: "photos", plate1: ["4 poses, one strip", "photos drop here"], plate2: ["wait while they develop"], sample: "sample figures", src: "src: ", on: "on" },
  ko: { photos: "사진", plate1: ["네 컷, 한 장", "사진은 여기로 나와요"], plate2: ["현상되는 동안 기다려 주세요"], sample: "예시 수치", src: "출처: ", on: "켜짐" },
};
type Labels = (typeof LABEL)["en"] | (typeof LABEL)["ko"];

const isWide = (c: string) => {
  const n = c.codePointAt(0) || 0;
  return (n >= 0x1100 && n <= 0x115f) || (n >= 0x2e80 && n <= 0xa4cf) || (n >= 0xac00 && n <= 0xd7a3) || (n >= 0xf900 && n <= 0xfaff) || (n >= 0xff00 && n <= 0xff60) || (n >= 0xffe0 && n <= 0xffe6) || n >= 0x1f300;
};
const readLen = (s: string) => { let n = 0; for (const c of s) n += isWide(c) ? 1.7 : 1; return n; };

function splitTitle(t: string): { name: string; pitch: string } {
  for (const sep of [" · ", " — ", " | "]) {
    const i = t.indexOf(sep);
    if (i > 0) return { name: t.slice(0, i).trim(), pitch: t.slice(i + sep.length).trim() };
  }
  return { name: t.trim(), pitch: "" };
}
/** 띄어쓰기로 줄바꿈 — 한 낱말이 폭보다 길면 글자로 끊는다. 지금 x.font 기준. */
function wrap(x: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of String(text).split(/\s+/)) {
    const nx = cur ? cur + " " + w : w;
    if (x.measureText(nx).width <= maxW) { cur = nx; continue; }
    if (cur) out.push(cur);
    if (x.measureText(w).width <= maxW) { cur = w; continue; }
    let part = "";
    for (const ch of Array.from(w)) { if (x.measureText(part + ch).width > maxW && part) { out.push(part); part = ch; } else part += ch; }
    cur = part;
  }
  if (cur) out.push(cur);
  return out;
}
const fit = (x: CanvasRenderingContext2D, text: string, fam: string, w: number, maxW: number, max: number, min = 10) => {
  let s = max;
  for (; s > min; s -= 2) { x.font = K.font(s, fam, w); if (x.measureText(text).width <= maxW) break; }
  return s;
};

type Booth = "cli" | "utility" | "hardware";
function pickBooth(work: GenreWork, seed: number): Booth {
  const kinds = work.scenes.map((s) => s.kind);
  const pctItems = work.scenes.some((s) => s.kind === "items" && s.items.length > 0 && s.items.every((it) => /^\s*[\d.,]+\s*%\s*$/.test(it.value)));
  if (pctItems) return "hardware";
  if (kinds.includes("terminal")) return "cli";
  if (!kinds.includes("hook")) return "utility";
  return (["cli", "utility", "hardware"] as const)[seed % 3];
}
type Style = {
  key: Booth; wall: string; panel: string; panelLine: string; rivet: string;
  sign: { bg: string; ink: string; sub: string; frame: string; bulbs: boolean };
  tone: "bw" | "color" | "blue"; curtain: [string, string, string]; prop: string; alarm: string;
  slotX: number; stamp: string; tray: string; plate: string; plateInk: string; insRot: number;
};
function styleFor(work: GenreWork, key: Booth): Style {
  const alarm = work.alarm || "#d23a3a";
  if (key === "cli") return {
    key, wall: "#141619", panel: "#8e959c", panelLine: "#6c737a", rivet: "#b9bfc5",
    sign: { bg: "#101113", ink: "#f2f2ee", sub: "#a9aeb3", frame: "#c9cdd1", bulbs: true },
    tone: "bw", curtain: ["#4a4f56", "#3c4047", "#565b62"], prop: "#d9dcdf", alarm: "#2a2a2a",
    slotX: 130, stamp: "#b8323a", tray: "#4c5258", plate: "#24272b", plateInk: "#d7dadd", insRot: -0.03,
  };
  if (key === "utility") {
    const a = work.accent || "#ff9f0a";
    return {
      key, wall: "#18263b", panel: a, panelLine: K.mix(a, "#000000", 0.25), rivet: K.mix(a, "#ffffff", 0.35),
      sign: { bg: "#f7f7f4", ink: "#1a1c22", sub: K.mix(a, "#000000", 0.3), frame: "#ffffff", bulbs: false },
      tone: "color", curtain: ["#24395e", "#1c2e4e", "#2d4670"], prop: a, alarm,
      slotX: -150, stamp: "#3b3f9a", tray: "#262b33", plate: "#1a1c22", plateInk: "#f7f7f4", insRot: 0.035,
    };
  }
  const a = work.accent || "#f18600";
  return {
    key, wall: "#101b1d", panel: "#2c4b51", panelLine: "#21393e", rivet: "#5f7f86",
    sign: { bg: "#1b2d31", ink: a, sub: "#cfe0e3", frame: "#5f7f86", bulbs: true },
    tone: "blue", curtain: [a, K.mix(a, "#000000", 0.18), K.mix(a, "#ffffff", 0.12)], prop: a, alarm,
    slotX: 170, stamp: a, tray: "#22393d", plate: "#0f1a1c", plateInk: a, insRot: -0.02,
  };
}

type Ctx = { x: CanvasRenderingContext2D; st: Style; seed: number; SANS: string; MARK: string; MONO: string; T: Labels; name: string; ko: boolean; mw: number };

// ---------------- 포즈: 부스 카메라 앞에 놓인 것 ----------------
function curtain({ x, st, seed }: Ctx) {
  const [c0, c1, c2] = st.curtain;
  x.fillStyle = c0; x.fillRect(0, 0, FW, FH);
  let px = -10, i = 0;
  while (px < FW + 10) {
    const w = 26 + K.rand(seed, i) * 22;
    x.fillStyle = i % 2 ? c1 : c2; x.globalAlpha = 0.55;
    x.beginPath(); x.moveTo(px, 0); x.bezierCurveTo(px + 6, FH * 0.4, px - 6, FH * 0.7, px + 3, FH); x.lineTo(px + 3 + w * 0.45, FH); x.bezierCurveTo(px + w * 0.45 - 4, FH * 0.7, px + w * 0.45 + 5, FH * 0.4, px + w * 0.45, 0); x.closePath(); x.fill();
    x.globalAlpha = 1;
    px += w; i++;
  }
}
function tape(c: Ctx, text: string, cx: number, cy: number, rot: number, size = 24, maxW = 470) {
  const { x } = c;
  x.save(); x.translate(cx, cy); x.rotate(rot);
  const sz = c.ko ? Math.round(size * 1.15) : size;
  x.font = K.font(sz, c.MARK, c.mw);
  const lines = wrap(x, text, maxW - 30).slice(0, 3);
  const tw = Math.max(...lines.map((l) => x.measureText(l).width)) + 30, th = lines.length * sz * 1.15 + 14;
  x.fillStyle = "#e7e6e0"; x.globalAlpha = 0.96;
  x.beginPath(); x.moveTo(-tw / 2, -th / 2);
  for (let k = 0; k <= 6; k++) x.lineTo(-tw / 2 + (tw * k) / 6, -th / 2 + (k % 2 ? 2 : 0));
  x.lineTo(tw / 2 + 2, th / 2); for (let k = 6; k >= 0; k--) x.lineTo(-tw / 2 + (tw * k) / 6, th / 2 - (k % 2 ? 2 : 0));
  x.closePath(); x.fill(); x.globalAlpha = 1;
  x.fillStyle = "#17181b"; x.textAlign = "center";
  lines.forEach((l, i) => x.fillText(l, 0, -th / 2 + 7 + sz * 0.92 + i * sz * 1.15));
  x.restore();
}
function card(x: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, rot: number, fill = "#f5f5f2") {
  x.save(); x.translate(cx, cy); x.rotate(rot);
  x.fillStyle = "rgba(0,0,0,0.28)"; x.fillRect(-w / 2 + 6, -h / 2 + 8, w, h);
  x.fillStyle = fill; x.fillRect(-w / 2, -h / 2, w, h);
  return () => x.restore();
}

function pose(c: Ctx, sc: FlatScene) {
  const { x, st, seed, SANS, MARK, MONO, T, mw } = c;
  switch (sc.kind) {
    case "hook": {
      const done = card(x, 260, 178, 400, 280, -0.035);
      x.fillStyle = "#1a1a1a"; x.textAlign = "left";
      fit(x, sc.label, MARK, mw, 350, c.ko ? 25 : 22, 14); x.fillText(sc.label, -176, -96);
      const vs = fit(x, sc.value, SANS, 700, 340, 150);
      x.font = K.font(vs, SANS, 700); x.textAlign = "center"; x.fillStyle = sc.alarm ? st.alarm : "#141414";
      x.fillText(sc.value, 0, 52);
      x.fillStyle = "#1a1a1a"; fit(x, sc.line, MARK, mw, 360, c.ko ? 25 : 22, 14); x.fillText(sc.line, 0, 112);
      done();
      return;
    }
    case "story": {
      const done = card(x, 260, 168, 470, 300, 0.02, "#7a5a3c");
      x.fillStyle = "#161616"; x.fillRect(-222, -138, 444, 276);
      x.fillStyle = "rgba(255,255,255,0.05)"; for (let y = -132; y < 138; y += 14) x.fillRect(-222, y, 444, 2);
      x.fillStyle = "#f1f1ee"; x.textAlign = "center";
      let s1 = 40, s2 = 28;
      x.font = K.font(s1, SANS, 500);
      let l1 = wrap(x, sc.line.toUpperCase(), 400);
      x.font = K.font(s2, SANS, 400);
      let l2 = wrap(x, sc.line2.toUpperCase(), 400);
      while (l1.length * s1 * 1.25 + l2.length * s2 * 1.3 > 240 && s1 > 26) { s1 -= 2; s2 -= 1.5; x.font = K.font(s1, SANS, 500); l1 = wrap(x, sc.line.toUpperCase(), 400); x.font = K.font(s2, SANS, 400); l2 = wrap(x, sc.line2.toUpperCase(), 400); }
      const total = l1.length * s1 * 1.25 + 16 + l2.length * s2 * 1.3;
      let y = -total / 2 + s1 * 0.95;
      x.font = K.font(s1, SANS, 500); for (const l of l1) { x.fillText(l, 0, y); y += s1 * 1.25; }
      y += 10; x.font = K.font(s2, SANS, 400); x.fillStyle = "#c9c9c4"; for (const l of l2) { x.fillText(l, 0, y); y += s2 * 1.3; }
      done();
      return;
    }
    case "flow": {
      const n = sc.nodes.length, w = Math.min(150, (470 - (n - 1) * 26) / n), h = 128;
      const xs = sc.nodes.map((_, i) => 25 + w / 2 + i * (w + 26) + (470 - n * w - (n - 1) * 26) / 2);
      const ys = sc.nodes.map((_, i) => 120 + (i % 2 ? 34 : 0) + K.rand(seed, i) * 10);
      x.strokeStyle = "#e9e3d6"; x.lineWidth = 2; x.beginPath(); x.moveTo(0, 46); x.quadraticCurveTo(260, 92, FW, 50); x.stroke();
      sc.nodes.forEach((nd, i) => {
        const last = i === n - 1;
        const done = card(x, xs[i], ys[i], w, h, (K.rand(seed, i, 3) - 0.5) * 0.12, last ? st.prop : "#f6f6f3");
        x.fillStyle = last ? "rgba(255,255,255,0.4)" : "rgba(196,60,60,0.55)"; x.fillRect(-w / 2, -h / 2 + 22, w, 2);
        x.fillStyle = "rgba(70,110,170,0.25)"; for (let y = -h / 2 + 44; y < h / 2; y += 18) x.fillRect(-w / 2, y, w, 1);
        x.fillStyle = "#c23232"; x.beginPath(); x.arc(0, -h / 2 + 9, 6, 0, Math.PI * 2); x.fill();
        x.fillStyle = "#16171a"; x.textAlign = "center";
        let s = (n > 3 ? 19 : 22) * (c.ko ? 1.18 : 1);
        x.font = K.font(s, MARK, mw);
        let ls = wrap(x, nd, w - 14);
        while (ls.length > 3 && s > 13) { s -= 1.5; x.font = K.font(s, MARK, mw); ls = wrap(x, nd, w - 14); }
        ls.forEach((l, k) => x.fillText(l, 0, -ls.length * s * 0.6 + 16 + k * s * 1.18));
        done();
      });
      x.strokeStyle = "#f2f2ee"; x.lineWidth = 4; x.lineCap = "round";
      for (let i = 0; i < n - 1; i++) {
        const xa = xs[i] + w / 2 - 2, xb = xs[i + 1] - w / 2 + 2, ym = (ys[i] + ys[i + 1]) / 2 + 74;
        x.beginPath(); x.moveTo(xa - 8, ym - 6); x.quadraticCurveTo((xa + xb) / 2, ym + 14, xb + 2, ym - 4); x.stroke();
        x.beginPath(); x.moveTo(xb - 8, ym - 14); x.lineTo(xb + 2, ym - 4); x.lineTo(xb - 11, ym + 2); x.stroke();
      }
      tape(c, sc.line, 260, 352, -0.015, 22);
      return;
    }
    case "terminal": {
      x.fillStyle = "#2a2c30"; x.fillRect(48, 22, 424, 272);
      x.fillStyle = "#0d0e10"; x.fillRect(60, 32, 400, 250);
      x.fillStyle = "#3a3d42"; x.beginPath(); x.moveTo(30, 296); x.lineTo(490, 296); x.lineTo(510, 318); x.lineTo(10, 318); x.closePath(); x.fill();
      x.textAlign = "left";
      const fitMono = (s: string, w: number) => { let z = 15; for (; z > 9; z -= 0.5) { x.font = K.font(z, MONO, w); if (x.measureText(s).width <= 372) break; } };
      fitMono("$ " + sc.command, 600); x.fillStyle = "#e9eaec"; x.fillText("$ " + sc.command, 74, 62);
      sc.output.slice(0, 6).forEach((o, i) => {
        const key = /survived|살아남/i.test(o);
        if (key) { x.fillStyle = "rgba(255,255,255,0.14)"; x.fillRect(68, 80 + i * 26 + 6, 384, 24); }
        fitMono(o, key ? 600 : 400);
        x.fillStyle = key ? "#ffffff" : "#b4b8be";
        x.fillText(o, 74, 100 + i * 26 + 6);
      });
      x.fillStyle = "#e9eaec"; x.fillRect(74, 100 + Math.min(6, sc.output.length) * 26 + 2, 9, 16);
      tape(c, sc.line, 260, 358, 0.012, 22);
      return;
    }
    case "items": {
      if (st.key === "hardware") {
        // 센서 기기들을 부스 의자 위에 줄 세운다
        const n = sc.items.length;
        sc.items.slice(0, 6).forEach((it, i) => {
          const row = i < 3 ? 0 : 1, col = row ? i - 3 : i, per = row ? Math.min(3, n - 3) : Math.min(3, n);
          const bw = 140, bh = 96;
          const cx = 260 + (col - (per - 1) / 2) * 162, cy = 82 + row * 140 + (K.rand(seed, i) - 0.5) * 8;
          const done = card(x, cx, cy, bw, bh, (K.rand(seed, i, 2) - 0.5) * 0.07, "#f1f2f0");
          x.fillStyle = "#b8c2a6"; x.fillRect(-bw / 2 + 12, -bh / 2 + 12, bw - 24, 52);
          x.fillStyle = it.alarm ? st.alarm : "#26302a"; x.textAlign = "center";
          fit(x, it.value, SANS, 500, bw - 34, 38, 16); x.fillText(it.value, 0, 2);
          x.fillStyle = it.alarm ? st.alarm : "#7d8a7f"; x.beginPath(); x.arc(bw / 2 - 16, bh / 2 - 14, 5, 0, Math.PI * 2); x.fill();
          x.fillStyle = "#17181b"; x.textAlign = "left"; fit(x, it.label, MARK, mw, bw - 44, c.ko ? 20 : 15, 10); x.fillText(it.label, -bw / 2 + 12, bh / 2 - 9);
          done();
        });
        tape(c, sc.line, 260, 360, -0.012, 22);
        return;
      }
      // 허브 화면을 띄운 폰
      const done = card(x, 260, 168, 236, 318, -0.025, "#111214");
      x.fillStyle = "#f5f5f7"; x.fillRect(-106, -146, 212, 292);
      x.fillStyle = "#16171a"; x.textAlign = "left"; fit(x, c.name, SANS, 500, 180, 19, 12); x.fillText(c.name, -92, -116);
      const rows = sc.items.slice(0, 5);
      rows.forEach((it, i) => {
        const y = -86 + i * 50;
        x.fillStyle = "#e6e6ea"; x.fillRect(-96, y - 4, 192, 1);
        const v = it.value === "✓" ? T.on : it.value;
        x.font = K.font(19, SANS, 500); const vw = x.measureText(v).width;
        x.fillStyle = "#2a2b30"; fit(x, it.label, SANS, 400, 176 - vw, 17, 11); x.fillText(it.label, -92, y + 26);
        x.textAlign = "right"; x.font = K.font(19, SANS, 500); x.fillStyle = it.value === "✓" ? st.prop : "#16171a";
        x.fillText(v, 92, y + 26); x.textAlign = "left";
      });
      done();
      tape(c, sc.line, 260, 362, 0.018, 21);
      return;
    }
    case "alert": {
      const done = card(x, 250, 158, 230, 300, 0.03, "#111214");
      x.fillStyle = "#1d2433"; x.fillRect(-104, -138, 208, 276);
      x.fillStyle = "#e8ebf2"; x.font = K.font(52, SANS, 400); x.textAlign = "center"; x.fillText("9:41", 0, -62);
      x.fillStyle = "rgba(245,245,247,0.95)"; x.beginPath(); x.roundRect(-96, -26, 192, 92, 12); x.fill();
      x.fillStyle = st.alarm; x.beginPath(); x.roundRect(-86, -16, 26, 26, 6); x.fill();
      x.fillStyle = "#ffffff"; x.font = K.font(18, SANS, 700); x.fillText("!", -73, 4);
      x.textAlign = "left"; x.fillStyle = "#121316"; fit(x, sc.title, SANS, 500, 140, 18, 11); x.fillText(sc.title, -52, 3);
      x.font = K.font(15, SANS, 400);
      wrap(x, sc.body, 176).slice(0, 2).forEach((l, i) => x.fillText(l, -86, 32 + i * 19));
      done();
      tape(c, sc.line + (sc.line2 ? " — " + sc.line2 : ""), 262, 352, -0.02, 20, 480);
      return;
    }
    case "stats": {
      const n = Math.min(3, sc.stats.length), w = Math.min(148, 460 / n - 12);
      sc.stats.slice(0, 3).forEach((s0, i) => {
        const cx = 260 + (i - (n - 1) / 2) * (w + 16), cy = 128 + [0, -14, 8][i % 3];
        const done = card(x, cx, cy, w, 196, (K.rand(seed, i) - 0.5) * 0.1, i === 0 ? "#f7f7f4" : "#efefec");
        x.fillStyle = "#141414"; x.textAlign = "center";
        const v = s0.value + (s0.unit === "%" ? "%" : "");
        const vs = fit(x, v, SANS, 700, w - 16, 70);
        x.font = K.font(vs, SANS, 700); x.fillText(v, 0, -18);
        if (s0.unit && s0.unit !== "%") { fit(x, s0.unit, SANS, 400, w - 16, 20, 12); x.fillText(s0.unit, 0, 12); }
        x.fillStyle = i === 0 ? st.prop : "#9a9a96"; x.fillRect(-w / 2 + 14, 28, w - 28, 3);
        x.fillStyle = "#1a1a1a"; x.font = K.font(c.ko ? 19 : 16, MARK, mw);
        wrap(x, s0.label, w - 18).slice(0, 3).forEach((l, k) => x.fillText(l, 0, 56 + k * 19));
        done();
      });
      tape(c, sc.line, 260, sc.source ? 330 : 350, -0.01, 22);
      if (sc.source) { x.fillStyle = "rgba(255,255,255,0.75)"; x.font = K.font(15, MONO, 400); x.textAlign = "center"; x.fillText(T.src + sc.source, 260, 384); }
      return;
    }
    case "ending": {
      // 보통은 꼬리글로 가지만, 포즈로 올 때는 이름 팻말
      const done = card(x, 260, 178, 400, 240, 0.02);
      x.fillStyle = "#141414"; x.textAlign = "center";
      const vs = fit(x, sc.name, SANS, 700, 340, 70);
      x.font = K.font(vs, SANS, 700); x.fillText(sc.name, 0, 0);
      fit(x, sc.line, MARK, mw, 360, 22, 12); x.fillText(sc.line, 0, 60);
      done();
      return;
    }
  }
}

export const photobooth: Genre = {
  id: "photobooth",
  name: "Photobooth strip",
  ko: "포토부스",
  koIdea: "작품이 사진 부스 앞에 선다 — 장면마다 플래시가 터지고, 네 컷이 슬롯에서 한 장씩 나와 현상되고, 마지막에 띠가 툭 떨어진다",
  enIdea: "The work sits for an old photobooth — a flash per scene, each frame feeds out of the slot and develops, then the strip drops",
  family: "C",
  fonts: ["oswald", "permanentMarker", "plexMono"],
  make(work, { seed, fonts }) {
    const T = LABEL[work.locale];
    const ko = work.locale === "ko";
    const SANS = fonts.oswald, MARK = fonts.permanentMarker, MONO = fonts.plexMono;
    const mk = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
    const booth = pickBooth(work, seed);
    const st = styleFor(work, booth);
    const camSide = st.slotX <= 0 ? 1 : -1;
    const { name } = splitTitle(work.title);
    const scenes = work.scenes;
    const last = scenes[scenes.length - 1];
    const shots = scenes.slice(1, last.kind === "ending" ? scenes.length - 1 : scenes.length);
    const n = shots.length;

    // ---- 사진: 색 포즈 → 인화(톤·플래시 감쇠·입자) + 현상 초반의 "어두운 톤만" 층 ----
    const photograph = (sc: FlatScene, sd: number) => {
      const c = mk(FW * FS, FH * FS), x = c.getContext("2d")!;
      x.scale(FS, FS);
      const cx: Ctx = { x, st, seed: sd, SANS, MARK, MONO, T, name, ko, mw: ko ? 700 : 400 };
      curtain(cx);
      pose(cx, sc);
      const im = x.getImageData(0, 0, c.width, c.height), d = im.data;
      const early = x.createImageData(c.width, c.height), e = early.data;
      const r = K.rng(sd + 4), Wd = c.width, Hd = c.height;
      const navy = [22, 38, 74], paper = [238, 242, 245];
      for (let i = 0; i < d.length; i += 4) {
        const px = (i / 4) % Wd, py = Math.floor(i / 4 / Wd);
        const dx = (px / Wd - 0.48) * 1.1, dy = py / Hd - 0.42;
        const fall = 1.12 - 0.62 * (dx * dx + dy * dy);
        const gr = (r() - 0.5) * 16;
        let R = d[i], G = d[i + 1], B = d[i + 2];
        const L = K.clamp(((0.3 * R + 0.59 * G + 0.11 * B) / 255) * fall);
        const Lc = K.clamp((L - 0.5) * 1.22 + 0.52);
        if (st.tone === "bw") { const v = Lc * 236 + 8 + gr; R = v - 2; G = v; B = v + 3; }
        else if (st.tone === "blue") { R = K.lerp(navy[0], paper[0], Lc) + gr; G = K.lerp(navy[1], paper[1], Lc) + gr; B = K.lerp(navy[2], paper[2], Lc) + gr; }
        else {
          // 바랜 컬러 인화: 들뜬 검정, 살짝 청록인 그림자, 따뜻한 밝은 곳, 채도는 조금 덜
          const sat = 0.82, m = (R + G + B) / 3;
          R = (m + (R - m) * sat) * fall; G = (m + (G - m) * sat) * fall; B = (m + (B - m) * sat) * fall;
          R = 18 + R * 0.9 + (Lc > 0.6 ? 6 : -4) + gr; G = 20 + G * 0.9 + gr; B = 26 + B * 0.88 + (Lc < 0.4 ? 8 : -4) + gr;
        }
        d[i] = R; d[i + 1] = G; d[i + 2] = B; d[i + 3] = 255;
        const k = K.clamp((0.42 - Lc) / 0.42);
        e[i] = R; e[i + 1] = G; e[i + 2] = B; e[i + 3] = Math.round(255 * k * k);
      }
      x.putImageData(im, 0, 0);
      const ce = mk(Wd, Hd); ce.getContext("2d")!.putImageData(early, 0, 0);
      return { full: c, early: ce };
    };
    const photos = shots.map((sc, i) => photograph(sc, seed + i * 31));

    // ---- 간판(첫 장면) ----
    const sign = (() => {
      const SWd = 1120, SHt = 560, S = 1.4;
      const c = mk((SWd + 40) * S, (SHt + 40) * S), x = c.getContext("2d")!;
      x.scale(S, S); x.translate(20, 20);
      const sg = st.sign;
      x.fillStyle = "rgba(0,0,0,0.35)"; x.fillRect(10, 14, SWd, SHt);
      x.fillStyle = sg.frame; x.beginPath(); x.roundRect(0, 0, SWd, SHt, 18); x.fill();
      x.fillStyle = sg.bg; x.beginPath(); x.roundRect(22, 22, SWd - 44, SHt - 44, 8); x.fill();
      if (sg.bulbs) {
        for (let k = 0; k < 22; k++) {
          const bx = 40 + (k * (SWd - 80)) / 21;
          for (const by of [11, SHt - 11]) {
            x.fillStyle = "rgba(0,0,0,0.25)"; x.beginPath(); x.arc(bx + 1.5, by + 1.5, 6.5, 0, Math.PI * 2); x.fill();
            x.fillStyle = "#f6f5ef"; x.beginPath(); x.arc(bx, by, 6.5, 0, Math.PI * 2); x.fill();
          }
        }
      }
      const sc = scenes[0];
      x.fillStyle = sg.sub; x.textAlign = "right";
      fit(x, name + " · " + T.photos, SANS, 500, 420, 30, 16); x.fillText(name + " · " + T.photos, SWd - 64, 82); x.textAlign = "left";
      const maxW = SWd - 140;
      if (sc.kind === "hook") {
        x.fillStyle = sg.ink; fit(x, sc.label, SANS, 500, SWd - 560, 46, 24); x.fillText(sc.label, 64, 82);
        const vs = fit(x, sc.value, SANS, 700, maxW, 290);
        x.font = K.font(vs, SANS, 700); x.fillStyle = sc.alarm ? st.alarm : sg.ink;
        x.fillText(sc.value, 58, 82 + vs * 0.98);
        x.fillStyle = sg.ink; fit(x, sc.line, SANS, 400, maxW, 44, 24); x.fillText(sc.line, 64, SHt - 62);
      } else {
        const main = sc.kind === "story" || sc.kind === "items" || sc.kind === "flow" || sc.kind === "terminal" || sc.kind === "stats" || sc.kind === "alert" || sc.kind === "ending" ? sc.line : "";
        const sub = sc.kind === "story" || sc.kind === "alert" || sc.kind === "ending" ? sc.line2 : "";
        let s = 82;
        x.font = K.font(s, SANS, 500);
        let ls = wrap(x, main, maxW);
        while (ls.length > 3 && s > 48) { s -= 4; x.font = K.font(s, SANS, 500); ls = wrap(x, main, maxW); }
        x.fillStyle = sg.ink;
        ls.forEach((l, i) => x.fillText(l, 64, 190 + i * s * 1.17));
        x.fillStyle = sg.sub; fit(x, sub, SANS, 400, maxW, 48, 24); x.fillText(sub, 64, 190 + ls.length * s * 1.17 + 30);
      }
      return { c, w: SWd + 40, h: SHt + 40 };
    })();

    // ---- 꼬리글: 부스가 띠의 위 끝에 찍는다(마지막으로 나오는 부분) ----
    const footer = (() => {
      const c = mk(SW * 2, FOOT * 2), x = c.getContext("2d")!;
      x.scale(2, 2);
      x.fillStyle = "#1b1c1f"; x.textAlign = "left";
      const nm = last.kind === "ending" ? last.name || name : name;
      let s = 56; x.font = K.font(s, SANS, 700);
      let ls = wrap(x, nm, SW - 2 * BORD);
      while (ls.length > 2 && s > 30) { s -= 4; x.font = K.font(s, SANS, 700); ls = wrap(x, nm, SW - 2 * BORD); }
      let y = 40 + s;
      ls.forEach((l) => { x.fillText(l, BORD, y); y += s * 1.04; });
      x.fillStyle = st.stamp; x.fillRect(BORD, y - s * 0.62, 70, 5); y += 22;
      x.fillStyle = "#2a2b2f"; x.font = K.font(25, SANS, 400);
      if (last.kind === "ending") for (const t0 of [last.line, last.line2]) { if (!t0) continue; for (const l of wrap(x, t0, SW - 2 * BORD).slice(0, 2)) { if (y > FOOT - 8) break; x.fillText(l, BORD, y + 8); y += 31; } }
      return c;
    })();

    const SL = FOOT + GAP + n * (FH + GAP);
    const frameY = (k: number) => FOOT + GAP + (n - 1 - k) * (FH + GAP);
    const SLOT = 190, SX = st.slotX;
    const paperC = "#f6f7f6";
    const drawStampSample = (x: CanvasRenderingContext2D, k: number) => {
      x.save(); x.translate(BORD / 2 + 1, frameY(k) + FH / 2); x.rotate(-Math.PI / 2);
      x.globalAlpha = 0.82; x.strokeStyle = st.stamp; x.fillStyle = st.stamp; x.lineWidth = 1.6;
      x.font = K.font(17, SANS, 500); x.textAlign = "center";
      const tw = x.measureText(T.sample).width;
      x.fillText(T.sample, 0, 6);
      x.strokeRect(-tw / 2 - 12, -12, tw + 24, 24);
      x.restore();
    };
    // 다 된 띠(인서트용)
    const strip = mk(SW, SL), sx = strip.getContext("2d")!;
    sx.fillStyle = paperC; sx.fillRect(0, 0, SW, SL);
    photos.forEach((p, k) => { sx.drawImage(p.full, BORD, frameY(k), FW, FH); if (shots[k].data === "sample") drawStampSample(sx, k); });
    sx.drawImage(footer, 0, 0, SW, FOOT);
    { const im = sx.getImageData(0, 0, SW, SL), d = im.data, r = K.rng(seed + 2); for (let i = 0; i < d.length; i += 4) { const v = (r() - 0.5) * 5; d[i] += v; d[i + 1] += v; d[i + 2] += v; } sx.putImageData(im, 0, 0); }
    // 나오는 중인 띠: 종이 + 꼬리글 + 도장(사진은 현상하며 그린다)
    const blank = mk(SW, SL), bx = blank.getContext("2d")!;
    bx.fillStyle = paperC; bx.fillRect(0, 0, SW, SL);
    bx.drawImage(footer, 0, 0, SW, FOOT);
    shots.forEach((sc, k) => { if (sc.data === "sample") drawStampSample(bx, k); });

    // 부스 판(고정)
    const PX0 = -800, PY0 = -760, PWd = 1600, PHd = 2400;
    const panel = mk(PWd, PHd), px = panel.getContext("2d")!;
    px.translate(-PX0, -PY0);
    px.fillStyle = st.panel; px.fillRect(PX0, PY0, PWd, PHd);
    px.fillStyle = st.panelLine;
    for (const yy of [-30, 980]) px.fillRect(PX0, yy, PWd, 4);
    px.fillRect(-790, PY0, 4, PHd); px.fillRect(786, PY0, 4, PHd);
    for (let yy = PY0 + 40; yy < PY0 + PHd; yy += 160) for (const xx of [-770, 770]) {
      px.fillStyle = "rgba(0,0,0,0.25)"; px.beginPath(); px.arc(xx + 2, yy + 2, 7, 0, Math.PI * 2); px.fill();
      px.fillStyle = st.rivet; px.beginPath(); px.arc(xx, yy, 7, 0, Math.PI * 2); px.fill();
    }
    px.fillStyle = "rgba(0,0,0,0.3)"; px.beginPath(); px.roundRect(SX - SW / 2 - 46, SLOT - 44, SW + 92, 78, 14); px.fill();
    px.fillStyle = "#c7ccd1"; px.beginPath(); px.roundRect(SX - SW / 2 - 50, SLOT - 50, SW + 100, 78, 14); px.fill();
    px.fillStyle = "#e9ecee"; px.fillRect(SX - SW / 2 - 40, SLOT - 44, SW + 80, 6);
    px.fillStyle = "#0b0c0d"; px.beginPath(); px.roundRect(SX - SW / 2 - 14, SLOT - 18, SW + 28, 18, 6); px.fill();
    const plate = (x0: number, y0: number, w: number, lines: string[], size: number) => {
      const h = 36 + lines.length * size * 1.25;
      px.fillStyle = "rgba(0,0,0,0.3)"; px.fillRect(x0 + 5, y0 + 6, w, h);
      px.fillStyle = st.plate; px.fillRect(x0, y0, w, h);
      px.fillStyle = st.plateInk; px.textAlign = "left";
      lines.forEach((l, i) => { fit(px, l, SANS, 500, w - 40, size, 14); px.fillText(l, x0 + 22, y0 + 18 + size + i * size * 1.25); });
      for (const [a, b] of [[8, 8], [w - 8, 8], [8, h - 8], [w - 8, h - 8]]) { px.fillStyle = st.rivet; px.beginPath(); px.arc(x0 + a, y0 + b, 3.5, 0, Math.PI * 2); px.fill(); }
      return h;
    };
    const plX = camSide > 0 ? SX + SW / 2 + 44 : SX - SW / 2 - 44 - 300;
    const h1 = plate(plX, SLOT + 40, 300, T.plate1, 28);
    plate(plX, SLOT + 72 + h1, 300, T.plate2, 24);

    // ---- 일정 ----
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
    let Tm = K.clamp(readOf(scenes[0]) / 20 + 0.4, 2.0, 3.0);
    const tiltAt = Tm, tiltD = 1.25;
    Tm += tiltD - 0.25;
    type Ev = { flash: number; f0: number; f1: number; d0: number; E0: number; E1: number };
    const ev: Ev[] = [];
    const starts: number[] = [0];
    // 컷 수가 많으면 각 컷의 머무름을 줄여 30초 안에 든다
    const lookScale = n > 4 ? 4 / n : 1;
    for (let k = 0; k < n; k++) {
      const flash = Tm;
      starts.push(flash);
      const f0 = Tm + 0.22, f1 = f0 + 0.95;
      const d0 = f1 - 0.3;
      const look = (K.clamp(readOf(shots[k]) / 20 + 0.5, 2.5, 3.7) + (k === n - 1 ? 0.5 : 0)) * lookScale;
      ev.push({ flash, f0, f1, d0, E0: k ? GAP + k * (FH + GAP) : 0, E1: GAP + (k + 1) * (FH + GAP) });
      Tm = d0 + Math.max(1.9, look);
    }
    const foot0 = Tm, foot1 = Tm + 0.85;
    if (last.kind === "ending") starts.push(foot0);
    const feeds = [...ev.map((e) => ({ f0: e.f0, f1: e.f1, E0: e.E0, E1: e.E1 })), { f0: foot0, f1: foot1, E0: GAP + n * (FH + GAP), E1: SL + 40 }];
    Tm = foot1 + 1.0;
    const dropAt = Tm;
    Tm += 0.5;
    const cutAt = Tm;
    const glide0 = cutAt + 0.3, glide1 = cutAt + 2.6;
    const handoffStart = cutAt + 2.1;
    const duration = handoffStart + 2.4;

    const Eat = (t: number) => {
      let E = 0;
      for (const e of feeds) {
        if (t < e.f0) break;
        const k = K.clamp((K.step(t, 24) - e.f0) / (e.f1 - e.f0));
        E = K.lerp(e.E0, e.E1, K.ease.outCubic(k) * 0.85 + k * 0.15);
      }
      return E;
    };
    const devAt = (k: number, t: number) => K.clamp((t - ev[k].d0) / 2.3);
    const flashAt = (t: number) => { let a = 0; for (let k = 0; k < n; k++) { const dt = t - ev[k].flash; if (dt >= 0 && dt < 0.5) a = Math.max(a, dt < 0.03 ? dt / 0.03 : Math.exp(-(dt - 0.03) * 13)); } return a; };

    // ---- 카메라 ----
    const signCam = { x: 0, y: -380, z: 1.3 };
    const slotCam = { x: SX + camSide * 185, y: SLOT + 236, z: 1.5 };
    const ez = K.ease.bezier(0.33, 0, 0.1, 1);
    const camAt = (t: number) => {
      if (t < tiltAt) { const p = K.ease.outCubic(K.seg(t, 0, 6)) * 0.035; return { ...signCam, z: signCam.z * (1 + p) }; }
      if (t < tiltAt + tiltD) {
        const k = ez((t - tiltAt) / tiltD), z0 = signCam.z * (1 + K.ease.outCubic(K.seg(tiltAt, 0, 6)) * 0.035);
        return { x: K.lerp(signCam.x, slotCam.x, k), y: K.lerp(signCam.y, slotCam.y, k), z: Math.exp(K.lerp(Math.log(z0), Math.log(slotCam.z), k)) };
      }
      // 사진이 현상되는 동안 천천히 다가가고, 다음 급지에서 돌아온다
      let push = 0;
      for (let k = 0; k < n; k++) if (t >= ev[k].d0) push = K.ease.outCubic(K.seg(t, ev[k].d0, 3.2)) * 0.03 * (ev[k + 1] && t > ev[k + 1].f0 ? 0 : 1);
      if (t > foot0) push = 0;
      return { x: slotCam.x, y: slotCam.y + (t > foot0 ? -K.ease.outCubic(K.seg(t, foot0, 1.2)) * 60 : 0), z: slotCam.z * (1 + push) };
    };

    const drawLiveStrip = (g: CanvasRenderingContext2D, t: number, yMax: number) => {
      const E = Eat(t);
      if (E <= 0) return;
      let off = 0, rot = 0;
      if (t > dropAt) { const dt = t - dropAt; off = 0.5 * 5200 * dt * dt; rot = dt * 0.18 * camSide; }
      g.save();
      g.beginPath(); g.rect(SX - SW, SLOT, SW * 2, 2400); g.clip();
      g.translate(SX, SLOT + E - SL + off);
      if (rot) { g.translate(0, SL); g.rotate(rot); g.translate(0, -SL); }
      g.translate(-SW / 2, 0);
      g.fillStyle = "rgba(0,0,0,0.22)"; g.fillRect(9, Math.max(0, SL - E) + 12, SW, E);
      { const a = Math.max(0, SL - E); g.drawImage(blank, 0, a, SW, SL - a, 0, a, SW, SL - a); }
      for (let k = 0; k < n; k++) {
        if (t < ev[k].f0) continue;
        const fy = frameY(k), dv = devAt(k, t);
        if (SLOT + E - SL + off + fy > yMax) continue;                // 화면 아래로 나간 컷은 그리지 않는다
        if (dv < 1) { g.fillStyle = "#e4e6e6"; g.fillRect(BORD, fy, FW, FH); }   // 아직 현상 안 된 유제: 옅은 회색
        if (dv > 0) {
          const p = photos[k];
          if (dv < 1) { g.globalAlpha = K.clamp(dv * 2.4) * 0.7; g.drawImage(p.early, BORD, fy, FW, FH); }
          g.globalAlpha = Math.pow(K.clamp((dv - 0.18) / 0.82), 1.4); g.drawImage(p.full, BORD, fy, FW, FH);
          g.globalAlpha = 1;
        }
      }
      g.restore();
    };

    return {
      duration,
      starts: work.scenes.map((_, i) => starts[i] ?? starts[starts.length - 1]),
      render(g, t) {
        if (t < cutAt) {
          g.fillStyle = st.wall; g.fillRect(0, 0, K.W, K.H);
          const cm = camAt(t);
          g.save();
          g.translate(800, 450); g.scale(cm.z, cm.z); g.translate(-cm.x, -cm.y);
          // 보이는 부분만 옮겨 그린다(판이 크다)
          const vx0 = Math.max(PX0, cm.x - 800 / cm.z - 4), vx1 = Math.min(PX0 + PWd, cm.x + 800 / cm.z + 4);
          const vy0 = Math.max(PY0, cm.y - 450 / cm.z - 4), vy1 = Math.min(PY0 + PHd, cm.y + 450 / cm.z + 4);
          if (vx1 > vx0 && vy1 > vy0) g.drawImage(panel, vx0 - PX0, vy0 - PY0, vx1 - vx0, vy1 - vy0, vx0, vy0, vx1 - vx0, vy1 - vy0);
          g.drawImage(sign.c, -sign.w / 2, -380 - sign.h / 2, sign.w, sign.h);
          drawLiveStrip(g, t, cm.y + 450 / cm.z + 10);
          g.fillStyle = "#c7ccd1"; g.fillRect(SX - SW / 2 - 24, SLOT - 2, SW + 48, 6);
          g.restore();
          // 부스 플래시: 커튼 틈으로 새어 나오는 빛, 포즈마다 한 번
          const fa = flashAt(t);
          if (fa > 0) { g.fillStyle = "rgba(250,252,255," + (0.62 * fa).toFixed(3) + ")"; g.fillRect(0, 0, K.W, K.H); }
          K.grain(g, t, 0.06, seed, 24, "overlay");
          return;
        }
        // ---- 인서트: 받침에 놓인 다 된 띠를 따라 훑는다 ----
        const ti = t - cutAt;
        g.fillStyle = st.tray; g.fillRect(0, 0, K.W, K.H);
        g.fillStyle = "rgba(255,255,255,0.035)"; for (let y = 0; y < K.H; y += 6) g.fillRect(0, y, K.W, 2);
        const k = K.ease.bezier(0.4, 0, 0.12, 1)(K.seg(t, glide0, glide1 - glide0));
        const yA = frameY(0) + FH * 0.35, yB = FOOT * 0.62;
        const z = K.lerp(0.98, 1.16, k) * (1 + K.ease.outCubic(K.seg(t, glide1, 4)) * 0.02);
        const settle = (1 - K.ease.spring(ti, 0.45, 0.25)) * 14;
        g.save();
        g.translate(800 + camSide * 170, 450 - settle); g.scale(z, z); g.rotate(st.insRot);
        g.translate(-SW / 2, -K.lerp(yA, yB, k));
        g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(-10, 14, SW, SL);
        g.drawImage(strip, 0, 0, SW, SL);
        g.restore();
        const hp = K.seg(t, handoffStart, 2.4);
        if (hp > 0) {
          const hx = camSide > 0 ? 70 : 1600 - 530;
          g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(hx + 5, 900 - 86, 460, 56);
          g.fillStyle = st.plate; g.fillRect(hx, 900 - 92, 460, 56);
          K.handoff(g, hp, { ink: st.plateInk, family: SANS, size: 28, x: hx + 22, y: 900 - 54, handle: work.handle });
        }
        K.grain(g, t, 0.05, seed, 24, "overlay");
      },
    };
  },
};
