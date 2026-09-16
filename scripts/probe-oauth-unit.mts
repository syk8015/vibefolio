// 원격 MCP용 OAuth의 순수 판정 검사(2026-09-17). 네트워크·DB를 안 탄다.
//
// 여기서 지키는 것은 "연결이 조용히 깨지는 방법" 세 가지다:
//   1. 발견 문서에서 CIMD 두 항목 중 하나가 빠지면 Claude가 등록 방식으로 떨어진다
//      — 우리는 등록을 안 만들었으므로 그대로 연결 실패다. 화면엔 이유가 안 나온다.
//   2. client_id URL 규칙이 느슨해지면 사칭·SSRF 입구가 열린다.
//   3. PKCE 검증이 틀리면 가로챈 인증 코드로 토큰이 나온다(공개 클라이언트의 유일한 자물쇠).
import {
  parseClientId, redirectUriAllowed, verifyPkce, mcpResourceUrl, oauthIssuer, OAUTH_SCOPE,
  OAuthError, type ClientDoc,
} from "../lib/oauth";
import { GET as asMetaGet } from "../app/api/oauth/meta/authorization-server/route";
import { GET as prmGet } from "../app/api/oauth/meta/protected-resource/route";

let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail.slice(0, 200)}` : ""}`);
  if (!pass) failed++;
};
const rejects = (name: string, fn: () => unknown) => {
  try {
    fn();
    ok(name, false, "거절해야 하는데 통과했습니다");
  } catch (e) {
    ok(name, e instanceof OAuthError, e instanceof Error ? e.message : String(e));
  }
};

// ── (1) client_id URL 규칙 ───────────────────────────────────────────────────
const GOOD = "https://claude.ai/oauth/claude-code-client-metadata";
ok("(1a) 정상 client_id 통과", parseClientId(GOOD) === GOOD);
rejects("(1b) http 거절", () => parseClientId("http://claude.ai/oauth/x"));
rejects("(1c) 경로 없는 URL 거절", () => parseClientId("https://claude.ai"));
rejects("(1d) 경로가 / 뿐이면 거절", () => parseClientId("https://claude.ai/"));
rejects("(1e) 프래그먼트 거절", () => parseClientId("https://claude.ai/oauth/x#y"));
rejects("(1f) 사용자정보 거절", () => parseClientId("https://u:p@claude.ai/oauth/x"));
rejects("(1g) 점 세그먼트 거절", () => parseClientId("https://claude.ai/oauth/../x"));
rejects("(1h) URL이 아니면 거절", () => parseClientId("claude-ai"));
rejects("(1i) 빈 값 거절", () => parseClientId(""));

// ── (2) 리다이렉트 주소 대조 ─────────────────────────────────────────────────
const hosted: ClientDoc = {
  client_id: GOOD,
  client_name: "Claude",
  redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
};
const local: ClientDoc = {
  client_id: GOOD,
  redirect_uris: ["http://localhost/callback", "http://127.0.0.1/callback"],
};
ok("(2a) 정확히 일치하면 허용", redirectUriAllowed(hosted, "https://claude.ai/api/mcp/auth_callback"));
ok("(2b) 목록에 없는 주소 거절", !redirectUriAllowed(hosted, "https://evil.example/api/mcp/auth_callback"));
ok("(2c) 같은 호스트라도 다른 경로면 거절", !redirectUriAllowed(hosted, "https://claude.ai/steal"));
// 루프백만 포트를 무시한다 — 터미널 클라이언트는 빈 포트를 그때그때 잡아 쓴다.
ok("(2d) 루프백은 포트가 달라도 허용", redirectUriAllowed(local, "http://localhost:3118/callback"));
ok("(2e) 127.0.0.1도 포트 무시", redirectUriAllowed(local, "http://127.0.0.1:52341/callback"));
ok("(2f) 루프백이라도 경로가 다르면 거절", !redirectUriAllowed(local, "http://localhost:3118/evil"));
// 포트 무시는 루프백 전용이다. 바깥 호스트에까지 번지면 하위도메인 탈취가 통한다.
ok("(2g) 바깥 호스트엔 포트 무시 안 함", !redirectUriAllowed(hosted, "https://claude.ai:8443/api/mcp/auth_callback"));
ok("(2h) https 루프백은 http 목록과 안 맞음", !redirectUriAllowed(local, "https://localhost:3118/callback"));

// ── (3) PKCE (RFC 7636 부록 B의 공식 예시) ───────────────────────────────────
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
ok("(3a) 규격 예시 통과", verifyPkce(VERIFIER, CHALLENGE));
ok("(3b) 틀린 verifier 거절", !verifyPkce("wrong-verifier", CHALLENGE));
ok("(3c) 빈 verifier 거절", !verifyPkce("", CHALLENGE));
ok("(3d) 빈 challenge 거절", !verifyPkce(VERIFIER, ""));
// 길이가 다른 값으로 timingSafeEqual을 부르면 던진다 — 던지지 않고 false여야 한다.
ok("(3e) 길이가 다른 challenge에 예외 없이 false", verifyPkce(VERIFIER, "short") === false);

// ── (4) 발견 문서 ────────────────────────────────────────────────────────────
const asMeta = await (await asMetaGet()).json();
ok("(4a) issuer가 우리 주소", asMeta.issuer === oauthIssuer(), asMeta.issuer);
ok("(4b) 인증 화면은 페이지 경로", asMeta.authorization_endpoint === `${oauthIssuer()}/oauth/authorize`, asMeta.authorization_endpoint);
ok("(4c) 토큰 주소", asMeta.token_endpoint === `${oauthIssuer()}/api/oauth/token`, asMeta.token_endpoint);
// 아래 둘이 **같이** 있어야 Claude가 CIMD를 고른다. 하나라도 빠지면 등록 방식을
// 찾다가 연결이 실패한다 — 이 프로브의 존재 이유.
ok("(4d) CIMD 지원을 밝힘", asMeta.client_id_metadata_document_supported === true);
ok("(4e) 공개 클라이언트(none)를 밝힘", Array.isArray(asMeta.token_endpoint_auth_methods_supported)
  && asMeta.token_endpoint_auth_methods_supported.includes("none"));
ok("(4f) PKCE S256만", JSON.stringify(asMeta.code_challenge_methods_supported) === JSON.stringify(["S256"]));
ok("(4g) grant 두 가지", JSON.stringify(asMeta.grant_types_supported) === JSON.stringify(["authorization_code", "refresh_token"]));
ok("(4h) response_type=code", JSON.stringify(asMeta.response_types_supported) === JSON.stringify(["code"]));

const prm = await (await prmGet()).json();
// resource는 MCP 주소와 글자 그대로 같아야 한다 — 다르면 토큰의 대상 판정이 깨진다.
ok("(4i) PRM resource = MCP 주소", prm.resource === mcpResourceUrl(), prm.resource);
ok("(4j) PRM이 가리키는 인증 서버는 하나", Array.isArray(prm.authorization_servers)
  && prm.authorization_servers.length === 1 && prm.authorization_servers[0] === oauthIssuer());
ok("(4k) 토큰은 헤더로만", JSON.stringify(prm.bearer_methods_supported) === JSON.stringify(["header"]));
ok("(4l) 범위가 두 문서에서 같음", JSON.stringify(prm.scopes_supported) === JSON.stringify([OAUTH_SCOPE])
  && JSON.stringify(asMeta.scopes_supported) === JSON.stringify([OAUTH_SCOPE]));
// offline_access를 실으면 클라이언트가 그 범위를 덧붙여 요청한다 — 우리는 안 준다.
ok("(4m) offline_access 안 실림", !JSON.stringify(prm.scopes_supported).includes("offline_access"));

// ── (5) MCP 주소 모양 ────────────────────────────────────────────────────────
// `/sse`로 끝나면 클라이언트가 옛 SSE 전송으로 잡는다. 끝 슬래시도 대상 판정을 깬다.
ok("(5a) /sse로 끝나지 않음", !mcpResourceUrl().endsWith("/sse"));
ok("(5b) 끝 슬래시 없음", !mcpResourceUrl().endsWith("/"));
ok("(5c) https", mcpResourceUrl().startsWith("https://"));

console.log(failed ? `\n${failed}건 실패` : "\nALL PASS");
process.exit(failed ? 1 : 0);
