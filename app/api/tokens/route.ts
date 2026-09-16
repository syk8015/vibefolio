import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requireUser } from "@/lib/routeAuth";
import { getT } from "@/lib/i18n/server";
import { issueToken, MAX_TOKENS_PER_USER } from "@/lib/apiToken";
import { AUTO_TOKEN_NAME, MCP_TOKEN_NAME } from "@/lib/connectSnippets";

// POST /api/tokens — 로그인한 유저가 새 개인 액세스 토큰(PAT)을 발급한다.
// raw 토큰은 이 응답에서 딱 한 번만 노출된다(DB엔 sha256 해시만 저장). 발급/조회는
// 서비스롤 경로 — api_tokens 엔 insert RLS 정책이 없어 클라 직접 쓰기는 막혀 있다.
export async function POST(req: NextRequest) {
  const { t } = await getT();
  try {
    const auth = await requireUser(t.api.loginRequired);
    if (auth instanceof NextResponse) return auth;
    const { user } = auth;

    let name: string | null = null;
    // 센티널 이름 2종: 프롬프트 자동발급(auto) · MCP 설정 복사(mcp, 2026-09-04).
    // 둘 다 "복사할 때마다 새 토큰, 이전 것은 즉시 무효" 규칙을 같이 탄다.
    let sentinel: string | null = null;
    try {
      const body = await req.json();
      if (body?.auto === true) sentinel = AUTO_TOKEN_NAME;
      else if (body?.mcp === true) sentinel = MCP_TOKEN_NAME;
      if (typeof body?.name === "string") name = body.name.trim().slice(0, 80) || null;
    } catch {
      /* name·auto·mcp는 선택 — 본문 없어도 됨 */
    }

    // 자동발급(연결 패널 "MCP 설정 복사" 등) — 살아있는 센티널 토큰은 유저당 이름별로
    // 항상 1개가 되도록 이전 것을 먼저 폐기한다(복사할 때마다 새 토큰, 이전 것은 즉시
    // 무효). 발급 규약 자체는 lib/apiToken.ts의 issueToken 한 곳 — 페어링 코드 교환
    // (/api/connect/exchange)이 같은 규칙을 써야 해서 2026-09-16에 뽑아냈다.
    if (sentinel) name = sentinel;
    const issued = await issueToken({ userId: user.id, name, revokeSameName: !!sentinel });
    if (!issued.ok) {
      if (issued.reason === "limit") {
        return apiError({
          status: 409,
          message: t.api.tokenLimit(MAX_TOKENS_PER_USER),
          code: "TOKEN_LIMIT",
        });
      }
      return apiError({
        status: 500,
        message: t.api.tokenCreateFailed,
        code: issued.reason === "revoke" ? "DB_REVOKE_FAILED" : "DB_INSERT_FAILED",
        cause: issued.cause,
      });
    }

    // raw는 여기서만. 클라이언트는 이 값을 복사해 NOOKFRAME_TOKEN으로 저장한다.
    return NextResponse.json({ ok: true, token: issued.raw, prefix: issued.prefix });
  } catch (err) {
    return apiError({ status: 500, message: t.api.retryLater, code: "INTERNAL", cause: err });
  }
}
