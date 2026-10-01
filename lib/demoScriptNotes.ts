// 촬영 대본의 "조용히 바뀐 칸"을 경로로 짚기(2026-10-02, 외부 AI 피드백 NF-11).
//
// 왜 있나: normalizeDemoScript는 틀린 값을 400으로 막지 않고 조용히 버리거나 자른다
// (인제스트의 원칙 — 스텝 하나가 틀렸다고 발행 전체를 되돌리지 않는다). 그런데 에코가
// 알려주는 건 "살아남은 스텝 수"뿐이라, `action: "tap"`이 버려져 그 장면이 비싼 비전
// 경로로 떨어져도 올린 AI는 어느 칸이 문제였는지 몰랐다. 여기서 원본과 정규화 결과를
// 칸 단위로 대 보고 `demoScript.steps[3].action: …`처럼 경로를 붙여 돌려준다.
//
// 판정을 따로 만들지 않는다: 스텝 하나씩 normalizeDemoScript에 다시 태워 그 결과와
// 원본을 비교할 뿐이다 — 규칙(허용 액션·글자 상한·hold 범위)이 두 벌이 되면 이 설명이
// 실제 저장과 어긋난다. 읽는 쪽이 AI라 문장은 영어 고정(CLI·MCP 출력과 같은 규칙).
// 경로의 번호는 보낸 JSON 배열 그대로 0부터다.

import { DEMO_SCRIPT_ACTIONS, DEMO_SCRIPT_MAX_STEPS, normalizeDemoScript, type DemoScriptStep } from "./demoScript";

// 정규화가 읽는 스텝 키(별칭 포함). 이 밖의 키는 저장되지 않는다 — "waitFor"·"value"·
// "selectors"처럼 그럴듯한 오타가 조용히 사라지는 게 가장 흔한 손실이다.
const STEP_KEYS = new Set([
  "goal", "what", "where", "target", "selector", "action", "toSelector", "to",
  "text", "expect", "result", "hold", "caption", "captions", "order",
]);
const SCRIPT_KEYS = new Set(["steps", "skip", "prep"]);
const MAX_NOTES = 12;

const squash = (v: unknown) => (typeof v === "string" ? v.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim() : "");

function stepNotes(raw: unknown, path: string, out: string[]): boolean {
  if (typeof raw === "string") {
    if (!squash(raw)) out.push(`${path}: empty — step dropped.`);
    else out.push(`${path}: a plain string becomes a goal-only step (no action, no selector) — the robot has to guess it from the screen. Send { goal, action, selector, … }.`);
    return !!squash(raw);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    out.push(`${path}: must be an object { goal, action, selector, … } — step dropped.`);
    return false;
  }
  const r = raw as Record<string, unknown>;
  const norm: DemoScriptStep | undefined = normalizeDemoScript([raw])?.steps[0];
  if (!norm) {
    out.push(`${path}.goal: missing — a step without a goal is dropped.`);
    return false;
  }
  for (const key of Object.keys(r)) {
    if (!STEP_KEYS.has(key)) out.push(`${path}.${key}: not a demoScript step field — ignored.`);
  }
  if (r.action !== undefined && r.action !== "" && !norm.action) {
    out.push(`${path}.action: ${JSON.stringify(r.action)} is not one of ${DEMO_SCRIPT_ACTIONS.join("|")} — ignored, so this step is filmed by guessing from the screen.`);
  }
  if (norm.action === "navigate" && r.to !== undefined && r.to !== "back") {
    out.push(`${path}.to: navigate only goes back (to: "back") — ${JSON.stringify(r.to)} is ignored.`);
  }
  // 글자 상한에 잘린 칸 — 셀렉터가 잘리면 아예 다른 요소를 가리키게 된다.
  const trimmed: Array<[string, unknown, string | undefined]> = [
    ["goal", r.goal ?? r.what, norm.goal],
    ["where", r.where ?? r.target, norm.where],
    ["selector", r.selector, norm.selector],
    ["text", r.text, norm.text],
    ["expect", r.expect ?? r.result, norm.expect],
  ];
  for (const [key, before, after] of trimmed) {
    const b = squash(before);
    if (b && after !== undefined && after.length < b.length) {
      out.push(`${path}.${key}: cut to ${after.length} characters${key === "selector" ? " — the cut selector may not match anything" : ""}.`);
    }
  }
  if (r.hold !== undefined) {
    const n = typeof r.hold === "number" ? r.hold : parseFloat(String(r.hold));
    if (norm.hold === undefined) out.push(`${path}.hold: ${JSON.stringify(r.hold)} is not a positive number of seconds — ignored.`);
    else if (Number.isFinite(n) && Math.abs(n - norm.hold) > 0.05) out.push(`${path}.hold: ${n} → ${norm.hold} (allowed 0.5–4 seconds).`);
  }
  const cap = r.caption ?? r.captions;
  if (cap !== undefined && !norm.caption) {
    out.push(`${path}.caption: must be { "en": "…" } and/or { "ko": "…" } — ignored.`);
  }
  return true;
}

/** 원본 demoScript → 조용히 버려지거나 바뀐 칸들(경로 + 한 문장). 없으면 빈 배열. */
export function demoScriptNotes(raw: unknown): string[] {
  if (raw === undefined || raw === null || raw === "") return [];
  const out: string[] = [];
  let rawSteps: unknown[];
  let base = "demoScript.steps";
  if (Array.isArray(raw)) {
    rawSteps = raw;
    base = "demoScript";
  } else if (typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    for (const key of Object.keys(r)) {
      if (!SCRIPT_KEYS.has(key)) out.push(`demoScript.${key}: not a demoScript field (steps, skip, prep) — ignored.`);
    }
    if (!Array.isArray(r.steps)) {
      out.push("demoScript.steps: must be an array of steps — nothing was kept.");
      return out.slice(0, MAX_NOTES);
    }
    rawSteps = r.steps;
    if (r.skip !== undefined && !Array.isArray(r.skip)) out.push("demoScript.skip: must be an array of strings — ignored.");
  } else {
    return ["demoScript: must be { steps: [ … ] } — ignored."];
  }
  let kept = 0;
  rawSteps.forEach((s, i) => {
    if (stepNotes(s, `${base}[${i}]`, out)) kept++;
  });
  if (kept > DEMO_SCRIPT_MAX_STEPS) {
    out.push(`demoScript.steps: ${kept} steps — only the first ${DEMO_SCRIPT_MAX_STEPS} are kept (the film is ~30 seconds).`);
  }
  return out.length > MAX_NOTES
    ? [...out.slice(0, MAX_NOTES - 1), `… and ${out.length - (MAX_NOTES - 1)} more.`]
    : out;
}
