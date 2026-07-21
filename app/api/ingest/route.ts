import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { rateLimit } from "@/lib/rate-limit";
import { verifyToken, bearerFromHeader } from "@/lib/apiToken";
import { detectDemoSource, liveUrlIssue } from "@/lib/demoSource";
import { assertSafePublicUrl, SsrfError } from "@/lib/ssrf";
import { screenshotUrl } from "@/lib/thumbnail";
import { normalizeTags, normalizeContentType } from "@/lib/projectTaxonomy";
import { MAX_UPLOAD_BYTES, expandZipBundle, findIndexHtml, UploadError } from "@/lib/upload-safety";
import { logger } from "@/lib/logger";

// POST /api/ingest — Nookframe Connect. 외부 AI 에이전트(CLI/MCP/붙여넣기)가 로그인된
// 유저 대신 프로젝트를 "초안"으로 밀어넣는다. 초안은 공개 어디에도 안 뜨고(RLS),
// 유저가 대시보드에서 확인 후 "공개"를 눌러야 노출+데모 촬영이 시작된다. 이 라우트는
// 데모 파이프라인 컬럼을 절대 건드리지 않는다 — 데모는 발행 시점의 쿠키 인증
// trigger-demo 라우트가 처리한다(인증 경계 분리). 설계 상세: docs/nookframe-connect.md.

// 검토 대기 초안 상한(유저당). 무한 초안 생성 남용을 막는다.
const MAX_ACTIVE_DRAFTS = 20;
// multipart 본문 상한(zip 25MB + form 오버헤드 여유). Next 16 App Router는 암묵
// 본문 상한이 없어 명시적으로 막는다.
const MAX_BODY_BYTES = MAX_UPLOAD_BYTES + 2 * 1024 * 1024;

interface IngestPayload {
  title?: unknown;
  description?: unknown;
  builderNote?: unknown;
  demoHighlights?: unknown;
  tags?: unknown;
  contentType?: unknown;
  deployUrl?: unknown;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function POST(req: NextRequest) {
  try {
    // 1. 인증 — Bearer PAT 우선, 없으면 쿠키 세션(=/publish 웹 경로). PAT는 헤더로만.
    const bearer = bearerFromHeader(req.headers.get("authorization"));
    let userId: string;
    if (bearer) {
      const tok = await verifyToken(bearer);
      if (!tok) {
        return apiError({ status: 401, message: "토큰이 유효하지 않거나 폐기됐어요.", code: "UNAUTHORIZED" });
      }
      userId = tok.userId;
    } else {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return apiError({ status: 401, message: "로그인이 필요해요. (토큰 또는 세션)", code: "UNAUTHORIZED" });
      }
      userId = user.id;
    }

    // 2. 레이트리밋 — user_id 키(토큰 여러 개로 우회 못 하게).
    const allowed = await rateLimit({ name: "ingest", key: userId, windowSeconds: 3600, max: 20 });
    if (!allowed) {
      return apiError({ status: 429, message: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.", code: "RATE_LIMITED" });
    }

    // 3. 본문 파싱 — JSON(URL 경로) 또는 multipart/form-data(파일 경로).
    const contentType = req.headers.get("content-type") ?? "";
    let payload: IngestPayload;
    let bundle: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const declaredLen = Number(req.headers.get("content-length") ?? "0");
      if (declaredLen > MAX_BODY_BYTES) {
        return apiError({ status: 413, message: "업로드가 너무 커요 (최대 25MB).", code: "TOO_LARGE" });
      }
      const form = await req.formData();
      const rawPayload = form.get("payload");
      if (typeof rawPayload !== "string") {
        return apiError({ status: 400, message: "payload(JSON) 파트가 필요해요.", code: "BAD_REQUEST" });
      }
      try {
        payload = JSON.parse(rawPayload) as IngestPayload;
      } catch {
        return apiError({ status: 400, message: "payload JSON을 읽을 수 없어요.", code: "BAD_JSON" });
      }
      const file = form.get("bundle");
      if (file && typeof file === "object" && "arrayBuffer" in file) {
        bundle = file as File;
      }
    } else {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return apiError({ status: 400, message: "JSON 본문을 읽을 수 없어요.", code: "BAD_JSON" });
      }
      // { payload: {...} } 도, 필드를 최상위에 둔 { ... } 도 허용.
      const b = body as { payload?: IngestPayload } & IngestPayload;
      payload = (b?.payload ?? b) as IngestPayload;
    }

    // 4. payload 검증.
    const title = strOrNull(payload?.title);
    if (!title) {
      return apiError({ status: 400, message: "title이 필요해요.", code: "TITLE_REQUIRED" });
    }
    const description = strOrNull(payload?.description) ?? "";
    const comment = strOrNull(payload?.builderNote) ?? "";
    const demoHint = typeof payload?.demoHighlights === "string"
      ? payload.demoHighlights.trim().slice(0, 500) || null
      : null;
    const tags = normalizeTags(payload?.tags);
    const contentTypeId = normalizeContentType(payload?.contentType);

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
        message: `검토 대기 중인 초안이 너무 많아요 (최대 ${MAX_ACTIVE_DRAFTS}개). 대시보드에서 먼저 공개하거나 정리해 주세요.`,
        code: "DRAFT_LIMIT",
      });
    }

    // 6. URL 경로면 여기서 demo_url·thumbnail 확정(파일 경로는 행 생성 후).
    let demoUrl = "";
    let thumbnail = "";
    if (!bundle) {
      const deployUrl = strOrNull(payload?.deployUrl);
      if (!deployUrl) {
        return apiError({ status: 400, message: "deployUrl 또는 파일 번들(bundle)이 필요해요.", code: "NO_ARTIFACT" });
      }
      const source = detectDemoSource(deployUrl);
      if (!source) {
        return apiError({ status: 400, message: "임베드·시연할 수 있는 URL이 아니에요.", code: "BAD_URL" });
      }
      // 외부 live_url은 콘텐츠호스트·사설망 조기 차단(실 SSRF 게이트는 발행 시 trigger-demo).
      if (source.type === "live_url") {
        const issue = liveUrlIssue(source.value);
        if (issue?.kind === "content-host") {
          return apiError({
            status: 400, code: "CONTENT_HOST",
            message: `${issue.host}는 자동 시연으로 촬영하는 '내 작품' 주소가 아니에요.`,
          });
        }
        if (issue?.kind === "private-host") {
          return apiError({
            status: 400, code: "PRIVATE_HOST",
            message: "localhost·내부 주소는 안 돼요. 공개로 접속되는 배포 URL로 올려주세요.",
          });
        }
        try {
          await assertSafePublicUrl(source.value);
        } catch (e) {
          if (e instanceof SsrfError) {
            return apiError({
              status: 400, code: "PRIVATE_HOST",
              message: "공개 인터넷에서 접속되는 주소가 아니에요. 배포된 공개 URL로 올려주세요.",
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
        tags,
        content_type: contentTypeId,
        type: "image",
        year: new Date().getFullYear().toString(),
        demo_url: demoUrl,
        thumbnail,
        sort_order: totalCount ?? 0,
      })
      .select("id")
      .single();
    if (insErr || !created) {
      return apiError({ status: 500, message: "프로젝트를 만들지 못했어요.", code: "DB_INSERT_FAILED", cause: insErr });
    }
    const projectId = created.id as string;

    // 8. 파일 경로: zip 확장(방어) → 업로드 → demo_url·thumbnail 세팅. 실패 시 고아 행 정리.
    if (bundle) {
      const prefix = `${userId}/${projectId}/`;
      try {
        if (bundle.size > MAX_UPLOAD_BYTES) {
          throw new UploadError("업로드가 너무 커요 (최대 25MB).");
        }
        const buf = await bundle.arrayBuffer();
        const entries = await expandZipBundle(buf); // 엔트리 수·압축해제 크기 캡 내장
        const indexPath = findIndexHtml(entries);
        if (!indexPath) {
          throw new UploadError("index.html이 없어요. 자동 시연은 브라우저에 뜨는 화면을 촬영해요 — 정적 사이트 번들에 index.html을 포함해 주세요.");
        }
        for (const e of entries) {
          const storagePath = `${prefix}${e.relativePath}`;
          // 서비스롤은 스토리지 RLS를 우회하므로 최종 키가 소유자 prefix 안인지 직접 assert.
          if (!storagePath.startsWith(prefix) || storagePath.includes("/../")) {
            throw new UploadError("잘못된 파일 경로가 감지됐어요.");
          }
          const { error: upErr } = await admin.storage
            .from("project-files")
            .upload(storagePath, e.data, { upsert: true, contentType: e.contentType });
          if (upErr) throw new UploadError(`파일 업로드 실패: ${upErr.message}`);
        }
        demoUrl = `/api/preview/${prefix}${indexPath}`;
        const { error: updErr } = await admin
          .from("projects")
          .update({ demo_url: demoUrl, thumbnail: screenshotUrl(`${req.nextUrl.origin}${demoUrl}`) })
          .eq("id", projectId);
        if (updErr) throw new UploadError("데모 URL 저장에 실패했어요.");
      } catch (e) {
        // 고아 행 정리 — null demo_url 초안이 남지 않게 방금 만든 행을 지운다.
        // (스토리지에 일부 올라간 객체는 추측 불가한 uuid 폴더 아래 남을 수 있으나
        //  DB 행이 없어 발견 불가 — storage-audit 스윕이 회수.)
        await admin.from("projects").delete().eq("id", projectId);
        await admin.storage.from("project-files").remove([`${userId}/${projectId}`]).catch(() => {});
        if (e instanceof UploadError) {
          return apiError({ status: 400, message: e.message, code: "UPLOAD_FAILED" });
        }
        logger.error("ingest: file upload failed", { error: e, projectId });
        return apiError({ status: 500, message: "업로드 처리 중 오류가 났어요.", code: "UPLOAD_ERROR", cause: e });
      }
    }

    // 9. 응답 — reviewUrl은 하드코딩 SITE_URL이 아니라 요청 origin 기준.
    const reviewUrl = `${req.nextUrl.origin}/dashboard?review=${projectId}`;
    return NextResponse.json({ ok: true, projectId, reviewUrl, isDraft: true });
  } catch (err) {
    return apiError({ status: 500, message: "잠시 후 다시 시도해 주세요.", code: "INTERNAL", cause: err });
  }
}
