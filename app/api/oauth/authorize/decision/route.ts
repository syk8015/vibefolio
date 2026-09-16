import { NextRequest, NextResponse } from "next/server";
import { APP_ORIGIN } from "@/lib/previewOrigin";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { validateAuthorizeParams, issueAuthCode, oauthIssuer } from "@/lib/oauth";

// POST /api/oauth/authorize/decision — 동의 화면의 [허용]·[취소]를 받는다.
//
// 인증 코드가 태어나는 유일한 자리다. 화면(app/oauth/authorize)이 이미 같은 검증을
// 했지만 여기서 **다시** 한다 — 화면을 거치지 않고 이 주소로 직접 POST할 수 있으므로,
// 검증이 화면에만 있으면 없는 것과 같다(lib/oauth.ts의 validateAuthorizeParams 공용).

/** 클라이언트에게 결과를 돌려줄 주소 만들기. state는 받은 그대로 되돌려준다. */
function backTo(redirectUri: string, params: Record<string, string | null>) {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v !== null) url.searchParams.set(k, v);
  // POST → GET이라 303. 브라우저가 본문을 다시 보내지 않는다.
  return NextResponse.redirect(url.toString(), 303);
}

export async function POST(req: NextRequest) {
  try {
    // CSRF: 쿠키 세션으로 **상태를 바꾸는** POST다. 서버 액션과 달리 라우트 핸들러엔
    // 자동 방어가 없으므로 Origin을 본다 — 남의 사이트에 심어 둔 폼이 사용자의 쿠키로
    // 조용히 연결을 승인시키는 것을 막는 자리다.
    const origin = req.headers.get("origin");
    if (origin && origin !== APP_ORIGIN && origin !== req.nextUrl.origin) {
      return NextResponse.json({ error: "invalid_request", error_description: "bad origin" }, { status: 403 });
    }

    const form = new URLSearchParams(await req.text());

    // 로그인 확인. 화면을 이미 봤다면 있는 게 정상이고, 없으면 승인할 사람이 없다.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(new URL("/login", req.nextUrl.origin).toString(), 303);
    }

    const check = await validateAuthorizeParams(form);
    if (!check.ok) {
      if (!check.redirectTo) {
        // 돌려줄 주소를 못 믿는다 — 화면에 띄운다(열린 리다이렉터가 되지 않는다).
        const url = new URL("/oauth/authorize", req.nextUrl.origin);
        url.searchParams.set("error", check.error.code);
        url.searchParams.set("error_description", check.error.message);
        return NextResponse.redirect(url.toString(), 303);
      }
      return backTo(check.redirectTo, {
        error: check.error.code,
        error_description: check.error.message,
        state: check.state,
      });
    }

    const { req: authReq } = check;

    // [취소] — 규약대로 access_denied를 실어 돌려보낸다. 아무 일도 일어나지 않는다.
    if (form.get("decision") !== "allow") {
      return backTo(authReq.redirectUri, { error: "access_denied", state: authReq.state });
    }

    const code = await issueAuthCode({
      userId: user.id,
      clientId: authReq.clientId,
      redirectUri: authReq.redirectUri,
      codeChallenge: authReq.codeChallenge,
      resource: authReq.resource,
      scope: authReq.scope,
    });
    if (!code) {
      logger.error("oauth/decision: code issue failed", { clientId: authReq.clientId });
      return backTo(authReq.redirectUri, {
        error: "server_error",
        error_description: "Could not issue an authorization code.",
        state: authReq.state,
      });
    }

    // iss(RFC 9207) — 이 코드를 누가 발급했는지. 클라이언트가 교환 전에 대조해
    // 섞어치기 공격을 잡는다.
    return backTo(authReq.redirectUri, { code, state: authReq.state, iss: oauthIssuer() });
  } catch (err) {
    logger.error("oauth/decision: unhandled", { error: err });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
