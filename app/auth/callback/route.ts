import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { logger } from "@/lib/logger";
import { safeNext } from "@/lib/safeNext";
import { LAST_LOGIN_COOKIE, LAST_LOGIN_MAX_AGE, isLoginMethod } from "@/lib/lastLogin";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Open-redirect guard: `next` is user-controlled and concatenated onto origin.
  // lib/safeNext keeps only a same-origin relative path (login page shares it).
  const next = safeNext(searchParams.get("next"), "/dashboard");

  if (code) {
    try {
      // Create the redirect response first so we can set cookies on it
      const response = NextResponse.redirect(`${origin}${next}`);

      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() {
              return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
              // Must set cookies directly on the response object in Route Handlers
              cookiesToSet.forEach(({ name, value, options }) =>
                response.cookies.set(name, value, options)
              );
            },
          },
        }
      );

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        // 로그인 화면의 "지난번에 사용" 표시(lib/lastLogin). 성공했을 때만 심는다 —
        // 버튼만 누르고 취소한 방법이 "지난번"으로 남지 않게.
        const via = searchParams.get("via");
        if (isLoginMethod(via)) {
          response.cookies.set(LAST_LOGIN_COOKIE, via, {
            path: "/", maxAge: LAST_LOGIN_MAX_AGE, sameSite: "lax", secure: origin.startsWith("https:"),
          });
        }
        return response;
      }
    } catch (err) {
      // Unexpected failure during code exchange — never 500 the browser on an
      // auth callback; fall through to the same graceful /login redirect.
      logger.error("auth/callback: code exchange threw", { error: err });
    }
  }

  // 실패해도 어디로 가던 길이었는지는 넘긴다 — 로그인 화면이 "재설정 링크였다"와
  // "가입 인증이었다"를 구분해 안내하고(B8), 로그인하면 그 길을 이어 간다.
  // (다른 브라우저에서 연 가입 인증 링크가 대표 사례: 코드 교환은 실패해도 Supabase가
  // 메일 인증 자체는 이미 끝냈다 — 비밀번호로 로그인하면 된다.)
  // 구글·깃허브 화면에서 취소했거나 공급자가 거절하면 code 대신 ?error=가 실려 온다 —
  // "메일 인증은 끝났다" 안내가 틀리므로 따로 표시한다(깃허브 대표 사례: 확인된 메일 없음).
  const providerError = searchParams.get("error");
  if (!code && providerError) {
    logger.warn("auth/callback: provider returned error", {
      error: providerError, description: searchParams.get("error_description"),
    });
  }
  const fail = new URL("/login", origin);
  fail.searchParams.set("error", !code && providerError ? "oauth" : "auth");
  fail.searchParams.set("next", next);
  return NextResponse.redirect(fail);
}
