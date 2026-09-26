import { createServerClient } from "@supabase/ssr";
import { safeNext } from "@/lib/safeNext";
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

  // 대문자가 섞인 명함 주소(/Alexvibe, /Alexvibe/my-app) → 소문자 정식 주소로 308.
  // 아이디는 소문자로만 저장된다(lib/username.ts) — 인스타 바이오에 대문자로 적힌
  // 링크, 폰이 첫 글자를 올려 친 주소가 404가 되지 않게. 첫 칸만 접는다(작품 slug는
  // 그대로). 앱 경로는 전부 소문자라 대문자 첫 칸은 아이디일 수밖에 없다.
  const firstSeg = pathname.split("/")[1] ?? "";
  if (/[A-Z]/.test(firstSeg) && /^[A-Za-z0-9_-]+$/.test(firstSeg)) {
    const lower = request.nextUrl.clone();
    lower.pathname = "/" + firstSeg.toLowerCase() + pathname.slice(firstSeg.length + 1);
    return NextResponse.redirect(lower, 308);
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

  // 원래 가려던 곳(경로+쿼리). 메일의 [대시보드] 링크·?review=<id> 딥링크가
  // 로그인·온보딩을 거쳐도 살아남게 ?next=로 실어 보낸다.
  const here = pathname + request.nextUrl.search;

  // 비로그인 유저가 /dashboard·/settings 접근 시 로그인으로
  if (!user && (pathname.startsWith("/dashboard") || pathname.startsWith("/settings"))) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", here);
    return NextResponse.redirect(login);
  }

  // 로그인 유저가 /login, /signup 접근 시 대시보드로 — ?next=가 있으면 거기로(/publish에서 온 사람).
  if (user && (pathname === "/login" || pathname === "/signup")) {
    return NextResponse.redirect(new URL(safeNext(request.nextUrl.searchParams.get("next"), "/dashboard"), request.url));
  }

  // username 없는 로그인 유저 → 온보딩으로
  // /.well-known/*(OAuth 발견 문서)도 제외한다 — 로그인은 했지만 아직 username이
  // 없는 사람의 브라우저에서 이 주소를 열면 온보딩으로 튕겨 발견이 깨진다. 바깥
  // 서버(쿠키 없음)는 어차피 안 걸리지만, 리다이렉트가 붙는 순간 인증 헤더가 사라지는
  // 클라이언트가 있어 이 경로엔 리다이렉트를 하나도 두지 않는 편이 안전하다.
  const skipOnboarding = pathname.startsWith("/onboarding") || pathname.startsWith("/api")
    || pathname.startsWith("/auth") || pathname.startsWith("/.well-known");
  if (user && !user.user_metadata?.username && !skipOnboarding) {
    const onboarding = new URL("/onboarding", request.url);
    if (pathname !== "/") onboarding.searchParams.set("next", here);
    return NextResponse.redirect(onboarding);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
