import { createAdminClient } from "./supabase/admin";
import { sendEmail, alertRecipients } from "./email";
import { adminAlertEmail, SITE_URL } from "./email-templates";
import { logger } from "./logger";

// 관리자 승인 요청 메일을 하루 한 통으로 묶는다(2026-09-22 트래픽3). 한도 초과 held·
// 재촬영 요청마다 관리자 메일이 1통씩 나가, 몰리는 날엔 가입 확인 메일과 같은 Resend
// 한도를 먹었다. 24시간 창의 첫 요청만 바로 알리고, 그 뒤 요청은 관제탑 큐에 쌓인다.
// 창이 지나도 큐가 남아 있으면 health 크론이 같은 키로 "승인 대기 N건"을 한 번 보낸다.
// 상태는 워치독 메일 dedup과 같은 system_status.alerts_state에 둔다.
export const APPROVAL_MAIL_KEY = "approvals-waiting";
export const APPROVAL_MAIL_WINDOW_MS = 24 * 3_600_000;

// 절대 throw 하지 않는다 — 호출부(요청 접수 응답)를 메일 문제로 실패시키지 않게.
export async function mailApprovalRequest(input: { title: string; lines: string[] }): Promise<boolean> {
  try {
    return await mailApprovalRequestInner(input);
  } catch (error) {
    logger.error("approval mail failed", { error, title: input.title });
    return false;
  }
}

async function mailApprovalRequestInner(input: { title: string; lines: string[] }): Promise<boolean> {
  const admin = createAdminClient();
  const now = Date.now();
  const { data, error } = await admin
    .from("system_status")
    .select("alerts_state")
    .eq("id", "singleton")
    .single();
  // 상태를 못 읽으면(마이그레이션 전 등) 예전처럼 바로 보낸다 — 알림을 잃는 쪽보다 낫다.
  if (!error) {
    const state = (data?.alerts_state ?? {}) as Record<string, string>;
    const last = state[APPROVAL_MAIL_KEY] ? Date.parse(state[APPROVAL_MAIL_KEY]) : NaN;
    if (Number.isFinite(last) && now - last < APPROVAL_MAIL_WINDOW_MS) {
      logger.info("approval mail batched (already mailed within 24h)", { title: input.title });
      return false;
    }
    await admin
      .from("system_status")
      .update({ alerts_state: { ...state, [APPROVAL_MAIL_KEY]: new Date(now).toISOString() } })
      .eq("id", "singleton");
  }
  return sendEmail({
    to: alertRecipients(),
    ...adminAlertEmail({
      title: input.title,
      lines: [
        ...input.lines,
        "앞으로 24시간 동안 들어오는 승인 요청은 따로 메일하지 않아요 — 관제탑 승인 큐에서 한 번에 봐 주세요. 그때도 남아 있으면 한 번 더 알려드려요.",
      ],
      ctaLabel: "승인 콘솔 열기",
      ctaUrl: `${SITE_URL}/admin`,
    }),
  });
}
