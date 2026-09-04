import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { requireAdmin } from "@/lib/routeAuth";
import { promoTrackingUrl } from "@/lib/promo";

// 클립을 특정 채널에 올린 기록. 실제 업로드는 사람이 채널에 직접 하고(반자동),
// 이 포스트 row가 발급하는 트래킹 링크(promoTrackingUrl)로 유입·가입이 자동
// 집계된다 — 즉 **행을 만들어야 링크가 생긴다**(campaign=promo-{postId}).
//
// 같은 클립+채널로 다시 들어오면 새로 만들지 않고 있는 걸 돌려준다. 채널 버튼을
// 두 번 눌렀다고 추적 링크가 둘로 갈라지면 그 채널 성적이 반토막 난다.
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (auth instanceof NextResponse) return auth;

    let clipId = "";
    let channel = "";
    let caption = "";
    let status: "draft" | "posted" = "draft";
    try {
      const body = await req.json();
      clipId = typeof body?.clipId === "string" ? body.clipId : "";
      channel = typeof body?.channel === "string" ? body.channel.trim() : "";
      caption = typeof body?.caption === "string" ? body.caption : "";
      if (body?.status === "posted") status = "posted";
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

    const { data: existing } = await admin
      .from("promo_posts")
      .select("id")
      .eq("clip_id", clipId)
      .eq("channel", channel)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({
        ok: true,
        postId: existing.id,
        trackingUrl: promoTrackingUrl({ channel, postId: existing.id }),
        reused: true,
      });
    }

    const { data: post, error } = await admin
      .from("promo_posts")
      .insert({
        clip_id: clipId,
        channel,
        caption: caption || null,
        status,
        posted_at: status === "posted" ? new Date().toISOString() : null,
      })
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
