import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { rateLimit, clientIpKey } from "@/lib/rate-limit";
import { redeemConnectCode } from "@/lib/connectCode";
import { issueToken } from "@/lib/apiToken";
import { AUTO_TOKEN_NAME } from "@/lib/connectSnippets";
import { logger } from "@/lib/logger";

// POST /api/connect/exchange — 1회용 페어링 코드를 액세스 토큰으로 바꿔 준다(2026-09-16).
//
// 호출자는 `npx nookframe login <코드>`를 실행한 CLI다. 로그인 세션이 없다 — **코드가
// 곧 인증**이다. 그래서 코드는 32바이트 난수(추측 불가)이고, 30분·1회용이며, 소비는
// 조건부 UPDATE로 원자적이다(lib/connectCode.ts). 쿠키를 안 쓰므로 CSRF 표면도 없다.
//
// 답은 영어 사전 고정 — PAT 경로와 같은 규약(기계·AI 호출자). 발급하는 토큰은 연결
// 패널의 자동 토큰과 같은 센티널 이름을 쓰므로, 새로 페어링하면 이전 자동 토큰은 죽는다.
export async function POST(req: NextRequest) {
  const t = getDictionary("en");
  try {
    // 코드는 난수라 대입이 사실상 불가능하지만, 교환은 인증 없는 입구라 IP 상한을 둔다.
    const allowed = await rateLimit({
      name: "connect-exchange", key: clientIpKey(req), windowSeconds: 3600, max: 20,
    });
    if (!allowed) {
      return apiError({ status: 429, message: t.api.tooManyRequests, code: "RATE_LIMITED" });
    }

    let code: unknown;
    try {
      const body = await req.json();
      code = body?.code;
    } catch {
      return apiError({ status: 400, message: t.api.jsonBodyInvalid, code: "BAD_JSON" });
    }
    // 코드는 본문으로만 받는다(쿼리 금지) — 서버 로그·리퍼러에 남지 않게, PAT와 같은 규율.
    if (typeof code !== "string" || !code.trim()) {
      return apiError({ status: 400, message: t.api.pairingCodeInvalid, code: "CODE_INVALID" });
    }

    const userId = await redeemConnectCode(code.trim());
    // 어떤 실패든(없는 코드·이미 쓴 코드·만료) 같은 답 — 유저 열거의 실마리를 주지 않는다.
    if (!userId) {
      return apiError({ status: 401, message: t.api.pairingCodeInvalid, code: "CODE_INVALID" });
    }

    const issued = await issueToken({ userId, name: AUTO_TOKEN_NAME, revokeSameName: true });
    if (!issued.ok) {
      // 코드는 이미 소비됐다(재시도 불가) — 로그에 사유를 남겨야 원인이 추적된다.
      logger.error("connect/exchange: token issue failed", { reason: issued.reason, cause: issued.cause });
      return apiError({
        status: issued.reason === "limit" ? 409 : 500,
        message: issued.reason === "limit" ? t.api.tokenLimit(10) : t.api.tokenCreateFailed,
        code: issued.reason === "limit" ? "TOKEN_LIMIT" : "TOKEN_ISSUE_FAILED",
      });
    }
    // raw 토큰은 여기서만. CLI가 ~/.nookframe/config.json(0600)에 저장한다.
    return NextResponse.json({ ok: true, token: issued.raw, prefix: issued.prefix });
  } catch (err) {
    return apiError({ status: 500, message: t.api.retryLater, code: "INTERNAL", cause: err });
  }
}
