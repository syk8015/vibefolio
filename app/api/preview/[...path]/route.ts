import { NextRequest, NextResponse } from "next/server";
import { PREVIEW_ORIGIN, APP_ORIGIN } from "@/lib/previewOrigin";
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
