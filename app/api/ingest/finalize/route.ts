import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { rateLimit } from "@/lib/rate-limit";
import { ingestAuth, pickApiT } from "../shared";
import { screenshotUrl } from "@/lib/thumbnail";
import { MAX_UPLOAD_BYTES, UploadError, summarizeDropped } from "@/lib/upload-safety";
import {
  validateMedia, uploadMedia, storeZipBundle, removeStaleFiles, dropNewRow, inspectUploads,
  UPLOAD_TEMP_KEYS, UPLOAD_REPLACE_MARKER,
} from "@/lib/ingestStore";
import { uploadErrorResponse } from "../uploadError";
import { normalizeDemoScript } from "@/lib/demoScript";
import { logger } from "@/lib/logger";

// POST /api/ingest/finalize — 서명 URL 2단계의 마무리. /api/ingest가 uploads
// 선언에 발급한 URL로 클라가 스토리지에 직접 PUT한 뒤(Vercel 본문 상한 ~4.5MB
// 우회) 여기를 호출하면, 임시 `_upload/<session>/` 오브젝트를 내려받아 인라인 경로와
// 동일한 검증(zip 안전 일습·미디어 매직바이트, lib/ingestStore.ts 공유)을 거쳐
// demo_url·thumbnail·video_url을 연결하고 임시 오브젝트를 지운다.
//
// 보안: 서명 URL은 서버가 조립한 키에만 유효하고, 여기서도 서버가 만든 가장 새 업로드
// 세션의 키만 읽는다(클라 입력이 키에 안 섞임). 검증 실패 시 인라인 경로와 같은 정책으로
// 이번 발행이 새로 만든 행을 지운다(불량 아티팩트가 연결된 초안이 남지 않게) —
// 이미 있던 초안(같은 URL 재발행·draftId)은 1단계가 남긴 교체 표식을 보고 그대로
// 둔다. is_draft=false 행은 거부 — PAT의 폭발반경(자기 초안 생성뿐)을 유지한다.

export async function POST(req: NextRequest) {
  try {
    // 1. 인증 — /api/ingest와 동일(PAT 헤더 우선, 아니면 쿠키 세션 — 공용 헬퍼).
    const auth = await ingestAuth(req);
    if (auth.fail) return auth.fail;
    const { userId, t } = auth;

    // 2. 레이트리밋 — ingest와 같은 버킷(2단계 발행 = 2히트, 상한 내 여유 충분).
    const allowed = await rateLimit({ name: "ingest", key: userId, windowSeconds: 3600, max: 20 });
    if (!allowed) {
      return apiError({ status: 429, message: t.api.tooManyRequests, code: "RATE_LIMITED" });
    }

    // 3. 본문 — { projectId } 하나.
    let projectId: string;
    try {
      const body = (await req.json()) as { projectId?: unknown };
      projectId = typeof body?.projectId === "string" ? body.projectId : "";
    } catch {
      return apiError({ status: 400, message: t.api.jsonBodyInvalid, code: "BAD_JSON" });
    }
    if (!projectId) {
      return apiError({ status: 400, message: t.api.jsonBodyInvalid, code: "BAD_REQUEST" });
    }

    // 4. 행 소유·초안 확인.
    const admin = createAdminClient();
    const { data: row, error: selErr } = await admin
      .from("projects")
      .select("id, user_id, is_draft, demo_url, video_url, thumbnail, demo_script")
      .eq("id", projectId)
      .maybeSingle();
    if (selErr || !row) {
      return apiError({ status: 404, message: t.api.projectNotFound, code: "NOT_FOUND" });
    }
    if (row.user_id !== userId) {
      return apiError({ status: 403, message: t.api.projectForbidden, code: "FORBIDDEN" });
    }
    if (!row.is_draft) {
      return apiError({ status: 409, message: t.api.finalizeNotDraft, code: "NOT_DRAFT" });
    }

    // 5. 임시 오브젝트 회수 — 1단계가 만든 가장 새 업로드 세션의 키만. download 에러 =
    // 미업로드로 간주. replacing = 1단계가 "이미 있던 초안에 올린다"고 남긴 교체 표식.
    // 세션·표식은 목록 조회로 찾는다(CDN 캐시를 안 탄다 — lib/ingestStore.ts).
    const { session, replacing } = await inspectUploads(admin, userId, projectId);
    const tempKeys = session
      ? [
          UPLOAD_TEMP_KEYS.bundle(userId, projectId, session),
          UPLOAD_TEMP_KEYS.screenshot(userId, projectId, session),
          UPLOAD_TEMP_KEYS.video(userId, projectId, session),
        ]
      : [];
    const download = async (key: string | undefined): Promise<Uint8Array | null> => {
      if (!key) return null;
      const { data, error } = await admin.storage.from("project-files").download(key);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    };
    const [bundleBuf, shotBuf, videoBuf] = await Promise.all(tempKeys.length ? tempKeys.map(download) : [null, null, null]);
    const cleanupTemp = () =>
      admin.storage
        .from("project-files")
        .remove([...tempKeys, UPLOAD_REPLACE_MARKER(userId, projectId)])
        .then(
          () => {},
          () => {},
        );

    // 아무것도 안 올라온 finalize: 이미 아티팩트가 연결돼 있으면(재호출) 멱등 성공,
    // 아니면 실패 — 빈 초안을 "완료"로 오인하게 두지 않는다.
    if (!bundleBuf && !shotBuf && !videoBuf) {
      if (row.demo_url || row.video_url) {
        const reviewUrl = `${req.nextUrl.origin}/dashboard?review=${projectId}`;
        return NextResponse.json({ ok: true, projectId, reviewUrl, deduped: true });
      }
      return apiError({ status: 400, message: t.api.finalizeNothing, code: "NOTHING_TO_FINALIZE" });
    }

    // 6. 검증 + 연결 — 인라인 경로와 동일 코어. 실패 시 이번 발행이 만든 행만 삭제(동일 정책).
    // droppedFiles = 안전상 저장하지 않은 비밀 파일 요약(.env·.git/ 등). 응답 밖으로
    // 새어나가야 하므로 try 밖에 선언한다 — 알려주지 않으면 발행자는 자기 앱이 왜
    // 안 도는지 모른다.
    let droppedFiles: string[] = [];
    try {
      const updates: Record<string, string> = {};
      const sniffed = validateMedia(shotBuf, videoBuf);
      // 영상도 대본도 없으면 이 초안은 찍을 방법이 없다(2026-09-16). 발행 때
      // `uploads:["video"]` **선언만으로** 대본 게이트를 면제받고서 영상을 끝내 안
      // 올린 경우다 — 여기서 막지 않으면 대본 없는 초안이 남고, 공개되면 픽셀 추측
      // 이라는 옛 촬영 경로로 간다(편당 $0.19 vs 셀렉터 직배선 $0.02).
      // 아래 catch가 기존 정책대로 처리한다: 이번 발행이 만든 행이면 삭제, 교체
      // 발행이면 그대로 둔다 — 1단계가 이제 옛 대본을 안 덮으므로 옛 대본이 살아 있다.
      if (!videoBuf && !row.video_url && !normalizeDemoScript(row.demo_script)) {
        throw new UploadError(t.api.finalizeNoScriptNoVideo, "no-film-source");
      }
      let keep: Set<string> | null = null;
      if (bundleBuf) {
        if (bundleBuf.byteLength > MAX_UPLOAD_BYTES) {
          throw new UploadError(t.api.uploadTooLarge, "too-large");
        }
        const stored = await storeZipBundle(admin, userId, projectId, bundleBuf.buffer as ArrayBuffer);
        const { entryPath, runnable } = stored;
        droppedFiles = summarizeDropped(stored.dropped, t.api.secretFileKinds);
        keep = new Set(stored.keys);
        updates.demo_url = `/api/preview/${userId}/${projectId}/${entryPath}`;
        // runnable 앵커(소스 zip)는 미리보기 화면이 없다 — 인라인 경로와 동일하게
        // thum.io 썸네일을 만들지 않는다(소스 원문 스크린샷 방지). 교체 발행이면 제작자
        // 스크린샷(_media/) 썸네일도 덮지 않는다(ingest upsert와 같은 규칙).
        if (!runnable && !(row.thumbnail as string | null)?.includes("/_media/")) {
          updates.thumbnail = screenshotUrl(`${req.nextUrl.origin}${updates.demo_url}`);
        }
      }
      const media = await uploadMedia(admin, userId, projectId, shotBuf, videoBuf, sniffed);
      Object.assign(updates, media); // screenshot thumbnail이 thum.io보다 우선
      if (videoBuf) updates.type = "video";
      const { error: updErr } = await admin.from("projects").update(updates).eq("id", projectId);
      if (updErr) throw new UploadError(t.api.demoUrlSaveFailed);
      // 파일 초안의 zip을 갈아끼웠으면 새 zip에 없는 옛 파일을 지운다(공개 버킷). 정리 실패는
      // 발행 실패가 아니다 — 새 파일은 이미 연결됐으니 기록만 남긴다.
      if (keep && (row.demo_url as string | null)?.startsWith("/api/preview/")) {
        await removeStaleFiles(admin, userId, projectId, keep).catch((err) =>
          logger.error("ingest finalize: stale file cleanup failed", { error: err, projectId }));
      }
      await cleanupTemp();
    } catch (e) {
      // 교체 표식이 있으면 이미 있던 초안이다 — 지우지 않고 이전 상태를 남긴다.
      if (!replacing) await dropNewRow(admin, userId, projectId);
      await cleanupTemp();
      if (e instanceof UploadError) return await uploadErrorResponse(e, t, userId);
      logger.error("ingest finalize: processing failed", { error: e, projectId });
      return apiError({ status: 500, message: t.api.uploadProcessingError, code: "UPLOAD_ERROR", cause: e });
    }

    const reviewUrl = `${req.nextUrl.origin}/dashboard?review=${projectId}`;
    return NextResponse.json({
      ok: true, projectId, reviewUrl,
      ...(droppedFiles.length ? { droppedFiles } : {}),
    });
  } catch (err) {
    const tc = await pickApiT(req);
    return apiError({ status: 500, message: tc.api.retryLater, code: "INTERNAL", cause: err });
  }
}
