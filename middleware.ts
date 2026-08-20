import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { PREVIEW_ORIGIN, APP_ORIGIN } from "@/lib/previewOrigin";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/config";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Preview-origin isolation. The sandbox host serves untrusted, user-uploaded
  // project content and MUST serve nothing else — otherwise an uploaded page can
  // same-origin a real app route on that host (login-form phishing, reading an
  // app iframe). Every domain points at the same deployment, so a dedicated
  // preview domain still serves the whole app unless we gate it here: anything
  // that isn't /api/preview on the preview host is bounced to the canonical app
  // origin. Runs before the Supabase round-trip so preview assets skip it.
  // (Guard against a misconfig where preview host == app host → would loop.)
  const previewHost = PREVIEW_ORIGIN ? new URL(PREVIEW_ORIGIN).host : "";
  const appHost = new URL(APP_ORIGIN).host;
  if (
    previewHost &&
    previewHost !== appHost &&
    request.nextUrl.host === previewHost &&
    !pathname.startsWith("/api/preview")
  ) {
    return NextResponse.redirect(
      new URL(pathname + request.nextUrl.search, APP_ORIGIN),
      307,
    );
  }

  // ?lang=ko|en — 언어 쿠키 토글(B안)의 URL 오버라이드. Accept-Language를 못
  // 바꾸는 쪽(공유 링크, 시연 촬영 로봇)이 언어를 지정하는 유일한 통로다.
  // 같은 요청 렌더에 주입하는 대신 쿠키를 심고 lang만 뗀 같은 주소로 307 —
  // 이후 모든 페이지 이동에 쿠키가 따라간다. 쿠키 옵션은 LanguageToggle의
  // document.cookie 쓰기와 동일하게 유지할 것.
  const langParam = request.nextUrl.searchParams.get("lang");
  if (isLocale(langParam)) {
    const clean = request.nextUrl.clone();
    clean.searchParams.delete("lang");
    const langResponse = NextResponse.redirect(clean, 307);
    langResponse.cookies.set(LOCALE_COOKIE, langParam, {
      path: "/",
      maxAge: 31536000,
      sameSite: "lax",
    });
    return langResponse;
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — required for SSR auth to work
  const { data: { user } } = await supabase.auth.getUser();

  // 비로그인 유저가 /dashboard 접근 시 로그인으로
  if (!user && pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // 로그인 유저가 /login, /signup 접근 시 홈으로
  if (user && (pathname === "/login" || pathname === "/signup")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // username 없는 로그인 유저 → 온보딩으로
  const skipOnboarding = pathname.startsWith("/onboarding") || pathname.startsWith("/api") || pathname.startsWith("/auth");
  if (user && !user.user_metadata?.username && !skipOnboarding) {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
