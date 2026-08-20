// 직배선 조립기 (2026-08-20): 만든 AI가 준 셀렉터 대본을 비전 모델 없이 Script로.
//
// explore(비전 탐색)의 존재 이유는 "사람 말로 된 where를 화면에서 좌표로 바꾸는
// 것"이었다. 만든 AI는 코드를 아니까 셀렉터를 직접 줄 수 있고, 그러면 좌표·확대
// 박스·스크롤 착지는 추측이 아니라 DOM 측정값이 된다 — 프레이밍 정밀도와 API
// 비용(편당 ~$0.16 → ~$0)의 근본 해결이 같은 지점에 있다.
//
// 신뢰 모델: 셀렉터는 UNTRUSTED 유저 데이터다. 여기서 하는 것은 그들 자신의
// 앱 위에서 클릭/입력을 조립하는 것뿐이고, 집행층(safety.ts write-mock ·
// netguard 사설망 차단 · browser.ts 파일피커 무력화)은 컨텍스트에 이미 깔려
// 있어 대본이 뭐라 하든 유지된다 — 비전 경로의 replay와 같은 신뢰 경계.
//
// 게이트("자기보고 말고 코드 채점"): AI 모델 수준을 물어보는 대신, 조립이 실제로
// 걸어보며 셀렉터가 잡히는지 채점한다. 하나라도 못 잡으면 ok=false → 파이프라인이
// 비전 탐색으로 폴백(우리 토큰이 비상장치).
import type { Page } from "playwright-core";
import type { DemoScript, DemoScriptStep } from "../lib/demoScript";
import type { Script, ScriptAction } from "./script";
import { VIEW_H } from "./config";
import { sleep } from "./util";

// 스텝이 직배선 가능하려면: 셀렉터 + 명시적 action. draw(캔버스 궤적)는 좌표
// 창작이 필요해 비전 전용. drag는 도착지 셀렉터까지 있어야 결정론이 된다.
export function isFullyWired(script: DemoScript): boolean {
  return script.steps.every((st) => {
    if (!st.selector || !st.action) return false;
    if (st.action === "draw") return false;
    if (st.action === "drag" && !st.toSelector) return false;
    if (st.action === "type" && !st.text) return false;
    return true;
  });
}

export type AssembleOutcome =
  | { ok: true; script: Script & { interactions: number } }
  | { ok: false; reason: string };

// 요소를 화면 세로 중앙 부근으로 가져오는 스크롤을 "기록되는 액션"으로 만든다 —
// 조립 화면과 리플레이 화면이 같은 스크롤 경로를 밟아야 좌표가 성립한다.
// scrollIntoView(block:center)는 즉시형이라 측정이 정확하고, 리플레이의 휠
// smoothScroll이 같은 순이동을 완만하게 재현한다.
async function ensureCentered(
  page: Page,
  sel: string,
  actions: ScriptAction[],
): Promise<{ x: number; y: number; w: number; h: number }> {
  const loc = page.locator(sel).first();
  await loc.waitFor({ state: "visible", timeout: 4000 });
  let box = await loc.boundingBox();
  if (!box) throw new Error("element has no box");
  const cy = box.y + box.height / 2;
  const comfortable = cy >= 90 && cy <= VIEW_H - 90 && box.y >= 0 && box.y + box.height <= VIEW_H;
  if (!comfortable) {
    const before = (await page.evaluate("window.scrollY")) as number;
    await loc.evaluate((el) => el.scrollIntoView({ block: "center", inline: "nearest" }));
    await sleep(120); // 레이아웃 안정(고정 헤더 보정 등)
    const after = (await page.evaluate("window.scrollY")) as number;
    const dy = Math.round(after - before);
    if (dy) actions.push({ kind: "scroll", dy });
    box = await loc.boundingBox();
    if (!box) throw new Error("element lost its box after scroll");
  }
  return {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
    w: Math.round(box.width),
    h: Math.round(box.height),
  };
}

function fail(i: number, st: DemoScriptStep, why: string): AssembleOutcome {
  return { ok: false, reason: `step ${i + 1} "${st.goal.slice(0, 40)}": ${why}` };
}

// 대본을 위에서부터 실제로 걸어보며(상태 의존 — 앞 스텝의 클릭이 다음 스텝의
// 화면을 만든다) 액션·좌표를 채집한다. 첫 실패에서 멈춘다: 실패 스텝 뒤의
// 셀렉터는 그 스텝의 효과 위에서만 존재할 수 있어 채점이 무의미하다.
export async function assembleScript(
  page: Page,
  script: DemoScript,
): Promise<AssembleOutcome> {
  const actions: ScriptAction[] = [];
  let interactions = 0;

  for (let i = 0; i < script.steps.length; i++) {
    const st = script.steps[i];
    const sel = st.selector!;
    const holdMs = st.hold ? Math.round(st.hold * 1000) : undefined;
    const label = st.goal.slice(0, 40);
    let pos: { x: number; y: number; w: number; h: number };
    try {
      pos = await ensureCentered(page, sel, actions);
    } catch (e) {
      return fail(i, st, e instanceof Error ? e.message : String(e));
    }

    try {
      switch (st.action) {
        case "scroll": {
          // ensureCentered가 이미 스크롤을 기록했다. 스텝 hold는 그 스크롤에 —
          // 이동이 없었다면(이미 화면 안) 멈춤 비트(dy=0)로 남긴다.
          const last = actions[actions.length - 1];
          if (last?.kind === "scroll" && last.holdMs === undefined) {
            if (holdMs) last.holdMs = holdMs;
          } else {
            actions.push({ kind: "scroll", dy: 0, ...(holdMs ? { holdMs } : {}) });
          }
          break;
        }
        case "focus": {
          actions.push({
            kind: "focus", selector: sel, x: pos.x, y: pos.y, w: pos.w, h: pos.h,
            label, ...(holdMs ? { holdMs } : {}),
          });
          break;
        }
        case "click": {
          actions.push({
            kind: "click", selector: sel, x: pos.x, y: pos.y, label,
            ...(holdMs ? { holdMs } : {}),
          });
          interactions++;
          await page.mouse.click(pos.x, pos.y);
          // 클릭 효과(모달·전환·내비게이션)가 다음 스텝의 무대가 된다.
          await sleep(700);
          await page.waitForLoadState("domcontentloaded").catch(() => {});
          break;
        }
        case "hover": {
          actions.push({
            kind: "hover", selector: sel, x: pos.x, y: pos.y,
            ...(holdMs ? { holdMs } : {}),
          });
          await page.mouse.move(pos.x, pos.y);
          await sleep(250);
          break;
        }
        case "type": {
          actions.push({
            kind: "type", selector: sel, text: st.text!, x: pos.x, y: pos.y, label,
            ...(holdMs ? { holdMs } : {}),
          });
          interactions++;
          await page.mouse.click(pos.x, pos.y);
          await page.keyboard.type(st.text!, { delay: 20 });
          await sleep(400);
          break;
        }
        case "drag": {
          const toLoc = page.locator(st.toSelector!).first();
          await toLoc.waitFor({ state: "visible", timeout: 4000 });
          const toBox = await toLoc.boundingBox();
          if (!toBox) return fail(i, st, `drop target has no box (${st.toSelector})`);
          const toY = toBox.y + toBox.height / 2;
          if (toY < 0 || toY > VIEW_H)
            return fail(i, st, "drop target off-screen after centering the source — vision fallback");
          const to = {
            x: Math.round(toBox.x + toBox.width / 2),
            y: Math.round(toY),
          };
          actions.push({
            kind: "drag", selector: sel, x: pos.x, y: pos.y, toX: to.x, toY: to.y, label,
            ...(holdMs ? { holdMs } : {}),
          });
          interactions++;
          // 조립 화면의 상태도 진행시킨다(간이 드래그 — 연출은 리플레이 몫).
          await page.mouse.move(pos.x, pos.y);
          await page.mouse.down();
          for (let s = 1; s <= 8; s++) {
            await page.mouse.move(
              pos.x + ((to.x - pos.x) * s) / 8,
              pos.y + ((to.y - pos.y) * s) / 8,
            );
            await sleep(30);
          }
          await page.mouse.up();
          await sleep(400);
          break;
        }
        default:
          return fail(i, st, `unsupported wired action "${st.action}"`);
      }
    } catch (e) {
      return fail(i, st, e instanceof Error ? e.message : String(e));
    }
  }

  if (!actions.length) return { ok: false, reason: "no actions assembled" };
  return {
    ok: true,
    script: {
      actions,
      loginGated: false,
      notes:
        `assembled from creator selectors — ${script.steps.length}/${script.steps.length} steps wired, ` +
        `${interactions} interactions, 0 vision calls`,
      interactions,
    },
  };
}
