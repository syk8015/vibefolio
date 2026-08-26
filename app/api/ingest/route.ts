import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { getT } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { rateLimit } from "@/lib/rate-limit";
import { bearerFromHeader } from "@/lib/apiToken";
import { detectDemoSource } from "@/lib/demoSource";
import { screenshotUrl } from "@/lib/thumbnail";
import {
  ingestAuth, publicUrlGate, strOrNull, buildAccepted, descriptionTooLong, DESCRIPTION_MAX,
  missingScriptColumn,
} from "./shared";
import { normalizeTags, normalizeContentType } from "@/lib/projectTaxonomy";
import { normalizeDemoAccess, type DemoAccess } from "@/lib/demoAccess";
import { normalizeDemoScript, DEMO_SCRIPT_MIN_STEPS } from "@/lib/demoScript";
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
// trigger-demo 라우트가 처리한다(인증 경계 분리). 같은 진입 URL의 초안이 이미
// 있으면 새 행 대신 그 행을 갱신한다(upsert — 6단계). 설계 상세: docs/nookframe-connect.md.

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
  demoScript?: unknown;
  tags?: unknown;
  contentType?: unknown;
  deployUrl?: unknown;
  appUrl?: unknown;
  demoAccess?: unknown;
  uploads?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    // 1. 인증 — Bearer PAT 우선, 없으면 쿠키 세션(=/publish 웹 경로). PAT는 헤더로만.
    const auth = await ingestAuth(req);
    if (auth.fail) return auth.fail;
    const { userId, t } = auth;

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
    if (descriptionTooLong(description)) {
      return apiError({
        status: 400, message: t.api.descriptionTooLong(DESCRIPTION_MAX), code: "DESCRIPTION_TOO_LONG",
      });
    }
    const comment = strOrNull(payload?.builderNote) ?? "";
    const demoHint = typeof payload?.demoHighlights === "string"
      ? payload.demoHighlights.trim().slice(0, 500) || null
      : null;
    // 촬영 대본(demoHighlights의 구조화 승격) — 저장만. 형식이 어긋난 스텝은
    // 정규화가 조용히 버리고, 살아남은 스텝 수는 accepted 에코가 알린다.
    const demoScript = normalizeDemoScript(payload?.demoScript);
    let scriptStored = !!demoScript; // 컬럼 부재 디그레이드 시 false로 — 에코가 진실을 말하게
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
        const gate = await publicUrlGate(demoAccess.url, t);
        if (gate) return gate;
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
      if (e instanceof UploadError) return await uploadErrorResponse(e, t, userId);
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

    // 촬영 대본 게이트(2026-08-25 사용자 확정). 대본이 없으면 로봇은 화면을
    // 픽셀로 더듬어 추측 촬영한다 — 품질도 비용도 나쁜 옛 경로다(편당 $0.19 vs
    // 셀렉터 직배선 $0.02). 수동 업로드를 폐기해 대본이 **유일한 품질 손잡이**가
    // 된 이상, 부실하면 저장하지 말고 발행 AI에게 되돌려보낸다 — AI는 에러를
    // 보면 고쳐서 다시 보내므로, 이 거절이 곧 품질을 끌어올리는 유일한 순간이다.
    // 면제: 직접 만든 시연 영상을 준 경우(자동 촬영 자체를 건너뛴다).
    const hasOwnVideo = !!video || declared.includes("video");
    if (!hasOwnVideo) {
      const steps = demoScript?.steps.length ?? 0;
      if (steps === 0) {
        return apiError({ status: 400, message: t.api.scriptRequired, code: "SCRIPT_REQUIRED" });
      }
      if (steps < DEMO_SCRIPT_MIN_STEPS) {
        return apiError({ status: 400, message: t.api.scriptTooThin(steps), code: "SCRIPT_TOO_THIN" });
      }
    }

    const admin = createAdminClient();

    // 5. URL 경로면 여기서 demo_url·thumbnail 확정(파일 경로는 행 생성 후).
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
        const gate = await publicUrlGate(source.value, t);
        if (gate) return gate;
        // 외부 URL은 theater가 iframe하지 않으므로 썸네일이 없으면 밋밋하다 → thum.io로 찍는다.
        thumbnail = screenshotUrl(source.value);
      }
      demoUrl = source.value;

      // 고르지 않은 쪽을 버리지 않고 demo_access.altUrl로 남긴다(피드백 B-4):
      // "랜딩과 앱 중 뭘 찍을지"를 발행자가 미리 못 정해도, 촬영 직전 로컬 워커가
      // 두 화면을 한 장씩 훑어 정보량 많은 쪽을 고를 수 있다. 지금까지는 loser가
      // DB에 아예 도달하지 못해 그 판단 자체가 불가능했다. 로봇이 여는 주소이므로
      // winner와 똑같은 게이트를 통과한 것만 남긴다. 게이트에서 걸리면 요청 전체를
      // 400 내지 않고 alt만 포기한다 — 본 아티팩트(winner)는 멀쩡한데 부가 후보
      // 하나 때문에 발행이 막히면 안 된다.
      const appUrlRaw = strOrNull(payload?.appUrl);
      const deployUrlRaw = strOrNull(payload?.deployUrl);
      if (source.type === "live_url" && appUrlRaw && deployUrlRaw && !demoAccess?.altUrl) {
        const altSource = detectDemoSource(deployUrlRaw);
        if (altSource?.type === "live_url" && altSource.value !== source.value) {
          if (!(await publicUrlGate(altSource.value, t))) {
            demoAccess = { ...(demoAccess ?? {}), altUrl: altSource.value };
          }
        }
      }
    }

    // 6. upsert 판별(요청4) — 같은 진입 URL의 "초안"이 이미 있으면 새 행을 만들지
    // 않고 그 행을 갱신한다(재푸시=최신 페이로드가 진실). 초안 한정: 공개된 행은
    // 절대 건드리지 않아 PAT의 폭발반경(자기 초안뿐)이 유지된다. zip 경로는 비교할
    // URL이 없어 항상 새 초안(기존 동작).
    let projectId: string;
    let upserted = false;
    const { data: existing } = demoUrl
      ? await admin
          .from("projects")
          .select("id, thumbnail")
          .eq("user_id", userId)
          .eq("is_draft", true)
          .eq("demo_url", demoUrl)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };

    if (existing) {
      const upd: Record<string, unknown> = {
        title,
        description,
        comment,
        demo_user_hint: demoHint,
        demo_script: demoScript,
        demo_access: demoAccess,
        tags,
        content_type: contentTypeId,
      };
      if (videoBuf) upd.type = "video";
      // 제작자 스크린샷(_media/) 썸네일은 보존 — thum.io 자동 썸네일로 덮지 않는다.
      if (thumbnail && !(existing.thumbnail as string | null)?.includes("/_media/")) {
        upd.thumbnail = thumbnail;
      }
      let { error: updErr } = await admin.from("projects").update(upd).eq("id", existing.id);
      // migration_demo_script.sql 적용 전 무중단 디그레이드(워커의 42703 정책과
      // 동일): 컬럼이 없다고 발행 전체가 죽으면 안 된다 — 대본만 빼고 재시도.
      if (missingScriptColumn(updErr)) {
        logger.error("[ingest] projects.demo_script missing — apply migration_demo_script.sql (storing without the script)");
        delete upd.demo_script;
        scriptStored = false;
        ({ error: updErr } = await admin.from("projects").update(upd).eq("id", existing.id));
      }
      if (updErr) {
        return apiError({ status: 500, message: t.api.projectCreateFailed, code: "DB_UPDATE_FAILED", cause: updErr });
      }
      projectId = existing.id as string;
      upserted = true;
    } else {
      // 7. 초안 상한 체크(새 행을 만들 때만) 후 insert — 행 id를 파일 스토리지
      // 폴더로 쓰기 위해(삭제 누수 wart도 해소).
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
      const { count: totalCount } = await admin
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      const row: Record<string, unknown> = {
        user_id: userId,
        is_draft: true,
        title,
        description,
        comment,
        demo_user_hint: demoHint,
        demo_script: demoScript,
        demo_access: demoAccess,
        tags,
        content_type: contentTypeId,
        type: videoBuf ? "video" : "image",
        year: new Date().getFullYear().toString(),
        demo_url: demoUrl,
        thumbnail,
        sort_order: totalCount ?? 0,
      };
      let { data: created, error: insErr } = await admin
        .from("projects").insert(row).select("id").single();
      // 위 update 브랜치와 같은 마이그레이션 전 디그레이드.
      if (missingScriptColumn(insErr)) {
        logger.error("[ingest] projects.demo_script missing — apply migration_demo_script.sql (storing without the script)");
        delete row.demo_script;
        scriptStored = false;
        ({ data: created, error: insErr } = await admin
          .from("projects").insert(row).select("id").single());
      }
      if (insErr || !created) {
        return apiError({ status: 500, message: t.api.projectCreateFailed, code: "DB_INSERT_FAILED", cause: insErr });
      }
      projectId = created.id as string;
    }

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
        const { entryPath, runnable } = await storeZipBundle(admin, userId, projectId, await bundle.arrayBuffer());
        demoUrl = `/api/preview/${userId}/${projectId}/${entryPath}`;
        // runnable 앵커(파이썬·CLI 소스 zip)는 미리보기가 없어 thum.io 스크린샷이
        // 소스 코드 원문을 찍는다 — 썸네일 없이 두고 촬영본/제작자 스크린샷이 채운다.
        const { error: updErr } = await admin
          .from("projects")
          .update({
            demo_url: demoUrl,
            ...(runnable ? {} : { thumbnail: screenshotUrl(`${req.nextUrl.origin}${demoUrl}`) }),
          })
          .eq("id", projectId);
        if (updErr) throw new UploadError(t.api.demoUrlSaveFailed);
      } catch (e) {
        await admin.from("projects").delete().eq("id", projectId);
        if (e instanceof UploadError) return await uploadErrorResponse(e, t, userId);
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
        // 고아 행 정리 — zip 실패 경로와 동일 정책(스토리지 잔재는 storage-audit이
        // 회수). 단 upsert된 기존 초안은 지우지 않는다(이전 상태가 남는 게 낫다).
        if (!upserted) await admin.from("projects").delete().eq("id", projectId);
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
          if (!upserted) await admin.from("projects").delete().eq("id", projectId);
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
      // 무엇이 실제로 저장됐는지 그대로 돌려준다(C-1) — 태그 철자 불일치·타입 오타·
      // 500자 절단은 에러가 아니라 조용한 폐기라, 이 에코가 유일한 사후 확인 수단이다.
      accepted: buildAccepted(payload as unknown as Record<string, unknown>, {
        title, description, comment, demoHint, tags,
        demoScript: scriptStored ? demoScript : null,
        contentTypeId, demoAccess, entryUrl: demoUrl,
      }, normalizeTags),
      ...(upserted ? { upserted: true } : {}),
      // 랜딩·앱을 둘 다 준 경우 뭘 찍을지는 촬영 직전에 고른다(피드백 B-4) — 발행
      // AI가 "내가 고른 게 최종"으로 오해하지 않게 후보를 돌려준다.
      ...(demoAccess?.altUrl ? { entryUrl: demoUrl, scoutAltUrl: demoAccess.altUrl } : {}),
      ...(uploads ? { uploads, finalizeUrl: `${req.nextUrl.origin}/api/ingest/finalize` } : {}),
    });
  } catch (err) {
    const tc = bearerFromHeader(req.headers.get("authorization")) ? getDictionary("en") : (await getT()).t;
    return apiError({ status: 500, message: tc.api.retryLater, code: "INTERNAL", cause: err });
  }
}
