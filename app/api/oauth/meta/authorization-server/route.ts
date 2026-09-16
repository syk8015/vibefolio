import { NextResponse } from "next/server";
import { oauthIssuer, OAUTH_SCOPE } from "@/lib/oauth";

// GET /.well-known/oauth-authorization-server — 인증 서버 메타데이터(RFC 8414).
// next.config.ts의 rewrite가 여기로 잇는다.
//
// 두 항목이 **같이** 있어야 Claude가 CIMD(등록 없는 방식)를 고른다:
//   client_id_metadata_document_supported: true
//   token_endpoint_auth_methods_supported: ["none"]
// 둘 중 하나라도 빠지면 Claude는 registration_endpoint(동적 등록)를 찾고, 우리는
// 그걸 안 만들었으므로 연결이 실패한다. 값을 지우지 말 것.
//
// `issuer`는 이 문서를 가져온 주소를 만들 때 쓴 issuer와 바이트 단위로 같아야 한다
// (클라이언트가 대조하고, 다르면 거절한다).
export async function GET() {
  const issuer = oauthIssuer();
  return NextResponse.json(
    {
      issuer,
      // 사람이 눈으로 보고 [허용]을 누르는 자리라 API가 아니라 **페이지**다.
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/api/oauth/token`,
      scopes_supported: [OAUTH_SCOPE],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      // 공개 클라이언트 — 비밀값 없이 PKCE만으로 교환한다. Claude가 그렇게 등록된다.
      token_endpoint_auth_methods_supported: ["none"],
      // PKCE는 필수이고 S256만 받는다. 이 항목이 없으면 클라이언트는 진행을 거부해야 한다.
      code_challenge_methods_supported: ["S256"],
      client_id_metadata_document_supported: true,
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}
