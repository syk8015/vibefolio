import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { PREVIEW_ORIGIN, APP_ORIGIN } from "@/lib/previewOrigin";

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
