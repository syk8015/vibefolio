import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { getT } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { rateLimit } from "@/lib/rate-limit";
import { bearerFromHeader } from "@/lib/apiToken";
import { ingestAuth } from "../shared";
import { screenshotUrl } from "@/lib/thumbnail";
import { MAX_UPLOAD_BYTES, UploadError } from "@/lib/upload-safety";
import {
  validateMedia, uploadMedia, storeZipBundle, UPLOAD_TEMP_KEYS,
} from "@/lib/ingestStore";
import { uploadErrorResponse } from "../uploadError";
import { logger } from "@/lib/logger";

// POST /api/ingest/finalize — 서명 URL 2단계의 마무리. /api/ingest가 uploads
// 선언에 발급한 URL로 클라가 스토리지에 직접 PUT한 뒤(Vercel 본문 상한 ~4.5MB
// 우회) 여기를 호출하면, 임시 `_upload/` 오브젝트를 내려받아 인라인 경로와
// 동일한 검증(zip 안전 일습·미디어 매직바이트, lib/ingestStore.ts 공유)을 거쳐
// demo_url·thumbnail·video_url을 연결하고 임시 오브젝트를 지운다.
//
// 보안: 서명 URL은 서버가 조립한 고정 키에만 유효하고, 여기서도 그 고정 키만
// 읽는다(클라 입력이 키에 안 섞임). 검증 실패 시 인라인 경로와 같은 정책으로
// 행을 지운다(불량 아티팩트가 연결된 초안이 남지 않게). is_draft=false 행은
// 거부 — PAT의 폭발반경(자기 초안 생성뿐)을 유지한다.

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
      .select("id, user_id, is_draft, demo_url, video_url")
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

    // 5. 임시 오브젝트 회수(고정 키만). download 에러 = 미업로드로 간주.
    const tempKeys = {
      bundle: UPLOAD_TEMP_KEYS.bundle(userId, projectId),
      screenshot: UPLOAD_TEMP_KEYS.screenshot(userId, projectId),
      video: UPLOAD_TEMP_KEYS.video(userId, projectId),
    };
    const download = async (key: string): Promise<Uint8Array | null> => {
      const { data, error } = await admin.storage.from("project-files").download(key);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    };
    const [bundleBuf, shotBuf, videoBuf] = await Promise.all([
      download(tempKeys.bundle),
      download(tempKeys.screenshot),
      download(tempKeys.video),
    ]);
    const cleanupTemp = () =>
      admin.storage.from("project-files").remove(Object.values(tempKeys)).then(
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

    // 6. 검증 + 연결 — 인라인 경로와 동일 코어. 실패 시 행 삭제(동일 정책).
    try {
      const updates: Record<string, string> = {};
      const sniffed = validateMedia(shotBuf, videoBuf);
      if (bundleBuf) {
        if (bundleBuf.byteLength > MAX_UPLOAD_BYTES) {
          throw new UploadError(t.api.uploadTooLarge, "too-large");
        }
        const { indexPath } = await storeZipBundle(admin, userId, projectId, bundleBuf.buffer as ArrayBuffer);
        updates.demo_url = `/api/preview/${userId}/${projectId}/${indexPath}`;
        updates.thumbnail = screenshotUrl(`${req.nextUrl.origin}${updates.demo_url}`);
      }
      const media = await uploadMedia(admin, userId, projectId, shotBuf, videoBuf, sniffed);
      Object.assign(updates, media); // screenshot thumbnail이 thum.io보다 우선
      if (videoBuf) updates.type = "video";
      const { error: updErr } = await admin.from("projects").update(updates).eq("id", projectId);
      if (updErr) throw new UploadError(t.api.demoUrlSaveFailed);
      await cleanupTemp();
    } catch (e) {
      await admin.from("projects").delete().eq("id", projectId);
      await cleanupTemp();
      if (e instanceof UploadError) return uploadErrorResponse(e, t);
      logger.error("ingest finalize: processing failed", { error: e, projectId });
      return apiError({ status: 500, message: t.api.uploadProcessingError, code: "UPLOAD_ERROR", cause: e });
    }

    const reviewUrl = `${req.nextUrl.origin}/dashboard?review=${projectId}`;
    return NextResponse.json({ ok: true, projectId, reviewUrl });
  } catch (err) {
    const tc = bearerFromHeader(req.headers.get("authorization")) ? getDictionary("en") : (await getT()).t;
    return apiError({ status: 500, message: tc.api.retryLater, code: "INTERNAL", cause: err });
  }
}
