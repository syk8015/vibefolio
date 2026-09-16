import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requireUser } from "@/lib/routeAuth";
import { getT } from "@/lib/i18n/server";
import { rateLimit } from "@/lib/rate-limit";
import { issueConnectCode, CONNECT_CODE_TTL_MIN } from "@/lib/connectCode";

// POST /api/connect/code — 프롬프트에 심을 **1회용 페어링 코드**를 발급한다(2026-09-16).
//
// 예전엔 [프롬프트 복사]가 /api/tokens로 raw PAT를 받아 프롬프트에 박았다. 그 프롬프트는
// AI 채팅창에 붙여넣는 물건이라 살아 있는 크리덴셜이 대화 기록에 영구히 남았다. 이제
// 프롬프트엔 코드만 들어가고, CLI `login <코드>`가 /api/connect/exchange에서 진짜
// 토큰으로 바꿔 받는다 — 기록에 남는 코드는 30분 뒤 또는 첫 교환 즉시 죽는다.
//
// 토큰은 여기서 만들지 않는다. 교환 시점에 만들어지므로, 프롬프트를 복사만 하고 쓰지
// 않으면 토큰은 아예 생기지 않는다(예전엔 복사마다 토큰이 하나 생겼다).
// 본문을 읽지 않는다(누가 요청했는지는 쿠키 세션이 말한다) — 그래서 req 매개변수도 없다.
export async function POST() {
  const { t } = await getT();
  try {
    const auth = await requireUser(t.api.loginRequired);
    if (auth instanceof NextResponse) return auth;
    const { user } = auth;

    // 코드는 싸지만 무한 발급은 행을 쌓는다 — 유저 키로 넉넉한 상한만 둔다.
    const allowed = await rateLimit({ name: "connect-code", key: user.id, windowSeconds: 3600, max: 30 });
    if (!allowed) {
      return apiError({ status: 429, message: t.api.tooManyRequests, code: "RATE_LIMITED" });
    }

    const issued = await issueConnectCode(user.id);
    if (!issued) {
      return apiError({ status: 500, message: t.api.pairingCodeFailed, code: "CODE_ISSUE_FAILED" });
    }
    // raw 코드는 이 응답에만. 화면은 이것을 프롬프트 본문에 끼워 클립보드로 보낸다.
    return NextResponse.json({
      ok: true,
      code: issued.code,
      expiresAt: issued.expiresAt,
      expiresInMinutes: CONNECT_CODE_TTL_MIN,
    });
  } catch (err) {
    return apiError({ status: 500, message: t.api.retryLater, code: "INTERNAL", cause: err });
  }
}
