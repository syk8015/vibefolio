import { headers } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIpKeyFromHeaders } from "@/lib/rate-limit";
import { sendEmail, alertRecipients } from "@/lib/email";
import { adminAlertEmail, SITE_URL } from "@/lib/email-templates";
import { logger } from "@/lib/logger";

// 알아채기 + 미끼(2026-11-02, 보안 로드맵 1단계 3·4번). 누가 멈추나(10-31 결정)를 따른다:
//   작은 멈춤(토큰 하나·계정 하나) = 자동 · 사이트 전체 잠금 = 사람만 — 단, 미끼는 진짜 사용자가
//   절대 건드릴 일이 없어 "건드림 = 공격자 확실"이라 자동으로 크게 막아도 된다. 방문 수로는 안 잠근다.
//
//   1. 미끼 토큰 — 진짜처럼 생긴 토큰을 공격자만 볼 곳에 심어 뒀다. 그 sha256이 Vercel 설정값
//      DECOY_TOKEN_SHA256(쉼표로 여럿)에 있다. 누가 그걸 내밀면 사이트를 읽기 전용으로 잠그고 메일.
//      어디에 심었는지는 레포에 적지 않는다(레포는 공개).
//   2. 토큰 과사용 — 토큰 하나가 10분에 TOKEN_BURST_MAX번 넘게 쓰이면 그 토큰만 끊고 메일.
//   3. 관리자 조치 몰림 — 관리자 계정 하나가 10분에 ADMIN_BURST_MAX번 넘게 관리자 API를 부르면
//      그 계정의 로그인을 전부 끊고 메일(훔친 세션으로 휘젓는 경우).
// 셋 다 절대 throw 하지 않는다 — 감지가 고장 나도 사이트 흐름은 그대로 간다.

export const TOKEN_BURST_MAX = 300; // MCP는 인제스트를 HTTP로 다시 불러 한 번에 2번 센다 → 실제 150번
export const ADMIN_BURST_MAX = 60;
const WINDOW_S = 600;

/** DECOY_TOKEN_SHA256 → 소문자 64자 해시 목록. 순수 함수 — scripts/probe-tripwire-unit.mts. */
export function parseDecoyHashes(env: string | undefined): Set<string> {
  return new Set(
    (env ?? "")
      .split(/[\s,]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => /^[0-9a-f]{64}$/.test(s)),
  );
}

let decoyHashes: Set<string> | null = null;
export function isDecoyTokenHash(hash: string): boolean {
  decoyHashes ??= parseDecoyHashes(process.env.DECOY_TOKEN_SHA256);
  return decoyHashes.has(hash.toLowerCase());
}

async function where(): Promise<string> {
  try {
    const h = await headers();
    return `나라 ${h.get("x-vercel-ip-country") ?? "?"} · IP 표식 ${clientIpKeyFromHeaders(h).slice(0, 8)} · ${(h.get("user-agent") ?? "?").slice(0, 80)}`;
  } catch {
    return "요청 정보 없음";
  }
}

async function stampAlert(key: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("system_status").select("alerts_state").eq("id", "singleton").single();
  const state = (data?.alerts_state ?? {}) as Record<string, string>;
  await admin
    .from("system_status")
    .update({ alerts_state: { ...state, [key]: new Date().toISOString() } })
    .eq("id", "singleton");
}

async function mail(title: string, lines: string[]) {
  await sendEmail({
    to: alertRecipients(),
    ...adminAlertEmail({ title, lines, ctaLabel: "비상 정지 열기", ctaUrl: `${SITE_URL}/admin#stop` }),
  });
}

/** 미끼 토큰이 쓰였다 — 사이트를 읽기 전용으로 잠그고 알린다. 부른 쪽은 그냥 401을 낸다(눈치 못 채게). */
export async function tripDecoy(what: string): Promise<void> {
  try {
    const from = await where();
    logger.error("tripwire: DECOY touched — site locked read-only", { alert: "decoy", what, from });
    const admin = createAdminClient();
    // 이미 잠겨 있으면 처음 잠근 시각을 덮지 않는다.
    await admin
      .from("system_status")
      .update({ site_readonly_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", "singleton")
      .is("site_readonly_at", null);
    await stampAlert("decoy");
    // 메일은 10분에 한 통 — 공격자가 계속 두드려도 메일함이 넘치지 않게.
    if (await rateLimit({ name: "tripwire-mail", key: "decoy", windowSeconds: WINDOW_S, max: 1 })) {
      await mail("미끼가 건드려졌어요 — 사이트를 읽기 전용으로 잠갔어요", [
        `무엇: ${what}`,
        `어디서: ${from}`,
        "진짜 사용자는 절대 모르는 미끼라, 누군가 데이터 저장소·백업·맥 중 하나를 들여다봤다는 뜻이에요.",
        "다음: 관제탑 › 비상 정지에서 [전부 끊기] → 서비스 키·워커 열쇠·데이터 저장소 비밀번호 바꾸기 → 원인 찾은 뒤 읽기 전용 풀기.",
      ]);
    }
  } catch (err) {
    logger.error("tripwire: decoy handling failed", { error: err });
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
      logger.error("tripwire: token burst — token revoked", { alert: "token-burst", tokenId, userId, from });
      await stampAlert("token-burst");
      await mail("토큰 하나가 너무 많이 쓰여서 끊었어요", [
        `10분 안에 ${TOKEN_BURST_MAX}번을 넘었어요. 그 토큰만 끊었고 나머지는 그대로예요.`,
        `사용자 ${userId.slice(0, 8)} · 토큰 ${tokenId.slice(0, 8)} · ${from}`,
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
    logger.error("tripwire: admin burst — admin signed out", { alert: "admin-burst", from, sessions: data, error });
    await stampAlert("admin-burst");
    await mail("관리자 조치가 몰려서 관리자 로그인을 전부 끊었어요", [
      `10분 안에 관리자 API를 ${ADMIN_BURST_MAX}번 넘게 불렀어요. 계정: ${user.email ?? user.id}`,
      `마지막 요청: ${from}`,
      error ? "⚠️ 로그인 끊기는 실패했어요 — 설정에서 모든 기기 로그아웃을 직접 눌러 주세요." : `로그인 ${data ?? 0}개를 끊었어요. 직접 한 거라면 다시 로그인하면 돼요.`,
      "직접 한 게 아니라면 Google·GitHub 비밀번호를 바꾸고 비상 정지를 검토해 주세요.",
    ]);
    return false;
  } catch (err) {
    logger.error("tripwire: admin action note failed", { error: err });
    return true;
  }
}
