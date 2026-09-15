// Nookframe Connect — 인제스트 아티팩트 저장 코어. 인라인 multipart 경로
// (app/api/ingest)와 서명 URL 2단계의 마무리 경로(app/api/ingest/finalize)가
// zip 확장·미디어 판정/업로드를 공유한다. 두 경로가 갈라지면 안전 검사(존재
// 이유)가 갈라지므로 반드시 여기만 수정할 것.
//
// 에러는 전부 UploadError(code) — locale 메시지는 각 라우트가 code로 그린다.
// 서비스롤 업로드는 스토리지 RLS를 우회하므로 여기의 prefix assert(zip)와
// 매직바이트 판정(미디어)이 형식·경로의 유일 방어다.

import {
  MAX_UPLOAD_BYTES, MAX_MEDIA_IMAGE_BYTES, MAX_MEDIA_VIDEO_BYTES,
  expandZipBundle, pickZipAnchor, sniffImage, sniffVideo, UploadError,
  type DroppedFile,
} from "./upload-safety";
import { detectNativeApp } from "./nativeApp";

// 서비스롤 admin 클라이언트 중 여기서 쓰는 표면만 (demoPayload.ts의 선례).
type AdminClient = {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        data: Uint8Array | ArrayBuffer,
        opts?: { upsert?: boolean; contentType?: string },
      ): Promise<{ error: { message: string } | null }>;
      getPublicUrl(path: string): { data: { publicUrl: string } };
      list(
        path: string,
        opts?: { limit?: number; offset?: number },
      ): Promise<{ data: { name: string; id: string | null }[] | null; error: { message: string } | null }>;
      remove(paths: string[]): Promise<{ error: { message: string } | null }>;
    };
  };
};

export type SniffedMedia = {
  shotType: { ext: string; mime: string } | null;
  videoType: { ext: string; mime: string } | null;
};

// 서명 URL 2단계에서 선언 가능한 업로드 종류와 임시 오브젝트 키. finalize는 이
// 고정 키만 읽는다 — 클라 입력이 키에 섞이지 않아 traversal 여지가 없다.
export const UPLOAD_KINDS = ["bundle", "screenshot", "video"] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];
export const UPLOAD_TEMP_KEYS: Record<UploadKind, (uid: string, pid: string) => string> = {
  bundle: (uid, pid) => `${uid}/${pid}/_upload/bundle.zip`,
  screenshot: (uid, pid) => `${uid}/${pid}/_upload/screenshot.bin`,
  video: (uid, pid) => `${uid}/${pid}/_upload/video.bin`,
};

// 교체 표식(2026-09-15) — 2단계 업로드가 "이미 있던 초안"(같은 URL 재발행·draftId)에
// 올리는 것이면 1단계(/api/ingest)가 이 키에 남긴다. finalize는 행이 이번 요청에서 새로
// 생긴 건지 알 수 없어서, 표식이 있으면 검증이 실패해도 행을 지우지 않는다(인라인 경로의
// !upserted와 같은 규칙). 서명 URL을 발급하지 않는 키라 PAT 호출자는 이 파일을 못 만든다.
const REPLACE_MARKER_NAME = "replace.marker";
export const UPLOAD_REPLACE_MARKER = (uid: string, pid: string) => `${uid}/${pid}/_upload/${REPLACE_MARKER_NAME}`;

// 표식 확인은 download가 아니라 목록 조회로 한다. 지운 임시 오브젝트가 스토리지 CDN
// 캐시에서 잠깐 더 읽히는 걸 실측했다(2026-08-14) — 반대로 막 만든 표식 자리에서 옛
// "없음"이 읽히면 이미 있던 초안을 지우게 되므로, 캐시를 타지 않는 list로 판정한다.
export async function hasReplaceMarker(admin: AdminClient, uid: string, pid: string): Promise<boolean> {
  const { data, error } = await admin.storage.from("project-files").list(`${uid}/${pid}/_upload`, { limit: 100 });
  if (error) throw new Error(`storage list failed: ${error.message}`);
  return (data ?? []).some((f) => f.name === REPLACE_MARKER_NAME);
}

// 캡 + 매직바이트 판정(네트워크 없음). 행 생성 전에 불러 실패를 조기 확정한다.
// 저장 확장자·MIME은 여기 결과만 쓴다(자칭 Content-Type·파일명 불신).
export function validateMedia(
  shotBuf: Uint8Array | null,
  videoBuf: Uint8Array | null,
): SniffedMedia {
  let shotType: SniffedMedia["shotType"] = null;
  let videoType: SniffedMedia["videoType"] = null;
  if (shotBuf) {
    if (shotBuf.byteLength > MAX_MEDIA_IMAGE_BYTES) {
      throw new UploadError("스크린샷 이미지가 너무 커요.", "media-image-large");
    }
    shotType = sniffImage(shotBuf);
    if (!shotType) throw new UploadError("screenshot이 이미지 파일이 아니에요.", "media-image-bad");
  }
  if (videoBuf) {
    if (videoBuf.byteLength > MAX_MEDIA_VIDEO_BYTES) {
      throw new UploadError("시연 영상이 너무 커요.", "media-video-large");
    }
    videoType = sniffVideo(videoBuf);
    if (!videoType) throw new UploadError("video가 영상 파일이 아니에요.", "media-video-bad");
  }
  return { shotType, videoType };
}

// 판정 끝난 미디어를 행 폴더 `_media/`에 올리고 채울 컬럼 값을 돌려준다.
// 키는 고정 파일명+스니핑 확장자로 서버가 조립 — traversal 여지 없음.
export async function uploadMedia(
  admin: AdminClient,
  userId: string,
  projectId: string,
  shotBuf: Uint8Array | null,
  videoBuf: Uint8Array | null,
  sniffed: SniffedMedia,
): Promise<{ thumbnail?: string; video_url?: string }> {
  const updates: { thumbnail?: string; video_url?: string } = {};
  if (shotBuf && sniffed.shotType) {
    const key = `${userId}/${projectId}/_media/screenshot.${sniffed.shotType.ext}`;
    const { error } = await admin.storage
      .from("project-files")
      .upload(key, shotBuf, { upsert: true, contentType: sniffed.shotType.mime });
    if (error) throw new UploadError(`screenshot upload: ${error.message}`, "upload-failed");
    updates.thumbnail = admin.storage.from("project-files").getPublicUrl(key).data.publicUrl;
  }
  if (videoBuf && sniffed.videoType) {
    const key = `${userId}/${projectId}/_media/video.${sniffed.videoType.ext}`;
    const { error } = await admin.storage
      .from("project-files")
      .upload(key, videoBuf, { upsert: true, contentType: sniffed.videoType.mime });
    if (error) throw new UploadError(`video upload: ${error.message}`, "upload-failed");
    updates.video_url = admin.storage.from("project-files").getPublicUrl(key).data.publicUrl;
  }
  return updates;
}

// zip 번들을 확장(폭탄/엔트리 캡 내장)해 행 폴더에 올리고 demo_url이 가리킬
// 앵커 파일의 상대경로를 돌려준다. 앵커=index.html(정적 사이트) 또는, 그게
// 없으면 실행 가능한 코드의 표식(package.json / *.py — E2B 빌드 모드로 촬영,
// 2026-08-20 zip 입구 완화). 최종 demo_url/thumbnail 세팅은 호출부 몫.
// keys = 올린 오브젝트 키 전부 — 교체 발행에서 옛 파일 정리(removeStaleFiles)가 남길 목록.
export async function storeZipBundle(
  admin: AdminClient,
  userId: string,
  projectId: string,
  buf: ArrayBuffer,
): Promise<{ entryPath: string; runnable: boolean; dropped: DroppedFile[]; keys: string[] }> {
  if (buf.byteLength > MAX_UPLOAD_BYTES) {
    throw new UploadError("업로드가 너무 커요.", "too-large");
  }
  const prefix = `${userId}/${projectId}/`;
  // 엔트리 수·압축해제 크기 캡 내장. dropped = 안전상 저장하지 않은 비밀 파일
  // (.env·.git/ 등) — 호출부가 발행자에게 그대로 되돌려준다.
  const { entries, dropped } = await expandZipBundle(buf);
  const anchor = pickZipAnchor(entries);
  if (!anchor) {
    // 앵커가 없는 zip 중 상당수는 "웹으로 띄울 수 없는" 네이티브 앱이다. 거절은
    // 그대로 하되 이유를 정확히 말해주고, /admin이 수요를 셀 수 있게 표시를 남긴다
    // (lib/nativeApp.ts).
    const native = detectNativeApp(entries.map((e) => e.relativePath));
    if (native) {
      throw new UploadError("웹으로 띄울 수 없는 네이티브 앱이에요.", "native-app", native);
    }
    throw new UploadError("index.html도 실행 가능한 코드도 없어요.", "index-html-missing");
  }
  // supabase-js는 최종 키를 인코딩 없이 URL에 끼워 넣고, fetch의 WHATWG 파서가
  // %2e%2e·raw CR/LF 등을 `..`로 정규화한다. 문자열 startsWith만으로는
  // prefix 이탈을 못 막으므로(서비스롤=스토리지 RLS 우회), 실제로 전송될 URL을
  // 파싱한 뒤 정규화된 pathname이 소유자 prefix 안인지 assert한다.
  // 경로 검사를 전부 끝낸 뒤에 올린다 — 이미 있던 초안의 파일을 갈아끼울 때(draftId)
  // 중간에 걸려 옛 파일과 새 파일이 섞인 채 남지 않게.
  const storageKeyBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/project-files/`;
  const requiredPathPrefix = new URL(`${storageKeyBase}${prefix}`).pathname;
  const keys: string[] = [];
  for (const e of entries) {
    const storagePath = `${prefix}${e.relativePath}`;
    let normalizedPath: string;
    try {
      normalizedPath = new URL(`${storageKeyBase}${storagePath}`).pathname;
    } catch {
      throw new UploadError("잘못된 파일 경로가 감지됐어요.", "bad-file-path");
    }
    if (
      !storagePath.startsWith(prefix) ||
      storagePath.includes("/../") ||
      !normalizedPath.startsWith(requiredPathPrefix)
    ) {
      throw new UploadError("잘못된 파일 경로가 감지됐어요.", "bad-file-path");
    }
    keys.push(storagePath);
  }
  for (let i = 0; i < entries.length; i++) {
    const { error: upErr } = await admin.storage
      .from("project-files")
      .upload(keys[i], entries[i].data, { upsert: true, contentType: entries[i].contentType });
    if (upErr) throw new UploadError(`파일 업로드 실패: ${upErr.message}`, "upload-failed");
  }
  return {
    entryPath: anchor.path,
    runnable: anchor.kind === "runnable",
    dropped, // 언어별 라벨은 라우트가 사전으로 붙인다(PAT 응답은 영어 고정).
    keys,
  };
}

// 아티팩트를 갈아끼운 초안에서 새 아티팩트에 없는 옛 파일을 지운다(draftId 교체 발행,
// 2026-09-15). project-files는 공개 버킷이라, 남겨두면 새 zip에서 뺀 파일(또는 URL로
// 바꾼 초안의 옛 zip 전체)이 옛 주소로 계속 서빙된다. _media(제작자 미디어)·_upload
// (진행 중 임시)는 건드리지 않는다. list는 한 겹·한 페이지씩만 보므로 폴더 BFS + 페이지 반복.
const LIST_PAGE = 1000;
export async function removeStaleFiles(
  admin: AdminClient,
  userId: string,
  projectId: string,
  keep: ReadonlySet<string>,
): Promise<number> {
  const root = `${userId}/${projectId}`;
  const stale: string[] = [];
  const queue = [root];
  while (queue.length) {
    const dir = queue.shift()!;
    for (let offset = 0; ; offset += LIST_PAGE) {
      const { data, error } = await admin.storage.from("project-files").list(dir, { limit: LIST_PAGE, offset });
      if (error) throw new Error(`storage list failed: ${error.message}`);
      for (const entry of data ?? []) {
        if (dir === root && (entry.name === "_media" || entry.name === "_upload")) continue;
        const full = `${dir}/${entry.name}`;
        if (entry.id === null) queue.push(full);
        else if (!keep.has(full)) stale.push(full);
      }
      if (!data || data.length < LIST_PAGE) break;
    }
  }
  for (let i = 0; i < stale.length; i += 100) {
    const { error } = await admin.storage.from("project-files").remove(stale.slice(i, i + 100));
    if (error) throw new Error(`storage remove failed: ${error.message}`);
  }
  return stale.length;
}
