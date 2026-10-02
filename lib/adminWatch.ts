import { headers } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { rateLimit, clientIpKeyFromHeaders } from "@/lib/rate-limit";
import { sendEmail, alertRecipients } from "@/lib/email";
import { adminAlertEmail, SITE_URL } from "@/lib/email-templates";
import { logger } from "@/lib/logger";

// 관리자 화면 지켜보기(2026-10-02, 위협 목록 "/admin 공격 감지 없음").
//
// 관리자 화면·API는 관리자가 아니면 404로 존재를 숨긴다(lib/routeAuth.ts requireAdmin). 그런데
// 누가 그 문을 계속 두드려도 아무도 몰랐다. 두 가지를 본다:
//   1. 막힌 접근 — IP 하나가 10분에 6번 넘게 막히면 관리자에게 메일(전체 1시간에 1통).
//   2. 열린 접근 — 관리자 세션이 처음 보는 나라에서 열리면 메일(나라마다 30일에 1통). 세션을
//      훔친 사람은 404에 안 걸리므로 1번으로는 안 보인다. 집 IP는 자주 바뀌어 IP가 아니라 나라로 센다.
// 셋 다 rl_touch 창(fail-open)이라 표가 없고, 메일·한도기가 고장 나도 화면은 그대로 열리거나 막힌다.

const PROBE_WINDOW_S = 600;
const PROBE_MAX = 5;

async function alertOnce(bucket: string, windowSeconds: number, title: string, lines: string[]) {
  const first = await rateLimit({ name: "admin-alert", key: bucket, windowSeconds, max: 1 });
  if (!first) return;
  await sendEmail({
    to: alertRecipients(),
    ...adminAlertEmail({ title, lines, ctaLabel: "관제탑 열기", ctaUrl: `${SITE_URL}/admin` }),
  });
}

/** 관리자 문에서 막힌 요청. 막는 응답(404)은 부른 쪽이 그대로 낸다 — 이 함수는 기록만. */
export async function noteAdminDenied(where: string, user: User | null): Promise<void> {
  try {
    const h = await headers();
    const ipKey = clientIpKeyFromHeaders(h);
    const country = h.get("x-vercel-ip-country") ?? "?";
    logger.warn("admin: access denied", { where, ip: ipKey.slice(0, 8), country, loggedIn: !!user });
    const under = await rateLimit({ name: "admin-denied", key: ipKey, windowSeconds: PROBE_WINDOW_S, max: PROBE_MAX });
    if (under) return;
    await alertOnce("denied", 3600, "관리자 화면 접근 시도", [
      `한 곳에서 10분 안에 ${PROBE_MAX + 1}번 넘게 관리자 화면을 열려다 막혔어요(404).`,
      `마지막 위치: ${where} · 나라 ${country} · IP 표식 ${ipKey.slice(0, 8)}`,
      `로그인: ${user ? `예 (${user.email ?? user.id})` : "아니오"}`,
      "같은 일이 계속되면 Vercel 방화벽에서 그 나라·IP를 막을 수 있어요. 이 메일은 1시간에 한 번만 와요.",
    ]);
  } catch (err) {
    logger.error("adminWatch: denied note failed", { error: err });
  }
}

/** 관리자 세션으로 열린 요청 — 처음 보는 나라면 알린다. */
export async function noteAdminAllowed(where: string, user: User): Promise<void> {
  try {
    const h = await headers();
    const country = h.get("x-vercel-ip-country") ?? "?";
    const seen = !(await rateLimit({ name: "admin-country", key: `${user.id}:${country}`, windowSeconds: 30 * 86400, max: 1 }));
    if (seen) return;
    logger.warn("admin: opened from a new country", { where, country });
    await alertOnce(`country:${user.id}:${country}`, 30 * 86400, "관리자 화면이 새 나라에서 열렸어요", [
      `계정: ${user.email ?? user.id}`,
      `나라: ${country} · 위치: ${where}`,
      "직접 연 거라면 무시해도 돼요. 아니라면 설정에서 모든 기기 로그아웃 후 Google·GitHub 비밀번호를 바꿔 주세요.",
    ]);
  } catch (err) {
    logger.error("adminWatch: allowed note failed", { error: err });
  }
}
