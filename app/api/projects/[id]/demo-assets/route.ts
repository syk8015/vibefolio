import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/apiError";
import { logger } from "@/lib/logger";
import { isR2Configured, deleteR2Prefix } from "@/lib/r2";

// Delete a project's demo assets (versioned mp4 + poster) from R2. R2 needs
// server-side secrets, so the client-side project-delete flow can't do it — it
// calls this authed route before removing the row (ownership is verified from the
// row, which must still exist). When R2 isn't configured, the Supabase-fallback
// demo lives under the project's storage folder and is removed client-side, so
// this is a no-op.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return apiError({ status: 401, message: "로그인이 필요해요.", code: "UNAUTHORIZED" });
    }

    const { data: project, error: selErr } = await supabase
      .from("projects")
      .select("id, user_id")
      .eq("id", id)
      .single();
    if (selErr || !project) {
      return apiError({ status: 404, message: "프로젝트를 찾을 수 없어요.", code: "NOT_FOUND" });
    }
    if (project.user_id !== user.id) {
      return apiError({ status: 403, message: "이 프로젝트에 대한 권한이 없어요.", code: "FORBIDDEN" });
    }

    if (!isR2Configured()) {
      return NextResponse.json({ ok: true, deleted: 0, r2: false });
    }

    const deleted = await deleteR2Prefix(`${project.user_id}/${id}/`);
    logger.info("r2 demo assets deleted", { projectId: id, deleted });
    return NextResponse.json({ ok: true, deleted, r2: true });
  } catch (err) {
    return apiError({
      status: 500,
      message: "잠시 후 다시 시도해 주세요.",
      code: "INTERNAL",
      cause: err,
    });
  }
}
