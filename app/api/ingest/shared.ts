import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/apiError";
import { getT } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { verifyToken, bearerFromHeader } from "@/lib/apiToken";
import type { DemoScript } from "@/lib/demoScript";
import { liveUrlIssue } from "@/lib/demoSource";
import { assertSafePublicUrl, SsrfError } from "@/lib/ssrf";

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
  const t = bearer ? getDictionary("en") : (await getT()).t;
  if (bearer) {
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
};

const DEMO_HIGHLIGHTS_MAX = 500;

// migration_demo_script.sql 적용 전 디그레이드 판별(insert/update 공용) —
// PostgREST는 스키마 캐시 기준 PGRST204("Could not find the '…' column"),
// 직결 SQL은 42703을 낸다. 어느 쪽이든 대본만 빼고 재시도할 근거.
export function missingScriptColumn(
  e: { code?: string; message?: string } | null | undefined,
): boolean {
  return !!e && (e.code === "PGRST204" || e.code === "42703") &&
    (e.message ?? "").includes("demo_script");
}

// 설명은 일부러 3줄로 끊어 쓰는 카피라, "몇 자냐"보다 "몇 줄이고 한 줄이 얼마나
// 기냐"가 실제 화면을 결정한다. 한글은 터미널·화면에서 두 칸을 먹으므로 글자 수가
// 아니라 칸 수로 잰다. 폰 명함(폭 280px·12px)에서 한 줄에 들어가는 건 대략 46칸.
function lineCols(line: string): number {
  let w = 0;
  for (const ch of line) {
    const c = ch.codePointAt(0)!;
    const wide =
      (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6) || c >= 0x1f300;
    w += wide ? 2 : 1;
  }
  return w;
}

// 설명은 명함 화면에서 작품 위에 겹쳐 뜨는 글(components/theater/TheaterStage.tsx)이라
// 길면 첫인상을 통째로 망친다. 화면은 3줄에서 자르고, 여기서는 "벽 같은 글"이 애초에
// 저장되지 못하게 막는다. 조용히 자르지 않고 400으로 되돌려 보내는 이유: 문장 중간에서
// 잘린 소개글은 안 잘린 것보다 나쁘고, AI 호출자는 에러를 보면 줄여서 다시 보낸다.
export const DESCRIPTION_MAX = 200;
export const descriptionTooLong = (v: string) => [...v].length > DESCRIPTION_MAX;

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
  },
  normalizeTags: (v: unknown) => string[],
): AcceptedEcho {
  const rawHint = typeof raw?.demoHighlights === "string" ? raw.demoHighlights.trim() : "";
  const rawType = typeof raw?.contentType === "string" ? raw.contentType.trim() : "";
  const access = stored.demoAccess;
  return {
    title: stored.title,
    descriptionChars: [...stored.description].length,
    descriptionLines: stored.description ? stored.description.split("\n").length : 0,
    descriptionMaxLineCols: stored.description
      ? Math.max(...stored.description.split("\n").map(lineCols))
      : 0,
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
  };
}
