// 무API 프로브: 대본의 기다리기(wait) 비트(2026-10-02) — 느린 앱의 결과를 필름이 놓치지 않는지.
// 실 Chrome, 합성 페이지(버튼을 누르면 1.5초 뒤 결과가 그려진다), 픽스처 서버 불필요.
//   npx -y tsx local-runner/probe-wait.ts
// 확인:
//   1. 조립(assemble): 셀렉터 wait = 실제로 기다린 뒤 wait 액션 기록 + 다음 스텝이 그 결과 위에서 조립됨
//   2. 조립: 셀렉터 없는 wait = hold초만큼 멈추는 ms 기록
//   3. 조립: 끝내 안 나타나는 셀렉터 = 실패(비전 폴백 신호) + 사유에 "never appeared"
//   4. 리플레이: wait 비트가 결과가 그려질 때까지 기다린다(기다린 시간 ≥ 1.2초)
import { launchChromium } from "./browser";
import { injectCursorOverlay, ensureCursor } from "./cursor";
import { CameraTrack } from "./camera";
import { assembleScript } from "./assemble";
import { replay } from "./replay";
import type { Script } from "./script";
import { VIEW_W, VIEW_H } from "./config";
import { normalizeDemoScript } from "../lib/demoScript";

const PAGE_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;font:16px sans-serif} #ask{position:fixed;left:80px;top:100px;width:160px;height:44px}
  #out{position:fixed;left:80px;top:200px} #more{position:fixed;left:80px;top:300px;width:160px;height:44px}
</style></head><body>
  <button id="ask">Ask</button>
  <script>
    window.__more = 0;
    document.getElementById("ask").addEventListener("click", () => {
      setTimeout(() => {
        const p = document.createElement("p"); p.id = "out"; p.textContent = "Slow answer";
        const b = document.createElement("button"); b.id = "more"; b.textContent = "More";
        b.addEventListener("click", () => { window.__more++; });
        document.body.append(p, b);
      }, 1500);
    });
  </script>
</body></html>`;

let pass = 0, fail = 0;
const check = (ok: boolean, msg: string) => { ok ? pass++ : fail++; console.log(`${ok ? "✓" : "✗"} ${msg}`); };
const norm = (v: unknown) => normalizeDemoScript(v)!;

const browser = await launchChromium();
try {
  const ctx = await browser.newContext({ viewport: { width: VIEW_W, height: VIEW_H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  // 1·2. 조립
  await page.setContent(PAGE_HTML, { waitUntil: "load" });
  const out = await assembleScript(page, norm({
    steps: [
      { goal: "질문", selector: "#ask", action: "click" },
      { goal: "답 기다리기", selector: "#out", action: "wait", hold: 2 },
      { goal: "답 아래 버튼", selector: "#more", action: "click" },
      { goal: "잠깐 멈춤", action: "wait", hold: 1.5 },
    ],
  }));
  check(out.ok, `조립 성공${out.ok ? "" : ` (${(out as { reason: string }).reason})`}`);
  if (out.ok) {
    const acts = out.script.actions;
    console.log("   actions:", acts.map((a) => a.kind).join(" → "));
    const w = acts.filter((a) => a.kind === "wait") as { selector?: string; ms?: number; holdMs?: number; step?: number }[];
    check(w[0]?.selector === "#out" && w[0].holdMs === 2000 && w[0].step === 2, "셀렉터 wait 기록(hold·장면 번호 부착)");
    check(w[1]?.selector === undefined && w[1]?.ms === 1500 && w[1].step === 4, "셀렉터 없는 wait = hold초 멈춤(ms)");
    check(acts.some((a) => a.kind === "click" && a.selector === "#more"), "기다린 결과 위의 버튼까지 조립됨");
  }

  // 3. 끝내 안 나타남 → 실패(10초 상한)
  await page.setContent(PAGE_HTML, { waitUntil: "load" });
  const t0 = Date.now();
  const bad = await assembleScript(page, norm({ steps: [{ goal: "안 오는 답", selector: "#never", action: "wait" }] }));
  check(!bad.ok && /never appeared/.test((bad as { reason: string }).reason), `안 나타나면 조립 실패 (${!bad.ok ? (bad as { reason: string }).reason : ""})`);
  check(Date.now() - t0 < 12_000, "상한 10초 안에서 포기");

  // 4. 리플레이
  await injectCursorOverlay(page);
  await page.setContent(PAGE_HTML, { waitUntil: "load" });
  await ensureCursor(page);
  const cam = new CameraTrack(Date.now(), VIEW_W, VIEW_H);
  const script: Script = {
    loginGated: false,
    actions: [
      { kind: "click", selector: "#ask", x: 160, y: 122, holdMs: 100 },
      { kind: "wait", selector: "#out", holdMs: 100 },
      { kind: "click", selector: "#more", x: 160, y: 322, holdMs: 100 },
    ],
  };
  const r0 = Date.now();
  const played = await replay(page, script, cam);
  check(played.actionsDone === 3 && played.fallbacks.length === 0, `리플레이 3비트 완주, 좌표 대체 없음 (${played.fallbacks.length})`);
  check((await page.evaluate("window.__more")) === 1, "기다린 뒤 나타난 버튼을 눌렀다");
  check(Date.now() - r0 >= 1500, `결과가 그려질 때까지 기다렸다 (${Date.now() - r0}ms)`);
} finally {
  await browser.close();
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
