import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, bodyTooLarge } from "@/lib/apiError";
import { requireAdmin } from "@/lib/routeAuth";
import { recipientLocale } from "@/lib/i18n/user-locale";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { takedownEmail } from "@/lib/email-templates";
import { logger } from "@/lib/logger";
import { revalidatePortfolio } from "@/lib/revalidatePortfolio";
import { BODY_TOO_LARGE, readJsonOr, MAX_SMALL_JSON_BYTES } from "@/lib/upload-safety";

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
// 잠금(2026-10-02, migration_takedown_lock.sql): 내린 작품엔 taken_down_at을 찍어 주인이
// [공개]를 다시 눌러도 트리거가 막는다. 프로필 신고는 명함 정지(profiles.suspended_at — 주인
// 말고는 안 보임) + 그 사람의 공개 작품 전부 내리기. 풀기는 SQL 파일 머리의 두 줄.
// SQL 적용 전이면 칸이 없다 → 작품은 옛 방식(is_draft만)으로 내리고, 명함 정지는 409로 알린다.

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
      const body = await readJsonOr(req, MAX_SMALL_JSON_BYTES, null);
      if (body === BODY_TOO_LARGE) return bodyTooLarge();
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
      if (report.target_type === "profile") {
        const res = await suspendProfile(admin, report.target_id, report.reason, id);
        if (res instanceof NextResponse) return res;
        takenDown = res;
      } else {
        const res = await takeDownProject(admin, report.target_id, report.reason, id);
        if (res instanceof NextResponse) return res;
        takenDown = res;
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

type Admin = ReturnType<typeof createAdminClient>;

// 작품 내리기 — 초안으로 + 잠금(taken_down_at). 이미 초안이어도 잠근다: 주인이 스스로 숨겨 둔
// 신고 작품을 나중에 다시 공개하지 못하게. 메일은 실제로 공개에서 내렸을 때만.
async function takeDownProject(admin: Admin, projectId: string, reason: string, reportId: string): Promise<boolean | NextResponse> {
  const { data: project, error: projErr } = await admin
    .from("projects")
    .select("id, user_id, title, is_draft")
    .eq("id", projectId)
    .maybeSingle();
  if (projErr) {
    return apiError({
      status: 500, message: "작품을 불러오지 못했어요.", code: "DB_READ_FAILED",
      cause: projErr, context: { reportId },
    });
  }
  if (!project) {
    // 이미 지워진 작품 — 내릴 게 없으니 신고만 닫는다.
    logger.info("report takedown: target already gone", { reportId, targetId: projectId });
    return false;
  }

  let { error: updErr } = await admin
    .from("projects")
    .update({ is_draft: true, taken_down_at: new Date().toISOString() })
    .eq("id", project.id);
  if (updErr && isMissingColumn(updErr, "taken_down_at")) {
    ({ error: updErr } = await admin.from("projects").update({ is_draft: true }).eq("id", project.id));
  }
  if (updErr) {
    return apiError({
      status: 500, message: "작품을 내리지 못했어요.", code: "TAKEDOWN_FAILED",
      cause: updErr, context: { reportId, projectId: project.id },
    });
  }
  if (project.is_draft) return false;

  // 내린 작품이 캐시로 1분간 공개 화면에 남지 않게.
  revalidatePortfolio();
  // 소유자 통지 — 조용히 사라지면 "내 작품이 왜 없어졌지"가 된다.
  // 메일 실패가 조치를 되돌리지는 않는다(로그로 남긴다).
  if (isEmailConfigured()) {
    try {
      const { data: authUser } = await admin.auth.admin.getUserById(project.user_id);
      const to = authUser?.user?.email;
      if (to) {
        const locale = await recipientLocale(admin, project.user_id);
        const label = REASON_LABEL[reason]?.[locale === "en" ? "en" : "ko"] ?? reason;
        const mail = takedownEmail({
          projectTitle: project.title || getDictionary(locale).email.untitledProject,
          reasonLabel: label,
          locale,
        });
        await sendEmail({ to, subject: mail.subject, html: mail.html });
      }
    } catch (e) {
      logger.error("report takedown: owner email failed", { error: e, reportId });
    }
  }
  return true;
}

function isMissingColumn(err: { code?: string; message?: string }, col: string): boolean {
  return (err.code === "42703" || err.code === "PGRST204") && (err.message ?? "").includes(col);
}

// 명함 정지 — 정지 표시 → 공개 작품 전부 초안 + 잠금 → 주인 메일. 정지를 먼저 찍는다: 그 순간부터
// 트리거가 새 공개를 막으므로, 작품을 내리는 사이에 주인이 하나 더 공개하는 틈이 없다.
async function suspendProfile(admin: Admin, profileId: string, reason: string, reportId: string): Promise<boolean | NextResponse> {
  const now = new Date().toISOString();
  const { data: prof, error: profErr } = await admin
    .from("profiles")
    .update({ suspended_at: now })
    .eq("id", profileId)
    .select("id, username")
    .maybeSingle();
  if (profErr && isMissingColumn(profErr, "suspended_at")) {
    return apiError({
      status: 409, message: "명함 정지 SQL(migration_takedown_lock.sql)을 먼저 적용해 주세요.", code: "MIGRATION_PENDING",
    });
  }
  if (profErr) {
    return apiError({ status: 500, message: "명함을 내리지 못했어요.", code: "TAKEDOWN_FAILED", cause: profErr, context: { reportId } });
  }
  if (!prof) return false; // 이미 탈퇴한 사람

  const { error: projErr } = await admin
    .from("projects")
    .update({ is_draft: true, taken_down_at: now })
    .eq("user_id", profileId)
    .eq("is_draft", false);
  if (projErr) {
    return apiError({ status: 500, message: "작품을 내리지 못했어요.", code: "TAKEDOWN_FAILED", cause: projErr, context: { reportId } });
  }
  revalidatePortfolio();

  if (isEmailConfigured()) {
    try {
      const { data: authUser } = await admin.auth.admin.getUserById(profileId);
      const to = authUser?.user?.email;
      if (to) {
        const locale = await recipientLocale(admin, profileId);
        const label = REASON_LABEL[reason]?.[locale === "en" ? "en" : "ko"] ?? reason;
        const mail = takedownEmail({ projectTitle: `@${prof.username}`, reasonLabel: label, locale, target: "profile" });
        await sendEmail({ to, subject: mail.subject, html: mail.html });
      }
    } catch (e) {
      logger.error("report takedown: owner email failed", { error: e, reportId });
    }
  }
  return true;
}
