import { createHash, randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

// Nookframe Connect — 페어링 코드 발급/교환. SERVER-ONLY (서비스롤).
//
// 왜 있나(2026-09-16 사용자 확정): 프롬프트에 살아 있는 PAT를 박아 넣으면, 그 프롬프트를
// 붙여넣은 AI 채팅 기록에 크리덴셜이 영구히 남는다. 그래서 프롬프트에 들어가는 것은
// `nf_code_…` **1회용 코드**로 바꾸고, CLI `login <코드>`가 /api/connect/exchange에서
// 진짜 토큰으로 바꿔 받아 저장한다. 기록에 남는 코드는 30분 뒤 또는 첫 교환 즉시 죽는다.
//
// 코드는 토큰이 아니다 — Bearer로 쓸 수 없고(verifyToken이 스킴을 보고 거절),
// 이 파일의 교환 경로에서만 의미가 있다. 반대로 교환으로 받은 PAT는 평소처럼 오래 산다.

const CODE_SCHEME = "nf_code_";
/** 코드 유효기간. AI가 프롬프트를 읽고 레포를 훑다가 login을 늦게 실행할 여유는 주되, 기록에 남은 값은 빨리 죽게. */
export const CONNECT_CODE_TTL_MIN = 30;

function hashCode(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Bearer로 온 값이 토큰이 아니라 페어링 코드인가 — 옛 CLI가 코드를 토큰으로 저장한 경우를 짚어주는 판별. */
export function looksLikeConnectCode(raw: string | null | undefined): boolean {
  return !!raw && raw.startsWith(CODE_SCHEME);
}

/**
 * 새 페어링 코드 발급. raw는 호출부(=프롬프트)로 1회만 나가고 DB엔 sha256만 남는다.
 * 같은 유저의 낡은 코드(만료·사용됨)는 여기서 같이 치운다 — 크론을 만들 만한 양이 아니다.
 */
export async function issueConnectCode(userId: string): Promise<{ code: string; expiresAt: string } | null> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const { error: sweepErr } = await admin
    .from("connect_codes")
    .delete()
    .eq("user_id", userId)
    .or(`used_at.not.is.null,expires_at.lt.${nowIso}`);
  // 청소 실패는 발급 실패가 아니다 — 행이 조금 쌓일 뿐이다.
  if (sweepErr) logger.error("connectCode: sweep failed", { error: sweepErr });

  const raw = `${CODE_SCHEME}${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + CONNECT_CODE_TTL_MIN * 60_000).toISOString();
  const { error } = await admin.from("connect_codes").insert({
    user_id: userId,
    code_hash: hashCode(raw),
    expires_at: expiresAt,
  });
  if (error) {
    logger.error("connectCode: insert failed", { error });
    return null;
  }
  return { code: raw, expiresAt };
}

/**
 * 코드 → 소유 user_id. 살아 있는 코드면 같은 호출에서 **소비 표시까지** 한다.
 *
 * 소비는 조건부 UPDATE 한 방(`used_at is null` + 만료 전)으로 해서, 같은 코드가 동시에
 * 두 번 들어와도 한쪽만 행을 가져간다(select→update 2단계면 둘 다 통과할 수 있다).
 */
export async function redeemConnectCode(raw: string | null | undefined): Promise<string | null> {
  if (!looksLikeConnectCode(raw)) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("connect_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("code_hash", hashCode(raw!))
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("user_id");
  if (error) {
    logger.error("connectCode: redeem failed", { error });
    return null;
  }
  return data?.length === 1 ? (data[0].user_id as string) : null;
}
