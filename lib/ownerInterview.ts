// 주인 인터뷰(2026-09-29 사용자 확정: "인터뷰는 필수로 하자") — docs/owner-interview-real-record.md §2.
//
// 데모는 진짜 앱과 같지 않고, 어디가 중요한지는 만든 사람만 안다. 그래서 올리는 AI가
// 초안을 쓰기 **전에** 주인에게 묻고, 답은 주인의 말 그대로 옮긴다. 쓰임:
//   proudMoment·mustSee → 촬영 대본에서 오래·먼저 보여줄 장면
//   howIUse             → 명함 말풍선 한 줄(builderNote)의 재료
//   hide                → 대본에서 뺄 것. 공개하지 않는다(비공개 칸)
// 작품 페이지에 "만든 사람의 한마디" 칸은 만들지 않는다(09-29) — 작품 페이지는 영상이 주인공이다.
//
// 판정은 여기 한 벌뿐이다: 생성 게이트(/api/ingest)·수정(/api/ingest/drafts/[id])·초안
// 검토 창이 같은 함수를 쓴다. 서버와 화면의 답이 갈라지면 "화면에선 됐는데 저장이 안 된다"가 된다.

export interface OwnerInterview {
  proudMoment: string;
  howIUse: string;
  mustSee: string;
  hide: string[];
}

export const OWNER_INTERVIEW_KEYS = ["proudMoment", "howIUse", "mustSee"] as const;
export type OwnerInterviewKey = (typeof OWNER_INTERVIEW_KEYS)[number];

export const OWNER_ANSWER_MAX = 300;
export const OWNER_HIDE_ITEM_MAX = 80;
export const OWNER_HIDE_MAX_ITEMS = 12;

// 칸만 채운 자리 표시 — 주인에게 묻지 않고 AI가 메운 흔적이라 빈 답과 같게 본다.
const PLACEHOLDER = /^(?:-+|\.+|\?+|…+|n\/?a|none|null|nil|tbd|todo|unknown|no answer|없음|모름|미정|해당\s*없음|답\s*없음)$/i;

function clean(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
}

const chars = (s: string) => [...s].length;

export type OwnerInterviewIssue =
  | { kind: "missing" }
  | { kind: "incomplete"; keys: OwnerInterviewKey[] }
  | { kind: "too-long"; key: OwnerInterviewKey | "hide"; max: number };

/** 가릴 것 — 배열이든 쉼표·줄바꿈으로 나눈 글이든 받는다. "없음" 같은 말은 빈 목록이 된다. */
export function normalizeHideList(raw: unknown): string[] | "too-long" {
  const parts: unknown[] = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(/[,\n、，;]/)
      : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const v = clean(p);
    if (!v || PLACEHOLDER.test(v)) continue;
    if (chars(v) > OWNER_HIDE_ITEM_MAX) return "too-long";
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= OWNER_HIDE_MAX_ITEMS) break;
  }
  return out;
}

export function normalizeOwnerInterview(
  raw: unknown,
): { value: OwnerInterview; issue: null } | { value: null; issue: OwnerInterviewIssue } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { value: null, issue: { kind: "missing" } };
  }
  const r = raw as Record<string, unknown>;
  const answers: Partial<Record<OwnerInterviewKey, string>> = {};
  const missing: OwnerInterviewKey[] = [];
  for (const k of OWNER_INTERVIEW_KEYS) {
    const v = clean(r[k]);
    if (!v || PLACEHOLDER.test(v)) {
      missing.push(k);
      continue;
    }
    if (chars(v) > OWNER_ANSWER_MAX) return { value: null, issue: { kind: "too-long", key: k, max: OWNER_ANSWER_MAX } };
    answers[k] = v;
  }
  if (missing.length) return { value: null, issue: { kind: "incomplete", keys: missing } };
  const hide = normalizeHideList(r.hide);
  if (hide === "too-long") return { value: null, issue: { kind: "too-long", key: "hide", max: OWNER_HIDE_ITEM_MAX } };
  return {
    value: { proudMoment: answers.proudMoment!, howIUse: answers.howIUse!, mustSee: answers.mustSee!, hide },
    issue: null,
  };
}

/** DB에서 읽은 값(jsonb) → 화면용. 형식이 어긋나면 null — 인터뷰 없이 올라온 옛 초안과 같게 본다. */
export function readOwnerInterview(raw: unknown): OwnerInterview | null {
  return normalizeOwnerInterview(raw).value;
}
