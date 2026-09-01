import { NextRequest, NextResponse } from "next/server";
import { PREVIEW_ORIGIN, APP_ORIGIN } from "@/lib/previewOrigin";
import { secretFileKind } from "@/lib/upload-safety";
import { logger } from "@/lib/logger";

// Preview isolation is a security control, not a nicety: without a distinct sandbox
// origin, uploaded project JS runs same-origin and can steal a logged-in session.
// If this is ever deployed to production without NEXT_PUBLIC_PREVIEW_ORIGIN, the
// origin-bounce below silently no-ops (fail-open). Warn loudly once at cold start so
// the misconfiguration is visible in logs/Sentry instead of passing unnoticed.
if (!PREVIEW_ORIGIN && process.env.VERCEL_ENV === "production") {
  logger.error(
    "preview isolation DISABLED: NEXT_PUBLIC_PREVIEW_ORIGIN is unset in production — uploaded content serves same-origin (session-theft risk)",
  );
}

const MIME_MAP: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css",
  js: "application/javascript",
  mjs: "application/javascript",
  json: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  ico: "image/x-icon",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  // Path-traversal guard: filePath is interpolated into the Supabase public-object
  // URL, so a crafted request must not be able to climb out of the project-files
  // bucket. Encoded `%2e%2e` arrives here already decoded as a literal `..`
  // segment; a double-encoded `%2f` would show up as a slash inside a segment.
  // Reject those (and backslash / NUL / empty segments) before building the URL.
  if (
    !path?.length ||
    path.some(
      (seg) =>
        seg === "" ||
        seg === ".." ||
        seg.includes("/") ||
        seg.includes("\\") ||
        seg.includes("\0"),
    )
  ) {
    return new NextResponse("Bad request", { status: 400 });
  }
  const filePath = path.join("/");

  // 비밀 파일은 저장돼 있더라도 서빙하지 않는다 (2026-09-01). 이 라우트는 공개
  // 버킷을 그대로 중계하는 무인증 프록시이고, 공개 작품의 demo_url이
  // `/api/preview/{uid}/{rowId}/index.html`이라 방문자는 `{uid}/{rowId}`를 이미
  // 안다 — 뒤만 `.env`로 바꾸면 한 번에 맞힌다. 업로드 단계 필터(upload-safety)가
  // 1차 방어고, 여기는 그걸 우회해 들어온 것(브라우저 직행 업로드는 서버를 안
  // 거친다)과 필터 이전에 이미 올라간 것을 위한 마지막 그물이다.
  // ⚠️ 완전한 봉쇄는 아니다 — 버킷 public=true라 Supabase 공개 URL 직격은 이
  //    라우트를 통과하지 않는다(의도된 상태·서명 URL 전환은 별도 트랙).
  //    그래서 진짜 방어는 여전히 "애초에 저장하지 않는 것"이다.
  if (secretFileKind(filePath)) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Untrusted uploaded content must execute only on the sandbox origin so its JS
  // can never touch nookframe.com cookies/localStorage (session theft). If this
  // request reached the main app origin — direct nav, a stale link, or an embed
  // we missed — bounce it to the sandbox origin. No-op in dev (PREVIEW_ORIGIN unset).
  if (PREVIEW_ORIGIN && req.nextUrl.host !== new URL(PREVIEW_ORIGIN).host) {
    return NextResponse.redirect(
      `${PREVIEW_ORIGIN}/api/preview/${filePath}${req.nextUrl.search}`,
      307,
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const storageUrl = `${supabaseUrl}/storage/v1/object/public/project-files/${filePath}`;

  // This route serves files for iframes, so error responses stay plain-text
  // (never JSON) to honour its content contract. The outer guard only ensures an
  // upstream network failure becomes a clean 502 instead of an unhandled 500.
  let upstream: Response;
  try {
    // Cap the wait: every embed asset (JS/CSS/font/image) flows through here, and a
    // slow storage origin would otherwise pin this function until the platform timeout.
    upstream = await fetch(storageUrl, { signal: AbortSignal.timeout(8000) });
  } catch (err) {
    logger.error("preview: upstream fetch failed", { error: err, filePath });
    return new NextResponse("Upstream error", { status: 502 });
  }
  if (!upstream.ok) return new NextResponse("Not found", { status: 404 });

  const ext = filePath.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const contentType = MIME_MAP[ext] ?? "application/octet-stream";

  const isHtml = contentType.startsWith("text/html");
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=60",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
  if (isHtml) {
    // This HTML is served from the sandbox origin and embedded cross-origin by the
    // app (TheaterStage live embed), so framing must be allowed from the app origin
    // — NOT 'self' (= the sandbox host, which would refuse the app's iframe and
    // silently break the live embed). X-Frame-Options can't express a cross-origin
    // allow (ALLOW-FROM is dead), so we rely on frame-ancestors alone and must not
    // send XFO. default-src stays permissive: uploaded apps load their own assets,
    // and cross-origin isolation already prevents them from touching the app origin.
    headers["Content-Security-Policy"] =
      `default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; frame-ancestors ${APP_ORIGIN} https://www.nookframe.com`;
  }

  return new NextResponse(upstream.body, { headers });
}
