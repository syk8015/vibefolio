import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requireUser } from "@/lib/routeAuth";
import { getT } from "@/lib/i18n/server";
import { rateLimit } from "@/lib/rate-limit";
import { safeFetch } from "@/lib/ssrf";
import { embedVerdict } from "@/lib/embeddable";
import { APP_ORIGIN } from "@/lib/previewOrigin";

// POST /api/embed-check { url } → { embeddable, reason? }
//
// 초안 검토 화면이 미리보기 iframe을 **그리기 전에** 물어본다. 대부분의 배포
// 사이트는 X-Frame-Options / CSP frame-ancestors로 임베드를 막아 두는데, 그걸
// 모르고 iframe을 꽂으면 화면엔 브라우저의 "연결을 거부했습니다"만 남는다
// (2026-09-05 사용자 접수). 미리 알면 썸네일 + 새 탭 안내로 바꿔 그릴 수 있다.
//
// 이 라우트는 서버가 임의 URL을 대신 열어 주는 원시 도구다 — og-thumbnail과
// 같은 방어선을 그대로 쓴다: 로그인 필수, 사용자별 레이트리밋, lib/ssrf의
// safeFetch(사설망 차단 + 리다이렉트 매 홉 재검증). 그리고 **차단된 목적지와
// 그냥 도달 못 한 목적지의 응답을 같게** 만들어 내부 호스트 탐지 오라클이
// 되지 않게 한다.
const UNREACHABLE = { embeddable: false, reason: "unreachable" as const };

export async function POST(req: NextRequest) {
  const { t } = await getT();
  try {
    const auth = await requireUser(t.api.loginRequired);
    if (auth instanceof NextResponse) return auth;
    const { user } = auth;

    if (!(await rateLimit({ name: "embed-check", key: user.id, windowSeconds: 3600, max: 120 }))) {
      return NextResponse.json(UNREACHABLE, { status: 429 });
    }

    let url = "";
    try {
      ({ url } = await req.json());
    } catch {
      return NextResponse.json(UNREACHABLE);
    }
    if (!url || typeof url !== "string" || url.length > 2048 || !/^https?:\/\//i.test(url)) {
      return NextResponse.json(UNREACHABLE);
    }

    let res;
    try {
      res = await safeFetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Nookframe/1.0)",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(6000),
      });
    } catch {
      return NextResponse.json(UNREACHABLE);
    }
    // 본문은 필요 없다 — 헤더만 보고 즉시 끊는다.
    try {
      await res.body?.cancel();
    } catch {
      /* 이미 닫혔으면 무시 */
    }

    const verdict = embedVerdict(
      {
        xFrameOptions: res.headers.get("x-frame-options"),
        csp: res.headers.get("content-security-policy"),
      },
      APP_ORIGIN,
    );
    return verdict === "ok"
      ? NextResponse.json({ embeddable: true })
      : NextResponse.json({ embeddable: false, reason: "blocked" });
  } catch (err) {
    return apiError({ status: 500, message: t.api.retryLater, code: "INTERNAL", cause: err });
  }
}
