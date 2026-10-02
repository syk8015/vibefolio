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
import { stepTakesCaption, type DemoScript } from "@/lib/demoScript";

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
 * 자막 판정. 뒤로가기(navigate)·기다리기(wait) 장면은 자막이 없는 게 정상 — 앞 장면 자막이 그대로 이어진다.
 * 번호는 사람이 읽는 1부터. 빠진 장면을 **전부** 알려준다(하나씩 고치며 여러 번 되돌려받지 않게).
 */
export function captionIssue(script: DemoScript | null, needed: readonly SiteLocale[]): CaptionIssue | null {
  if (!script || !needed.length) return null;
  for (const locale of needed) {
    const missing: number[] = [];
    for (let i = 0; i < script.steps.length; i++) {
      const st = script.steps[i];
      if (!stepTakesCaption(st)) continue;
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

// ── 촬영 뒤: 자막 시간표(2026-09-29, 2단계) ──────────────────────────────────
// 로봇이 장면마다 몇 초에 시작했는지 기록하고(local-runner/replay.ts), 그 시각으로 자막
// 시간표를 만든다. 재생 화면이 영상 위에 얹는다 — 영상에 박지 않으니 글을 고치면 바로
// 바뀐다. 저장은 공개 칸 projects.demo_captions(워커만 쓴다 — 가드 트리거).

export type CaptionCue = { start: number; end: number; text: string };
export type CaptionTrack = Partial<Record<SiteLocale, CaptionCue[]>>;
/** 장면 시작 표시 — step은 대본 번호(1부터), atSec는 필름 시각(초). */
export type StepMark = { step: number; atSec: number };

const CUE_MAX = 20;
const CUE_TEXT_MAX = CAPTION_STORE_MAX;
const FILM_MAX_SEC = 60;
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * 장면 표시 + 대본 자막 → 언어별 시간표. 규칙:
 *  - 자막은 다음 장면이 시작할 때 내려간다. 자막 없는 장면은 빈칸(앞 자막을 끈다).
 *  - 뒤로가기(navigate)·기다리기(wait) 장면은 경계가 아니다 — 앞 자막이 그대로 이어진다(자막 규칙과
 *    같다). 단 그 장면에 그 언어 자막을 따로 달았다면 그 자막이 뜬다.
 *  - 첫 자막은 0초부터 — 첫 동작 전 인트로 동안에도 무엇을 보는지 알 수 있게.
 *  - 필름 길이(clipSec) 밖은 자른다. 촬영 예산에 걸려 못 찍은 장면은 표시가 없어 자막도 없다.
 */
export function buildCaptionTrack(
  marks: readonly StepMark[],
  script: DemoScript | null,
  locales: readonly SiteLocale[],
  clipSec: number,
): CaptionTrack {
  const out: CaptionTrack = {};
  if (!script || !locales.length) return out;
  const seen = new Set<number>();
  const allBounds = [...marks]
    .filter((m) => Number.isFinite(m.atSec) && m.step >= 1 && m.step <= script.steps.length)
    .sort((a, b) => a.atSec - b.atSec)
    .filter((m) => (seen.has(m.step) ? false : (seen.add(m.step), true)));
  for (const locale of locales) {
    const cues: CaptionCue[] = [];
    const bounds = allBounds.filter((m) => {
      const st = script.steps[m.step - 1];
      return stepTakesCaption(st) || !!st.caption?.[locale];
    });
    for (let i = 0; i < bounds.length; i++) {
      const text = script.steps[bounds[i].step - 1].caption?.[locale];
      if (!text) continue;
      const start = i === 0 ? 0 : Math.max(0, bounds[i].atSec);
      const end = Math.min(clipSec, i + 1 < bounds.length ? bounds[i + 1].atSec : clipSec);
      if (end - start < 0.3) continue;
      cues.push({ start: round1(start), end: round1(end), text });
      if (cues.length >= CUE_MAX) break;
    }
    if (cues.length) out[locale] = cues;
  }
  return out;
}

/** 서버가 받는 모양 검사(워커 → /api/worker/jobs) + 화면이 읽을 때. 어긋난 줄은 버린다. */
export function normalizeCaptionTrack(raw: unknown): CaptionTrack | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: CaptionTrack = {};
  for (const l of SITE_LOCALES) {
    const list = (raw as Record<string, unknown>)[l];
    if (!Array.isArray(list)) continue;
    const cues: CaptionCue[] = [];
    for (const c of list) {
      if (!c || typeof c !== "object") continue;
      const { start, end, text } = c as Record<string, unknown>;
      if (typeof start !== "number" || typeof end !== "number" || typeof text !== "string") continue;
      if (!(start >= 0 && end > start && end <= FILM_MAX_SEC)) continue;
      const t = text.replace(/\s+/g, " ").trim();
      if (!t) continue;
      if (cues.length && start < cues[cues.length - 1].end - 0.05) continue; // 겹치면 버린다
      cues.push({ start: round1(start), end: round1(end), text: [...t].slice(0, CUE_TEXT_MAX).join("") });
      if (cues.length >= CUE_MAX) break;
    }
    if (cues.length) out[l] = cues;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * 공개된 영상의 자막 한 줄 글 고치기(2026-10-02) — 시각은 그대로, 글만. 촬영 뒤 시간표는 워커만 쓰는
 * 칸이라 주인은 서버 라우트(/api/projects/[id]/captions)로만 고친다. 거절 이유는 그대로 화면 문구가 된다.
 */
export type CueEditIssue = "no-cue" | "empty" | "too-long";
export function editCaptionCue(
  raw: unknown, locale: SiteLocale, index: number, text: string,
): { track: CaptionTrack; oldText: string; text: string } | { issue: CueEditIssue } {
  const track = normalizeCaptionTrack(raw);
  const cues = track?.[locale];
  if (!track || !cues || !Number.isInteger(index) || index < 0 || index >= cues.length) return { issue: "no-cue" };
  const v = text.replace(/\s+/g, " ").trim();
  if (!v) return { issue: "empty" };
  if ([...v].length > CAPTION_MAX) return { issue: "too-long" };
  const oldText = cues[index].text;
  return { track: { ...track, [locale]: cues.map((c, i) => (i === index ? { ...c, text: v } : c)) }, oldText, text: v };
}

/** 같은 글을 단 대본 장면의 자막도 같이 고친다 — 다시 찍어도 고친 글이 되살아나지 않게. 바뀐 게 없으면 null. */
export function renameScriptCaption(
  script: DemoScript | null, locale: SiteLocale, oldText: string, text: string,
): DemoScript | null {
  if (!script || oldText === text) return null;
  let hit = false;
  const steps = script.steps.map((st) => {
    const cur = st.caption?.[locale];
    if (typeof cur !== "string" || cur.replace(/\s+/g, " ").trim() !== oldText) return st;
    hit = true;
    return { ...st, caption: { ...st.caption, [locale]: text } };
  });
  return hit ? { ...script, steps } : null;
}

/** 다른 언어로 한 번 더 찍은 영상 주소 — { en: "https://…" }. https만 받는다. */
export function normalizeLocaleVideos(raw: unknown): Partial<Record<SiteLocale, string>> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Partial<Record<SiteLocale, string>> = {};
  for (const l of SITE_LOCALES) {
    const v = (raw as Record<string, unknown>)[l];
    if (typeof v === "string" && /^https:\/\/[^\s]+$/.test(v) && v.length <= 1000) out[l] = v;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * 촬영 계획 — 어떤 언어로 몇 번 찍고, 어떤 언어에 자막을 입히나.
 *  - 앱 화면이 두 언어 다 되면: 기본 언어로 한 번(영상 칸), 다른 언어로 한 번 더(언어별 영상 칸).
 *  - 한 언어만 되면: 그 언어로 한 번 + 나머지 언어 자막.
 *  - 둘 다 아니면: 브라우저 영어로 한 번(옛 동작) + 두 언어 자막.
 *  - 언어 칸이 없는 옛 작품: 옛 동작 그대로(영어 브라우저, 자막 없음).
 */
export function filmPlan(
  primary: SiteLocale | null,
  app: readonly SiteLocale[] | null,
): { main: SiteLocale; extra: SiteLocale | null; captions: SiteLocale[] } {
  if (!app) return { main: "en", extra: null, captions: [] };
  const films = filmLocales(app);
  if (films.length === 2) {
    const main = primary && films.includes(primary) ? primary : films[0];
    return { main, extra: otherLocale(main), captions: [] };
  }
  return { main: films[0] ?? "en", extra: null, captions: captionLocalesNeeded(app) };
}

// ── 보는 사람 언어로 고르기(2026-09-29, 3단계) ──────────────────────────────
// 명함·작품 페이지·초안 검토가 같은 규칙을 쓴다:
//  - 글: 보는 사람 언어가 기본 언어와 다르고 그 언어 판이 있으면 그 판(한마디가 비었으면 원래 한마디).
//  - 영상: 그 언어로 따로 찍은 영상이 있으면 그것(자막 없음 — 화면이 이미 그 말이다).
//    없으면 기본 영상 + 그 언어 자막(있으면).
//  - 한 언어로만 올라간 작품은 그대로(09-29 결정 — 대신 보여줄 작품을 고르지 않는다).
export type LocalizableWork = {
  title: string;
  description: string | null;
  comment?: string | null;
  primary_locale?: unknown;
  translations?: unknown;
  demo_video_url?: string | null;
  demo_locale_videos?: unknown;
  demo_captions?: unknown;
};

export function localizeWork(w: LocalizableWork, viewer: SiteLocale): {
  title: string;
  description: string;
  comment: string;
  demoVideoUrl: string | null;
  captions: CaptionCue[] | null;
  translated: boolean;
} {
  const primary = normalizeLocale(w.primary_locale);
  const tr = primary && primary !== viewer ? readTranslations(w.translations)[viewer] : undefined;
  const localeVideo = normalizeLocaleVideos(w.demo_locale_videos)?.[viewer];
  const captions = localeVideo ? null : normalizeCaptionTrack(w.demo_captions)?.[viewer] ?? null;
  return {
    title: tr?.title ?? w.title,
    description: tr?.description ?? w.description ?? "",
    comment: (tr?.builderNote || w.comment) ?? "",
    demoVideoUrl: localeVideo ?? w.demo_video_url ?? null,
    captions,
    translated: !!tr,
  };
}

/** 재생 중 시각의 자막 한 줄(없으면 null). 끝 시각은 포함하지 않는다. */
export function cueAt(captions: readonly CaptionCue[] | null | undefined, t: number): string | null {
  if (!captions) return null;
  for (const c of captions) if (t >= c.start && t < c.end) return c.text;
  return null;
}
