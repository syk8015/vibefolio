import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requireUser } from "@/lib/routeAuth";
import { getT } from "@/lib/i18n/server";
import { rateLimit } from "@/lib/rate-limit";
import { revalidatePortfolio } from "@/lib/revalidatePortfolio";

// POST /api/revalidate → 204
//
// 대시보드는 공개·수정·대표 지정·순서를 브라우저에서 DB에 바로 쓴다. 그 뒤
// 공개 화면 캐시를 비우는 건 서버만 할 수 있어 이 라우트를 부른다. 캐시는
// 전체 공용 태그라 로그인 + 사용자별 한도로 남이 마구 비우지 못하게 한다.
// 한도를 넘으면 조용히 204 — 캐시는 60초 뒤 어차피 스스로 갱신된다.
export async function POST() {
  const { t } = await getT();
  try {
    const auth = await requireUser(t.api.loginRequired);
    if (auth instanceof NextResponse) return auth;
    if (await rateLimit({ name: "revalidate", key: auth.user.id, windowSeconds: 3600, max: 120 })) {
      revalidatePortfolio();
    }
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return apiError({ status: 500, message: t.api.retryLater, code: "REVALIDATE_FAILED", cause: err });
  }
}
