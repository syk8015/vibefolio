import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { isAdminEmail } from "@/lib/demoQuota";

// Admin marks a content report as resolved (/admin/ops inbox). Resolution frees
// the partial-unique dedup slot, so the same reporter can flag the same target
// again if the problem recurs — that's intentional.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdminEmail(user.email)) {
      // Don't reveal the endpoint to non-admins.
      return apiError({ status: 404, message: "찾을 수 없어요.", code: "NOT_FOUND" });
    }

    const admin = createAdminClient();
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

    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError({
      status: 500,
      message: "잠시 후 다시 시도해 주세요.",
      code: "INTERNAL",
      cause: err,
    });
  }
}
