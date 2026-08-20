// 무API 프로브: 직배선 조립기(assemble.ts) — 셀렉터 대본이 비전 없이 Script가
// 되는지, 실패가 코드 채점(폴백 신호)으로 떨어지는지. 실행:
//   npm run demo:fixtures &   (nookgym 픽스처 :5050)
//   npx -y tsx local-runner/probe-assemble.ts
// probe-landing과 같은 자리(실 Chrome·API 0원). 2026-08-20 직배선 트랙의 회귀 가드.
import { launchChromium } from "./browser";
import { assembleScript, isFullyWired } from "./assemble";
import { normalizeDemoScript } from "../lib/demoScript";

const URL = "http://localhost:5050/nookgym.html";
let pass = 0, fail = 0;
const check = (ok: boolean, msg: string) => { ok ? pass++ : fail++; console.log(`${ok ? "✓" : "✗"} ${msg}`); };

// ── isFullyWired 게이트 ───────────────────────────────────────────────────────
const norm = (v: unknown) => normalizeDemoScript(v)!;
check(
  isFullyWired(norm({ steps: [{ goal: "a", selector: "#x", action: "click" }] })),
  "셀렉터+action=직배선 대상",
);
check(!isFullyWired(norm({ steps: [{ goal: "a", action: "click" }] })), "셀렉터 없는 스텝=비전 폴백");
check(!isFullyWired(norm({ steps: [{ goal: "a", selector: "#x" }] })), "action 없는 스텝=비전 폴백");
check(
  !isFullyWired(norm({ steps: [{ goal: "a", selector: "#x", action: "drag" }] })),
  "drag에 toSelector 없으면 비전 폴백",
);
check(
  !isFullyWired(norm({ steps: [{ goal: "a", selector: "#x", action: "draw" }] })),
  "draw는 항상 비전(캔버스 궤적)",
);
check(
  !isFullyWired(norm({ steps: [{ goal: "a", selector: "#x", action: "type" }] })),
  "type에 text 없으면 비전 폴백",
);

// ── 실제 조립: nookgym 픽스처 ─────────────────────────────────────────────────
const browser = await launchChromium();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: "en-US" });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: "networkidle" });

const script = norm({
  steps: [
    { goal: "포커스 슬라이더 강조", selector: '[data-testid="focus-slider"]', action: "focus", hold: 3 },
    // 보드는 페이지 하단 — 조립기가 암시 스크롤을 기록해야 좌표가 성립한다.
    { goal: "보드로 스크롤", selector: "#board", action: "scroll", hold: 1 },
    { goal: "칸반 카드 드래그", selector: '[data-testid="col-todo"] .card', toSelector: '[data-testid="col-doing"]', action: "drag" },
    { goal: "할 일 추가 버튼", selector: '[data-testid="add-task-btn"]', action: "click", hold: 2 },
    // 마지막 스텝(입력값이 걸어본 흔적으로 남는다 — add-task 클릭은 검색을 리셋함).
    { goal: "검색창에 입력", selector: '[data-testid="search-input"]', action: "type", text: "design", hold: 2 },
  ],
});
check(isFullyWired(script), "픽스처 대본=완전 직배선");

const out = await assembleScript(page, script);
check(out.ok, `조립 성공${out.ok ? "" : ` (사유: ${(out as { reason: string }).reason})`}`);
if (out.ok) {
  const acts = out.script.actions;
  console.log("   actions:", acts.map((a) => a.kind).join(" → "));
  const type0 = acts.find((a) => a.kind === "type") as { text: string; holdMs?: number; x?: number };
  check(type0?.text === "design" && type0.holdMs === 2000, "type 액션에 text·hold 부착");
  const focus0 = acts.find((a) => a.kind === "focus") as { w: number; h: number; holdMs?: number };
  check(!!focus0 && focus0.w >= 60 && focus0.holdMs === 3000, `focus 박스=요소 실측(${focus0?.w}×${focus0?.h})`);
  const scrolls = acts.filter((a) => a.kind === "scroll") as { dy: number; holdMs?: number }[];
  check(scrolls.length >= 1 && scrolls.some((s) => Math.abs(s.dy) > 50 || s.holdMs !== undefined),
    `하단 요소 앞에 스크롤 기록(${scrolls.map((s) => s.dy).join(",")})`);
  const drag0 = acts.find((a) => a.kind === "drag") as { x: number; y: number; toX: number; toY: number };
  check(!!drag0 && Math.abs(drag0.toX - drag0.x) > 40, "drag 출발→도착 벡터 실측");
  const click0 = acts.find((a) => a.kind === "click") as { holdMs?: number };
  check(click0?.holdMs === 2000, "click 스텝 hold가 클릭 액션에(암시 스크롤 아님)");
  check(/0 vision calls/.test(out.script.notes ?? ""), "notes에 무비전 조립 명시");
  // 조립 워크가 실제 상태를 진행시켰는지 — 검색 입력값이 남아 있어야 한다.
  check((await page.locator('[data-testid="search-input"]').inputValue()) === "design", "조립 워크가 라이브 상태 진행");
}

// ── 실패 = 코드 채점 → 폴백 신호 ──────────────────────────────────────────────
await page.goto(URL, { waitUntil: "networkidle" });
const broken = norm({
  steps: [
    { goal: "있는 버튼", selector: '[data-testid="add-task-btn"]', action: "click" },
    { goal: "없는 요소", selector: "#no-such-element-xyz", action: "click" },
  ],
});
const bad = await assembleScript(page, broken);
check(!bad.ok, "빗나간 셀렉터=조립 실패(ok=false)");
check(!bad.ok && /step 2/.test((bad as { reason: string }).reason), `실패 스텝을 이름으로 짚음 (${!bad.ok ? (bad as { reason: string }).reason : ""})`);

await browser.close();
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
