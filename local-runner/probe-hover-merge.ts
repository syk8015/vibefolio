// 무API 프로브: 같은 요소 위 마우스 기록 합치기(script.ts hoverMergesIntoPrev·aimHoverPops, 2026-10-02).
// 실행: npx -y tsx local-runner/probe-hover-merge.ts
// 대본이 장면을 나눠 같은 요소를 연달아 가리키면, 새 장면의 첫 기록이 앞 박자에 먹혀 그 장면의
// 멈춤 시간·자막 시작 표시가 사라졌다. 새 장면이 시작됐으면 합치지도 지우지도 않는지 본다.
import { aimHoverPops, hoverMergesIntoPrev } from "./script";

let failed = 0;
function assert(name: string, cond: boolean) {
  if (cond) console.log(`  ✅ ${name}`);
  else { failed++; console.error(`  ❌ ${name}`); }
}

const hover = (selector: string, step?: number) => ({ kind: "hover", selector, ...(step ? { step } : {}) });

assert("같은 장면 안 같은 요소 호버는 합친다(조준 흔들림)", hoverMergesIntoPrev(hover("#card", 2), "#card", null));
assert("새 장면이 같은 요소를 또 가리키면 합치지 않는다", !hoverMergesIntoPrev(hover("#card", 2), "#card", 3));
assert("다른 요소는 합치지 않는다", !hoverMergesIntoPrev(hover("#card", 2), "#other", null));
assert("앞이 호버가 아니면 합치지 않는다", !hoverMergesIntoPrev({ kind: "click", selector: "#card" }, "#card", null) && !hoverMergesIntoPrev(undefined, "#card", null));

assert("누르기 직전 같은 요소 호버는 조준 — 지운다", aimHoverPops(hover("#btn"), "#btn", null));
assert("같은 장면의 조준 호버(장면 표시 있음)도 지운다", aimHoverPops(hover("#btn", 4), "#btn", null));
assert("표시 없는 조준 호버 뒤 새 장면의 누르기 — 지운다", aimHoverPops(hover("#btn"), "#btn", 5));
assert("앞 장면의 호버 박자 뒤 새 장면의 누르기 — 남긴다", !aimHoverPops(hover("#btn", 4), "#btn", 5));
assert("다른 요소의 호버는 안 지운다", !aimHoverPops(hover("#a"), "#b", null));

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
