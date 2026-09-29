// 작품 두 언어(2026-09-29 사용자 확정: "그렇게 해보자") — 모든 작품이 한국어·영어 글을
// 한 벌씩 갖고, 보는 사람은 자기 언어 판을 본다. 영미권이 주 대상인데 올라오는 앱은
// 대부분 한국어 화면뿐이라서다.
//
// 칸 셋:
//   language     — 기본 언어. 제목·소개·한마디가 쓰인 말(주인이 쓰는 말)
//   appLanguages — 앱 **화면**이 보여줄 수 있는 말(ko·en 중). 둘 다면 로봇이 언어별로
//                  두 번 찍고, 빠진 말은 장면마다 자막(steps[i].caption)으로 채운다
//   translation  — 다른 언어의 제목·소개·한마디
// 한국어뿐인 앱이면 올리는 AI가 주인에게 "영어판도 만들어 드릴까요?"를 묻는다(강제 안 함) —
// 좋다면 영어를 넣고 배포해 appLanguages에 둘 다, 싫다면 영어 자막. 영어뿐인 앱은 묻지 않고
// 한국어 자막만 쓴다.
//
// 판정은 여기 한 벌이다: 생성 게이트(/api/ingest)·수정(/api/ingest/drafts/[id])이 같은
// 함수를 쓴다. 서버 두 곳의 답이 갈라지면 "만들 땐 됐는데 고치니 튕긴다"가 된다.
import { descriptionShapeIssue, descriptionTooLong, type DescriptionIssue } from "@/lib/descriptionShape";
import type { DemoScript } from "@/lib/demoScript";

export const SITE_LOCALES = ["ko", "en"] as const;
export type SiteLocale = (typeof SITE_LOCALES)[number];

export const otherLocale = (l: SiteLocale): SiteLocale => (l === "ko" ? "en" : "ko");

// 자막 한 줄 상한 — 영상 아래 띠에 두 줄 안으로 들어가는 길이(영어 약 90자).
export const CAPTION_MAX = 90;
// 정규화가 받아 두는 상한(저장 크기 방어). 게이트는 CAPTION_MAX로 따로 거절한다 —
// 여기서 잘라 버리면 문장 중간이 끊긴 자막이 조용히 저장된다.
export const CAPTION_STORE_MAX = 200;
export const TRANSLATION_TITLE_MAX = 80;
const BUILDER_NOTE_MAX = 200;

const LOCALE_ALIASES: Record<string, SiteLocale> = {
  ko: "ko", kr: "ko", kor: "ko", korean: "ko", "한국어": "ko", "한글": "ko",
  en: "en", eng: "en", english: "en", "영어": "en",
};

/** "ko"·"ko-KR"·"Korean"·"한국어" → "ko". 목록 밖(ja 등)이면 null. */
export function normalizeLocale(v: unknown): SiteLocale | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  if (!s) return null;
  return LOCALE_ALIASES[s] ?? LOCALE_ALIASES[s.split(/[-_]/)[0]] ?? null;
}

/**
 * 앱 화면 언어 목록. 배열(또는 글자 하나)이 오면 ko·en만 남긴 목록 — 일본어뿐인 앱은 빈
 * 목록이 정상이다(자막 둘 다). 칸 자체가 없으면 null(= 답하지 않음).
 */
export function normalizeAppLanguages(v: unknown): SiteLocale[] | null {
  const raw = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\s/]+/) : null;
  if (!raw) return null;
  const set = new Set(raw.map(normalizeLocale).filter((l): l is SiteLocale => !!l));
  return SITE_LOCALES.filter((l) => set.has(l));
}

/** 자막이 필요한 언어 = 앱 화면이 못 보여주는 사이트 언어. */
export function captionLocalesNeeded(app: readonly SiteLocale[]): SiteLocale[] {
  return SITE_LOCALES.filter((l) => !app.includes(l));
}

/** 로봇이 찍을 언어 = 앱 화면이 보여주는 사이트 언어. 비었으면 한 번(앱 기본값)만 찍는다. */
export function filmLocales(app: readonly SiteLocale[]): SiteLocale[] {
  return SITE_LOCALES.filter((l) => app.includes(l));
}

export interface WorkTranslation {
  title: string;
  description: string;
  // DB 칸 이름(comment)이 아니라 페이로드 이름을 쓴다 — 이 모양 그대로 jsonb에 들어간다.
  builderNote: string;
}

/** 저장 모양: { [다른 언어]: WorkTranslation } — 기본 언어 글은 원래 칸(title·description·comment)에 있다. */
export type WorkTranslations = Partial<Record<SiteLocale, WorkTranslation>>;

export type TranslationIssue =
  | { kind: "missing" }
  | { kind: "title-missing" }
  | { kind: "title-too-long"; max: number }
  | { kind: "description-too-long" }
  | { kind: "description-shape"; issue: DescriptionIssue };

function cleanLine(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** 다른 언어 판 글 — 소개글은 기본 언어와 같은 3줄 규격(명함에서 같은 자리에 뜬다). */
export function normalizeTranslation(
  raw: unknown,
): { value: WorkTranslation; issue: null } | { value: null; issue: TranslationIssue } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { value: null, issue: { kind: "missing" } };
  const r = raw as Record<string, unknown>;
  const titleRaw = typeof r.title === "string" ? r.title.replace(/\s+/g, " ").trim() : "";
  if (!titleRaw) return { value: null, issue: { kind: "title-missing" } };
  if ([...titleRaw].length > TRANSLATION_TITLE_MAX) {
    return { value: null, issue: { kind: "title-too-long", max: TRANSLATION_TITLE_MAX } };
  }
  const description = typeof r.description === "string" ? r.description.trim() : "";
  if (descriptionTooLong(description)) return { value: null, issue: { kind: "description-too-long" } };
  const shape = descriptionShapeIssue(description);
  if (shape) return { value: null, issue: { kind: "description-shape", issue: shape } };
  return {
    value: { title: titleRaw, description, builderNote: cleanLine(r.builderNote, BUILDER_NOTE_MAX) },
    issue: null,
  };
}

/** DB jsonb → 화면·에코용. 모양이 어긋난 언어는 없는 것으로 본다. */
export function readTranslations(raw: unknown): WorkTranslations {
  const out: WorkTranslations = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const l of SITE_LOCALES) {
    const one = normalizeTranslation((raw as Record<string, unknown>)[l]);
    if (one.value) out[l] = one.value;
  }
  return out;
}

export type CaptionIssue =
  | { kind: "missing"; locale: SiteLocale; steps: number[] }
  | { kind: "too-long"; locale: SiteLocale; step: number; max: number };

/**
 * 자막 판정. 뒤로가기(navigate) 장면은 자막이 없는 게 정상 — 앞 장면 자막이 그대로 이어진다.
 * 번호는 사람이 읽는 1부터. 빠진 장면을 **전부** 알려준다(하나씩 고치며 여러 번 되돌려받지 않게).
 */
export function captionIssue(script: DemoScript | null, needed: readonly SiteLocale[]): CaptionIssue | null {
  if (!script || !needed.length) return null;
  for (const locale of needed) {
    const missing: number[] = [];
    for (let i = 0; i < script.steps.length; i++) {
      const st = script.steps[i];
      if (st.action === "navigate") continue;
      const cap = st.caption?.[locale];
      if (!cap) missing.push(i + 1);
      else if ([...cap].length > CAPTION_MAX) return { kind: "too-long", locale, step: i + 1, max: CAPTION_MAX };
    }
    if (missing.length) return { kind: "missing", locale, steps: missing };
  }
  return null;
}

/** 에코용 — 언어별로 자막이 달린 장면 수. */
export function captionCounts(script: DemoScript | null): Partial<Record<SiteLocale, number>> {
  const out: Partial<Record<SiteLocale, number>> = {};
  for (const st of script?.steps ?? []) {
    for (const l of SITE_LOCALES) if (st.caption?.[l]) out[l] = (out[l] ?? 0) + 1;
  }
  return out;
}

export type WorkLanguageIssue =
  | { kind: "language-missing" }
  | { kind: "language-invalid"; got: string }
  | { kind: "app-languages-missing" }
  | { kind: "translation"; locale: SiteLocale; issue: TranslationIssue }
  | { kind: "captions"; issue: CaptionIssue };

export interface WorkLanguages {
  language: SiteLocale;
  appLanguages: SiteLocale[];
  translation: WorkTranslation;
}

/**
 * 생성 게이트 한 번에 — 기본 언어 → 앱 화면 언어 → 다른 언어 글 → 자막 순서.
 * 자막은 로봇이 대본으로 찍을 때만 본다(직접 만든 영상엔 장면 시각이 없어 입힐 곳이 없다).
 */
export function judgeWorkLanguages(input: {
  language: unknown;
  appLanguages: unknown;
  translation: unknown;
  script: DemoScript | null;
  hasOwnVideo: boolean;
}): { value: WorkLanguages; issue: null } | { value: null; issue: WorkLanguageIssue } {
  const sent = input.language;
  const language = normalizeLocale(sent);
  if (!language) {
    if (sent === undefined || sent === null || sent === "") return { value: null, issue: { kind: "language-missing" } };
    return {
      value: null,
      issue: { kind: "language-invalid", got: typeof sent === "string" ? sent : JSON.stringify(sent) },
    };
  }
  const appLanguages = normalizeAppLanguages(input.appLanguages);
  if (!appLanguages) return { value: null, issue: { kind: "app-languages-missing" } };
  const tr = normalizeTranslation(input.translation);
  if (tr.issue) return { value: null, issue: { kind: "translation", locale: otherLocale(language), issue: tr.issue } };
  if (!input.hasOwnVideo) {
    const cap = captionIssue(input.script, captionLocalesNeeded(appLanguages));
    if (cap) return { value: null, issue: { kind: "captions", issue: cap } };
  }
  return { value: { language, appLanguages, translation: tr.value }, issue: null };
}
