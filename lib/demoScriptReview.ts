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
//      한계: JS가 그리는 화면(SPA 셸)은 못 본다 → "확인 불가"로 정직하게 답한다.
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
export const INTERACTIVE_ACTIONS = new Set<string>(["click", "type", "drag", "draw"]);
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

/** 대본에 적힌 셀렉터 전부(출발·도착), 중복 제거·순서 유지. */
export function selectorsOf(script: DemoScript): string[] {
  const out: string[] = [];
  for (const s of script.steps) {
    for (const sel of [s.selector, s.toSelector]) {
      if (sel && !out.includes(sel)) out.push(sel);
    }
  }
  return out;
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
export function parseSelector(selector: string): Token[][] | null {
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

export type HtmlIndex = {
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
export function looksJsRendered(idx: HtmlIndex): boolean {
  return idx.hasScript && idx.textChars < 300 && idx.ids.size + idx.classes.size < 5;
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

export type SelectorCheckReason = "no-selectors" | "fetch-failed" | "not-html" | "js-rendered";

export type SelectorCheck = {
  status: "checked" | "skipped";
  reason?: SelectorCheckReason;
  // 실제로 연 주소(demoAccess까지 합친 것) — AI가 "어디를 봤는지" 알게.
  url: string;
  checked: number;
  found: number;
  missing: string[];
  // 가상클래스만 있는 등 정적 HTML로는 판정 못 한 셀렉터.
  unparsed: string[];
};

/** 네트워크 없는 판정 코어. url은 표시용으로 그대로 실어 보낸다. */
export function checkSelectorsInHtml(html: string, selectors: string[], url = ""): SelectorCheck {
  const base = { url, checked: 0, found: 0, missing: [] as string[], unparsed: [] as string[] };
  if (!selectors.length) return { status: "skipped", reason: "no-selectors", ...base };
  const idx = indexHtml(html);
  if (looksJsRendered(idx)) return { status: "skipped", reason: "js-rendered", ...base };
  for (const sel of selectors) {
    const alts = parseSelector(sel);
    if (!alts) { base.unparsed.push(sel); continue; }
    base.checked++;
    const hit = alts.some((tokens) => tokens.every((t) => tokenFound(t, idx)));
    if (hit) base.found++;
    else base.missing.push(sel);
  }
  return { status: "checked", ...base };
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
      try { target = new URL(entry, baseUrl).toString(); } catch { /* base 그대로 */ }
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
 * 진입 URL의 HTML을 한 번 받아 셀렉터 실재를 센다. 절대 throw하지 않는다 — 발행을
 * 막는 게이트가 아니라 부가 정보라, 어떤 실패도 "확인 못 함"으로만 답한다.
 */
export async function probeSelectors(url: string, selectors: string[]): Promise<SelectorCheck> {
  const skipped = (reason: SelectorCheckReason): SelectorCheck =>
    ({ status: "skipped", reason, url, checked: 0, found: 0, missing: [], unparsed: [] });
  if (!selectors.length) return skipped("no-selectors");
  try {
    const res = await safeFetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Nookframe/1.0; +https://nookframe.com)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) return skipped("fetch-failed");
    const ct = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(ct)) return skipped("not-html");
    const bytes = await readResponseCapped(res, PROBE_HTML_CAP);
    const html = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return checkSelectorsInHtml(html, selectors, url);
  } catch {
    return skipped("fetch-failed");
  }
}
