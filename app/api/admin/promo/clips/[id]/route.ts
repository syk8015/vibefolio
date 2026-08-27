import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { isAdminEmail } from "@/lib/demoQuota";

// 클립 캡션 저장. 캡션은 채널마다가 아니라 **클립 하나에 하나**다
// (2026-08-27, migration_promo_caption.sql) — 어느 SNS에 올리든 같은 글을 쓰기
// 때문이다. 채널별 기록은 올릴 때 promo_posts.caption에 함께 박힌다.
const CAPTION_MAX = 4000;

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

    let caption: string | null = null;
    try {
      const body = await req.json();
      if (typeof body?.caption === "string") caption = body.caption;
    } catch {
      // falls through to validation below
    }
    if (caption === null) {
      return apiError({ status: 400, message: "caption이 필요해요.", code: "BAD_REQUEST" });
    }
    if (caption.length > CAPTION_MAX) {
      return apiError({ status: 400, message: "캡션이 너무 길어요.", code: "CAPTION_TOO_LONG" });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("promo_clips")
      .update({ caption: caption || null })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) {
      return apiError({
        status: 500,
        message: "캡션 저장에 실패했어요.",
        code: "DB_UPDATE_FAILED",
        cause: error,
        context: { clipId: id },
      });
    }
    if (!data) {
      return apiError({ status: 404, message: "클립을 찾을 수 없어요.", code: "NOT_FOUND" });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError({ status: 500, message: "잠시 후 다시 시도해 주세요.", code: "INTERNAL", cause: err });
  }
}
