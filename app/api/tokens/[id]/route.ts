import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";

// DELETE /api/tokens/[id] — 토큰 소프트 폐기(revoked_at 스탬프). 소유 확인 후 서비스
// 롤로 update한다(api_tokens 엔 update RLS 정책이 없으므로 클라 직접 update 불가).
// 폐기된 토큰은 verifyToken()의 `.is('revoked_at', null)` 필터에서 즉시 걸러진다.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return apiError({ status: 401, message: "로그인이 필요해요.", code: "UNAUTHORIZED" });
    }

    const admin = createAdminClient();
    const { data: tok } = await admin
      .from("api_tokens")
      .select("user_id, revoked_at")
      .eq("id", id)
      .maybeSingle();
    if (!tok) {
      return apiError({ status: 404, message: "토큰을 찾을 수 없어요.", code: "NOT_FOUND" });
    }
    if (tok.user_id !== user.id) {
      return apiError({ status: 403, message: "이 토큰에 대한 권한이 없어요.", code: "FORBIDDEN" });
    }
    if (tok.revoked_at) {
      return NextResponse.json({ ok: true, already: true });
    }

    const { error } = await admin
      .from("api_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      return apiError({
        status: 500,
        message: "토큰을 폐기하지 못했어요. 잠시 후 다시 시도해 주세요.",
        code: "DB_UPDATE_FAILED",
        cause: error,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError({ status: 500, message: "잠시 후 다시 시도해 주세요.", code: "INTERNAL", cause: err });
  }
}
