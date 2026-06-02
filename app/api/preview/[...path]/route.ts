import { NextRequest, NextResponse } from "next/server";
import { PREVIEW_ORIGIN } from "@/lib/previewOrigin";

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

  const upstream = await fetch(storageUrl);
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
    // Allow scripts (needed for built Vite/React apps) but restrict framing to same origin.
    // Full sandboxing requires serving from a separate domain.
    headers["X-Frame-Options"] = "SAMEORIGIN";
    headers["Content-Security-Policy"] =
      "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; frame-ancestors 'self'";
  }

  return new NextResponse(upstream.body, { headers });
}
