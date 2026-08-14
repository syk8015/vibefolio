import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { getT } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { rateLimit } from "@/lib/rate-limit";
import { verifyToken, bearerFromHeader } from "@/lib/apiToken";
import { detectDemoSource, liveUrlIssue } from "@/lib/demoSource";
import { assertSafePublicUrl, SsrfError } from "@/lib/ssrf";
import { screenshotUrl } from "@/lib/thumbnail";
import { normalizeTags, normalizeContentType } from "@/lib/projectTaxonomy";
import { normalizeDemoAccess, type DemoAccess } from "@/lib/demoAccess";
import {
  MAX_UPLOAD_BYTES, MAX_MEDIA_IMAGE_BYTES, MAX_MEDIA_VIDEO_BYTES, UploadError,
} from "@/lib/upload-safety";
import {
  validateMedia, uploadMedia, storeZipBundle,
  UPLOAD_KINDS, UPLOAD_TEMP_KEYS, type SniffedMedia, type UploadKind,
} from "@/lib/ingestStore";
import { uploadErrorResponse } from "./uploadError";
import { logger } from "@/lib/logger";

// POST /api/ingest — Nookframe Connect. 외부 AI 에이전트(CLI/MCP/붙여넣기)가 로그인된
// 유저 대신 프로젝트를 "초안"으로 밀어넣는다. 초안은 공개 어디에도 안 뜨고(RLS),
// 유저가 대시보드에서 확인 후 "공개"를 눌러야 노출+데모 촬영이 시작된다. 이 라우트는
// 데모 파이프라인 컬럼을 절대 건드리지 않는다 — 데모는 발행 시점의 쿠키 인증
// trigger-demo 라우트가 처리한다(인증 경계 분리). 설계 상세: docs/nookframe-connect.md.

// 검토 대기 초안 상한(유저당). 무한 초안 생성 남용을 막는다.
const MAX_ACTIVE_DRAFTS = 20;
// multipart 본문 상한(zip 25MB + 미디어 20+5MB + form 오버헤드 여유). Next 16
// App Router는 암묵 본문 상한이 없어 명시적으로 막는다.
const MAX_BODY_BYTES =
  MAX_UPLOAD_BYTES + MAX_MEDIA_VIDEO_BYTES + MAX_MEDIA_IMAGE_BYTES + 2 * 1024 * 1024;

interface IngestPayload {
  title?: unknown;
  description?: unknown;
  builderNote?: unknown;
  demoHighlights?: unknown;
  tags?: unknown;
  contentType?: unknown;
  deployUrl?: unknown;
  appUrl?: unknown;
  demoAccess?: unknown;
  uploads?: unknown;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function POST(req: NextRequest) {
  try {
    // 1. 인증 — Bearer PAT 우선, 없으면 쿠키 세션(=/publish 웹 경로). PAT는 헤더로만.
    // 언어: PAT는 기계/AI 호출자라 en 고정, 세션(/publish)은 쿠키 locale.
    const bearer = bearerFromHeader(req.headers.get("authorization"));
    const t = bearer ? getDictionary("en") : (await getT()).t;
    let userId: string;
    if (bearer) {
      const tok = await verifyToken(bearer);
      if (!tok) {
        return apiError({ status: 401, message: t.api.tokenInvalid, code: "UNAUTHORIZED" });
      }
      userId = tok.userId;
    } else {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return apiError({ status: 401, message: t.api.loginOrTokenRequired, code: "UNAUTHORIZED" });
      }
      userId = user.id;
    }

    // 2. 레이트리밋 — user_id 키(토큰 여러 개로 우회 못 하게).
    const allowed = await rateLimit({ name: "ingest", key: userId, windowSeconds: 3600, max: 20 });
    if (!allowed) {
      return apiError({ status: 429, message: t.api.tooManyRequests, code: "RATE_LIMITED" });
    }

    // 3. 본문 파싱 — JSON(URL 경로) 또는 multipart/form-data(파일 경로).
    const contentType = req.headers.get("content-type") ?? "";
    let payload: IngestPayload;
    let bundle: File | null = null;
    // 제작자 미디어(요청1): screenshot(이미지 1장→thumbnail)·video(영상 1개→
    // video_url, 노출 1순위). 내용 스캔은 1차 미도입 — 대시보드 수동 업로드와
    // 같은 노출면·같은 사후 대응(신고·admin), 위협모델의 기존 열린 항목에 합류.
    let screenshot: File | null = null;
    let video: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const declaredLen = Number(req.headers.get("content-length") ?? "0");
      if (declaredLen > MAX_BODY_BYTES) {
        return apiError({ status: 413, message: t.api.uploadTooLarge, code: "TOO_LARGE" });
      }
      const form = await req.formData();
      const rawPayload = form.get("payload");
      if (typeof rawPayload !== "string") {
        return apiError({ status: 400, message: t.api.payloadPartRequired, code: "BAD_REQUEST" });
      }
      try {
        payload = JSON.parse(rawPayload) as IngestPayload;
      } catch {
        return apiError({ status: 400, message: t.api.payloadJsonInvalid, code: "BAD_JSON" });
      }
      const file = form.get("bundle");
      if (file && typeof file === "object" && "arrayBuffer" in file) {
        bundle = file as File;
      }
      const shot = form.get("screenshot");
      if (shot && typeof shot === "object" && "arrayBuffer" in shot) {
        screenshot = shot as File;
      }
      const vid = form.get("video");
      if (vid && typeof vid === "object" && "arrayBuffer" in vid) {
        video = vid as File;
      }
    } else {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return apiError({ status: 400, message: t.api.jsonBodyInvalid, code: "BAD_JSON" });
      }
      // { payload: {...} } 도, 필드를 최상위에 둔 { ... } 도 허용.
      const b = body as { payload?: IngestPayload } & IngestPayload;
      payload = (b?.payload ?? b) as IngestPayload;
    }

    // 4. payload 검증.
    const title = strOrNull(payload?.title);
    if (!title) {
      return apiError({ status: 400, message: t.api.titleRequired, code: "TITLE_REQUIRED" });
    }
    const description = strOrNull(payload?.description) ?? "";
    const comment = strOrNull(payload?.builderNote) ?? "";
    const demoHint = typeof payload?.demoHighlights === "string"
      ? payload.demoHighlights.trim().slice(0, 500) || null
      : null;
    const tags = normalizeTags(payload?.tags);
    const contentTypeId = normalizeContentType(payload?.contentType);

    // demoAccess — 로그인 필요 앱의 데모 모드 진입 정보(url·params·note만, 계정
    // 정보는 설계상 범위 밖). 여기서는 "저장만": 사용(진입 URL 조립·로봇 브리핑
    // 주입)은 발행 시점 쿠키 인증 trigger-demo → 로컬 워커 경로가 유일하다.
    // 절대 URL은 appUrl과 같은 게이트(콘텐츠호스트·사설망·SSRF)를 통과해야 한다.
    let demoAccess: DemoAccess | null = null;
    {
      const norm = normalizeDemoAccess(payload?.demoAccess);
      if (norm.issue === "bad-url") {
        return apiError({ status: 400, message: t.api.demoAccessBadUrl, code: "BAD_DEMO_ACCESS" });
      }
      demoAccess = norm.access;
      if (demoAccess?.url && !demoAccess.url.startsWith("/")) {
        const issue = liveUrlIssue(demoAccess.url);
        if (issue?.kind === "content-host") {
          return apiError({
            status: 400, code: "CONTENT_HOST",
            message: t.api.contentHostShort(issue.host),
          });
        }
        if (issue?.kind === "private-host") {
          return apiError({
            status: 400, code: "PRIVATE_HOST",
            message: t.api.privateHostShort,
          });
        }
        try {
          await assertSafePublicUrl(demoAccess.url);
        } catch (e) {
          if (e instanceof SsrfError) {
            return apiError({
              status: 400, code: "PRIVATE_HOST",
              message: t.api.notPublicUrl,
            });
          }
          throw e;
        }
      }
    }

    // 미디어 검증(인라인 파트) — 행을 만들기 전에 캡·매직바이트로 실패를 조기
    // 확정한다. 판정·업로드 로직은 finalize 경로와 공유(lib/ingestStore.ts).
    let shotBuf: Uint8Array | null = null;
    let videoBuf: Uint8Array | null = null;
    let sniffed: SniffedMedia = { shotType: null, videoType: null };
    try {
      if (screenshot) shotBuf = new Uint8Array(await screenshot.arrayBuffer());
      if (video) videoBuf = new Uint8Array(await video.arrayBuffer());
      sniffed = validateMedia(shotBuf, videoBuf);
    } catch (e) {
      if (e instanceof UploadError) return uploadErrorResponse(e, t);
      throw e;
    }

    // 서명 URL 2단계(대용량): Vercel 함수 본문 상한(~4.5MB 실측) 때문에 큰 zip/
    // 영상은 인라인 multipart로 못 온다 → payload.uploads로 종류만 선언하면
    // 스토리지 직행 업로드 URL을 발급하고, 검증·연결은 /api/ingest/finalize가
    // 담당한다. 인라인 파트가 이미 온 종류는 선언을 무시한다(이중 처리 방지).
    const declared: UploadKind[] = Array.isArray(payload?.uploads)
      ? [...new Set(
          (payload.uploads as unknown[]).filter(
            (u): u is UploadKind =>
              typeof u === "string" && (UPLOAD_KINDS as readonly string[]).includes(u),
          ),
        )].filter((k) => (k === "bundle" ? !bundle : k === "screenshot" ? !screenshot : !video))
      : [];

    const admin = createAdminClient();

    // 5. 초안 상한 체크.
    const { count: draftCount } = await admin
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_draft", true);
    if ((draftCount ?? 0) >= MAX_ACTIVE_DRAFTS) {
      return apiError({
        status: 409,
        message: t.api.draftLimit(MAX_ACTIVE_DRAFTS),
        code: "DRAFT_LIMIT",
      });
    }

    // 6. URL 경로면 여기서 demo_url·thumbnail 확정(파일 경로는 행 생성 후).
    // 랜딩(/)과 실제 앱(/app)이 나뉜 제품은 deployUrl(랜딩)만 받으면 시연 로봇이
    // 랜딩만 찍는다 → appUrl(앱 화면 진입 URL)이 있으면 그걸 임베드·촬영 대상으로
    // 우선 사용. 검증(소스 판별·콘텐츠호스트·SSRF)은 deployUrl과 동일 경로를 탄다.
    let demoUrl = "";
    let thumbnail = "";
    if (!bundle && !declared.includes("bundle")) {
      const entryUrl = strOrNull(payload?.appUrl) ?? strOrNull(payload?.deployUrl);
      if (!entryUrl) {
        return apiError({ status: 400, message: t.api.artifactRequired, code: "NO_ARTIFACT" });
      }
      const source = detectDemoSource(entryUrl);
      if (!source) {
        return apiError({ status: 400, message: t.api.badUrl, code: "BAD_URL" });
      }
      // 외부 live_url은 콘텐츠호스트·사설망 조기 차단(실 SSRF 게이트는 발행 시 trigger-demo).
      if (source.type === "live_url") {
        const issue = liveUrlIssue(source.value);
        if (issue?.kind === "content-host") {
          return apiError({
            status: 400, code: "CONTENT_HOST",
            message: t.api.contentHostShort(issue.host),
          });
        }
        if (issue?.kind === "private-host") {
          return apiError({
            status: 400, code: "PRIVATE_HOST",
            message: t.api.privateHostShort,
          });
        }
        try {
          await assertSafePublicUrl(source.value);
        } catch (e) {
          if (e instanceof SsrfError) {
            return apiError({
              status: 400, code: "PRIVATE_HOST",
              message: t.api.notPublicUrl,
            });
          }
          throw e;
        }
        // 외부 URL은 theater가 iframe하지 않으므로 썸네일이 없으면 밋밋하다 → thum.io로 찍는다.
        thumbnail = screenshotUrl(source.value);
      }
      demoUrl = source.value;
    }

    // 7. 초안 행 먼저 insert — 행 id를 파일 스토리지 폴더로 쓰기 위해(삭제 누수 wart도 해소).
    const { count: totalCount } = await admin
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    const { data: created, error: insErr } = await admin
      .from("projects")
      .insert({
        user_id: userId,
        is_draft: true,
        title,
        description,
        comment,
        demo_user_hint: demoHint,
        demo_access: demoAccess,
        tags,
        content_type: contentTypeId,
        type: videoBuf ? "video" : "image",
        year: new Date().getFullYear().toString(),
        demo_url: demoUrl,
        thumbnail,
        sort_order: totalCount ?? 0,
      })
      .select("id")
      .single();
    if (insErr || !created) {
      return apiError({ status: 500, message: t.api.projectCreateFailed, code: "DB_INSERT_FAILED", cause: insErr });
    }
    const projectId = created.id as string;

    // 8. 인라인 zip: 확장(방어)→업로드→demo_url·thumbnail 세팅(lib/ingestStore
    // 공유 코어). 실패 시 고아 행 정리 — null demo_url 초안이 남지 않게 방금 만든
    // 행을 지운다. (스토리지에 일부 올라간 객체는 추측 불가한 uuid 폴더 아래 남을
    // 수 있으나 DB 행이 없어 발견 불가 — storage-audit 스윕이 회수. remove()는
    // 오브젝트 키 목록이 필요해 폴더 경로 전달은 no-op이므로 하지 않는다.)
    if (bundle) {
      try {
        if (bundle.size > MAX_UPLOAD_BYTES) {
          throw new UploadError(t.api.uploadTooLarge, "too-large");
        }
        const { indexPath } = await storeZipBundle(admin, userId, projectId, await bundle.arrayBuffer());
        demoUrl = `/api/preview/${userId}/${projectId}/${indexPath}`;
        const { error: updErr } = await admin
          .from("projects")
          .update({ demo_url: demoUrl, thumbnail: screenshotUrl(`${req.nextUrl.origin}${demoUrl}`) })
          .eq("id", projectId);
        if (updErr) throw new UploadError(t.api.demoUrlSaveFailed);
      } catch (e) {
        await admin.from("projects").delete().eq("id", projectId);
        if (e instanceof UploadError) return uploadErrorResponse(e, t);
        logger.error("ingest: file upload failed", { error: e, projectId });
        return apiError({ status: 500, message: t.api.uploadProcessingError, code: "UPLOAD_ERROR", cause: e });
      }
    }

    // 8.5. 인라인 미디어 업로드 — 행 폴더 `_media/`(프로젝트 삭제 시 zip과 같은
    // 수명주기). screenshot은 thumbnail을(thum.io 스크린샷보다 우선), video는
    // video_url(노출 1순위 표면)을 채운다.
    if (shotBuf || videoBuf) {
      try {
        const updates = await uploadMedia(admin, userId, projectId, shotBuf, videoBuf, sniffed);
        const { error: updErr } = await admin.from("projects").update(updates).eq("id", projectId);
        if (updErr) throw new Error(`media row update: ${updErr.message}`);
      } catch (e) {
        // 고아 행 정리 — zip 실패 경로와 동일 정책(스토리지 잔재는 storage-audit이 회수).
        await admin.from("projects").delete().eq("id", projectId);
        logger.error("ingest: media upload failed", { error: e, projectId });
        return apiError({ status: 500, message: t.api.mediaUploadFailed, code: "MEDIA_UPLOAD_FAILED", cause: e });
      }
    }

    // 8.7. 서명 URL 발급(2단계 선언분) — 스토리지 직행 PUT용. 키는 서버 고정
    // (_upload/ 임시 폴더), 만료는 짧게. 검증·연결은 finalize가 한다.
    let uploads: Partial<Record<UploadKind, string>> | undefined;
    if (declared.length) {
      uploads = {};
      for (const kind of declared) {
        const { data, error } = await admin.storage
          .from("project-files")
          .createSignedUploadUrl(UPLOAD_TEMP_KEYS[kind](userId, projectId), { upsert: true });
        if (error || !data) {
          await admin.from("projects").delete().eq("id", projectId);
          return apiError({
            status: 500, message: t.api.mediaUploadFailed, code: "SIGN_FAILED",
            cause: error, context: { projectId, kind },
          });
        }
        uploads[kind] = data.signedUrl;
      }
    }

    // 9. 응답 — reviewUrl은 하드코딩 SITE_URL이 아니라 요청 origin 기준.
    const reviewUrl = `${req.nextUrl.origin}/dashboard?review=${projectId}`;
    return NextResponse.json({
      ok: true, projectId, reviewUrl, isDraft: true,
      ...(uploads ? { uploads, finalizeUrl: `${req.nextUrl.origin}/api/ingest/finalize` } : {}),
    });
  } catch (err) {
    const tc = bearerFromHeader(req.headers.get("authorization")) ? getDictionary("en") : (await getT()).t;
    return apiError({ status: 500, message: tc.api.retryLater, code: "INTERNAL", cause: err });
  }
}
