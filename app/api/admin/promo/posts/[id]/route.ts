import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { isAdminEmail } from "@/lib/demoQuota";

// "이 채널에 올렸다"는 기록을 취소한다(채널 버튼의 ×). 캡션 편집·게시완료 표시
// PATCH는 폐기됐다(2026-08-27) — 캡션은 클립에 하나로 모였고, 채널 버튼을 누른
// 것 자체가 게시 표시라 따로 눌러 바꿀 게 없어졌다.
//
// ⚠️ 지우면 그 채널의 추적 링크(campaign=promo-{postId})가 가리키는 유입 기록이
// 집계에서 사라진다. UI는 유입·가입이 0일 때만 ×를 보여주지만, 서버는 이미 발급
// 된 링크가 돌아다닐 수 있다는 걸 감안해 **이미 숫자가 붙은 포스트는 거부**한다.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdminEmail(user.email)) {
      return apiError({ status: 404, message: "찾을 수 없어요.", code: "NOT_FOUND" });
    }

    const admin = createAdminClient();
    const { data: post, error: findErr } = await admin
      .from("promo_posts")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (findErr) {
      return apiError({ status: 500, message: "조회에 실패했어요.", code: "DB_SELECT_FAILED", cause: findErr });
    }
    if (!post) {
      return apiError({ status: 404, message: "포스트를 찾을 수 없어요.", code: "NOT_FOUND" });
    }

    // 유입/가입이 하나라도 붙었으면 기록을 지우지 않는다.
    const { count, error: evErr } = await admin
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .contains("props", { utm_campaign: `promo-${id}` });
    if (evErr) {
      return apiError({ status: 500, message: "조회에 실패했어요.", code: "DB_SELECT_FAILED", cause: evErr });
    }
    if ((count ?? 0) > 0) {
      return apiError({
        status: 409,
        message: "이미 유입이 기록된 채널이라 지울 수 없어요.",
        code: "HAS_TRAFFIC",
      });
    }

    const { error } = await admin.from("promo_posts").delete().eq("id", id);
    if (error) {
      return apiError({
        status: 500,
        message: "취소에 실패했어요.",
        code: "DB_DELETE_FAILED",
        cause: error,
        context: { postId: id },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError({ status: 500, message: "잠시 후 다시 시도해 주세요.", code: "INTERNAL", cause: err });
  }
}
