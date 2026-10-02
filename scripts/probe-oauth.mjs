// 원격 MCP 커넥터의 OAuth 전체 흐름 실서버 검사(2026-10-02) — 발견 → 동의 → 코드 → 토큰 → MCP → 갱신.
//
// 단위 검사(probe-oauth-unit, npm test)는 규칙 함수만 본다. 여기는 실제 주소들을 차례로 부른다 — Claude
// 커넥터가 연결할 때 밟는 길 그대로라, 이게 깨지면 커넥터 연결이 조용히 실패한다.
//   (0) 발견 문서 두 장 + MCP 401의 WWW-Authenticate가 서로를 가리킨다
//   (1) 동의 화면이 뜨고, [허용]이 루프백 주소로 code·state·iss를 돌려준다
//   (2) 막아야 하는 것: 남의 Origin(CSRF) 403 · [취소] = access_denied · 목록에 없는 redirect_uri는
//       그 주소로 안 보냄(열린 리다이렉터 금지) · 로그인 없으면 /login
//   (3) 토큰: PKCE 틀리면 invalid_grant(코드는 그 자리에서 죽음) · redirect_uri 다르면 invalid_grant ·
//       맞으면 토큰 한 쌍 · 같은 코드 두 번째는 invalid_grant
//   (4) 받은 토큰으로 MCP initialize · tools/list · tools/call(읽기 툴) → 200
//   (5) 갱신은 회전 — 새 쌍을 주고, 옛 갱신 토큰·옛 액세스 토큰은 죽는다
//
// 클라이언트는 Claude Code가 실제로 쓰는 공개 설명서(루프백 콜백)라 우리가 따로 띄울 것이 없다 —
// 콜백 주소는 Location 머리에서 읽기만 하고 열지 않는다. **계정은 1회용**(같은 사람·같은 클라이언트로
// 토큰을 새로 받으면 옛 연결이 폐기되므로 실제 계정을 쓰면 그 사람의 Claude Code 연결이 끊긴다).
// 사용: `node scripts/probe-oauth.mjs`
import "./_secrets.mjs";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createChunks, stringToBase64URL } from "@supabase/ssr";

const ORIGIN = process.env.PROBE_ORIGIN ?? "https://nookframe.com";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const CLIENT_ID = "https://claude.ai/oauth/claude-code-client-metadata";
const PORT = 40000 + Math.floor(Math.random() * 20000);
const REDIRECT = `http://localhost:${PORT}/callback`; // 설명서엔 포트 없이 — 루프백은 포트를 무시한다(RFC 8252)
const PROTOCOL = "2025-06-18";

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${String(detail).slice(0, 220)}` : ""}`);
  if (!pass) failed++;
};
const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};
const authParams = (challenge, extra = {}) => new URLSearchParams({
  response_type: "code",
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT,
  code_challenge: challenge,
  code_challenge_method: "S256",
  state: `st-${randomBytes(6).toString("hex")}`,
  resource: `${ORIGIN}/api/mcp`,
  ...extra,
});

let userId = null;
try {
  // (0) 발견
  const mcp401 = await fetch(`${ORIGIN}/api/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  const wwwAuth = mcp401.headers.get("www-authenticate") ?? "";
  const prmUrl = /resource_metadata="([^"]+)"/.exec(wwwAuth)?.[1];
  ok("(0) 토큰 없는 MCP → 401 + resource_metadata", mcp401.status === 401 && !!prmUrl, `${mcp401.status} ${wwwAuth.slice(0, 120)}`);
  const prm = prmUrl ? await fetch(prmUrl).then((r) => r.json()) : {};
  ok("(0) 보호 자원 문서: resource = MCP 주소", prm.resource === `${ORIGIN}/api/mcp`, JSON.stringify(prm).slice(0, 160));
  const asUrl = `${prm.authorization_servers?.[0]}/.well-known/oauth-authorization-server`;
  const as = await fetch(asUrl).then((r) => r.json()).catch(() => ({}));
  ok("(0) 인증 서버 문서: CIMD 두 항목 + PKCE S256",
    as.client_id_metadata_document_supported === true &&
      JSON.stringify(as.token_endpoint_auth_methods_supported) === '["none"]' &&
      (as.code_challenge_methods_supported ?? []).includes("S256") &&
      as.issuer === prm.authorization_servers?.[0],
    JSON.stringify(as).slice(0, 160));

  // 1회용 계정 + 로그인 쿠키
  const stamp = Date.now();
  const email = `delivered+nfprobe-oauth-${stamp}@resend.dev`;
  const username = `nfprobeoa${stamp}`.slice(0, 30);
  const { data: created, error: cErr } = await svc.auth.admin.createUser({ email, email_confirm: true, user_metadata: { username } });
  if (cErr) throw cErr;
  userId = created.user.id;
  await svc.from("profiles").upsert({ id: userId, username, name: "NF probe" });
  const { data: link } = await svc.auth.admin.generateLink({ type: "magiclink", email });
  const anon = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sess, error: vErr } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (vErr) throw vErr;
  const ref = new URL(URL_).hostname.split(".")[0];
  const cookie = createChunks(`sb-${ref}-auth-token`, "base64-" + stringToBase64URL(JSON.stringify(sess.session)))
    .map((c) => `${c.name}=${c.value}`).join("; ");

  const decide = (params, { decision = "allow", origin = ORIGIN, withCookie = true } = {}) => {
    const body = new URLSearchParams(params);
    body.set("decision", decision);
    return fetch(`${as.issuer}/api/oauth/authorize/decision`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin,
        ...(withCookie ? { cookie } : {}),
      },
      body,
    });
  };
  const codeFrom = (res) => {
    const loc = res.headers.get("location") ?? "";
    try {
      const u = new URL(loc);
      return { loc, url: u, code: u.searchParams.get("code"), error: u.searchParams.get("error") };
    } catch {
      return { loc, url: null, code: null, error: null };
    }
  };
  const token = (form) => fetch(as.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})), cache: r.headers.get("cache-control") }));

  // (1) 동의 화면 + [허용]
  const A = pkce();
  const pA = authParams(A.challenge);
  const page = await fetch(`${as.authorization_endpoint}?${pA}`, { headers: { cookie } });
  const html = await page.text();
  ok("(1) 동의 화면 200 · 요청한 곳(claude.ai) 표시", page.status === 200 && html.includes("claude.ai"), `${page.status}`);
  const allowA = codeFrom(await decide(pA));
  ok("(1) [허용] → 루프백으로 code·state·iss",
    !!allowA.code && allowA.url?.origin === `http://localhost:${PORT}` && allowA.url.searchParams.get("state") === pA.get("state") &&
      allowA.url.searchParams.get("iss") === as.issuer,
    allowA.loc.replace(/code=[^&]+/, "code=…"));

  // (2) 막아야 하는 것
  const evilOrigin = await decide(authParams(pkce().challenge), { origin: "https://evil.example" });
  ok("(2) 남의 Origin → 403(CSRF)", evilOrigin.status === 403, `${evilOrigin.status}`);
  const deny = codeFrom(await decide(authParams(pkce().challenge), { decision: "deny" }));
  ok("(2) [취소] → access_denied, 코드 없음", deny.error === "access_denied" && !deny.code, deny.loc);
  const badRedirect = await decide(authParams(pkce().challenge, { redirect_uri: "https://evil.example/cb" }));
  const badLoc = badRedirect.headers.get("location") ?? "";
  ok("(2) 목록에 없는 redirect_uri → 그 주소로 안 보냄", !badLoc.startsWith("https://evil.example") && badLoc.includes("/oauth/authorize"), `${badRedirect.status} ${badLoc.slice(0, 120)}`);
  const noLogin = await decide(authParams(pkce().challenge), { withCookie: false });
  ok("(2) 로그인 없으면 /login으로", (noLogin.headers.get("location") ?? "").includes("/login"), `${noLogin.status} ${noLogin.headers.get("location")}`);

  // (3) 토큰 교환
  const wrongPkce = await token({ grant_type: "authorization_code", code: allowA.code, code_verifier: pkce().verifier, redirect_uri: REDIRECT, client_id: CLIENT_ID });
  ok("(3) PKCE 틀림 → invalid_grant", wrongPkce.status === 400 && wrongPkce.json.error === "invalid_grant", JSON.stringify(wrongPkce.json));
  const afterWrong = await token({ grant_type: "authorization_code", code: allowA.code, code_verifier: A.verifier, redirect_uri: REDIRECT, client_id: CLIENT_ID });
  ok("(3) 틀린 시도에 코드가 죽음(맞는 값으로도 invalid_grant)", afterWrong.json.error === "invalid_grant", JSON.stringify(afterWrong.json));

  const C = pkce();
  const codeC = codeFrom(await decide(authParams(C.challenge))).code;
  const wrongRedirect = await token({ grant_type: "authorization_code", code: codeC, code_verifier: C.verifier, redirect_uri: `http://localhost:${PORT}/other`, client_id: CLIENT_ID });
  ok("(3) redirect_uri 다름 → invalid_grant", wrongRedirect.json.error === "invalid_grant", JSON.stringify(wrongRedirect.json));

  const B = pkce();
  const codeB = codeFrom(await decide(authParams(B.challenge))).code;
  const good = await token({ grant_type: "authorization_code", code: codeB, code_verifier: B.verifier, redirect_uri: REDIRECT, client_id: CLIENT_ID });
  ok("(3) 맞는 교환 → Bearer 토큰 한 쌍 · no-store",
    good.status === 200 && good.json.token_type === "Bearer" && !!good.json.access_token && !!good.json.refresh_token && /no-store/.test(good.cache ?? ""),
    `${good.status} ${Object.keys(good.json).join(",")}`);
  const replay = await token({ grant_type: "authorization_code", code: codeB, code_verifier: B.verifier, redirect_uri: REDIRECT, client_id: CLIENT_ID });
  ok("(3) 같은 코드 두 번째 → invalid_grant", replay.json.error === "invalid_grant", JSON.stringify(replay.json));

  // (4) MCP
  const rpc = (accessToken, body) => fetch(`${ORIGIN}/api/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(body.method === "initialize" ? {} : { "mcp-protocol-version": PROTOCOL }),
    },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
  const access1 = good.json.access_token;
  const init = await rpc(access1, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "nf-probe", version: "1" } } });
  ok("(4) MCP initialize → 200", init.status === 200 && !!init.json.result?.serverInfo, `${init.status}`);
  const list = await rpc(access1, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const names = (list.json.result?.tools ?? []).map((t) => t.name);
  ok("(4) tools/list → 툴 목록", list.status === 200 && names.includes("list_nookframe_drafts"), names.join(","));
  const call = await rpc(access1, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_nookframe_drafts", arguments: {} } });
  ok("(4) tools/call(초안 목록) → 200 · 오류 아님", call.status === 200 && !!call.json.result && call.json.result.isError !== true, JSON.stringify(call.json).slice(0, 160));

  // (5) 갱신 = 회전
  const refreshed = await token({ grant_type: "refresh_token", refresh_token: good.json.refresh_token });
  ok("(5) 갱신 → 새 토큰 한 쌍",
    refreshed.status === 200 && !!refreshed.json.access_token && refreshed.json.access_token !== access1 && refreshed.json.refresh_token !== good.json.refresh_token,
    `${refreshed.status} ${refreshed.json.error ?? ""}`);
  const oldRefresh = await token({ grant_type: "refresh_token", refresh_token: good.json.refresh_token });
  ok("(5) 옛 갱신 토큰 → invalid_grant", oldRefresh.json.error === "invalid_grant", JSON.stringify(oldRefresh.json));
  const oldAccess = await rpc(access1, { jsonrpc: "2.0", id: 4, method: "tools/list", params: {} });
  ok("(5) 옛 액세스 토큰 → 401", oldAccess.status === 401, `${oldAccess.status}`);
  const newAccess = await rpc(refreshed.json.access_token, { jsonrpc: "2.0", id: 5, method: "tools/list", params: {} });
  ok("(5) 새 액세스 토큰 → 200", newAccess.status === 200, `${newAccess.status}`);
} finally {
  if (userId) {
    await svc.from("api_tokens").delete().eq("user_id", userId);
    await svc.from("oauth_codes").delete().eq("user_id", userId);
    await svc.from("profiles").delete().eq("id", userId);
    await svc.auth.admin.deleteUser(userId);
  }
}

console.log(failed ? `\n✗ ${failed} failed` : "\nall oauth probes passed");
process.exit(failed ? 1 : 0);
