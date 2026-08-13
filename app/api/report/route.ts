import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { getT } from "@/lib/i18n/server";
import { rateLimit, clientIpKey } from "@/lib/rate-limit";
import { sendEmail, alertRecipients } from "@/lib/email";
import { adminAlertEmail, SITE_URL } from "@/lib/email-templates";

// Public content report (T6) — the 신고 button on /@user and /@user/:id.
// Logged-out visitors can report (the audience that matters for moderation is
// mostly anonymous), so identity is a hashed IP; the service role writes past
// content_reports' default-deny RLS after validation + rate limiting here.

const REASONS = ["spam", "adult", "impersonation", "copyright", "other"] as const;
type Reason = (typeof REASONS)[number];

const REASON_LABEL: Record<Reason, string> = {
  spam: "스팸/광고",
  adult: "성인물·유해 콘텐츠",
  impersonation: "사칭",
  copyright: "저작권 침해",
  other: "기타",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DETAIL_MAX = 500;

export async function POST(req: NextRequest) {
  const { t } = await getT();
  try {
    const body = await req.json().catch(() => null);
    const targetType = body?.targetType;
    const targetId = body?.targetId;
    const reason = body?.reason;

    if (
      (targetType !== "profile" && targetType !== "project") ||
      typeof targetId !== "string" ||
      !UUID_RE.test(targetId) ||
      !REASONS.includes(reason)
    ) {
      return apiError({ status: 400, message: t.api.badReport, code: "BAD_REQUEST" });
    }

    let detail = typeof body?.detail === "string" ? body.detail.trim() : "";
    if (detail.length > DETAIL_MAX) detail = detail.slice(0, DETAIL_MAX);

    const reporterKey = clientIpKey(req);
    const allowed = await rateLimit({
      name: "report",
      key: reporterKey,
      windowSeconds: 3600,
      max: 5,
    });
    if (!allowed) {
      return apiError({
        status: 429,
        message: t.api.reportRateLimited,
        code: "RATE_LIMITED",
      });
    }

    // Resolve the target so junk UUIDs don't reach the table, and so the admin
    // email can link straight to the reported page.
    const admin = createAdminClient();
    let targetUrl: string;
    let targetLabel: string;
    if (targetType === "profile") {
      const { data: p } = await admin
        .from("profiles")
        .select("id, username, name")
        .eq("id", targetId)
        .maybeSingle();
      if (!p) return apiError({ status: 404, message: t.api.targetNotFound, code: "NOT_FOUND" });
      targetUrl = `${SITE_URL}/${p.username}`;
      targetLabel = `프로필 @${p.username}`;
    } else {
      const { data: pr } = await admin
        .from("projects")
        .select("id, title, user_id")
        .eq("id", targetId)
        .maybeSingle();
      if (!pr) return apiError({ status: 404, message: t.api.targetNotFound, code: "NOT_FOUND" });
      const { data: owner } = await admin
        .from("profiles")
        .select("username")
        .eq("id", pr.user_id)
        .maybeSingle();
      targetUrl = `${SITE_URL}/${owner?.username ?? ""}/${pr.id}`;
      targetLabel = `프로젝트 "${pr.title ?? "(제목 없음)"}" (@${owner?.username ?? "?"})`;
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: insErr } = await admin.from("content_reports").insert({
      target_type: targetType,
      target_id: targetId,
      reason,
      detail: detail || null,
      reporter_key: reporterKey,
      reporter_user_id: user?.id ?? null,
    });
    if (insErr) {
      // Partial unique index: one open report per (target, reporter). A repeat
      // submit is a success from the reporter's point of view — and no re-alert.
      if (insErr.code === "23505") return NextResponse.json({ ok: true, already: true });
      return apiError({
        status: 500,
        message: t.api.reportSaveFailed,
        code: "DB_INSERT_FAILED",
        cause: insErr,
        context: { targetType, targetId },
      });
    }

    // sendEmail never throws; a mail failure must not fail the report itself.
    await sendEmail({
      to: alertRecipients(),
      ...adminAlertEmail({
        title: "콘텐츠 신고 접수",
        lines: [
          `대상: ${targetLabel}`,
          `사유: ${REASON_LABEL[reason as Reason]}`,
          ...(detail ? [`내용: ${detail.length > 200 ? detail.slice(0, 200) + "…" : detail}`] : []),
          `신고자: ${user?.email ?? "비로그인"} (${reporterKey.slice(0, 8)})`,
        ],
        ctaLabel: "신고된 페이지 열기",
        ctaUrl: targetUrl,
      }),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError({
      status: 500,
      message: t.api.retryLater,
      code: "INTERNAL",
      cause: err,
    });
  }
}
