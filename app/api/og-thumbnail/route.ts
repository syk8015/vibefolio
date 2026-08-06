import { NextRequest, NextResponse } from "next/server";
import { screenshotUrl } from "@/lib/thumbnail";
import { createClient } from "@/lib/supabase/server";
import { safeFetch, SsrfError, readResponseCapped } from "@/lib/ssrf";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// 본문 파싱은 200KB까지만 og:image 정규식에 태운다(과대 응답 DoS 방지).
const MAX_HTML_BYTES = 200_000;

export async function POST(req: NextRequest) {
  // 이 엔드포인트의 응답 계약은 { imageUrl }이다. 예기치 못한 예외에도 500/스택을
  // 노출하지 않고 imageUrl:null로 우아하게 폴백하며, 원인은 서버 로그로만 남긴다.
  try {
    // 로그인 사용자만(대시보드에서만 호출됨) — 서버를 익명 SSRF/페치 프록시로
    // 쓰지 못하게 막는 방어선. 실제 사설망 차단은 lib/ssrf가 담당한다.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ imageUrl: null }, { status: 401 });

    // Per-user cap: this is a server-side fetch primitive (Vercel egress + an
    // internal-host probe oracle). Keyed on the authenticated user, not IP.
    if (!(await rateLimit({ name: "og-thumbnail", key: user.id, windowSeconds: 3600, max: 60 }))) {
      return NextResponse.json({ imageUrl: null }, { status: 429 });
    }

    let url = "";
    try {
      ({ url } = await req.json());
    } catch {
      return NextResponse.json({ imageUrl: null });
    }
    if (!url || typeof url !== "string" || url.length > 2048) {
      return NextResponse.json({ imageUrl: null });
    }

    let res;
    try {
      res = await safeFetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Nookframe/1.0)",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(8000),
      });
    } catch (err) {
      // Fetch failed. Return the SAME response whether the host was blocked (SSRF —
      // resolves to a private/reserved IP) or just unreachable, so this endpoint
      // can't be used as an internal-host probe oracle (the two used to differ:
      // null vs a thum.io screenshot URL). Blocked destinations are never handed to
      // the external capture service either way.
      if (!(err instanceof SsrfError)) {
        logger.warn("og-thumbnail: fetch failed", { error: err });
      }
      return NextResponse.json({ imageUrl: null });
    }

    if (!res.ok) return NextResponse.json({ imageUrl: screenshotUrl(url) });

    try {
      const bytes = await readResponseCapped(res, MAX_HTML_BYTES);
      const html = new TextDecoder("utf-8", { fatal: false }).decode(bytes);

      const patterns = [
        /property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
        /content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
        /name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
        /content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
      ];

      for (const pattern of patterns) {
        const m = html.match(pattern);
        if (m?.[1]) {
          let imageUrl: string;
          try {
            imageUrl = new URL(m[1], url).href;
          } catch {
            continue;
          }
          // og:image가 http(s)가 아니면(javascript:, data:, file: 등) 버리고
          // 스크린샷 폴백 — 이 값은 방문자 페이지의 <img src>로 렌더된다.
          if (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://")) {
            continue;
          }
          return NextResponse.json({ imageUrl });
        }
      }

      // og:image 없음 — 스크린샷 폴백
      return NextResponse.json({ imageUrl: screenshotUrl(url) });
    } catch {
      return NextResponse.json({ imageUrl: screenshotUrl(url) });
    }
  } catch (err) {
    logger.error("og-thumbnail: unexpected failure", { error: err });
    return NextResponse.json({ imageUrl: null });
  }
}
