import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { requireAdmin } from "@/lib/routeAuth";
import {
  PROMO_SLOT_HOUR_KST,
  nextPromoSlot,
  promoScheduleChannels,
  type PromoLocale,
  type PromoPostStatus,
} from "@/lib/promo";

// [예약] — 클립 하나를 서버가 올리는 채널 중 클립 언어와 맞는 채널(lib/promo.ts
// promoScheduleChannels)에 하루 1편 칸으로 넣는다(docs/promo-publish.md §2.3).
// 1단계는 queued + scheduled_at만 적는다 — 실제로 올리는 건 2단계 게시 크론.
//
// 채널별 규칙: posted는 그대로(같은 앱에 같은 영상 두 번 금지), queued·publishing도 그대로,
// draft·failed는 다음 빈 칸으로 예약, 행이 없으면 만들어 예약.
// DELETE = 예약 취소(queued → draft). 서버가 이미 올리는 중(publishing)인 건 못 멈춘다.

type ScheduledPost = { channel: string; postId: string; status: PromoPostStatus; scheduledAt: string | null };

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await requireAdmin();
    if (auth instanceof NextResponse) return auth;

    const admin = createAdminClient();
    const { data: clip, error: clipErr } = await admin
      .from("promo_clips")
      .select("id, status, caption, tagline_locale")
      .eq("id", id)
      .maybeSingle();
    if (clipErr) {
      return apiError({ status: 500, message: "조회에 실패했어요.", code: "DB_SELECT_FAILED", cause: clipErr });
    }
    if (!clip) return apiError({ status: 404, message: "클립을 찾을 수 없어요.", code: "NOT_FOUND" });
    if (clip.status !== "done") {
      return apiError({ status: 409, message: "촬영이 끝난 클립만 예약할 수 있어요.", code: "CLIP_NOT_READY" });
    }
    // 화면도 막지만 서버가 한 번 더 — 캡션 없는 글이 예약 시각에 올라가면 안 된다.
    if (!(clip.caption ?? "").trim()) {
      return apiError({ status: 400, message: "캡션을 먼저 써 주세요.", code: "CAPTION_REQUIRED" });
    }

    const locale = clip.tagline_locale as PromoLocale;
    const channels = promoScheduleChannels(locale);
    if (channels.length === 0) {
      return apiError({ status: 400, message: "이 언어로 자동으로 올리는 채널이 없어요.", code: "NO_AUTO_CHANNEL" });
    }

    const { data: existing, error: exErr } = await admin
      .from("promo_posts")
      .select("id, channel, status, scheduled_at")
      .eq("clip_id", id)
      .in("channel", channels);
    if (exErr) {
      return apiError({ status: 500, message: "조회에 실패했어요.", code: "DB_SELECT_FAILED", cause: exErr });
    }

    const now = Date.now();
    const hour = PROMO_SLOT_HOUR_KST[locale];
    const result: ScheduledPost[] = [];

    for (const channel of channels) {
      const post = existing?.find((p) => p.channel === channel);
      const status = post?.status as PromoPostStatus | undefined;
      if (post && (status === "posted" || status === "queued" || status === "publishing")) {
        // DB는 "+00:00" 꼴로 돌려준다 — 새로 잡은 칸과 같은 모양(ISO Z)으로 맞춘다.
        const at = post.scheduled_at ? new Date(post.scheduled_at).toISOString() : null;
        result.push({ channel, postId: post.id, status: status!, scheduledAt: at });
        continue;
      }

      // 이 채널에 이미 잡힌 날(예약·올리는 중) + 이미 올린 날 — 하루 1편.
      const { data: busy, error: busyErr } = await admin
        .from("promo_posts")
        .select("status, scheduled_at, posted_at")
        .eq("channel", channel)
        .in("status", ["queued", "publishing", "posted"]);
      if (busyErr) {
        return apiError({ status: 500, message: "조회에 실패했어요.", code: "DB_SELECT_FAILED", cause: busyErr });
      }
      const taken = (busy ?? [])
        .map((b) => (b.status === "posted" ? b.posted_at : b.scheduled_at))
        .filter((v): v is string => !!v)
        .map((v) => Date.parse(v));
      const scheduledAt = new Date(nextPromoSlot(now, hour, taken)).toISOString();

      const fields = {
        status: "queued",
        scheduled_at: scheduledAt,
        caption: clip.caption,
        attempts: 0,
        fail_reason: null,
        external_id: null,
      };
      const write = post
        ? admin.from("promo_posts").update(fields).eq("id", post.id).in("status", ["draft", "failed"])
        : admin.from("promo_posts").insert({ clip_id: id, channel, ...fields });
      const { data: row, error } = await write.select("id").maybeSingle();
      if (error?.code === "23505") {
        return apiError({ status: 409, message: "다른 창에서 방금 바뀌었어요. 새로고침해 주세요.", code: "CONFLICT" });
      }
      if (error || !row) {
        return apiError({
          status: error ? 500 : 409,
          message: error ? "예약에 실패했어요." : "다른 창에서 방금 바뀌었어요. 새로고침해 주세요.",
          code: error ? "DB_WRITE_FAILED" : "CONFLICT",
          cause: error ?? undefined,
          context: { clipId: id, channel },
        });
      }
      result.push({ channel, postId: row.id, status: "queued", scheduledAt });
    }

    return NextResponse.json({ ok: true, posts: result });
  } catch (err) {
    return apiError({ status: 500, message: "잠시 후 다시 시도해 주세요.", code: "INTERNAL", cause: err });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await requireAdmin();
    if (auth instanceof NextResponse) return auth;

    const { data, error } = await createAdminClient()
      .from("promo_posts")
      .update({ status: "draft", scheduled_at: null })
      .eq("clip_id", id)
      .eq("status", "queued")
      .select("id, channel");
    if (error) {
      return apiError({ status: 500, message: "예약 취소에 실패했어요.", code: "DB_UPDATE_FAILED", cause: error, context: { clipId: id } });
    }
    return NextResponse.json({ ok: true, canceled: (data ?? []).map((r) => r.channel) });
  } catch (err) {
    return apiError({ status: 500, message: "잠시 후 다시 시도해 주세요.", code: "INTERNAL", cause: err });
  }
}
