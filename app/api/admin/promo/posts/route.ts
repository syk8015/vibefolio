import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { isAdminEmail } from "@/lib/demoQuota";
import { promoTrackingUrl } from "@/lib/promo";

// 클립을 특정 채널에 "올릴 예정"으로 등록(초안). 실제 업로드는 사람이 채널에
// 직접 하고(반자동), 이 포스트 row가 발급하는 트래킹 링크(promoTrackingUrl)로
// 유입·가입이 자동 집계된다.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdminEmail(user.email)) {
      return apiError({ status: 404, message: "찾을 수 없어요.", code: "NOT_FOUND" });
    }

    let clipId = "";
    let channel = "";
    let caption = "";
    try {
      const body = await req.json();
      clipId = typeof body?.clipId === "string" ? body.clipId : "";
      channel = typeof body?.channel === "string" ? body.channel.trim() : "";
      caption = typeof body?.caption === "string" ? body.caption : "";
    } catch {
      // falls through to validation below
    }
    if (!clipId || !channel) {
      return apiError({ status: 400, message: "clipId와 channel이 필요해요.", code: "BAD_REQUEST" });
    }
    if (channel.length > 60) {
      return apiError({ status: 400, message: "채널 이름이 너무 길어요.", code: "CHANNEL_TOO_LONG" });
    }

    const admin = createAdminClient();
    const { data: clip, error: clipErr } = await admin
      .from("promo_clips")
      .select("id")
      .eq("id", clipId)
      .single();
    if (clipErr || !clip) {
      return apiError({ status: 404, message: "클립을 찾을 수 없어요.", code: "NOT_FOUND" });
    }

    const { data: post, error } = await admin
      .from("promo_posts")
      .insert({ clip_id: clipId, channel, caption: caption || null, status: "draft" })
      .select("id")
      .single();
    if (error || !post) {
      return apiError({
        status: 500,
        message: "포스트 생성에 실패했어요.",
        code: "DB_INSERT_FAILED",
        cause: error,
      });
    }

    return NextResponse.json({
      ok: true,
      postId: post.id,
      trackingUrl: promoTrackingUrl({ channel, postId: post.id }),
    });
  } catch (err) {
    return apiError({ status: 500, message: "잠시 후 다시 시도해 주세요.", code: "INTERNAL", cause: err });
  }
}
