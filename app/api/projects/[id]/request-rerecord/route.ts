import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { apiError } from "@/lib/apiError";
import { getT } from "@/lib/i18n/server";
import { sendEmail, alertRecipients } from "@/lib/email";
import { adminAlertEmail, SITE_URL } from "@/lib/email-templates";

// A project gets ONE auto demo. Re-recording a landed video (or getting another
// take after the retry budget is spent) is not self-serve — the owner files a
// request that says what they want changed, and an admin approves it on /admin.
// This route only records the ask; nothing is spent until approval.

const REASON_MAX = 1000;
const IN_FLIGHT = ["pending", "building", "recording", "editing"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { t } = await getT();
  try {
    const { id } = await params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return apiError({ status: 401, message: t.api.loginRequired, code: "UNAUTHORIZED" });
    }

    let reason = "";
    try {
      const body = await req.json();
      reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    } catch {
      reason = "";
    }
    if (!reason) {
      return apiError({
        status: 400,
        message: t.api.rerecordReasonRequired,
        code: "REASON_REQUIRED",
      });
    }
    if (reason.length > REASON_MAX) reason = reason.slice(0, REASON_MAX);

    const { data: project, error: selErr } = await supabase
      .from("projects")
      .select("id, user_id, title, demo_build_status")
      .eq("id", id)
      .single();
    if (selErr || !project) {
      return apiError({ status: 404, message: t.api.projectNotFound, code: "NOT_FOUND" });
    }
    if (project.user_id !== user.id) {
      return apiError({ status: 403, message: t.api.projectForbidden, code: "FORBIDDEN" });
    }
    if (IN_FLIGHT.includes(project.demo_build_status ?? "")) {
      return apiError({
        status: 409,
        message: t.api.rerecordInFlight,
        code: "IN_FLIGHT",
      });
    }

    // Writes to the approval queue go through the service role (users have no
    // insert policy on demo_requests). Ownership was just verified above.
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: existing } = await admin
      .from("demo_requests")
      .select("id")
      .eq("project_id", id)
      .eq("kind", "rerecord")
      .eq("status", "pending")
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ ok: true, already: true });
    }

    const { error: insErr } = await admin.from("demo_requests").insert({
      project_id: id,
      user_id: user.id,
      kind: "rerecord",
      reason,
    });
    if (insErr) {
      // Unique partial index (one pending per project+kind) can race two submits;
      // treat the collision as "already requested" rather than an error.
      if (insErr.code === "23505") {
        return NextResponse.json({ ok: true, already: true });
      }
      return apiError({
        status: 500,
        message: t.api.rerecordSaveFailed,
        code: "DB_INSERT_FAILED",
        cause: insErr,
        context: { projectId: id },
      });
    }

    // 승인 대기 알림 (T4) — 새 요청이 실제로 접수됐을 때만 (already 경로 제외).
    // sendEmail은 절대 throw 하지 않으므로 요청 접수 응답을 위협하지 않는다.
    await sendEmail({
      to: alertRecipients(),
      ...adminAlertEmail({
        title: "재촬영 요청 접수",
        lines: [
          `프로젝트: ${project.title ?? "(제목 없음)"} (${id})`,
          `요청 내용: ${reason.length > 200 ? reason.slice(0, 200) + "…" : reason}`,
          "승인해야 재촬영이 시작돼요 — 승인 전까지는 아무것도 과금되지 않아요.",
        ],
        ctaLabel: "승인 콘솔 열기",
        ctaUrl: `${SITE_URL}/admin`,
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
