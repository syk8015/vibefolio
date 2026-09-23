import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { authorizeCron } from "@/lib/cronAuth";
import { logger } from "@/lib/logger";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { handoffEmail, SITE_URL } from "@/lib/email-templates";
import { trackServerEvent } from "@/lib/analytics";
import { AnalyticsEvent } from "@/lib/analytics-events";
import { isLocale, DEFAULT_LOCALE } from "@/lib/i18n/config";
import {
  HANDOFF_TTL_MS,
  REMIND_AFTER_MS,
  REMIND_BATCH_MAX,
  REMIND_BEFORE_MS,
  handoffLink,
  shouldRemind,
} from "@/lib/handoff";

// 폰 → 컴퓨터 넘기기 알림 크론(docs/desktop-handoff.md). cron-job.org가 1시간마다 부른다.
//   1) "(선택) 내일 알려주기"에 동의했고, 아직 컴퓨터에서 안 열었고, 알림을 안 보낸 행 중
//      20~44시간 된 것에 알림 1통 → reminded_at. 동의 없는 행엔 절대 안 보낸다.
//   2) 30일 지난 행 삭제 — 이메일을 오래 들고 있지 않는다.
// 권한 있는 호출엔 항상 200(찾은 게 있어도 크론 서비스가 실패로 보지 않게).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = authorizeCron(req);
  if (gate === "unconfigured") {
    return apiError({ status: 503, message: "CRON_SECRET not configured", code: "CRON_UNCONFIGURED" });
  }
  if (gate === "denied") {
    return apiError({ status: 401, message: "unauthorized", code: "UNAUTHORIZED", log: false });
  }

  const admin = createAdminClient();
  const now = Date.now();
  let sent = 0;
  let failed = 0;

  if (isEmailConfigured()) {
    const { data: rows, error } = await admin
      .from("desktop_handoffs")
      .select("id, email, locale, remind, opened_at, reminded_at, created_at")
      .eq("remind", true)
      .is("opened_at", null)
      .is("reminded_at", null)
      .lte("created_at", new Date(now - REMIND_AFTER_MS).toISOString())
      .gte("created_at", new Date(now - REMIND_BEFORE_MS).toISOString())
      .order("created_at", { ascending: true })
      .limit(REMIND_BATCH_MAX);
    if (error) {
      logger.error("handoff-reminders: select failed", { error });
    } else {
      for (const row of rows ?? []) {
        if (!shouldRemind(row, now)) continue;
        // 먼저 찍고 보낸다 — 크론이 겹쳐 돌아도 두 통이 가지 않게(한 통이 안 가는 쪽이 낫다).
        const { data: claimed } = await admin
          .from("desktop_handoffs")
          .update({ reminded_at: new Date().toISOString() })
          .eq("id", row.id)
          .is("reminded_at", null)
          .select("id");
        if (!claimed || claimed.length === 0) continue;
        const locale = isLocale(row.locale) ? row.locale : DEFAULT_LOCALE;
        const mail = handoffEmail({ link: handoffLink(SITE_URL, row.id), reminder: true, locale });
        if (await sendEmail({ to: row.email, ...mail })) {
          sent++;
          await trackServerEvent(AnalyticsEvent.HandoffReminded, { props: { handoff: row.id } });
        } else {
          failed++;
        }
      }
    }
  }

  const { error: delErr, count: deleted } = await admin
    .from("desktop_handoffs")
    .delete({ count: "exact" })
    .lt("created_at", new Date(now - HANDOFF_TTL_MS).toISOString());
  if (delErr) logger.error("handoff-reminders: purge failed", { error: delErr });

  return NextResponse.json({ ok: true, sent, failed, deleted: deleted ?? 0 });
}
