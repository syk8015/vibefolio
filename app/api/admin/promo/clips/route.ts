import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { requireAdmin } from "@/lib/routeAuth";
import { loggedInTaglines, loggedInTaglinesEn } from "@/lib/loggedInTaglines";
import { isPromoOpening } from "@/lib/promo";

// 홍보 클립 촬영 큐에 태그라인 하나를 등록한다. 실제 촬영은
// local-runner/promo-worker.ts(npm run promo:batch)가 pending 행을 claim해서
// 로컬에서 수행 — 이 라우트는 큐잉만 담당한다.
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (auth instanceof NextResponse) return auth;
    const { user } = auth;

    let locale = "";
    let text = "";
    let format = "";
    let opening: unknown = "hook";
    try {
      const body = await req.json();
      locale = typeof body?.locale === "string" ? body.locale : "";
      text = typeof body?.text === "string" ? body.text : "";
      format = typeof body?.format === "string" ? body.format : "";
      if (body?.opening !== undefined) opening = body.opening;
    } catch {
      // falls through to validation below
    }
    if (locale !== "ko" && locale !== "en") {
      return apiError({ status: 400, message: "locale은 ko 또는 en이어야 해요.", code: "BAD_LOCALE" });
    }
    if (format !== "vertical" && format !== "horizontal") {
      return apiError({ status: 400, message: "format은 vertical 또는 horizontal이어야 해요.", code: "BAD_FORMAT" });
    }
    if (!isPromoOpening(opening)) {
      return apiError({ status: 400, message: "opening은 full 또는 hook이어야 해요.", code: "BAD_OPENING" });
    }

    // 클라이언트는 text만 보내고, reply는 서버가 실제 풀에서 재조회한다 — 항상
    // "진짜 풀에 있는 문구"만 촬영 큐에 들어가도록 보장한다(LoggedInHeadline의
    // promoNotFound 가드와 같은 원칙).
    const pool = locale === "en" ? loggedInTaglinesEn : loggedInTaglines;
    const tagline = pool.find((item) => item.text === text);
    if (!tagline) {
      return apiError({ status: 400, message: "풀에 없는 문구예요.", code: "TAGLINE_NOT_FOUND" });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("promo_clips")
      .insert({
        status: "pending",
        tagline_locale: locale,
        tagline_text: tagline.text,
        tagline_reply: tagline.reply ?? null,
        format,
        opening,
        requested_by: user.email,
      })
      .select("id")
      .single();
    if (error || !data) {
      return apiError({
        status: 500,
        message: "촬영 큐 등록에 실패했어요.",
        code: "DB_INSERT_FAILED",
        cause: error,
      });
    }

    return NextResponse.json({ ok: true, clipId: data.id });
  } catch (err) {
    return apiError({ status: 500, message: "잠시 후 다시 시도해 주세요.", code: "INTERNAL", cause: err });
  }
}
