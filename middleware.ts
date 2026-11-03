import { createServerClient } from "@supabase/ssr";
import { safeNext } from "@/lib/safeNext";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { PREVIEW_ORIGIN, APP_ORIGIN } from "@/lib/previewOrigin";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/config";
import { botVisitTask } from "@/lib/botVisit";
import { lockBlock, readSiteLocks, LOCK_MESSAGE } from "@/lib/siteLock";
import { baitResponseBody, baitHitTask, ipKeyEdge, isIpKeyBlocked, touchesDecoyId, lockForDecoy, describeRequest } from "@/lib/bait";

export async function middleware(request: NextRequest, event: NextFetchEvent) {
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

  // 미끼(lib/bait.ts). ① 숨긴 미끼 id가 주소에 있으면 = 데이터 저장소·백업을 본 사람 → 사이트 잠금.
  // ② 겉 미끼 주소면 가짜 비밀 파일을 내준다(연 것만으론 안 막고 센다). ③ 겉 미끼 토큰을 써서
  // 막힌 IP면 /api 전부 403. 셋 다 앱 주소보다 먼저 본다.
  if (touchesDecoyId(pathname + request.nextUrl.search)) {
    event.waitUntil(lockForDecoy("숨긴 미끼 id가 요청 주소에 들어왔어요", `${describeRequest(request.headers)} · ${pathname.slice(0, 120)}`));
    return new NextResponse("Not Found", { status: 404 });
  }
  const bait = await baitResponseBody(pathname);
  if (bait) {
    event.waitUntil(baitHitTask(bait.label, pathname, request.headers.get("x-vercel-ip-country"), request.headers.get("user-agent")));
    return new NextResponse(bait.body, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
    });
  }
  if (pathname.startsWith("/api/") && (await isIpKeyBlocked(await ipKeyEdge(request.headers)))) {
    return NextResponse.json({ ok: false, error: "Access denied.", code: "BLOCKED" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  // 깨진 퍼센트 인코딩(%c0%ae 등)은 프레임워크가 주소 인자를 풀다 500을 냈다(5단계 낮음 D1) — 미끼 검사 뒤에 400.
  try { decodeURIComponent(pathname); } catch {
    return new NextResponse("Bad Request", { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  // 비상 정지(lib/siteLock.ts) — 읽기 전용·업로드 닫기 중이면 /api 쓰기를 503으로 막는다.
  // 읽기 요청은 상태를 묻지도 않는다(lockBlock이 GET을 바로 통과시키지만, 묻는 비용도 아낀다).
  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const code = lockBlock(request.method, pathname, await readSiteLocks());
    if (code) {
      const cookieLang = request.cookies.get(LOCALE_COOKIE)?.value;
      const en = cookieLang ? cookieLang === "en" : !/^\s*ko\b/i.test(request.headers.get("accept-language") ?? "");
      return NextResponse.json(
        { ok: false, error: LOCK_MESSAGE[code][en ? "en" : "ko"], code },
        { status: 503, headers: { "Retry-After": "600", "Cache-Control": "no-store" } },
      );
    }
  }

  // AI·링크 미리보기·검색 로봇의 페이지 요청 기록(lib/botVisit.ts) — 응답 뒤에 돈다.
  // /api는 뺀다(MCP·인제스트 클라이언트가 로봇 UA를 달고 올 수 있고, 거긴 페이지가 아니다).
  if (!pathname.startsWith("/api")) {
    const task = botVisitTask(request);
    if (task) event.waitUntil(task);
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
  // @를 %40으로 바꿔 보내는 앱(링크 복사·자동 링크)의 /%40handle도 여기서 받는다 —
  // next.config의 /@:username 리다이렉트는 인코딩된 @를 못 알아봐 404가 났다(10-30).
  const rawSeg = pathname.split("/")[1] ?? "";
  const firstSeg = rawSeg.replace(/^%40/i, "");
  if ((firstSeg !== rawSeg || /[A-Z]/.test(firstSeg)) && /^[A-Za-z0-9_-]+$/.test(firstSeg)) {
    const lower = request.nextUrl.clone();
    lower.pathname = "/" + firstSeg.toLowerCase() + pathname.slice(rawSeg.length + 1);
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
