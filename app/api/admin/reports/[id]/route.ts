import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { requireAdmin } from "@/lib/routeAuth";
import { recipientLocale } from "@/lib/i18n/user-locale";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { takedownEmail } from "@/lib/email-templates";
import { logger } from "@/lib/logger";

// Admin decision on a content report (/admin 신고 인박스).
//   resolve  → 문제 없음으로 종결. Resolution frees the partial-unique dedup slot,
//              so the same reporter can flag the same target again if the problem
//              recurs — that's intentional.
//   takedown → 신고된 **작품**을 비공개(초안)로 되돌리고 종결. 2026-09-01 신설:
//              약관 제7조가 "3영업일 내 비공개 처리하거나 삭제"를 약속하는데
//              그때까지 도구가 없어 Supabase를 손으로 만져야 했다.
//
// 왜 삭제가 아니라 is_draft=true 인가: ⓐ 초안 은닉은 이미 검증된 RLS 단일
// 게이트라 새 컬럼·새 경로가 필요 없다 ⓑ 되돌릴 수 있다 — 오판이었을 때 소유자의
// 작업물을 잃지 않는다(약관이 재검토 요청을 보장한다) ⓒ 파일도 그대로 남아
// 소유자는 대시보드에서 계속 본다.
//
// ⚠️ 한계(의도된 v1): 소유자가 다시 공개하면 되돌아온다. 재공개를 막으려면 새
// 컬럼이 필요한데, 관리자가 1명인 지금은 재신고로 충분하다. 반복되면 계정 삭제가
// 다음 수단이다.
// ⚠️ profile 신고는 내릴 수 없다 — 프로필을 숨기는 컬럼이 없다. 사칭 등은 개별
// 판단 후 계정 조치가 맞아, 가짜 버튼을 두는 대신 UI에서 비활성한다.

const REASON_LABEL: Record<string, { ko: string; en: string }> = {
  spam: { ko: "스팸/광고", en: "spam or advertising" },
  adult: { ko: "성인물·유해", en: "adult or harmful content" },
  impersonation: { ko: "사칭", en: "impersonation" },
  copyright: { ko: "저작권", en: "copyright" },
  other: { ko: "기타", en: "other" },
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const auth = await requireAdmin();
    if (auth instanceof NextResponse) return auth;

    // 본문 없는 POST = 기존 "처리됨" 버튼(하위 호환).
    let action = "resolve";
    try {
      const body = await req.json();
      if (typeof body?.action === "string") action = body.action;
    } catch { /* 본문 없음 = resolve */ }
    if (action !== "resolve" && action !== "takedown") {
      return apiError({ status: 400, message: "action은 resolve 또는 takedown이어야 해요.", code: "BAD_ACTION" });
    }

    const admin = createAdminClient();

    const { data: report, error: repErr } = await admin
      .from("content_reports")
      .select("id, target_type, target_id, reason, status")
      .eq("id", id)
      .maybeSingle();
    if (repErr || !report) {
      return apiError({ status: 404, message: "찾을 수 없어요.", code: "NOT_FOUND" });
    }
    if (report.status !== "open") {
      return apiError({ status: 409, message: "이미 처리된 신고예요.", code: "ALREADY_RESOLVED" });
    }

    // ── 내리기: 작품을 비공개로. 종결 표시보다 **먼저** 한다 — 내리기가 실패했는데
    //    신고만 닫히면 유해물이 공개된 채 인박스에서 사라진다.
    let takenDown = false;
    if (action === "takedown") {
      if (report.target_type !== "project") {
        return apiError({
          status: 400,
          message: "프로필 신고는 내리기로 처리할 수 없어요 — 개별 판단이 필요해요.",
          code: "TARGET_NOT_SUPPORTED",
        });
      }
      const { data: project, error: projErr } = await admin
        .from("projects")
        .select("id, user_id, title, is_draft")
        .eq("id", report.target_id)
        .maybeSingle();
      if (projErr) {
        return apiError({
          status: 500, message: "작품을 불러오지 못했어요.", code: "DB_READ_FAILED",
          cause: projErr, context: { reportId: id },
        });
      }
      if (!project) {
        // 이미 지워진 작품 — 내릴 게 없으니 신고만 닫는다.
        logger.info("report takedown: target already gone", { reportId: id, targetId: report.target_id });
      } else {
        if (!project.is_draft) {
          const { error: updErr } = await admin
            .from("projects")
            .update({ is_draft: true })
            .eq("id", project.id);
          if (updErr) {
            return apiError({
              status: 500, message: "작품을 내리지 못했어요.", code: "TAKEDOWN_FAILED",
              cause: updErr, context: { reportId: id, projectId: project.id },
            });
          }
          takenDown = true;
        }
        // 소유자 통지 — 조용히 사라지면 "내 작품이 왜 없어졌지"가 된다.
        // 메일 실패가 조치를 되돌리지는 않는다(로그로 남긴다).
        if (takenDown && isEmailConfigured()) {
          try {
            const { data: authUser } = await admin.auth.admin.getUserById(project.user_id);
            const to = authUser?.user?.email;
            if (to) {
              const locale = await recipientLocale(admin, project.user_id);
              const label = REASON_LABEL[report.reason]?.[locale === "en" ? "en" : "ko"] ?? report.reason;
              const mail = takedownEmail({
                projectTitle: project.title || getDictionary(locale).email.untitledProject,
                reasonLabel: label,
                locale,
              });
              await sendEmail({ to, subject: mail.subject, html: mail.html });
            }
          } catch (e) {
            logger.error("report takedown: owner email failed", { error: e, reportId: id });
          }
        }
      }
    }

    const { data, error } = await admin
      .from("content_reports")
      .update({ status: "resolved" })
      .eq("id", id)
      .eq("status", "open")
      .select("id")
      .maybeSingle();
    if (error) {
      return apiError({
        status: 500,
        message: "처리하지 못했어요. 잠시 후 다시 시도해 주세요.",
        code: "DB_UPDATE_FAILED",
        cause: error,
        context: { reportId: id },
      });
    }
    if (!data) {
      return apiError({ status: 409, message: "이미 처리된 신고예요.", code: "ALREADY_RESOLVED" });
    }

    logger.info("content report handled", { reportId: id, action, takenDown });
    return NextResponse.json({ ok: true, action, takenDown });
  } catch (err) {
    return apiError({
      status: 500,
      message: "잠시 후 다시 시도해 주세요.",
      code: "INTERNAL",
      cause: err,
    });
  }
}
