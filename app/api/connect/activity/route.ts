import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requireUser } from "@/lib/routeAuth";
import { getT } from "@/lib/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { latestActivity } from "@/lib/connectActivity";

// GET /api/connect/activity — 이 계정에서 AI 쪽 흔적이 가장 최근에 생긴 시각(2026-09-30).
// 연결 창이 [프롬프트 복사]·[주소 복사] 뒤 몇 초마다 물어 "AI가 작업을 시작했어요"로 바꾼다.
// 판정 규칙은 lib/connectActivity.ts. 시각 하나만 돌려준다 — 코드 해시·토큰 이름은 안 나간다.
// connect_codes는 정책 없는 default-deny 표라 서비스롤로 읽되, 조건은 로그인한 본인 id뿐이다.
export const dynamic = "force-dynamic";

export async function GET() {
  const { t } = await getT();
  try {
    const auth = await requireUser(t.api.loginRequired);
    if (auth instanceof NextResponse) return auth;
    const { user } = auth;

    const admin = createAdminClient();
    const [codes, tokens] = await Promise.all([
      admin.from("connect_codes").select("used_at").eq("user_id", user.id)
        .not("used_at", "is", null).order("used_at", { ascending: false }).limit(1),
      admin.from("api_tokens").select("last_used_at").eq("user_id", user.id).is("revoked_at", null)
        .not("last_used_at", "is", null).order("last_used_at", { ascending: false }).limit(1),
    ]);
    if (codes.error || tokens.error) throw new Error((codes.error ?? tokens.error)!.message);

    const latest = latestActivity([codes.data?.[0]?.used_at, tokens.data?.[0]?.last_used_at]);
    return NextResponse.json({ ok: true, latest }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return apiError({ status: 500, message: t.api.retryLater, code: "INTERNAL", cause: err });
  }
}
