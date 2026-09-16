import { NextResponse } from "next/server";
import { mcpResourceUrl, oauthIssuer, OAUTH_SCOPE } from "@/lib/oauth";

// GET /.well-known/oauth-protected-resource[/api/mcp] — 보호 자원 메타데이터(RFC 9728).
// 실제 주소는 next.config.ts의 rewrite가 여기로 잇는다(app/ 안의 점 폴더는 라우트가
// 안 된다). MCP 클라이언트는 우리 /api/mcp가 준 401의 resource_metadata를 따라와
// 이 문서를 읽고, 여기 적힌 인증 서버로 로그인하러 간다 — 발견의 첫 칸이다.
//
// 주의: `resource`는 MCP 엔드포인트 주소와 **글자 그대로** 같아야 한다(경로 포함,
// 끝 슬래시 없음). 다르면 클라이언트가 토큰의 대상이 우리가 맞는지 판정하지 못한다.
export async function GET() {
  return NextResponse.json(
    {
      resource: mcpResourceUrl(),
      // 클라이언트는 **첫 항목만** 본다(뒤로 넘어가지 않는다) — 하나만 싣는다.
      authorization_servers: [oauthIssuer()],
      // 토큰은 Authorization 헤더로만 받는다. 쿼리스트링 전달은 금지(PAT와 같은 규율).
      bearer_methods_supported: ["header"],
      scopes_supported: [OAUTH_SCOPE],
      resource_name: "Nookframe",
    },
    {
      headers: {
        // 공개 문서라 누구나 읽어도 되고, 브라우저에서 도는 MCP 클라이언트도 있다.
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}
