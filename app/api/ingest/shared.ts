import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/apiError";
import { getT } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { verifyToken, bearerFromHeader } from "@/lib/apiToken";
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
