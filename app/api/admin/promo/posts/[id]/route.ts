import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { isAdminEmail } from "@/lib/demoQuota";

// 캡션 재편집과 "게시완료로 표시"를 하나의 라우트로 처리한다(부분 필드 패치) —
// 저사용 내부 도구에 단일 목적 라우트를 여러 개 늘리지 않기 위한 의도적 통합.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdminEmail(user.email)) {
      return apiError({ status: 404, message: "찾을 수 없어요.", code: "NOT_FOUND" });
    }

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // empty patch below reports BAD_REQUEST
    }

    const patch: Record<string, unknown> = {};
    if (typeof body.caption === "string") patch.caption = body.caption;
    if (typeof body.channel === "string" && body.channel.trim()) {
      if (body.channel.length > 60) {
        return apiError({ status: 400, message: "채널 이름이 너무 길어요.", code: "CHANNEL_TOO_LONG" });
      }
      patch.channel = body.channel.trim();
    }
    if (typeof body.postUrl === "string") patch.post_url = body.postUrl || null;
    if (body.status === "posted" || body.status === "draft") {
      patch.status = body.status;
      patch.posted_at = body.status === "posted" ? new Date().toISOString() : null;
    }
    if (Object.keys(patch).length === 0) {
      return apiError({ status: 400, message: "변경할 내용이 없어요.", code: "EMPTY_PATCH" });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("promo_posts")
      .update(patch)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) {
      return apiError({
        status: 500,
        message: "수정에 실패했어요.",
        code: "DB_UPDATE_FAILED",
        cause: error,
        context: { postId: id },
      });
    }
    if (!data) {
      return apiError({ status: 404, message: "포스트를 찾을 수 없어요.", code: "NOT_FOUND" });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError({ status: 500, message: "잠시 후 다시 시도해 주세요.", code: "INTERNAL", cause: err });
  }
}
