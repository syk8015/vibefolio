import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/apiError";
import { getT } from "@/lib/i18n/server";
import { lineCols, DESCRIPTION_LINE_COLS_MAX, type DescriptionIssue } from "@/lib/descriptionShape";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { verifyToken, bearerFromHeader } from "@/lib/apiToken";
import { looksLikeConnectCode } from "@/lib/connectCode";
import type { DemoScript } from "@/lib/demoScript";
import {
  scriptStats, estimateFilm, SCRIPT_REVIEW_IDEAL_STEPS, SCRIPT_REVIEW_MIN_INTERACTIVE,
  type ScriptStats, type SelectorCheck, type FilmEstimate,
} from "@/lib/demoScriptReview";
import { liveUrlIssue } from "@/lib/demoSource";
import { assertSafePublicUrl, SsrfError } from "@/lib/ssrf";

// PAT(외부 AI) 호출은 영어 고정, 쿠키 세션은 유저 로케일 — 인제스트 라우트 전부가
// 같은 규칙을 쓴다(catch 블록 포함).
export async function pickApiT(req: NextRequest) {
  return bearerFromHeader(req.headers.get("authorization")) ? getDictionary("en") : (await getT()).t;
}

// 인제스트 계열 라우트(/api/ingest, finalize, drafts) 공용 헬퍼. 인증·URL 게이트가
// 라우트마다 복사되면 안전 검사가 갈라지므로(lib/ingestStore.ts와 같은 이유) 여기만 수정.

export type IngestDict = ReturnType<typeof getDictionary>;

export function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// PAT(Bearer 헤더) 우선, 없으면 쿠키 세션. 언어는 PAT=en 고정(기계/AI 호출자),
// 세션=쿠키 locale. fail이 있으면 호출부는 그대로 return.
export async function ingestAuth(req: NextRequest): Promise<
  | { userId: string; t: IngestDict; fail?: undefined }
  | { userId?: undefined; t: IngestDict; fail: NextResponse }
> {
  const bearer = bearerFromHeader(req.headers.get("authorization"));
  const t = await pickApiT(req);
  if (bearer) {
    // 옛 CLI(0.1.14 이하)의 `login <코드>`는 페어링 코드를 그대로 토큰으로 저장한다 —
    // 그러면 nf_code_…가 Bearer로 여기 온다(2026-09-16). "토큰이 유효하지 않다"고만
    // 답하면 AI가 엉뚱한 데를 고치므로, 무엇을 해야 하는지 짚어 준다.
    if (looksLikeConnectCode(bearer)) {
      return { t, fail: apiError({ status: 401, message: t.api.pairingCodeAsToken, code: "PAIRING_CODE" }) };
    }
    const tok = await verifyToken(bearer);
    if (!tok) {
      return { t, fail: apiError({ status: 401, message: t.api.tokenInvalid, code: "UNAUTHORIZED" }) };
    }
    return { userId: tok.userId, t };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { t, fail: apiError({ status: 401, message: t.api.loginOrTokenRequired, code: "UNAUTHORIZED" }) };
  }
  return { userId: user.id, t };
}

// 절대 URL(진입 URL·demoAccess.url 공용) 게이트 — 콘텐츠호스트·사설망 조기 차단
// + DNS resolve까지 하는 SSRF 검사. 위반이면 에러 응답, 통과면 null.
export async function publicUrlGate(url: string, t: IngestDict): Promise<NextResponse | null> {
  const issue = liveUrlIssue(url);
  if (issue?.kind === "content-host") {
    return apiError({ status: 400, code: "CONTENT_HOST", message: t.api.contentHostShort(issue.host) });
  }
  if (issue?.kind === "private-host") {
    return apiError({ status: 400, code: "PRIVATE_HOST", message: t.api.privateHostShort });
  }
  try {
    await assertSafePublicUrl(url);
  } catch (e) {
    if (e instanceof SsrfError) {
      return apiError({ status: 400, code: "PRIVATE_HOST", message: t.api.notPublicUrl });
    }
    throw e;
  }
  return null;
}

// ── 발행 결과 에코(도그푸딩 C-1) ────────────────────────────────────────────
// 인제스트는 "틀린 값은 에러 대신 조용히 버린다"가 설계다: AI 툴 태그는 철자가
// 목록과 안 맞으면 사라지고, contentType 오타는 null이 되고, demoHighlights는
// 500자에서 잘리고, demoAccess는 형태가 어긋나면 통째로 없어진다. 발행이 성공해도
// 무엇이 살아남았는지 알 방법이 없어서 올린 AI·사람이 사후 검증을 못 했다.
// 그래서 "요청한 값"이 아니라 **저장 직전의 값**으로 요약을 조립해 응답에 싣는다.
// 표시 전용이므로 여기서 저장 내용을 바꾸지 않는다.

export type AcceptedEcho = {
  title: string;
  descriptionChars: number;
  descriptionLines: number;
  descriptionMaxLineCols: number;
  // 줄별 칸 수(2026-09-16, 외부 AI 피드백 NF-10) — "3줄 54자"만으로는 어느 줄이 위태로운지
  // 알 수 없었다. 상한(52칸)과 나란히 읽으라고 줄 순서 그대로 싣는다.
  descriptionLineCols: number[];
  builderNoteChars: number;
  demoHighlightsChars: number;
  demoHighlightsTruncated: boolean;
  // 촬영 대본(demoScript): 저장된 스텝 수. 0 + demoScriptDropped=true 는 "보냈는데
  // 형식이 어긋나 통째로 버려짐" — 조용한 폐기를 에코가 알리는 기존 원칙 그대로.
  demoScriptSteps: number;
  demoScriptDropped: boolean;
  tags: string[];
  droppedTags: string[];
  contentType: string | null;
  droppedContentType: string | null;
  entryUrl: string | null;
  scoutAltUrl: string | null;
  demoAccess: string | null;
  demoAccessDropped: boolean;
  // 대상 화면(2026-09-15) — 초안 미리보기를 폰 틀/PC 틀로 나누는 답. 필수 게이트라
  // 조용한 폐기는 없다 — null은 "컬럼 마이그레이션 전이라 저장 못 함"뿐이다.
  targetDevice: "mobile" | "desktop" | null;
  // 대본 점검표(2026-09-04) — 게이트는 통과했지만 약한 대본이 어디가 약한지.
  // 자동 촬영이 없는 경우(영상 동봉·대본 없음)엔 아예 싣지 않는다.
  scriptReview?: ScriptReviewEcho;
};

export type ScriptReviewEcho = ScriptStats & {
  selectors: SelectorCheck | null;
  // 예상 촬영 길이와 잘리는 스텝(2026-09-16, 외부 AI 피드백 NF-05/17) — "5~8스텝"만으로는
  // 9스텝 대본이 30초를 넘는지 알 수 없었다. 어림 계산이라 하한으로 읽는 값.
  film: FilmEstimate;
  // 사람이 읽는 문장(PAT=영어·세션=쿠키 언어). 위 숫자에서 파생 — CLI는 숫자로
  // 문장을 직접 만들고, 원시 JSON을 읽는 AI는 이 줄을 그대로 지시문으로 쓴다.
  hints: string[];
};

/**
 * 대본 숫자 + 셀렉터 확인 결과 → 에코. 게이트(400)와 달리 저장을 막지 않는다 —
 * "어디가 약한지"를 응답에 실어, 약한 AI가 같은 턴에 고쳐 다시 올리게 하는 자리.
 */
export function buildScriptReview(
  script: DemoScript,
  selectors: SelectorCheck | null,
  t: IngestDict,
): ScriptReviewEcho {
  const s = scriptStats(script);
  const film = estimateFilm(script);
  const r = t.api.scriptReview;
  const hints: string[] = [];
  // 길이는 스텝을 빼야 하는 판단이라 제일 먼저 말한다 — 뒤 스텝이 통째로 안 찍히는 문제다.
  if (film.cutFromStep) hints.push(r.filmTooLong(film.seconds, film.cutFromStep, film.budget));
  if (s.steps < SCRIPT_REVIEW_IDEAL_STEPS) hints.push(r.fewSteps(s.steps));
  if (s.interactive < SCRIPT_REVIEW_MIN_INTERACTIVE) hints.push(r.lowInteraction(s.interactive, s.steps));
  if (s.wired < s.steps) hints.push(r.unwired(s.steps - s.wired, s.steps));
  if (s.withExpect < s.steps) hints.push(r.noExpect(s.steps - s.withExpect, s.steps));
  if (!s.hasSkip) hints.push(r.noSkip);
  if (selectors?.status === "checked" && selectors.missing.length) {
    hints.push(r.selectorsMissing(selectors.missing, selectors.url));
  } else if (selectors?.status === "skipped" && (selectors.reason === "js-rendered" || selectors.reason === "no-match")) {
    // 빈 JS 틀이든 하나도 안 맞든 "이 HTML로는 판정 못 함" — 같은 문장으로 답한다.
    hints.push(r.selectorsUnverifiable(selectors.url));
  } else if (selectors?.status === "skipped" && (selectors.reason === "fetch-failed" || selectors.reason === "not-html")) {
    hints.push(r.selectorsFetchFailed(selectors.url));
  }
  return { ...s, film, selectors, hints };
}

const DEMO_HIGHLIGHTS_MAX = 500;

// 마이그레이션 적용 전 디그레이드 판별(insert/update/select 공용) — 컬럼이 아직
// 없어도 발행이 살아 있어야 하는 선택 컬럼과, 그 컬럼을 만드는 파일. PostgREST는
// 스키마 캐시 기준 PGRST204("Could not find the '…' column"), 직결 SQL은 42703을
// 낸다. 어느 쪽이든 그 컬럼만 빼고 재시도할 근거.
export const OPTIONAL_COLUMN_MIGRATION = {
  demo_script: "migration_demo_script.sql",
  target_device: "migration_target_device.sql",
} as const;
export type OptionalColumn = keyof typeof OPTIONAL_COLUMN_MIGRATION;

export function missingOptionalColumn(
  e: { code?: string; message?: string } | null | undefined,
): OptionalColumn | null {
  if (!e || (e.code !== "PGRST204" && e.code !== "42703")) return null;
  const msg = e.message ?? "";
  return (Object.keys(OPTIONAL_COLUMN_MIGRATION) as OptionalColumn[]).find((c) => msg.includes(c)) ?? null;
}

export function missingScriptColumn(
  e: { code?: string; message?: string } | null | undefined,
): boolean {
  return missingOptionalColumn(e) === "demo_script";
}

// 소개글 규칙(길이·3줄 모양·칸 계산)은 lib/descriptionShape.ts로 옮겼다(2026-09-04) —
// 대시보드 인라인 편집이 서버와 같은 판정을 써야 해서다. 여기선 그대로 되내보낸다.
export {
  DESCRIPTION_MAX, DESCRIPTION_MIN_LINES, DESCRIPTION_MAX_LINES, DESCRIPTION_LINE_COLS_MAX,
  descriptionTooLong, descriptionShapeIssue, type DescriptionIssue,
} from "@/lib/descriptionShape";

/** 사유 → locale 카피. 라우트 두 곳이 같은 문구를 쓰도록 여기서 한 번만 분기한다. */
export function descriptionShapeMessage(issue: DescriptionIssue, t: IngestDict): string {
  // long-line은 칸 수가 아니라 **몇 번째 줄인지**를 넘긴다 — 고칠 곳을 짚어주는 게
  // "66칸이다"보다 훨씬 쓸모 있다(상한은 maxCols로 따로 알려준다).
  const n = issue.kind === "lines" ? issue.lines : issue.kind === "long-line" ? issue.line : 0;
  return t.api.descriptionShape(issue.kind, n, DESCRIPTION_LINE_COLS_MAX);
}

/** 원문 태그 중 저장되지 못한 것들. 철자 불일치·중복·개수 상한(10) 초과를 모두 잡는다. */
function droppedTagsOf(raw: unknown, kept: string[], normalize: (v: unknown) => string[]): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const one of raw) {
    if (typeof one !== "string") {
      out.push(JSON.stringify(one)?.slice(0, 40) ?? String(one));
      continue;
    }
    const hit = normalize([one])[0];
    if (!hit || !kept.includes(hit)) out.push(one);
  }
  return [...new Set(out)];
}

export function buildAccepted(
  raw: Record<string, unknown> | null | undefined,
  stored: {
    title: string;
    description: string;
    comment: string;
    demoHint: string | null;
    demoScript: DemoScript | null;
    tags: string[];
    contentTypeId: string | null;
    demoAccess: { url?: string; params?: Record<string, string>; impossible?: boolean; noLogin?: boolean; altUrl?: string } | null;
    entryUrl: string | null;
    targetDevice: string | null;
  },
  normalizeTags: (v: unknown) => string[],
  scriptReview?: ScriptReviewEcho,
): AcceptedEcho {
  const rawHint = typeof raw?.demoHighlights === "string" ? raw.demoHighlights.trim() : "";
  const rawType = typeof raw?.contentType === "string" ? raw.contentType.trim() : "";
  const access = stored.demoAccess;
  return {
    ...(scriptReview ? { scriptReview } : {}),
    title: stored.title,
    descriptionChars: [...stored.description].length,
    descriptionLines: stored.description ? stored.description.split("\n").length : 0,
    descriptionMaxLineCols: stored.description
      ? Math.max(...stored.description.split("\n").map(lineCols))
      : 0,
    // 줄별 칸 수(2026-09-16) — 줄 순서 그대로. 52칸이 거절선이라 어느 줄이 위태로운지가 곧 고칠 곳이다.
    descriptionLineCols: stored.description ? stored.description.split("\n").map(lineCols) : [],
    builderNoteChars: [...stored.comment].length,
    demoHighlightsChars: stored.demoHint ? [...stored.demoHint].length : 0,
    demoHighlightsTruncated: [...rawHint].length > DEMO_HIGHLIGHTS_MAX,
    demoScriptSteps: stored.demoScript?.steps.length ?? 0,
    demoScriptDropped: !!raw?.demoScript && !stored.demoScript,
    tags: stored.tags,
    droppedTags: droppedTagsOf(raw?.tags, stored.tags, normalizeTags),
    contentType: stored.contentTypeId,
    droppedContentType: rawType && !stored.contentTypeId ? rawType : null,
    entryUrl: stored.entryUrl || null,
    scoutAltUrl: access?.altUrl ?? null,
    // 에코는 "무엇이 실제로 저장됐나"를 보여주는 자리다(C-1). 로그인 답변 3종이
    // 모두 구별돼 보여야 AI가 자기가 무슨 답을 했는지 확인할 수 있다.
    demoAccess: access?.impossible
      ? "impossible"
      : (access?.url ?? (access?.noLogin ? "no-login" : null)),
    // altUrl은 서버가 스스로 채우는 값이라 "유저가 준 demoAccess가 살아남았나"의 근거가 못 된다.
    demoAccessDropped: !!raw?.demoAccess && !access?.url && !access?.impossible,
    targetDevice: stored.targetDevice === "mobile" || stored.targetDevice === "desktop" ? stored.targetDevice : null,
  };
}
