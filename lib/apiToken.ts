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
  const { data, error } = await admin
    .from("api_tokens")
    .select("id, user_id")
    .eq("token_hash", hashToken(raw))
    .is("revoked_at", null)
    .maybeSingle();
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
