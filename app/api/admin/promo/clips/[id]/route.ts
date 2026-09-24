import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { requireAdmin } from "@/lib/routeAuth";

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
    const auth = await requireAdmin();
    if (auth instanceof NextResponse) return auth;

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
    // 예약된 채널이 있으면 캡션을 비울 수 없다 — 빈 글이 예약 시각에 올라가면 안 된다
    // ([예약] 버튼이 빈 캡션을 막는 것과 같은 규칙, docs/promo-publish.md §2.3).
    if (!caption.trim()) {
      const { count, error: qErr } = await admin
        .from("promo_posts")
        .select("id", { count: "exact", head: true })
        .eq("clip_id", id)
        .in("status", ["queued", "publishing"]);
      if (qErr) {
        return apiError({ status: 500, message: "조회에 실패했어요.", code: "DB_SELECT_FAILED", cause: qErr });
      }
      if ((count ?? 0) > 0) {
        return apiError({
          status: 409,
          message: "예약된 채널이 있어서 캡션을 비울 수 없어요. 예약을 먼저 취소해 주세요.",
          code: "CAPTION_REQUIRED_WHILE_QUEUED",
        });
      }
    }

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
