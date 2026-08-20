// 무API 프로브: 스크롤 더듬기 병합(coalesceScrolls) + focus 카메라 무브 산식 +
// 브리핑의 focus 스텝 렌더. 실행: npx -y tsx local-runner/probe-focus-coalesce.ts
// 2026-08-20 사용자 판정("탐색의 스크롤 시행착오가 필름에 그대로 남는다 · 강조는
// 커서가 아니라 크롭이어야 한다")의 수리를 촬영 없이(과금 0) 회귀 가드한다.
import { coalesceScrolls, type ScriptAction } from "./script";
import { CameraTrack } from "./camera";
import { buildScriptBrief } from "./explore";
import { normalizeDemoScript } from "../lib/demoScript";
import { ZOOM_MAX, ZOOM_FLOOR } from "./config";

let failed = 0;
function assert(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✅ ${name}`);
  else {
    failed++;
    console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ── coalesceScrolls ───────────────────────────────────────────────────────────
console.log("[1] 스크롤 병합");

// 실제 v2 테이크의 더듬기 패턴: 300 → -100 → 800 → 400 → 400 (스텝 hold는 첫
// 스크롤에만). 한 그룹 = 순이동 1800 하나로.
const fumble: ScriptAction[] = [
  { kind: "hover", selector: "h1", x: 640, y: 360 },
  { kind: "scroll", dy: 300, holdMs: 3000 },
  { kind: "scroll", dy: -100 },
  { kind: "scroll", dy: 800 },
  { kind: "scroll", dy: 400 },
  { kind: "scroll", dy: 400 },
  { kind: "click", selector: "a", x: 600, y: 700 },
];
const merged = coalesceScrolls(fumble);
assert("5개 스크롤 → 1개", merged.filter((a) => a.kind === "scroll").length === 1);
const g = merged.find((a) => a.kind === "scroll") as { dy: number; holdMs?: number };
assert("순이동 보존(1800)", g.dy === 1800, `dy=${g.dy}`);
assert("그룹 첫 스크롤의 holdMs 보존", g.holdMs === 3000);
assert("스크롤 아닌 액션은 그대로", merged.length === 3 && merged[0].kind === "hover" && merged[2].kind === "click");

// holdMs가 붙은 스크롤은 새 그룹을 연다(스텝 경계 = 병합 금지).
const twoSteps: ScriptAction[] = [
  { kind: "scroll", dy: 500, holdMs: 2000 },
  { kind: "scroll", dy: 200 },
  { kind: "scroll", dy: 600, holdMs: 4000 },
  { kind: "scroll", dy: 100 },
];
const kept = coalesceScrolls(twoSteps);
assert("스텝 경계(holdMs)에서 그룹 분리", kept.length === 2);
assert(
  "각 그룹의 순이동·hold 유지",
  (kept[0] as { dy: number }).dy === 700 && (kept[0] as { holdMs?: number }).holdMs === 2000 &&
    (kept[1] as { dy: number }).dy === 700 && (kept[1] as { holdMs?: number }).holdMs === 4000,
);

// 내렸다 도로 올린 워시(순이동 ~0)는 통째로 사라진다 — 단 비트(hold)면 남는다.
const wash = coalesceScrolls([
  { kind: "scroll", dy: 300 },
  { kind: "scroll", dy: -300 },
  { kind: "click", selector: "b", x: 1, y: 1 },
]);
assert("순이동 0 워시는 드랍", wash.length === 1 && wash[0].kind === "click");
const washHold = coalesceScrolls([
  { kind: "scroll", dy: 300, holdMs: 1500 },
  { kind: "scroll", dy: -300 },
]);
assert("워시라도 hold 비트면 잔류(멈춤 비트)", washHold.length === 1 && (washHold[0] as { dy: number }).dy === 0);

// 가로(dx)도 순이동으로 합산된다.
const horiz = coalesceScrolls([
  { kind: "scroll", dy: 0, dx: 300 },
  { kind: "scroll", dy: 0, dx: 200 },
]);
assert("dx 합산", (horiz[0] as { dx?: number }).dx === 500);

// ── CameraTrack.focusRegion ───────────────────────────────────────────────────
console.log("[2] focus 카메라 무브");

const cam = new CameraTrack(Date.now(), 1280, 720);
cam.focusRegion({ x: 400, y: 300 }, 640, 360, 700);
const ev = cam.events[cam.events.length - 1];
// fit = min(1280/640, 720/360) * 0.85 = 2*0.85 = 1.7 (ZOOM_MAX=2.0 이내)
assert("영역 맞춤 줌(640×360 → 1.7×)", Math.abs(ev.toZoom - 1.7) < 1e-9, `z=${ev.toZoom}`);
assert("초점 = 영역 중심", ev.toFocalX === 400 && ev.toFocalY === 300);
assert("1×에서 출발(초점=화면 중앙)", ev.fromZoom === 1 && ev.fromFocalX === 640 && ev.fromFocalY === 360);
assert("focus 후 줌 상태 유지(hold-zoom)", cam.isZoomed());

// 이미 줌인 상태에서 focus → 현재 초점에서 새 영역으로 단일 블렌드 무브.
const ev2Before = cam.events.length;
cam.focusRegion({ x: 900, y: 500 }, 200, 150, 700);
const ev2 = cam.events[cam.events.length - 1];
assert("줌 중 focus는 이벤트 1개(블렌드)", cam.events.length === ev2Before + 1);
assert("이전 초점에서 출발", ev2.fromFocalX === 400 && ev2.fromFocalY === 300);
assert(`작은 영역도 ZOOM_MAX(${ZOOM_MAX}) 캡`, ev2.toZoom === ZOOM_MAX, `z=${ev2.toZoom}`);

// 거대 영역(화면 전체급)은 ZOOM_FLOOR 밑으로 못 내려간다.
const cam2 = new CameraTrack(Date.now(), 1280, 720);
cam2.focusRegion({ x: 640, y: 360 }, 1280, 720, 700);
assert(
  `전체 화면 영역은 ZOOM_FLOOR(${ZOOM_FLOOR})로 클램프`,
  cam2.events[0].toZoom === ZOOM_FLOOR,
  `z=${cam2.events[0].toZoom}`,
);

// ── 대본 focus 스텝 → 브리핑 렌더 ─────────────────────────────────────────────
console.log("[3] 브리핑 렌더");

const script = normalizeDemoScript({
  steps: [{ goal: "무대 감상", where: "왼쪽 큰 무대", action: "focus", hold: 3 }],
});
assert("focus 액션이 정규화를 통과", script?.steps[0].action === "focus");
const brief = buildScriptBrief(script!);
assert("브리핑이 focus_region 툴을 지시", brief.includes("focus_region"));
assert("커서 금지 문구 동반", brief.includes("do NOT click it or park the cursor"));

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
