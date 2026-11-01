import { headers } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIpKeyFromHeaders } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { lockForDecoy, alertMail, stampAlert, blockIpKey, IP_BLOCK_SECONDS, type BaitLabel } from "@/lib/bait";

// 알아채기 + 미끼(2026-11-02, 보안 로드맵 1단계 3·4번). 누가 멈추나(10-31 결정)를 따른다:
//   작은 멈춤(토큰 하나·계정 하나·IP 하나) = 자동 · 사이트 전체 잠금 = 사람만 — 단, 숨긴 미끼는 진짜
//   사용자가 절대 건드릴 일이 없어 "건드림 = 공격자 확실"이라 자동으로 크게 막아도 된다.
//   방문 수로는 안 잠근다.
//
//   1. 숨긴 미끼 토큰 — 데이터 저장소·백업·맥에 심은 토큰. sha256을 Vercel 설정값
//      DECOY_TOKEN_SHA256에 "장소:해시"로(쉼표로 여럿) 둔다 → 메일에 어디서 샜는지가 찍힌다.
//      쓰이면 사이트를 읽기 전용으로 잠그고 메일. 심은 곳은 레포에 적지 않는다(레포는 공개).
//   2. 겉 미끼 토큰(lib/bait.ts) — 누구나 열 수 있는 가짜 비밀 파일 속 토큰. 쓰이면 그 IP만 하루
//      동안 /api 전부 막고 메일 하루 한 통(아무나 닿는 미끼로 사이트 전체를 잠글 수 있으면 안 된다).
//   3. 토큰 과사용 — 토큰 하나가 10분에 TOKEN_BURST_MAX번 넘게 쓰이면 그 토큰만 끊고 메일.
//   4. 관리자 조치 몰림 — 관리자 계정 하나가 10분에 ADMIN_BURST_MAX번 넘게 관리자 API를 부르면
//      그 계정의 로그인을 전부 끊고 메일(훔친 세션으로 휘젓는 경우).
// 모두 절대 throw 하지 않는다 — 감지가 고장 나도 사이트 흐름은 그대로 간다.

export const TOKEN_BURST_MAX = 300; // MCP는 인제스트를 HTTP로 다시 불러 한 번에 2번 센다 → 실제 150번
export const ADMIN_BURST_MAX = 60;
const WINDOW_S = 600;

/** DECOY_TOKEN_SHA256 → 해시 → 장소 이름. "장소:해시" 또는 해시만("?"). 순수 함수 — probe-tripwire-unit. */
export function parseDecoyHashes(env: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of (env ?? "").split(/[\s,]+/)) {
    const m = /^(?:([a-z0-9_-]{1,20}):)?([0-9a-fA-F]{64})$/.exec(part.trim());
    if (m) out.set(m[2].toLowerCase(), m[1] ?? "?");
  }
  return out;
}

let decoyHashes: Map<string, string> | null = null;
/** 숨긴 미끼면 장소 이름, 아니면 null. */
export function decoyPlaceOf(hash: string): string | null {
  decoyHashes ??= parseDecoyHashes(process.env.DECOY_TOKEN_SHA256);
  return decoyHashes.get(hash.toLowerCase()) ?? null;
}

async function where(): Promise<{ text: string; ipKey: string | null }> {
  try {
    const h = await headers();
    const ipKey = clientIpKeyFromHeaders(h);
    return {
      text: `나라 ${h.get("x-vercel-ip-country") ?? "?"} · IP 표식 ${ipKey.slice(0, 8)} · ${(h.get("user-agent") ?? "?").slice(0, 80)}`,
      ipKey,
    };
  } catch {
    return { text: "요청 정보 없음", ipKey: null };
  }
}

/** 숨긴 미끼 토큰이 쓰였다. 부른 쪽은 그냥 401을 낸다(눈치 못 채게). */
export async function tripDecoy(place: string): Promise<void> {
  const from = await where();
  logger.error("tripwire: DECOY token used — site locked read-only", { alert: "decoy", place, from: from.text });
  await lockForDecoy(`숨긴 미끼 토큰이 쓰였어요 (심은 곳: ${place})`, from.text);
}

/** 겉 미끼 토큰이 쓰였다 — 그 IP를 하루 막는다. 부른 쪽은 그냥 401. */
export async function tripBait(label: BaitLabel): Promise<void> {
  try {
    const from = await where();
    logger.warn("tripwire: bait token used — ip blocked", { alert: "bait", label, from: from.text });
    if (from.ipKey) await blockIpKey(from.ipKey);
    await stampAlert("bait");
    if (await rateLimit({ name: "tripwire-mail", key: "bait", windowSeconds: 86_400, max: 1 })) {
      await alertMail("겉 미끼 토큰이 쓰였어요 — 그 IP를 하루 막았어요", [
        `미끼: ${label} (공개 주소에 둔 가짜 비밀 파일 속 토큰)`,
        `어디서: ${from.text}`,
        `그 IP는 ${IP_BLOCK_SECONDS / 3600}시간 동안 /api 전부가 막혀요. 사이트 전체는 그대로예요.`,
        "누군가 공격 도구나 AI로 비밀 파일을 찾아 써 본 거예요. 이 메일은 하루 한 통만 와요 — 그 뒤는 관제탑 경보 줄에만 남아요.",
      ]);
    }
  } catch (err) {
    logger.error("tripwire: bait handling failed", { error: err });
  }
}

/** 토큰 한 번 쓰임. 한도를 넘으면 그 토큰을 끊고 false(부른 쪽은 401). */
export async function noteTokenUse(tokenId: string, userId: string): Promise<boolean> {
  try {
    const under = await rateLimit({ name: "token-use", key: tokenId, windowSeconds: WINDOW_S, max: TOKEN_BURST_MAX });
    if (under) return true;
    const admin = createAdminClient();
    const { data: revoked } = await admin
      .from("api_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", tokenId)
      .is("revoked_at", null)
      .select("id");
    // 처음 끊은 요청만 알린다(끊긴 뒤 쏟아지는 요청은 어차피 401).
    if (revoked?.length) {
      const from = await where();
      logger.error("tripwire: token burst — token revoked", { alert: "token-burst", tokenId, userId, from: from.text });
      await stampAlert("token-burst");
      await alertMail("토큰 하나가 너무 많이 쓰여서 끊었어요", [
        `10분 안에 ${TOKEN_BURST_MAX}번을 넘었어요. 그 토큰만 끊었고 나머지는 그대로예요.`,
        `사용자 ${userId.slice(0, 8)} · 토큰 ${tokenId.slice(0, 8)} · ${from.text}`,
        "주인이 AI를 심하게 돌린 거라면 다시 연결하면 돼요. 아니라면 그 계정의 다른 토큰도 확인해 주세요.",
      ]);
    }
    return false;
  } catch (err) {
    logger.error("tripwire: token use note failed", { error: err });
    return true;
  }
}

/** 관리자 API 한 번 쓰임. 한도를 넘으면 그 계정의 로그인을 전부 끊고 false(부른 쪽은 404). */
export async function noteAdminAction(user: User): Promise<boolean> {
  try {
    const under = await rateLimit({ name: "admin-action", key: user.id, windowSeconds: WINDOW_S, max: ADMIN_BURST_MAX });
    if (under) return true;
    if (!(await rateLimit({ name: "tripwire-mail", key: `admin:${user.id}`, windowSeconds: WINDOW_S, max: 1 }))) {
      return false; // 이미 끊고 알렸다 — 같은 창에선 막기만
    }
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("admin_sign_out_user", { p_user_id: user.id });
    const from = await where();
    logger.error("tripwire: admin burst — admin signed out", { alert: "admin-burst", from: from.text, sessions: data, error });
    await stampAlert("admin-burst");
    await alertMail("관리자 조치가 몰려서 관리자 로그인을 전부 끊었어요", [
      `10분 안에 관리자 API를 ${ADMIN_BURST_MAX}번 넘게 불렀어요. 계정: ${user.email ?? user.id}`,
      `마지막 요청: ${from.text}`,
      error ? "⚠️ 로그인 끊기는 실패했어요 — 설정에서 모든 기기 로그아웃을 직접 눌러 주세요." : `로그인 ${data ?? 0}개를 끊었어요. 직접 한 거라면 다시 로그인하면 돼요.`,
      "직접 한 게 아니라면 Google·GitHub 비밀번호를 바꾸고 비상 정지를 검토해 주세요.",
    ]);
    return false;
  } catch (err) {
    logger.error("tripwire: admin action note failed", { error: err });
    return true;
  }
}
