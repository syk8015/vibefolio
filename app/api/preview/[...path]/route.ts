import { NextRequest, NextResponse } from "next/server";
import { PREVIEW_ORIGIN, APP_ORIGIN } from "@/lib/previewOrigin";
import { secretFileKind } from "@/lib/upload-safety";
import { logger } from "@/lib/logger";
import { readUserFileStream } from "@/lib/userStorage";
import { isTokenSegment, previewTokenSecret, verifyWith } from "@/lib/previewToken";
import { folderIsPublic, validPreviewFolder } from "@/lib/previewAccess";

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

// 없음·초안·내린 작품 모두 같은 답 — 캐시하지 않는다(공개하자마자 열려야 한다).
function notFound() {
  return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

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
  // 주소 모양: {uid}/{폴더}/[~열쇠/]파일… (2026-11-02, 초안 비공개 — lib/previewToken.ts·previewAccess.ts).
  // 열쇠 칸은 저장소 경로가 아니다 — 떼고 읽는다. 공개 작품의 폴더는 열쇠 없이, 초안·내린 작품·주인 없는
  // 폴더는 그 폴더의 열쇠로만 열린다. 아니면 '없음'과 똑같은 404(초안이 있는지조차 안 알린다).
  const [uid, folder, third] = path;
  const token = isTokenSegment(third) ? third : null;
  const rest = path.slice(token ? 3 : 2);
  if (!uid || !folder || !rest.length || !validPreviewFolder(uid, folder) || rest.some(isTokenSegment)) {
    return notFound();
  }
  const filePath = [uid, folder, ...rest].join("/");

  // 비밀 파일은 저장돼 있더라도 서빙하지 않는다 (2026-09-01). 공개 작품의 demo_url이
  // `/api/preview/{uid}/{rowId}/index.html`이라 방문자는 `{uid}/{rowId}`를 이미 안다 — 뒤만
  // `.env`로 바꾸면 한 번에 맞힌다. 업로드 단계 필터(upload-safety·storage/sign)가 1차 방어고, 여기는
  // 필터 이전에 이미 올라간 것을 위한 마지막 그물이다. 열쇠가 있어도 막는다.
  // media.nookframe.com/files/… 직접 주소는 Cloudflare 방화벽 규칙이 그림·영상 말고는 막는다(2026-11-02).
  if (secretFileKind(filePath)) {
    return notFound();
  }

  // Untrusted uploaded content must execute only on the sandbox origin so its JS
  // can never touch nookframe.com cookies/localStorage (session theft). If this
  // request reached the main app origin — direct nav, a stale link, or an embed
  // we missed — bounce it to the sandbox origin. No-op in dev (PREVIEW_ORIGIN unset).
  // 쿼리는 버리고 끝에 빈 `#`을 붙인다(2026-11-03, 5단계 S1-F8 높음). Supabase는 Site URL과 같은
  // 호스트면 어떤 경로든 로그인 뒤 돌아갈 곳으로 받는다 → 공격자가 돌아갈 곳을 이 주소로 잡은 로그인·
  // 재설정 메일을 보내면, 쿼리(?code=)나 브라우저가 이어 붙이는 #access_token이 이 307을 타고 공격자
  // 작품 페이지(미리보기 도메인)로 넘어갔다. Location에 `#`이 있으면 브라우저가 원래 조각을 잇지 않는다.
  if (PREVIEW_ORIGIN && req.nextUrl.host !== new URL(PREVIEW_ORIGIN).host) {
    return NextResponse.redirect(`${PREVIEW_ORIGIN}/api/preview/${path.join("/")}#`, 307);
  }

  const allowed = token
    ? verifyWith(previewTokenSecret(), token, uid, folder)
    : await folderIsPublic(uid, folder);
  if (!allowed) return notFound();

  const ext = filePath.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const contentType = MIME_MAP[ext] ?? "application/octet-stream";

  // 페이지가 아닌 파일(JS·CSS·그림…)은 뒤에 붙은 ?쿼리를 떼고 같은 주소로 보낸다(2026-10-01).
  // 저장소는 쿼리를 안 보니 내용은 같은데, 쿼리마다 엣지 캐시가 새로 잡혀서 `?아무거나`를 붙여
  // 부르면 매번 함수·전송량이 새로 들었다(퍼가기). 페이지(HTML)는 앱이 쿼리를 읽을 수 있어 그대로.
  if (req.nextUrl.search && !contentType.startsWith("text/html")) {
    return NextResponse.redirect(new URL(`/api/preview/${path.join("/")}`, req.nextUrl.origin), 308);
  }

  // 파일은 R2에서 바로 읽는다(2026-10-01~, lib/userStorage.ts — CDN이 아니라 저장소라 방금 바꾼
  // 파일도 바로 보인다). 옛 Supabase 파일은 R2로 옮겼고 그 버킷은 닫았다.
  // This route serves files for iframes, so error responses stay plain-text
  // (never JSON) to honour its content contract. The outer guard only ensures an
  // upstream network failure becomes a clean 502 instead of an unhandled 500.
  let body: ReadableStream | null = null;
  try {
    body = (await readUserFileStream("project-files", filePath))?.body ?? null;
  } catch (err) {
    logger.error("preview: upstream fetch failed", { error: err, filePath });
    return new NextResponse("Upstream error", { status: 502 });
  }
  if (!body) return notFound();

  const isHtml = contentType.startsWith("text/html");
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    // 열쇠로 연 것(초안)은 어디에도 남기지 않는다. 공개 작품은 1분 — 내린 작품이 그 안에 닫힌다.
    "Cache-Control": token ? "private, no-store" : "public, max-age=60",
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
  } else if (contentType.startsWith("image/svg")) {
    // SVG는 그림이지만 주소를 직접 열면 문서라 안의 <script>가 돈다(2026-10-02). 미리보기 도메인이라
    // 앱 쿠키엔 못 닿지만, 그림 파일이 피싱 페이지 노릇을 하지 못하게 스크립트·플러그인을 끈다.
    // <img>로 쓸 땐 원래 스크립트가 안 돌아서 작품 화면은 그대로다.
    headers["Content-Security-Policy"] = "script-src 'none'; object-src 'none'; base-uri 'none'";
  }

  return new NextResponse(body, { headers });
}
