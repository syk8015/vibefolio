import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIpKey } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import {
  redeemAuthCode, verifyPkce, issueGrant, rotateGrant, parseClientId, OAuthError,
} from "@/lib/oauth";

// POST /api/oauth/token — 인증 코드·갱신 토큰을 액세스 토큰으로 바꿔 준다(OAuth 2.1).
//
// 여기는 **폼 인코딩**으로 받는다(application/x-www-form-urlencoded). JSON만 받으면
// 클라이언트가 415를 받고 연결이 통째로 깨진다 — OAuth의 규약이라 선택지가 아니다.
//
// 클라이언트는 공개 클라이언트다: client_secret이 없고, 코드를 가로챈 쪽이 쓰지
// 못하게 막는 것은 오직 PKCE다. 그래서 code_verifier 검증이 이 라우트의 심장이다.
//
// 응답 형식·오류 코드는 RFC 6749 그대로 — 우리 apiError({ok:false,error,code})를
// 쓰지 않는 유일한 계열이다. OAuth 클라이언트는 `{"error":"invalid_grant"}` 모양만
// 알아듣고, 특히 갱신 실패에 invalid_grant가 아닌 값을 주면 재로그인 유도가 끊긴다.

/** RFC 6749 §5.2 오류 응답. 토큰 응답은 절대 캐시되면 안 된다(§5.1). */
function oauthError(code: string, description: string, status = 400) {
  return NextResponse.json(
    { error: code, error_description: description },
    { status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
  );
}

function tokenResponse(grant: {
  accessToken: string; refreshToken: string; expiresIn: number; scope: string;
}) {
  return NextResponse.json(
    {
      access_token: grant.accessToken,
      token_type: "Bearer",
      expires_in: grant.expiresIn,
      refresh_token: grant.refreshToken,
      scope: grant.scope,
    },
    { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
  );
}

export async function POST(req: NextRequest) {
  try {
    // 인증 없는 입구라 IP 상한을 둔다(코드·갱신 토큰 모두 난수지만 입구는 열려 있다).
    const allowed = await rateLimit({
      name: "oauth-token", key: clientIpKey(req), windowSeconds: 3600, max: 60,
    });
    if (!allowed) return oauthError("invalid_request", "Too many token requests.", 429);

    let form: URLSearchParams;
    try {
      form = new URLSearchParams(await req.text());
    } catch {
      return oauthError("invalid_request", "The body must be application/x-www-form-urlencoded.");
    }
    const grantType = form.get("grant_type");

    // ── 갱신 ────────────────────────────────────────────────────────────────
    if (grantType === "refresh_token") {
      const refresh = form.get("refresh_token");
      if (!refresh) return oauthError("invalid_request", "refresh_token is required.");
      // 만료·폐기·이미 회전된 갱신 토큰은 전부 같은 답 — 어느 쪽인지 알려 줄 이유가 없고,
      // 클라이언트가 해야 할 일(다시 로그인)은 어차피 하나다.
      const rotated = await rotateGrant(refresh);
      if (!rotated) return oauthError("invalid_grant", "This refresh token is no longer valid. Start the authorization flow again.");
      return tokenResponse(rotated);
    }

    // ── 인증 코드 교환 ──────────────────────────────────────────────────────
    if (grantType !== "authorization_code") {
      return oauthError("unsupported_grant_type", "Only authorization_code and refresh_token are supported.");
    }

    const code = form.get("code");
    const verifier = form.get("code_verifier");
    const redirectUri = form.get("redirect_uri");
    if (!code) return oauthError("invalid_request", "code is required.");
    if (!verifier) return oauthError("invalid_request", "code_verifier is required (this server requires PKCE).");

    let clientId: string;
    try {
      clientId = parseClientId(form.get("client_id"));
    } catch (e) {
      const err = e as OAuthError;
      return oauthError(err.code ?? "invalid_client", err.message);
    }

    // 코드는 1회용이다 — 여기서 소비된다. 아래 검사가 실패하면 코드는 이미 죽었고,
    // 그게 맞다(가로챈 코드를 재시도로 우려먹지 못하게).
    const redeemed = await redeemAuthCode(code);
    if (!redeemed) return oauthError("invalid_grant", "This authorization code is invalid, expired, or already used.");

    // 코드를 받아 간 클라이언트와 지금 교환하는 클라이언트가 같아야 한다.
    if (redeemed.clientId !== clientId) {
      return oauthError("invalid_grant", "This authorization code was issued to a different client.");
    }
    // redirect_uri는 인증 요청 때와 **정확히** 같아야 한다(RFC 6749 §4.1.3).
    if (!redirectUri || redirectUri !== redeemed.redirectUri) {
      return oauthError("invalid_grant", "redirect_uri does not match the one used to obtain this code.");
    }
    // PKCE — 코드를 가로챈 쪽은 verifier를 모른다. 이 검사가 공개 클라이언트의 유일한 자물쇠다.
    if (!verifyPkce(verifier, redeemed.codeChallenge)) {
      return oauthError("invalid_grant", "code_verifier does not match the code_challenge.");
    }

    const grant = await issueGrant({
      userId: redeemed.userId,
      clientId: redeemed.clientId,
      scope: redeemed.scope,
    });
    if (!grant) {
      logger.error("oauth/token: grant issue failed", { clientId });
      return oauthError("server_error", "Could not issue a token. Please try connecting again.", 500);
    }
    return tokenResponse(grant);
  } catch (err) {
    logger.error("oauth/token: unhandled", { error: err });
    return oauthError("server_error", "Something went wrong. Please try again.", 500);
  }
}
