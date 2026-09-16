import { createHash, randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

// Nookframe Connect — 개인 액세스 토큰(PAT) 발급/검증. SERVER-ONLY (서비스롤).
//
// 토큰은 `nf_live_<random>` 형태. DB에는 sha256(raw) 해시만 저장하고 raw는 발급
// 응답에서 딱 한 번만 노출한다(GitHub/Vercel PAT와 동일). 검증은 제시된 토큰을
// 해시해 인덱스 동등 조회 — sha256은 preimage-resistant라 타이밍 부채널로 유효
// 토큰을 복원할 수 없다. 유출돼도 폭발반경은 좁다: 이 토큰으로는 자기 user_id의
// 초안 프로젝트 INSERT만 가능하고, 발행/데모예산 소진/토큰목록 조회는 전부 쿠키
// (auth.uid()) 전용 경로라 닿지 못한다.

const TOKEN_SCHEME = "nf_live_";
// 유저당 활성 토큰 상한 — 무한 발급으로 레이트리밋 버킷을 늘리는 걸 막는다.
export const MAX_TOKENS_PER_USER = 10;

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** 새 토큰 생성. raw는 호출부에서 1회 반환 후 버린다(저장 금지). */
export function generateToken(): { raw: string; hash: string; prefix: string } {
  const raw = `${TOKEN_SCHEME}${randomBytes(32).toString("base64url")}`;
  return {
    raw,
    hash: hashToken(raw),
    // "nf_live_ab12cd…" — 목록에서 어떤 토큰인지 알아볼 정도만.
    prefix: `${raw.slice(0, TOKEN_SCHEME.length + 6)}…`,
  };
}

export type TokenIssue =
  | { ok: true; raw: string; prefix: string }
  | { ok: false; reason: "revoke" | "limit" | "insert"; cause?: unknown };

/**
 * 발급 규약 한 곳(2026-09-16) — /api/tokens(수동·자동), /api/connect/exchange(페어링 코드
 * 교환)가 같은 규칙을 쓴다. 센티널 이름(prompt-auto·mcp-auto)으로 발급하면 살아 있는
 * 동명 토큰을 먼저 폐기한다 = "복사할 때마다 새 토큰, 이전 것은 즉시 무효"라는 UI의 약속.
 * 폐기가 실패하면 발급도 멈춘다(그 약속이 깨진 채 새 토큰을 주면 안 된다).
 */
export async function issueToken(opts: {
  userId: string;
  name: string | null;
  /** 같은 이름의 살아 있는 토큰을 먼저 폐기한다(센티널 이름 전용). */
  revokeSameName?: boolean;
}): Promise<TokenIssue> {
  const admin = createAdminClient();
  if (opts.revokeSameName && opts.name) {
    const { error } = await admin
      .from("api_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", opts.userId)
      .eq("name", opts.name)
      .is("revoked_at", null);
    if (error) return { ok: false, reason: "revoke", cause: error };
  }
  const { count } = await admin
    .from("api_tokens")
    .select("id", { count: "exact", head: true })
    .eq("user_id", opts.userId)
    .is("revoked_at", null);
  if ((count ?? 0) >= MAX_TOKENS_PER_USER) return { ok: false, reason: "limit" };

  const { raw, hash, prefix } = generateToken();
  const { error } = await admin.from("api_tokens").insert({
    user_id: opts.userId,
    token_hash: hash,
    token_prefix: prefix,
    name: opts.name,
  });
  if (error) return { ok: false, reason: "insert", cause: error };
  return { ok: true, raw, prefix };
}

type ResolvedToken = { userId: string; tokenId: string };

/**
 * Bearer 토큰(raw) → 소유 user_id. 알 수 없거나 폐기된 토큰이면 null.
 * revoked 필터는 JS 후처리가 아니라 WHERE 절(`.is('revoked_at', null)`)에서.
 */
export async function verifyToken(
  raw: string | null | undefined,
): Promise<ResolvedToken | null> {
  if (!raw || !raw.startsWith(TOKEN_SCHEME)) return null;
  const admin = createAdminClient();
  const live = () =>
    admin.from("api_tokens").select("id, user_id").eq("token_hash", hashToken(raw)).is("revoked_at", null);

  // 만료 검사(2026-09-17, OAuth). 사람이 만든 PAT는 expires_at이 null이라 이 필터를
  // 그대로 통과한다 — 동작 불변. 만료가 붙는 것은 원격 MCP 커넥터가 받아 가는 토큰뿐이다.
  let { data, error } = await live()
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .maybeSingle();
  // 컬럼이 아직 없으면(코드 배포가 마이그레이션보다 먼저 나간 경우) 만료 필터만 빼고
  // 다시 묻는다. 여기서 그냥 실패하면 **모든 PAT 인증이 한꺼번에 죽는다** — 인제스트·
  // CLI·MCP가 전부 401이 되는 사고라, 인제스트 라우트의 선택 컬럼 디그레이드와 같은 태세를 쓴다.
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    logger.error("apiToken: expires_at column missing — run supabase/migration_oauth.sql", { error });
    ({ data, error } = await live().maybeSingle());
  }
  if (error) {
    logger.error("apiToken: verify lookup failed", { error });
    return null;
  }
  if (!data) return null;
  // last_used_at 갱신은 fire-and-forget — 검증 지연/실패에 영향 주지 않는다.
  void admin
    .from("api_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(
      () => {},
      (e) => logger.error("apiToken: last_used_at touch failed", { error: e }),
    );
  return { userId: data.user_id, tokenId: data.id };
}

/** Authorization 헤더에서 Bearer 토큰만 추출(쿼리/폼 금지 → CSRF 비유발). */
export function bearerFromHeader(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}
