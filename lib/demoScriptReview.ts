// Nookframe Connect — 촬영 대본 점검표(2026-09-04).
//
// 왜 있나: 같은 프롬프트를 줘도 AI마다 대본 품질이 다르다(09-03 실측 — 소넷5는
// 6스텝 중 조작 1개·라이브 확인 0회, 오퍼스5·페이블5.1은 8스텝·셀렉터 실측).
// 약한 AI는 프롬프트의 "라이브에서 확인해라"는 흘려듣지만, **기계가 돌려주는
// 판정은 따른다**(라운드 7·09-03 게이트에서 반복 확인). 그래서 400으로 막을 만큼
// 부실하진 않은 대본에도 "어디가 약한지"를 응답에 실어 보내, 같은 턴에 고쳐
// 다시 올리게 한다. 저장은 막지 않는다(게이트가 아니라 채점표).
//
// 두 부분:
//   1. scriptStats — 대본만 보고 세는 것(조작 스텝 수·셀렉터·expect·skip 유무).
//   2. 셀렉터 실재 확인 — 진입 URL의 HTML을 한 번 받아 `#id`·`.class`·태그·속성이
//      정적 HTML에 있는지 센다. 페이블이 손으로 한 DOM 확인을 모두에게 자동으로.
//      한계: HTML 한 장은 로봇의 **첫 화면**뿐이다. 첫 조작 뒤 스텝의 셀렉터는 다른
//      화면에 있는 게 정상이라 판정하지 않고(later), JS가 그리는 빈 틀이거나 셀렉터가
//      하나도 안 맞으면 "확인 불가"로 답한다. 틀린 "없음"은 AI가 멀쩡한 셀렉터를
//      고치게 만든다(09-15 스킨로그: 0/8 "없음" → 실제 8/8).
//      SSRF: lib/ssrf.ts safeFetch(사전 DNS 검증·수동 리다이렉트·connect 훅) 경유.
//
// 이 파일은 네트워크 없는 순수 함수(scriptStats·checkSelectorsInHtml)와 fetch를
// 하는 probeSelectors를 함께 둔다 — 라우트 3곳(발행·초안 PATCH·재촬영)과 검증
// 스크립트가 같은 판정을 쓰게.

import type { DemoScript } from "./demoScript";
import { isStepWired } from "./demoScript";
import type { DemoAccess } from "./demoAccess";
import { safeFetch, readResponseCapped } from "./ssrf";

// "실제 조작"으로 치는 액션 — focus/hover/scroll만으로 된 대본은 슬라이드쇼가 된다.
const INTERACTIVE_ACTIONS = new Set<string>(["click", "type", "drag", "draw"]);
// 이 미만이면 "조작이 적다"고 짚는다(소넷5 실측 1/6 → 발화, 오퍼스·페이블 2~3/8 → 무음).
export const SCRIPT_REVIEW_MIN_INTERACTIVE = 2;
// 게이트 하한(4)과 별개로 "영상 30초를 채우는" 권장 하한. 이 미만이면 짚는다.
export const SCRIPT_REVIEW_IDEAL_STEPS = 6;

export type ScriptStats = {
  steps: number;
  // 셀렉터+action이 갖춰져 비전 없이 조립되는 스텝(isStepWired).
  wired: number;
  interactive: number;
  withExpect: number;
  withHold: number;
  hasSkip: boolean;
  hasPrep: boolean;
};

export function scriptStats(script: DemoScript): ScriptStats {
  const steps = script.steps;
  return {
    steps: steps.length,
    wired: steps.filter(isStepWired).length,
    interactive: steps.filter((s) => !!s.action && INTERACTIVE_ACTIONS.has(s.action)).length,
    withExpect: steps.filter((s) => !!s.expect).length,
    withHold: steps.filter((s) => typeof s.hold === "number").length,
    hasSkip: !!script.skip?.length,
    hasPrep: !!script.prep,
  };
}

// ── 예상 필름 길이(2026-09-16, 외부 AI 피드백 NF-05/17) ──────────────────────
// "5~8스텝이 알맞다"는 말만으로는 9스텝 대본이 30초를 넘는지 알 수 없었다(외부 AI는
// hold 합이 20초인 9스텝을 넘는지 모른 채 골랐다). 러너의 페이싱 상수를 옮겨 온 어림
// 계산이다 — local-runner/replay.ts(HOLD_MS 900 · TYPE_DELAY_MS 55 · FOCUS_MOVE_MS 700 ·
// SETTLE_MS 180)와 camera.ts(glideMsFor × CURSOR_SLOWDOWN 1.67 = 커서 활강 0.7~1.5초).
// 셀렉터를 기다리거나 페이지가 느리면 실제는 더 걸린다 — **하한**으로 읽어야 하는 숫자다.
// lib은 러너를 import 하지 않으므로(런타임이 다름) 상수가 바뀌면 여기도 손으로 맞춘다.
const CURSOR_MOVE_SEC = 1.0; // 커서 활강 평균(짧은 이동 0.7 · 화면 횡단 1.5)
const SETTLE_SEC = 0.18; // 클릭 직전 정지
const TYPE_CHAR_SEC = 0.055; // 글자당 타이핑
const FOCUS_MOVE_SEC = 0.7; // focus 카메라 이동
const SCROLL_SEC = 0.75; // 부드러운 스크롤 한 번
const DRAG_SEC = 0.6; // 드래그 제스처 최소
const DRAW_SEC = 1.2; // 자유 곡선 한 획
const DEFAULT_HOLD_SEC = 0.9; // hold를 안 준 스텝의 기본 정지
// 필름 상한 34초(MAX_VIDEO_SEC)에서 인트로 3초·꼬리 1.1초를 뺀 "스텝에 쓸 수 있는 시간".
// 프롬프트가 말하는 "~30초"와 같은 숫자다.
export const FILM_BUDGET_SEC = 30;

export type FilmEstimate = {
  /** 스텝 전부를 찍는 데 걸리는 어림 시간(초, 인트로·꼬리 제외) */
  seconds: number;
  /** 스텝에 쓸 수 있는 시간(초) */
  budget: number;
  /** 이 번째 스텝부터 예산을 넘어 영상에 못 들어간다(1부터). 안 넘으면 null */
  cutFromStep: number | null;
};

// 뒤로가기 비트: 커서가 움직이지 않고 브라우저 히스토리 복귀만 기다린다
// (replay.ts navigate 분기 — goBack + hold). 클릭보다 싸다.
const NAV_SEC = 0.8;

function stepSeconds(step: DemoScript["steps"][number]): number {
  // hold는 스키마 상한(0.5~4초)으로 자른다 — 대본이 20을 적어도 러너가 그만큼 쉬지 않는다.
  const hold = typeof step.hold === "number"
    ? Math.min(4, Math.max(0.5, step.hold))
    : step.action === "scroll" ? 0 : DEFAULT_HOLD_SEC;
  switch (step.action) {
    case "focus": return FOCUS_MOVE_SEC + hold;
    case "scroll": return SCROLL_SEC + hold;
    case "hover": return CURSOR_MOVE_SEC + hold;
    case "type": return CURSOR_MOVE_SEC + SETTLE_SEC + (step.text?.length ?? 0) * TYPE_CHAR_SEC + hold;
    case "drag": return CURSOR_MOVE_SEC + SETTLE_SEC + DRAG_SEC + hold;
    case "navigate": return NAV_SEC + hold;
    case "draw": return CURSOR_MOVE_SEC + SETTLE_SEC + DRAW_SEC + hold;
    // click과 action 없는 스텝(로봇이 화면을 보고 고르는 것)은 같은 비용으로 센다.
    default: return CURSOR_MOVE_SEC + SETTLE_SEC + hold;
  }
}

/** 대본 → 예상 촬영 길이와 "몇 번째 스텝부터 잘리나". 네트워크 없는 순수 함수. */
export function estimateFilm(script: DemoScript): FilmEstimate {
  let total = 0;
  let cutFromStep: number | null = null;
  script.steps.forEach((step, i) => {
    total += stepSeconds(step);
    if (cutFromStep === null && total > FILM_BUDGET_SEC) cutFromStep = i + 1;
  });
  return { seconds: Math.round(total * 10) / 10, budget: FILM_BUDGET_SEC, cutFromStep };
}

// 화면을 바꾸지 않는 액션 — focus는 필름 카메라가 확대만 하고, scroll은 같은 페이지를
// 움직일 뿐이다. 나머지(click·type·drag·draw·hover, action 없음)는 다른 화면이나
// JS가 새로 그리는 요소(드롭다운·모달·검색 결과)를 부를 수 있다.
const SAME_SCREEN_ACTIONS = new Set<string>(["focus", "scroll"]);

export type SelectorGroups = {
  // 로봇이 진입 URL을 열자마자 쓰는 셀렉터 — 앞에서부터 첫 "화면을 바꿀 수 있는"
  // 스텝까지(그 스텝·drag 도착지 포함). 진입 URL의 HTML과 대볼 수 있는 건 이것뿐이다.
  entry: string[];
  // 그 뒤 스텝의 셀렉터 — 다른 화면에 있는 게 정상이라 "없음"으로 판정하지 않는다.
  later: string[];
};

/** 대본에 적힌 셀렉터 전부(출발·도착)를 첫 화면/뒤 화면으로 가른다. 중복 제거·순서 유지. */
export function selectorsOf(script: DemoScript): SelectorGroups {
  const entry: string[] = [];
  const later: string[] = [];
  let firstScreen = true;
  for (const s of script.steps) {
    for (const sel of [s.selector, s.toSelector]) {
      if (!sel || entry.includes(sel) || later.includes(sel)) continue;
      (firstScreen ? entry : later).push(sel);
    }
    if (!s.action || !SAME_SCREEN_ACTIONS.has(s.action)) firstScreen = false;
  }
  return { entry, later };
}

// ── 셀렉터 → 검사 가능한 토큰 ────────────────────────────────────────────────
// 완전한 CSS 파서가 아니다. `#id` `.class` `tag` `[attr(=value)]`만 보고, 가상
// 클래스(:nth-child 등)·조합자(공백 > + ~)는 "어딘가에 있으면 됨"으로 느슨하게
// 본다 — 목적은 "오타·없는 id를 잡기"지 매칭의 정확한 재현이 아니다.

type Token =
  | { kind: "id" | "class" | "tag"; name: string }
  | { kind: "attr"; name: string; op?: string; value?: string };

const SIMPLE_RE = /(#[\w-]+)|(\.[\w-]+)|(\[[^\]]*\])|(::?[\w-]+(?:\([^)]*\))?)|([a-zA-Z][\w-]*)|(\*)/g;
const ATTR_RE = /^\[\s*([\w:-]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\s*[iIsS]?\s*\]$/;

function tokenizeCompound(compound: string): Token[] {
  const tokens: Token[] = [];
  for (const m of compound.matchAll(SIMPLE_RE)) {
    if (m[1]) tokens.push({ kind: "id", name: m[1].slice(1) });
    else if (m[2]) tokens.push({ kind: "class", name: m[2].slice(1) });
    else if (m[3]) {
      const a = ATTR_RE.exec(m[3]);
      if (a) {
        const value = a[3] ?? a[4] ?? a[5];
        tokens.push({ kind: "attr", name: a[1].toLowerCase(), op: a[2], value });
      }
    } else if (m[5]) tokens.push({ kind: "tag", name: m[5].toLowerCase() });
    // m[4]=가상클래스, m[6]=* → 검사 대상 아님
  }
  return tokens;
}

/** 쉼표 대안 × 조합자 분해. 검사 가능한 토큰이 하나도 없으면 null(=판정 불가). */
function parseSelector(selector: string): Token[][] | null {
  const alternatives: Token[][] = [];
  for (const alt of selector.split(",")) {
    const tokens: Token[] = [];
    for (const compound of alt.trim().split(/\s*[>+~]\s*|\s+/)) {
      if (compound) tokens.push(...tokenizeCompound(compound));
    }
    if (tokens.length) alternatives.push(tokens);
  }
  return alternatives.length ? alternatives : null;
}

// ── HTML 색인 ────────────────────────────────────────────────────────────────

type HtmlIndex = {
  ids: Set<string>;
  classes: Set<string>;
  tags: Set<string>;
  attrs: Map<string, string[]>;
  // <script>·<style>·태그를 뺀 본문 글자 수 — JS 셸 판별용.
  textChars: number;
  hasScript: boolean;
};

const TAG_RE = /<([a-zA-Z][\w:-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/g;
const ATTR_LIST_RE = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
const MAX_TAGS = 50_000;

export function indexHtml(html: string): HtmlIndex {
  const idx: HtmlIndex = {
    ids: new Set(), classes: new Set(), tags: new Set(), attrs: new Map(),
    textChars: 0, hasScript: /<script[\s>]/i.test(html),
  };
  let n = 0;
  for (const m of html.matchAll(TAG_RE)) {
    if (++n > MAX_TAGS) break;
    idx.tags.add(m[1].toLowerCase());
    for (const a of (m[2] ?? "").matchAll(ATTR_LIST_RE)) {
      const name = a[1].toLowerCase();
      const value = a[2] ?? a[3] ?? a[4] ?? "";
      if (name === "id") idx.ids.add(value.trim());
      else if (name === "class") for (const c of value.split(/\s+/)) if (c) idx.classes.add(c);
      const list = idx.attrs.get(name);
      if (list) { if (list.length < 500) list.push(value); } else idx.attrs.set(name, [value]);
    }
  }
  idx.textChars = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
  return idx;
}

// SPA 셸(<div id="root"></div> + 번들 스크립트) 판별 — 이런 페이지에선 "못 찾음"이
// 오타가 아니라 "아직 안 그려짐"이라, 못 찾았다고 말하면 AI가 멀쩡한 셀렉터를 고친다.
// 본문이 한 문장도 안 되면 틀에 달린 id·class 수와 상관없이 빈 틀로 본다 — 09-15
// 스킨로그(Next.js) 페이지는 본문 4자인데 글꼴·Tailwind가 틀에 class 5개를 달아
// "id+class 5개 미만" 조건 하나로는 빠져나갔다.
const JS_SHELL_TEXT_MAX = 80;

export function looksJsRendered(idx: HtmlIndex): boolean {
  if (!idx.hasScript) return false;
  return idx.textChars < JS_SHELL_TEXT_MAX || (idx.textChars < 300 && idx.ids.size + idx.classes.size < 5);
}

function attrMatches(list: string[] | undefined, op?: string, value?: string): boolean {
  if (!list) return false;
  if (op === undefined || value === undefined) return true;
  return list.some((v) => {
    switch (op) {
      case "=": return v === value;
      case "^=": return v.startsWith(value);
      case "$=": return v.endsWith(value);
      case "*=": return v.includes(value);
      case "~=": return v.split(/\s+/).includes(value);
      case "|=": return v === value || v.startsWith(value + "-");
      default: return false;
    }
  });
}

function tokenFound(t: Token, idx: HtmlIndex): boolean {
  switch (t.kind) {
    case "id": return idx.ids.has(t.name);
    case "class": return idx.classes.has(t.name);
    case "tag": return idx.tags.has(t.name);
    case "attr": return attrMatches(idx.attrs.get(t.name), t.op, t.value);
  }
}

type SelectorCheckReason =
  | "no-selectors"
  | "no-entry-selectors" // 첫 화면 스텝에 판정할 셀렉터가 없음(뒤 화면 것만 있음)
  | "fetch-failed"
  | "not-html"
  | "js-rendered"
  | "no-match"; // 첫 화면·뒤 화면 통틀어 하나도 안 맞음 = 이 HTML은 로봇이 찍을 화면이 아님

export type SelectorCheck = {
  status: "checked" | "skipped";
  reason?: SelectorCheckReason;
  // 왜 못 열었는지를 가르는 짧은 코드(2026-09-17): `http-403`·`timeout`·`unreachable`·
  // `network`. 예전엔 전부 뭉뚱그려 "열지 못했어요"라 AI가 사용자에게 엉뚱한 것을
  // 시켰다("공유 설정을 확인해 주세요" — 실제로는 봇 차단이라 설정과 무관했다).
  // 사람이 읽는 문장으로 바꾸는 일은 사전이 한다(여기선 코드만 싣는다).
  detail?: string;
  // 실제로 연 주소(demoAccess까지 합친 것) — AI가 "어디를 봤는지" 알게.
  url: string;
  // checked·found·missing·unparsed는 첫 화면 셀렉터(entry)만 센다.
  checked: number;
  found: number;
  missing: string[];
  // 가상클래스만 있는 등 정적 HTML로는 판정 못 한 셀렉터.
  unparsed: string[];
  // 첫 조작 뒤 스텝의 셀렉터 — 판정하지 않고 싣기만 한다(구버전 CLI는 이 키를 모른다).
  later: string[];
};

function skippedCheck(
  reason: SelectorCheckReason,
  url: string,
  groups: SelectorGroups,
  detail?: string,
): SelectorCheck {
  return {
    status: "skipped", reason, url, checked: 0, found: 0, missing: [], unparsed: [],
    later: groups.later, ...(detail ? { detail } : {}),
  };
}

/** 셀렉터 하나가 이 HTML에 있나. 검사 가능한 토큰이 없으면 null(=판정 불가). */
function selectorHit(selector: string, idx: HtmlIndex): boolean | null {
  const alts = parseSelector(selector);
  return alts ? alts.some((tokens) => tokens.every((t) => tokenFound(t, idx))) : null;
}

/** 네트워크 없는 판정 코어. url은 표시용으로 그대로 실어 보낸다. */
export function checkSelectorsInHtml(html: string, groups: SelectorGroups, url = ""): SelectorCheck {
  if (!groups.entry.length) {
    return skippedCheck(groups.later.length ? "no-entry-selectors" : "no-selectors", url, groups);
  }
  const idx = indexHtml(html);
  if (looksJsRendered(idx)) return skippedCheck("js-rendered", url, groups);
  const out: SelectorCheck = {
    status: "checked", url, checked: 0, found: 0, missing: [], unparsed: [], later: groups.later,
  };
  for (const sel of groups.entry) {
    const hit = selectorHit(sel, idx);
    if (hit === null) { out.unparsed.push(sel); continue; }
    out.checked++;
    if (hit) out.found++;
    else out.missing.push(sel);
  }
  if (!out.checked) return { ...skippedCheck("no-entry-selectors", url, groups), unparsed: out.unparsed };
  // 첫 화면·뒤 화면 통틀어 하나도 안 맞으면 이 HTML은 로봇이 찍을 화면이 아니다 —
  // JS가 그리거나 다른 화면으로 넘어가는 페이지다(오타가 전부 겹칠 확률보다 훨씬 흔하다).
  if (!out.found && !groups.later.some((sel) => selectorHit(sel, idx))) {
    return skippedCheck("no-match", url, groups);
  }
  return out;
}

// 로봇이 실제로 여는 주소 — local-runner/job.ts resolveEntry의 live_url 분기와 같은
// 규칙(절대 url은 그대로, 상대 url은 base에 붙이고, params는 마지막에). 절대 url은
// 인제스트 게이트를 이미 통과한 값만 여기 온다.
export function composeProbeUrl(baseUrl: string, access: DemoAccess | null | undefined): string {
  let target = baseUrl;
  const entry = access?.url;
  if (entry) {
    if (/^https?:\/\//i.test(entry)) target = entry;
    else if (entry.startsWith("/")) {
      // 풀린 주소가 base 밖(//host 등)이면 base 그대로 — normalizeDemoAccess가 이미
      // 거르지만, 옛 행이나 다른 입구로 들어온 값에 대비한 이중 잠금.
      try {
        const r = new URL(entry, baseUrl);
        if (r.origin === new URL(baseUrl).origin) target = r.toString();
      } catch { /* base 그대로 */ }
    }
  }
  if (access?.params) {
    try {
      const u = new URL(target);
      for (const [k, v] of Object.entries(access.params)) u.searchParams.set(k, v);
      target = u.toString();
    } catch { /* target 그대로 */ }
  }
  return target;
}

const PROBE_TIMEOUT_MS = 6000;
const PROBE_HTML_CAP = 1024 * 1024;

/**
 * 진입 URL의 HTML을 한 번 받아 첫 화면 셀렉터의 실재를 센다. 절대 throw하지 않는다 —
 * 발행을 막는 게이트가 아니라 부가 정보라, 어떤 실패도 "확인 못 함"으로만 답한다.
 */
export async function probeSelectors(url: string, groups: SelectorGroups): Promise<SelectorCheck> {
  // 첫 화면에 판정할 셀렉터가 없으면 받아 올 이유도 없다(응답 지연 최대 6초 절약).
  if (!groups.entry.length) {
    return skippedCheck(groups.later.length ? "no-entry-selectors" : "no-selectors", url, groups);
  }
  try {
    const res = await safeFetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Nookframe/1.0; +https://nookframe.com)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) return skippedCheck("fetch-failed", url, groups, `http-${res.status}`);
    const ct = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(ct)) return skippedCheck("not-html", url, groups);
    const bytes = await readResponseCapped(res, PROBE_HTML_CAP);
    const html = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return checkSelectorsInHtml(html, groups, url);
  } catch (err) {
    // 시간 초과와 "주소에 닿지도 못함"은 사람이 할 일이 다르다 — 앞은 느린 페이지라
    // 그냥 넘어가도 되고, 뒤는 주소가 틀렸거나 죽은 것이다.
    const name = err instanceof Error ? err.name : "";
    const detail =
      name === "TimeoutError" || name === "AbortError" ? "timeout"
        : name === "SsrfError" ? "unreachable"
          : "network";
    return skippedCheck("fetch-failed", url, groups, detail);
  }
}
