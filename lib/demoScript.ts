// Nookframe Connect — demoScript: 작품을 "만든" AI가 넘겨주는 촬영 대본.
//
// demoHighlights(산문 힌트)의 구조화 승격이다. 산문은 레코더가 "그래서 어딜
// 눌러야 하는데?"를 픽셀만 보고 되추론해야 했고, 그 추론이 틀리면 첫 비트가
// 다크모드 토글 같은 껍데기로 새 나갔다(2026-08-19 Nookframe 자기촬영 실측).
// 만든 AI는 버튼 라벨·화면 흐름·기대 결과를 이미 아니까, 그걸 스텝 단위로 받아
// explore 브리핑의 등뼈로 쓴다.
//
// 신뢰 모델: 대본은 어디까지나 "제안"이다 — explore가 현재 화면에서 스텝의
// 컨트롤을 직접 확인한 뒤에만 실행하고, 하드룰(로그인/제출/삭제/파일선택 금지,
// 쓰기 mock)은 대본이 뭐라 하든 코드 집행층이 그대로 유지한다. 인제스트는
// 저장만 하고(가드 트리거 밖의 유저 콘텐츠 컬럼), 사용은 발행 시점 쿠키 인증
// trigger-demo → 로컬 워커 경로가 유일하다(demo_user_hint와 동일 채널).
//
// 세 지점(인제스트 파서·드래프트 PATCH·워커 소비)이 같은 정규화를 쓰도록 여기
// 한 곳에 둔다 — demoAccess와 같은 이유.

// explore의 스크립트 액션 어휘와 1:1이 아니다 — 이건 "의도" 수준의 어휘고,
// 실제 제스처(정확한 좌표·드래그 벡터)는 explore가 화면에서 확정한다.
export const DEMO_SCRIPT_ACTIONS = [
  "click",
  "type",
  "drag",
  "scroll",
  "hover",
  "draw",
] as const;
export type DemoScriptAction = (typeof DEMO_SCRIPT_ACTIONS)[number];

export type DemoScriptStep = {
  // 이 비트가 "무엇을 보여주는가" — 유일한 필수 필드.
  goal: string;
  // 화면에서 그 컨트롤을 찾는 법. CSS 셀렉터가 아니라 사람이 보고 찾는 말
  // (보이는 라벨·위치) — 레코더는 스크린샷을 보는 비전 모델이다.
  where?: string;
  action?: DemoScriptAction;
  // action=type일 때 입력할 내용(검색어 등).
  text?: string;
  // 하고 나면 화면에 나타나야 하는 것 — 레코더가 다음 스크린샷에서 대조해
  // "먹었는지"를 스스로 판정하는 근거(픽셀 프루닝의 상위 신호).
  expect?: string;
  // 이 비트의 결과를 몇 초 보여줄지(0.5~4초 클램프). 없으면 리플레이 기본
  // 페이싱(HOLD_MS). 만든 AI가 "여긴 천천히"를 지정하는 채널.
  hold?: number;
};

export type DemoScript = {
  // 중요한 순서대로 — 필름은 34초 캡에서 뒤부터 잘리므로 순서가 곧 우선순위다.
  steps: DemoScriptStep[];
  // 이 제품 고유 기능이 아니라서 비트를 쓰면 안 되는 것들(다크모드 토글 등).
  skip?: string[];
  // 투어 전 준비 한 줄(하드룰 안에서만 — read-only는 그대로).
  prep?: string;
};

// 상한: 캡을 다 채워도 jsonb가 DB shape check(16KB)에 여유 있게 들어가는 크기.
// 필름이 34초라 10스텝 이상은 어차피 못 싣는다.
export const DEMO_SCRIPT_MAX_STEPS = 10;
export const DEMO_SCRIPT_GOAL_MAX = 120;
export const DEMO_SCRIPT_WHERE_MAX = 120;
export const DEMO_SCRIPT_TEXT_MAX = 60;
export const DEMO_SCRIPT_EXPECT_MAX = 120;
export const DEMO_SCRIPT_SKIP_MAX = 8;
export const DEMO_SCRIPT_SKIP_ENTRY_MAX = 80;
export const DEMO_SCRIPT_PREP_MAX = 300;
export const DEMO_SCRIPT_HOLD_MIN = 0.5;
export const DEMO_SCRIPT_HOLD_MAX = 4;

// 제어문자 제거(개행 포함 — 스텝 필드는 전부 한 줄 값) + trim + 상한.
function clean(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normStep(raw: unknown): DemoScriptStep | null {
  // 문자열 스텝 허용: "다음 작품 버튼으로 작품 전환" → { goal }. AI 호출자가
  // 형식을 단순화해 보내는 흔한 이탈이라 조용히 버리는 것보다 받는 게 낫다.
  if (typeof raw === "string") {
    const goal = clean(raw, DEMO_SCRIPT_GOAL_MAX);
    return goal ? { goal } : null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const goal = clean(r.goal ?? r.what, DEMO_SCRIPT_GOAL_MAX);
  if (!goal) return null; // goal 없는 스텝은 비트가 못 된다
  const step: DemoScriptStep = { goal };
  const where = clean(r.where ?? r.target, DEMO_SCRIPT_WHERE_MAX);
  if (where) step.where = where;
  const action = clean(r.action, 20).toLowerCase();
  if ((DEMO_SCRIPT_ACTIONS as readonly string[]).includes(action)) {
    step.action = action as DemoScriptAction;
  }
  const text = clean(r.text, DEMO_SCRIPT_TEXT_MAX);
  if (text) step.text = text;
  const expect = clean(r.expect ?? r.result, DEMO_SCRIPT_EXPECT_MAX);
  if (expect) step.expect = expect;
  // hold: 숫자 또는 "2s" 같은 숫자 문자열 허용, 0.5~4초 클램프(0.1 단위).
  const holdRaw = typeof r.hold === "number" ? r.hold : parseFloat(String(r.hold ?? ""));
  if (Number.isFinite(holdRaw) && holdRaw > 0) {
    step.hold = Math.round(
      Math.min(DEMO_SCRIPT_HOLD_MAX, Math.max(DEMO_SCRIPT_HOLD_MIN, holdRaw)) * 10,
    ) / 10;
  }
  return step;
}

// Shape-only 정규화(네트워크 없음): unknown → 저장 가능한 DemoScript | null.
// 인제스트의 "틀린 값은 조용히 버리고 에코로 알린다" 설계를 따른다 — 스텝 단위로
// 살아남고, 전부 죽으면 null. 받는 형태:
//   { steps: [...], skip?: [...], prep?: "..." }  (정식)
//   [ ... ]                                        (steps만 — 흔한 축약)
// 스텝에 order 숫자가 있으면 그걸로 정렬한다(없으면 배열 순서 유지).
export function normalizeDemoScript(v: unknown): DemoScript | null {
  if (!v) return null;
  let rawSteps: unknown[];
  let rawSkip: unknown;
  let rawPrep: unknown;
  if (Array.isArray(v)) {
    rawSteps = v;
    rawSkip = undefined;
    rawPrep = undefined;
  } else if (typeof v === "object") {
    const r = v as Record<string, unknown>;
    rawSteps = Array.isArray(r.steps) ? r.steps : [];
    rawSkip = r.skip;
    rawPrep = r.prep;
  } else {
    return null;
  }

  const withOrder = rawSteps.map((s, i) => {
    const ord =
      s && typeof s === "object" && !Array.isArray(s) &&
      Number.isFinite(Number((s as Record<string, unknown>).order))
        ? Number((s as Record<string, unknown>).order)
        : null;
    return { s, i, ord };
  });
  // 전 스텝이 order를 달고 왔을 때만 정렬 — 일부만 있으면 배열 순서가 진실.
  if (withOrder.length && withOrder.every((w) => w.ord !== null)) {
    withOrder.sort((a, b) => (a.ord! - b.ord!) || (a.i - b.i));
  }

  const steps: DemoScriptStep[] = [];
  for (const w of withOrder) {
    const step = normStep(w.s);
    if (step) steps.push(step);
    if (steps.length >= DEMO_SCRIPT_MAX_STEPS) break;
  }
  if (!steps.length) return null;

  const out: DemoScript = { steps };
  if (Array.isArray(rawSkip)) {
    const skip = (rawSkip as unknown[])
      .map((s) => clean(s, DEMO_SCRIPT_SKIP_ENTRY_MAX))
      .filter(Boolean)
      .slice(0, DEMO_SCRIPT_SKIP_MAX);
    if (skip.length) out.skip = skip;
  }
  const prep = clean(rawPrep, DEMO_SCRIPT_PREP_MAX);
  if (prep) out.prep = prep;
  return out;
}
