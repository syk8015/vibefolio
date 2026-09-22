import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { APP_ORIGIN } from "@/lib/previewOrigin";
import { generateToken } from "@/lib/apiToken";
import { safeFetch, readResponseCapped, SsrfError } from "@/lib/ssrf";

// Nookframe — 원격 MCP(app/api/mcp)용 OAuth 2.1 인증 서버. SERVER-ONLY(서비스롤).
//
// 왜 OAuth인가(2026-09-17 사용자 확정): 셸 없는 채팅창 AI를 붙이는 길은 두 가지였다.
// (A) 사람이 Claude 설정의 헤더 칸에 PAT를 손으로 붙여넣기 (B) OAuth. A는 코드가
// 거의 0이지만 비개발자가 [고급 설정]을 펼쳐 `Bearer ` 접두사까지 정확히 타이핑해야
// 하고, 틀리면 화면에 401 숫자만 뜬다. B는 [허용] 한 번이고 틀릴 자리가 없다.
//
// 설계의 뼈대: **토큰 척추를 늘리지 않는다.** 여기서 발급하는 액세스 토큰도 결국
// api_tokens 행 하나이고 스킴도 같은 nf_live_다 — 그래서 ingestAuth·verifyToken·
// 연결 패널의 [폐기]가 전부 그대로 동작하고, 인제스트 라우트는 한 줄도 안 고친다.
// OAuth가 더하는 것은 만료·갱신·발급자 세 컬럼과 인증 코드 테이블뿐이다.

/** 이 서버가 주는 유일한 범위 — 초안 올리기. PAT의 폭발반경과 정확히 같다. */
export const OAUTH_SCOPE = "projects:write";

/** 인증 코드 수명. 사람이 [허용]을 누른 뒤 Claude가 즉시 교환한다 — 길 이유가 없다. */
const CODE_TTL_MIN = 10;

/**
 * 액세스 토큰 수명. 짧을수록 유출 피해가 짧지만 갱신 요청이 잦아진다.
 * 12시간 = 한 사람의 하루 작업이 대개 갱신 한 번 안에 끝나는 길이. 옛 PAT가 만료
 * 자체가 없었던 것에 비하면 큰 조임이고, 범위도 초안 쓰기 하나뿐이라 이 정도로 충분하다.
 */
const ACCESS_TTL_HOURS = 12;

/** 갱신 토큰 수명. 이보다 오래 쉬면 사람이 커넥터에서 다시 로그인한다. */
const REFRESH_TTL_DAYS = 90;

/** CIMD 문서를 다시 안 가져오는 기간의 하한·상한. 문서의 캐시 헤더를 이 사이로 조인다. */
const DOC_CACHE_MIN_SEC = 300;
const DOC_CACHE_MAX_SEC = 86_400;

/** CIMD 문서 읽기 상한(스펙 권고 5KB)과 가져오기 제한시간. */
const DOC_MAX_BYTES = 5 * 1024;
const DOC_TIMEOUT_MS = 5_000;

function sha256(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * 이 인증 서버가 지키는 자원 = 우리 MCP 엔드포인트. RFC 8707 `resource`와 PRM의
 * `resource`가 **글자 그대로** 이 값이어야 한다(경로 포함, 끝 슬래시 없음).
 */
export function mcpResourceUrl(): string {
  return `${APP_ORIGIN}/api/mcp`;
}

/** 이 인증 서버의 issuer. 메타데이터에 적는 값과 실제로 받아 가는 주소가 같아야 한다. */
export function oauthIssuer(): string {
  return APP_ORIGIN;
}

// ── CIMD: client_id가 곧 클라이언트 설명서 주소 ──────────────────────────────
//
// Claude가 권하는 방식(화면의 "Claude의 게시된 ID 사용"). client_id로 https URL이
// 오고, 우리가 그 주소를 읽어 이름·허용 리다이렉트 주소를 알아낸다. 등록 절차가
// 통째로 사라지는 대신, **문서는 클라이언트가 스스로 쓴 자기소개**라 믿을 수 없다 —
// 그래서 동의 화면은 문서의 client_name이 아니라 이 URL의 호스트를 보여준다.

export type ClientDoc = {
  client_id: string;
  client_name?: string;
  client_uri?: string;
  logo_uri?: string;
  redirect_uris: string[];
};

export class OAuthError extends Error {
  constructor(
    /** RFC 6749 오류 코드 — 화면·응답에 그대로 나간다. */
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "OAuthError";
  }
}

function hostOf(origin: string | undefined): string | null {
  if (!origin) return null;
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** 사용자가 파일을 올려 서빙시킬 수 있거나 우리 자신인 호스트들. */
function ownHosts(): Set<string> {
  const hosts = new Set<string>();
  const app = hostOf(APP_ORIGIN);
  if (app) {
    hosts.add(app);
    hosts.add(app.startsWith("www.") ? app.slice(4) : `www.${app}`);
  }
  // 호출 시점에 env를 읽는다(모듈 로드 시점 상수 대신) — 순수 검사 스크립트가 값을 바꿔 볼 수 있게.
  for (const o of [process.env.NEXT_PUBLIC_PREVIEW_ORIGIN, process.env.NEXT_PUBLIC_SUPABASE_URL]) {
    const h = hostOf(o);
    if (h) hosts.add(h);
  }
  return hosts;
}

/**
 * client_id URL 규칙(draft-ietf-oauth-client-id-metadata-document): https 전용,
 * **경로 필수**, 사용자정보·프래그먼트 금지. 비교는 언제나 단순 문자열 비교다 —
 * 기본 포트를 정규화하면 https://e.com/c 와 https://e.com:443/c 가 같아져 버린다.
 */
export function parseClientId(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new OAuthError("invalid_request", "client_id is required");
  }
  const value = raw.trim();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new OAuthError("invalid_client", "client_id must be an https URL (this server uses client ID metadata documents)");
  }
  if (url.protocol !== "https:") throw new OAuthError("invalid_client", "client_id must use https");
  if (url.username || url.password) throw new OAuthError("invalid_client", "client_id must not contain userinfo");
  if (url.hash) throw new OAuthError("invalid_client", "client_id must not contain a fragment");
  if (url.pathname === "/" || url.pathname === "") {
    throw new OAuthError("invalid_client", "client_id must include a path");
  }
  // 우리 호스트는 client_id가 될 수 없다(2026-09-22 감사 N-3). 동의 화면은 client_id
  // 호스트를 "누가 연결을 원하는지"로 크게 보여주는데, 작품 미리보기 주소와 Supabase
  // 저장소 주소는 누구나 파일을 올려 200으로 서빙시킬 수 있다 — 가짜 앱 설명 파일을
  // 올리면 화면에 우리 주소가 뜨는 클라이언트가 된다. 우리 자신은 클라이언트가 아니다.
  if (ownHosts().has(url.hostname.toLowerCase())) {
    throw new OAuthError("invalid_client", "client_id must not be hosted on this service's own domains");
  }
  // 점 세그먼트 금지. **원문에서** 본다 — URL 파서는 "/a/../b"를 파싱하면서 "/b"로
  // 펴 버리므로, 파싱된 pathname을 보면 이미 사라지고 없다. 그대로 두면 서로 다른
  // 문자열이 같은 문서를 가리켜, 단순 문자열 비교로 클라이언트를 가르는 전제가 깨진다.
  const afterHost = value.slice(value.indexOf(url.host) + url.host.length);
  if (/\/\.\.?(?=[/?#]|$)/.test(afterHost)) {
    throw new OAuthError("invalid_client", "client_id must not contain dot segments");
  }
  return value;
}

/**
 * 리다이렉트 주소 대조. 원칙은 정확 일치지만 **루프백만 포트를 무시**한다(RFC 8252
 * §7.3) — 터미널 쪽 클라이언트는 빈 포트를 그때그때 잡아 쓰면서 문서에는 포트 없이
 * 적어 두기 때문이다(Claude Code가 실제로 그렇게 해서 다른 서버들이 깨진 적이 있다).
 */
export function redirectUriAllowed(doc: ClientDoc, redirectUri: string): boolean {
  if (doc.redirect_uris.includes(redirectUri)) return true;
  let given: URL;
  try {
    given = new URL(redirectUri);
  } catch {
    return false;
  }
  const isLoopback = (h: string) => h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1";
  if (given.protocol !== "http:" || !isLoopback(given.hostname)) return false;
  return doc.redirect_uris.some((allowed) => {
    try {
      const a = new URL(allowed);
      return (
        a.protocol === "http:" &&
        isLoopback(a.hostname) &&
        a.pathname === given.pathname &&
        a.search === given.search
      );
    } catch {
      return false;
    }
  });
}

/** 캐시 헤더에서 재사용 가능 시간(초)을 뽑아 우리 상·하한으로 조인다. */
function cacheSecondsFrom(header: string | null): number {
  const m = header ? /max-age\s*=\s*(\d+)/i.exec(header) : null;
  const raw = m ? Number(m[1]) : DOC_CACHE_MIN_SEC;
  return Math.min(DOC_CACHE_MAX_SEC, Math.max(DOC_CACHE_MIN_SEC, raw));
}

function assertValidDoc(clientId: string, parsed: unknown): ClientDoc {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new OAuthError("invalid_client", "client metadata document is not a JSON object");
  }
  const doc = parsed as Record<string, unknown>;
  // 자기참조 검사(스펙 MUST): 문서가 스스로 밝히는 client_id가 우리가 읽은 주소와
  // 정확히 같아야 한다. 이게 없으면 아무 URL이나 남의 문서를 가리켜 사칭할 수 있다.
  if (doc.client_id !== clientId) {
    throw new OAuthError("invalid_client", "client metadata document does not match its own URL");
  }
  const uris = doc.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || uris.some((u) => typeof u !== "string")) {
    throw new OAuthError("invalid_client", "client metadata document has no redirect_uris");
  }
  // 비밀값은 이 문서에 있어서는 안 된다(draft-02가 명시적으로 금지) — 공개 URL에
  // 올라가는 물건이라, 있다면 그 자체가 잘못 만든 클라이언트라는 신호다.
  if (doc.client_secret !== undefined) {
    throw new OAuthError("invalid_client", "client metadata document must not carry a client_secret");
  }
  return {
    client_id: clientId,
    client_name: typeof doc.client_name === "string" ? doc.client_name : undefined,
    client_uri: typeof doc.client_uri === "string" ? doc.client_uri : undefined,
    logo_uri: typeof doc.logo_uri === "string" ? doc.logo_uri : undefined,
    redirect_uris: uris as string[],
  };
}

/**
 * client_id URL을 읽어 클라이언트 설명서를 얻는다. 규칙(전부 스펙 요구):
 *  - 리다이렉트를 **따라가지 않는다**(safeFetch에 maxRedirects=0 — 3xx면 던진다)
 *  - 200이 아니면 전부 오류
 *  - 5KB까지만 읽는다
 *  - 사설/예약 IP로 풀리는 주소는 안 부른다(safeFetch의 SSRF 가드)
 *  - **실패와 잘못된 문서는 캐시하지 않는다**(스펙 MUST) — 성공만 들어간다
 */
export async function fetchClientDoc(clientId: string): Promise<ClientDoc> {
  const admin = createAdminClient();
  const { data: cached } = await admin
    .from("oauth_client_docs")
    .select("document, expires_at")
    .eq("client_id", clientId)
    .maybeSingle();
  if (cached && new Date(cached.expires_at as string) > new Date()) {
    return assertValidDoc(clientId, cached.document);
  }

  let res;
  try {
    res = await safeFetch(
      clientId,
      { headers: { accept: "application/json" }, signal: AbortSignal.timeout(DOC_TIMEOUT_MS) },
      0,
    );
  } catch (err) {
    // 리다이렉트도 여기로 온다(maxRedirects=0이라 safeFetch가 던진다) — 스펙상 오류가 맞다.
    const why = err instanceof SsrfError ? err.message : "could not be fetched";
    throw new OAuthError("invalid_client", `client metadata document ${why}`);
  }
  if (res.status !== 200) {
    throw new OAuthError("invalid_client", `client metadata document returned HTTP ${res.status}`);
  }
  const bytes = await readResponseCapped(res, DOC_MAX_BYTES);
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new OAuthError("invalid_client", "client metadata document is not valid JSON (or is larger than 5KB)");
  }
  const doc = assertValidDoc(clientId, parsed);

  const ttl = cacheSecondsFrom(res.headers.get("cache-control"));
  const { error } = await admin.from("oauth_client_docs").upsert({
    client_id: clientId,
    document: parsed as Record<string, unknown>,
    fetched_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
  });
  // 캐시 실패는 인증 실패가 아니다 — 다음 요청이 한 번 더 가져올 뿐이다.
  if (error) logger.error("oauth: client doc cache write failed", { error });
  return doc;
}

// ── 인증 요청 검증 ───────────────────────────────────────────────────────────
//
// 동의 화면(app/oauth/authorize)과 [허용] 처리(decision)가 **같은 판정**을 써야 한다.
// 화면에서 통과한 요청이 제출에서 거절되면 사람은 이유를 못 본다 — 게이트를 복제하지
// 않는다는 레포 관례(발행 게이트를 CLI에 복제하지 않기로 한 것과 같은 판단)를 따른다.

export type AuthorizeRequest = {
  clientId: string;
  doc: ClientDoc;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  resource: string | null;
  scope: string;
};

export type AuthorizeCheck =
  /** 통과 — 사람에게 보여 주고 승인을 받으면 된다. */
  | { ok: true; req: AuthorizeRequest }
  /**
   * 클라이언트에게 되돌려 줄 수 있는 실패. redirect_uri가 이미 검증됐다는 뜻이라
   * OAuth 규약대로 error를 실어 그 주소로 돌려보낸다.
   */
  | { ok: false; redirectTo: string; state: string | null; error: OAuthError }
  /**
   * 되돌려 줄 수 없는 실패 — client_id나 redirect_uri 자체가 못 믿을 값이다.
   * 이 경우 리다이렉트하면 **우리가 열린 리다이렉터가 된다**. 화면에 그냥 띄운다.
   */
  | { ok: false; redirectTo: null; state: null; error: OAuthError };

/** resource(RFC 8707) 비교용 정규화 — 끝 슬래시와 스킴·호스트 대소문자만 무시한다. */
function sameResource(given: string, ours: string): boolean {
  const norm = (v: string) => {
    try {
      const u = new URL(v);
      return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}`;
    } catch {
      return v.replace(/\/+$/, "");
    }
  };
  return norm(given) === norm(ours);
}

export async function validateAuthorizeParams(params: URLSearchParams): Promise<AuthorizeCheck> {
  const fail = (error: OAuthError): AuthorizeCheck => ({ ok: false, redirectTo: null, state: null, error });

  let clientId: string;
  try {
    clientId = parseClientId(params.get("client_id"));
  } catch (e) {
    return fail(e as OAuthError);
  }

  let doc: ClientDoc;
  try {
    doc = await fetchClientDoc(clientId);
  } catch (e) {
    return fail(e instanceof OAuthError ? e : new OAuthError("invalid_client", "could not read the client metadata document"));
  }

  const redirectUri = params.get("redirect_uri");
  if (!redirectUri) return fail(new OAuthError("invalid_request", "redirect_uri is required"));
  if (!redirectUriAllowed(doc, redirectUri)) {
    // 여기서 리다이렉트하면 임의 주소로 사람을 보내 주는 기계가 된다 — 절대 금지.
    return fail(new OAuthError("invalid_request", "redirect_uri is not listed in the client metadata document"));
  }

  // 여기서부터는 돌려보낼 주소가 믿을 만하다 — 실패도 규약대로 클라이언트에게 전한다.
  const state = params.get("state");
  const bounce = (error: OAuthError): AuthorizeCheck => ({ ok: false, redirectTo: redirectUri, state, error });

  if (params.get("response_type") !== "code") {
    return bounce(new OAuthError("unsupported_response_type", "Only response_type=code is supported."));
  }
  const codeChallenge = params.get("code_challenge");
  if (!codeChallenge) {
    return bounce(new OAuthError("invalid_request", "code_challenge is required (this server requires PKCE)."));
  }
  if ((params.get("code_challenge_method") ?? "plain") !== "S256") {
    return bounce(new OAuthError("invalid_request", "Only code_challenge_method=S256 is supported."));
  }

  const resource = params.get("resource");
  if (resource && !sameResource(resource, mcpResourceUrl())) {
    return bounce(new OAuthError("invalid_target", `This server only issues tokens for ${mcpResourceUrl()}.`));
  }

  // 범위는 하나뿐이라 요청값과 무관하게 그것을 준다 — 못 알아듣는 범위 하나로 연결
  // 전체가 실패하는 것보다, 줄 수 있는 것만 주고 응답에 무엇을 줬는지 밝히는 편이 낫다
  // (OAuth도 "요청보다 좁게 주기"를 허용한다). 넓게 주는 일은 없다.
  return { ok: true, req: { clientId, doc, redirectUri, state, codeChallenge, resource, scope: OAUTH_SCOPE } };
}

// ── 인증 코드 ────────────────────────────────────────────────────────────────

/**
 * 사람이 동의 화면에서 [허용]을 누른 순간 발급. connect_codes와 같은 규율 —
 * 해시만 저장하고, 소비는 조건부 UPDATE 한 방이라 같은 코드가 동시에 두 번 들어와도
 * 한쪽만 가져간다.
 */
export async function issueAuthCode(grant: {
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string | null;
  scope: string;
}): Promise<string | null> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const { error: sweepErr } = await admin
    .from("oauth_codes")
    .delete()
    .eq("user_id", grant.userId)
    .or(`used_at.not.is.null,expires_at.lt.${nowIso}`);
  if (sweepErr) logger.error("oauth: code sweep failed", { error: sweepErr });

  const raw = `nf_ac_${randomBytes(32).toString("base64url")}`;
  const { error } = await admin.from("oauth_codes").insert({
    user_id: grant.userId,
    code_hash: sha256(raw),
    client_id: grant.clientId,
    redirect_uri: grant.redirectUri,
    code_challenge: grant.codeChallenge,
    resource: grant.resource,
    scope: grant.scope,
    expires_at: new Date(Date.now() + CODE_TTL_MIN * 60_000).toISOString(),
  });
  if (error) {
    logger.error("oauth: code insert failed", { error });
    return null;
  }
  return raw;
}

export type RedeemedCode = {
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
};

/** 코드 → 승인 내용. 살아 있으면 같은 호출에서 소비 표시까지 한다(1회용). */
export async function redeemAuthCode(raw: string): Promise<RedeemedCode | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("oauth_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("code_hash", sha256(raw))
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("user_id, client_id, redirect_uri, code_challenge, scope");
  if (error) {
    logger.error("oauth: code redeem failed", { error });
    return null;
  }
  if (data?.length !== 1) return null;
  const row = data[0];
  return {
    userId: row.user_id as string,
    clientId: row.client_id as string,
    redirectUri: row.redirect_uri as string,
    codeChallenge: row.code_challenge as string,
    scope: (row.scope as string) ?? OAUTH_SCOPE,
  };
}

/**
 * PKCE S256 검증. Claude는 등록 방식과 무관하게 **언제나** 보낸다.
 * 비교는 길이를 먼저 맞춘 뒤 timingSafeEqual — 값이 공격자 통제라 길이로 갈리면 안 된다.
 */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ── 토큰(액세스 + 갱신) ──────────────────────────────────────────────────────

export type Grant = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
};

function newGrantValues() {
  const access = generateToken();
  const refresh = `nf_rt_${randomBytes(32).toString("base64url")}`;
  const now = Date.now();
  return {
    access,
    refresh,
    refreshHash: sha256(refresh),
    expiresAt: new Date(now + ACCESS_TTL_HOURS * 3_600_000).toISOString(),
    refreshExpiresAt: new Date(now + REFRESH_TTL_DAYS * 86_400_000).toISOString(),
  };
}

/**
 * 인증 코드 → 토큰 한 쌍. 같은 클라이언트가 이 유저에게 이미 받아 둔 연결은 먼저
 * 폐기한다 — 재승인이 토큰 상한(유저당 10개)을 갉아먹지 않게, 그리고 "커넥터를
 * 다시 연결하면 이전 연결은 죽는다"가 사람이 기대하는 동작이라서.
 */
export async function issueGrant(opts: {
  userId: string;
  clientId: string;
  scope: string;
}): Promise<Grant | null> {
  const admin = createAdminClient();
  const { error: revokeErr } = await admin
    .from("api_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", opts.userId)
    .eq("oauth_client_id", opts.clientId)
    .is("revoked_at", null);
  if (revokeErr) {
    logger.error("oauth: previous grant revoke failed", { error: revokeErr });
    return null;
  }

  const v = newGrantValues();
  const { error } = await admin.from("api_tokens").insert({
    user_id: opts.userId,
    token_hash: sha256(v.access.raw),
    token_prefix: v.access.prefix,
    // 목록 UI가 "어디서 온 연결인지" 읽는 자리 — 호스트만 남긴다(문서의 자기소개가 아니라).
    name: `oauth:${new URL(opts.clientId).host}`,
    expires_at: v.expiresAt,
    refresh_hash: v.refreshHash,
    refresh_expires_at: v.refreshExpiresAt,
    oauth_client_id: opts.clientId,
    scope: opts.scope,
  });
  if (error) {
    logger.error("oauth: grant insert failed", { error });
    return null;
  }
  return {
    accessToken: v.access.raw,
    refreshToken: v.refresh,
    expiresIn: ACCESS_TTL_HOURS * 3600,
    scope: opts.scope,
  };
}

/**
 * 갱신 토큰 → 새 토큰 한 쌍. 공개 클라이언트는 갱신 토큰을 **회전**시켜야 하므로
 * (OAuth 2.1) 같은 행의 액세스·갱신 해시를 통째로 갈아끼운다 — 옛 갱신 토큰은 그
 * 순간 못 쓰게 된다. 조건부 UPDATE 한 방이라 같은 갱신 토큰이 동시에 두 번 들어와도
 * 한쪽만 성공한다.
 */
export async function rotateGrant(rawRefresh: string): Promise<Grant | null> {
  const admin = createAdminClient();
  const v = newGrantValues();
  const { data, error } = await admin
    .from("api_tokens")
    .update({
      token_hash: sha256(v.access.raw),
      token_prefix: v.access.prefix,
      expires_at: v.expiresAt,
      refresh_hash: v.refreshHash,
      refresh_expires_at: v.refreshExpiresAt,
      last_used_at: new Date().toISOString(),
    })
    .eq("refresh_hash", sha256(rawRefresh))
    .is("revoked_at", null)
    .gt("refresh_expires_at", new Date().toISOString())
    .select("scope");
  if (error) {
    logger.error("oauth: grant rotate failed", { error });
    return null;
  }
  if (data?.length !== 1) return null;
  return {
    accessToken: v.access.raw,
    refreshToken: v.refresh,
    expiresIn: ACCESS_TTL_HOURS * 3600,
    scope: (data[0].scope as string) ?? OAUTH_SCOPE,
  };
}
