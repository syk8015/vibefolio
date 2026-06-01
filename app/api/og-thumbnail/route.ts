import { NextRequest, NextResponse } from "next/server";
import { screenshotUrl } from "@/lib/thumbnail";
import { createClient } from "@/lib/supabase/server";
import { safeFetch, SsrfError } from "@/lib/ssrf";

// 본문 파싱은 200KB까지만 og:image 정규식에 태운다(과대 응답 DoS 방지).
const MAX_HTML_BYTES = 200_000;

export async function POST(req: NextRequest) {
  // 로그인 사용자만(대시보드에서만 호출됨) — 서버를 익명 SSRF/페치 프록시로
  // 쓰지 못하게 막는 방어선. 실제 사설망 차단은 lib/ssrf가 담당한다.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ imageUrl: null }, { status: 401 });

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
    // 사설/예약 대역 등 차단 목적지 → 썸네일 자체를 만들지 않는다(외부 캡처
    // 서비스에도 넘기지 않음).
    if (err instanceof SsrfError) return NextResponse.json({ imageUrl: null });
    // 공개 호스트인데 타임아웃/연결 실패 → thum.io 스크린샷 폴백.
    return NextResponse.json({ imageUrl: screenshotUrl(url) });
  }

  if (!res.ok) return NextResponse.json({ imageUrl: screenshotUrl(url) });

  try {
    const html = (await res.text()).slice(0, MAX_HTML_BYTES);

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
}
