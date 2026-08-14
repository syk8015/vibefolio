// 인제스트 아티팩트 처리(UploadError code) → HTTP 응답 매핑. 인라인 경로
// (route.ts)와 서명 URL 마무리 경로(finalize/route.ts)가 같은 표를 쓴다.
import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { MAX_ZIP_ENTRIES, MAX_MEDIA_IMAGE_BYTES, MAX_MEDIA_VIDEO_BYTES, UploadError } from "@/lib/upload-safety";
import type { Dictionary } from "@/lib/i18n/dictionaries";

export function uploadErrorResponse(e: UploadError, t: Dictionary): NextResponse {
  const mb = (n: number) => n / 1024 / 1024;
  switch (e.code) {
    case "zip-bomb":
      return apiError({ status: 400, message: t.api.zipBomb, code: "UPLOAD_FAILED" });
    case "zip-read-error":
      return apiError({ status: 400, message: t.api.zipReadError, code: "UPLOAD_FAILED" });
    case "zip-empty":
      return apiError({ status: 400, message: t.api.zipEmpty, code: "UPLOAD_FAILED" });
    case "zip-too-many":
      return apiError({ status: 400, message: t.api.zipTooManyFiles(MAX_ZIP_ENTRIES), code: "UPLOAD_FAILED" });
    case "zip-no-valid":
      return apiError({ status: 400, message: t.api.zipNoValidFiles, code: "UPLOAD_FAILED" });
    case "too-large":
      return apiError({ status: 413, message: t.api.uploadTooLarge, code: "TOO_LARGE" });
    case "index-html-missing":
      return apiError({ status: 400, message: t.api.indexHtmlMissing, code: "UPLOAD_FAILED" });
    case "bad-file-path":
      return apiError({ status: 400, message: t.api.badFilePath, code: "UPLOAD_FAILED" });
    case "upload-failed":
      return apiError({ status: 500, message: t.api.fileUploadFailed(e.message), code: "UPLOAD_FAILED" });
    case "media-image-large":
      return apiError({ status: 413, message: t.api.mediaImageTooLarge(mb(MAX_MEDIA_IMAGE_BYTES)), code: "MEDIA_TOO_LARGE" });
    case "media-video-large":
      return apiError({ status: 413, message: t.api.mediaVideoTooLarge(mb(MAX_MEDIA_VIDEO_BYTES)), code: "MEDIA_TOO_LARGE" });
    case "media-image-bad":
      return apiError({ status: 400, message: t.api.mediaImageBadType, code: "BAD_MEDIA" });
    case "media-video-bad":
      return apiError({ status: 400, message: t.api.mediaVideoBadType, code: "BAD_MEDIA" });
    default:
      // code 없이 라우트가 직접 만든 locale 메시지(예: demoUrlSaveFailed).
      return apiError({ status: 400, message: e.message, code: "UPLOAD_FAILED" });
  }
}
