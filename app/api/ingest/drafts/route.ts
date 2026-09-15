import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { rateLimit } from "@/lib/rate-limit";
import { ingestAuth, missingOptionalColumn, pickApiT } from "../shared";

// GET /api/ingest/drafts — Nookframe Connect 초안 목록(요청4). AI가 자기가 올린
// 초안을 확인·정리할 수 있게 한다. is_draft=true 행만 보인다 — 공개된 프로젝트는
// 이 API 표면에 아예 존재하지 않아 PAT의 폭발반경(자기 초안뿐)이 유지된다.
// 수정·삭제는 /api/ingest/drafts/[id] (PATCH·DELETE).

export async function GET(req: NextRequest) {
  try {
    const auth = await ingestAuth(req);
    if (auth.fail) return auth.fail;
    const { userId, t } = auth;

    // 발행(ingest 20/h)과 별도 버킷 — 목록 조회가 발행 쿼터를 깎지 않게.
    const allowed = await rateLimit({ name: "ingest-manage", key: userId, windowSeconds: 3600, max: 60 });
    if (!allowed) {
      return apiError({ status: 429, message: t.api.tooManyRequests, code: "RATE_LIMITED" });
    }

    const admin = createAdminClient();
    const LIST_COLS =
      "id, title, description, comment, demo_user_hint, demo_script, demo_access, tags, content_type, target_device, demo_url, thumbnail, video_url, created_at";
    let { data, error } = await admin
      .from("projects")
      .select(LIST_COLS)
      .eq("user_id", userId)
      .eq("is_draft", true)
      .order("created_at", { ascending: false });
    // 마이그레이션 적용 전 디그레이드 — 목록이 컬럼 하나 때문에 죽지 않게.
    // (동적 select 문자열은 supabase-js의 리터럴 컬럼 파서를 깨뜨려 행 타입이
    // 에러 유니온이 되므로 — 워커의 double cast와 같은 이유로 — 결과만 캐스트.)
    let cols: string = LIST_COLS;
    for (let col = missingOptionalColumn(error); col && cols.includes(`, ${col}`); col = missingOptionalColumn(error)) {
      cols = cols.replace(`, ${col}`, "");
      const retry = await admin
        .from("projects")
        .select(cols)
        .eq("user_id", userId)
        .eq("is_draft", true)
        .order("created_at", { ascending: false });
      data = retry.data as unknown as typeof data;
      error = retry.error;
    }
    if (error) {
      return apiError({ status: 500, message: t.api.retryLater, code: "DB_SELECT_FAILED", cause: error });
    }

    const drafts = (data ?? []).map((r) => ({
      ...r,
      reviewUrl: `${req.nextUrl.origin}/dashboard?review=${r.id}`,
    }));
    return NextResponse.json({ ok: true, count: drafts.length, drafts });
  } catch (err) {
    const tc = await pickApiT(req);
    return apiError({ status: 500, message: tc.api.retryLater, code: "INTERNAL", cause: err });
  }
}
