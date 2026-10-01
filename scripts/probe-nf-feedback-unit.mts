// 외부 AI 피드백 4차 준비(2026-10-02) 순수 함수 검증 — 네트워크 없음.
// 사용: `npx -y tsx scripts/probe-nf-feedback-unit.mts`
//
// 무엇을 보나:
//  NF-20 대본 점검의 셀렉터 수가 뒤로가기·셀렉터 없는 기다리기를 따로 세나("8/8 + back 1")
//  NF-18 focus가 페이지 통째 틀(body·main·#root…)을 가리키면 짚나, 진짜 카드는 안 짚나
//  NF-11 조용히 버려지거나 잘린 대본 칸을 `demoScript.steps[i].칸` 경로로 짚나 + 거절 본문의 field
import { scriptStats, isWholePageSelector } from "../lib/demoScriptReview";
import { demoScriptNotes } from "../lib/demoScriptNotes";
import { apiError } from "../lib/apiError";
import type { DemoScript } from "../lib/demoScript";
// cli/는 레포를 import하지 않지만, 레포의 검사가 cli/를 읽는 건 괜찮다(생성기·node --check와 같은 방향).
import { formatAccepted } from "../cli/src/echo.js";

let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

// ── NF-20: 3차 회차 대본 모양(셀렉터 8 + 뒤로가기 1) ──
const third: DemoScript = {
  steps: [
    ...Array.from({ length: 8 }, (_, i) => ({ goal: `beat ${i + 1}`, selector: `#s${i}`, action: "click" as const })),
    { goal: "back", action: "navigate" as const },
  ],
};
const s3 = scriptStats(third);
ok("3차 대본: wired 9 중 back 1·pause 0", s3.wired === 9 && s3.backSteps === 1 && s3.pauseSteps === 0, JSON.stringify(s3));
const line3 = formatAccepted({ title: "t", scriptReview: { ...s3, selectors: null, film: null, hints: [] } }).find((l: string) => l.includes("script check")) ?? "";
ok("CLI 표기: selector 8/8 + back 1", line3.includes("selector 8/8 + back 1") && !line3.includes("9/9"), line3.trim());

const withPause: DemoScript = {
  steps: [
    { goal: "a", selector: "#a", action: "click" },
    { goal: "loading", action: "wait", hold: 2 },
    { goal: "chart", action: "wait", selector: "#chart" },
    { goal: "b", where: "the save button", action: "click" },
  ],
};
const sp = scriptStats(withPause);
ok("기다리기: 셀렉터 없는 것만 pause, 셀렉터 있는 것은 셀렉터 스텝", sp.pauseSteps === 1 && sp.backSteps === 0, JSON.stringify(sp));
const lineP = formatAccepted({ title: "t", scriptReview: { ...sp, selectors: null, film: null, hints: [] } }).find((l: string) => l.includes("script check")) ?? "";
ok("CLI 표기: selector 2/3 + pause 1", lineP.includes("selector 2/3 + pause 1"), lineP.trim());
const old = formatAccepted({ title: "t", scriptReview: { steps: 9, wired: 9, interactive: 6, withExpect: 9, hasSkip: true, selectors: null } }).find((l: string) => l.includes("script check")) ?? "";
ok("구버전 서버(backSteps 없음) → 예전 표기 9/9", old.includes("selector 9/9"), old.trim());

// ── NF-18: focus 통째 틀 ──
for (const sel of ["body", "main", "#root", "#__next", " BODY ", "#root>div", "[role=main]", ".card, body"]) {
  ok(`통째 틀로 본다: ${JSON.stringify(sel)}`, isWholePageSelector(sel));
}
for (const sel of ["#chart", ".card", "main .card", "body .hero", undefined]) {
  ok(`통째 틀 아님: ${JSON.stringify(sel)}`, !isWholePageSelector(sel));
}
const sf = scriptStats({
  steps: [
    { goal: "page", selector: "main", action: "focus" },
    { goal: "chart", selector: "#chart", action: "focus" },
    { goal: "body click is fine", selector: "body", action: "click" },
    { goal: "root", selector: "#root", action: "focus" },
  ],
});
ok("focusWholePage = [1, 4] (click은 안 셈)", sf.focusWholePage.join() === "1,4", JSON.stringify(sf.focusWholePage));
const warnF = formatAccepted({ title: "t", scriptReview: { ...sf, selectors: null, film: null, hints: [] } }).join("\n");
ok("CLI 경고: Steps 1, 4 focus on the whole page", warnF.includes("Steps 1, 4 focus on the whole page"), "");

// ── NF-11: 조용히 바뀐 칸의 경로 ──
const notes = demoScriptNotes({
  steps: [
    { goal: "ok", selector: "#a", action: "click" },
    { goal: "tap", selector: "#b", action: "tap" },
    { selector: "#c", action: "click" },
    { goal: "typo", selector: "#d", action: "type", value: "hello" },
    { goal: "hold", selector: "#e", action: "click", hold: 9 },
    { goal: "cap", selector: "#f", action: "click", caption: "Hello" },
    { goal: "nav", action: "navigate", to: "/settings" },
    { goal: "long", selector: "#" + "x".repeat(300), action: "click" },
  ],
  waitFor: "#x",
});
const has = (prefix: string) => notes.some((n) => n.startsWith(prefix));
ok("알 수 없는 action → steps[1].action", has('demoScript.steps[1].action: "tap"'), notes.join(" | "));
ok("goal 없음 → steps[2].goal (스텝 버림)", has("demoScript.steps[2].goal: missing"));
ok("모르는 칸 → steps[3].value", has("demoScript.steps[3].value: not a demoScript step field"));
ok("hold 9 → 4로 줄임", has("demoScript.steps[4].hold: 9 → 4"));
ok("자막이 글자 하나 → steps[5].caption", has("demoScript.steps[5].caption"));
ok("navigate는 뒤로만 → steps[6].to", has("demoScript.steps[6].to"));
ok("셀렉터 잘림 → steps[7].selector", has("demoScript.steps[7].selector: cut to"));
ok("대본 바깥 모르는 칸 → demoScript.waitFor", has("demoScript.waitFor"));
ok("멀쩡한 스텝은 말하지 않는다", !has("demoScript.steps[0]"));
ok("정상 대본 → 메모 0", demoScriptNotes(third).length === 0);
ok("steps가 배열이 아님 → 한 줄", demoScriptNotes({ steps: "click the button" })[0]?.startsWith("demoScript.steps: must be an array") ?? false);
ok("대본 없음 → 메모 0", demoScriptNotes(undefined).length === 0);
{
  const many = demoScriptNotes({ steps: Array.from({ length: 12 }, (_, i) => ({ goal: `g${i}`, selector: `#s${i}`, action: "click" })) });
  ok("11번째부터 버림 → 상한 안내", many.some((n) => n.includes("only the first 10")), many.join(" | "));
}
{
  const flood = demoScriptNotes({ steps: Array.from({ length: 20 }, () => ({ goal: "g", action: "tap" })) });
  ok("메모는 12줄까지 + '… and N more'", flood.length === 12 && flood[11].startsWith("… and"), String(flood.length));
}

// ── NF-11: 거절 본문의 field ──
{
  const body = await apiError({ status: 400, message: "m", code: "X", field: "demoAccess.note" }).json();
  ok("apiError 본문에 field", body.field === "demoAccess.note" && body.code === "X", JSON.stringify(body));
  const bare = await apiError({ status: 400, message: "m" }).json();
  ok("field 없으면 키도 없다", !("field" in bare), JSON.stringify(bare));
}

console.log(failed ? `\n${failed}건 실패` : "\nALL PASS");
process.exit(failed ? 1 : 0);
