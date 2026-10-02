import { NextRequest, NextResponse } from "next/server";
import { apiError, bodyTooLarge } from "@/lib/apiError";
import { requireUser } from "@/lib/routeAuth";
import { getT } from "@/lib/i18n/server";
import { rateLimit } from "@/lib/rate-limit";
import { presignUserPut, type PresignedPut, type UserBucket } from "@/lib/userStorage";
import { MAX_UPLOAD_BYTES, MAX_ZIP_ENTRIES, MAX_MEDIA_IMAGE_BYTES, MAX_MEDIA_VIDEO_BYTES, safeRelativePath, secretFileKind, BODY_TOO_LARGE, readJsonOr, MAX_MEDIUM_JSON_BYTES } from "@/lib/upload-safety";

// POST /api/storage/sign — 대시보드가 파일을 R2에 바로 올릴 서명 URL(2026-10-01, lib/userStorage.ts).
//
// 예전엔 브라우저가 Supabase 버킷에 사용자 키로 바로 올렸고, 막는 건 버킷 RLS(자기 폴더만)였다.
// R2엔 그런 규칙이 없으니 여기서 정한다: 키는 서버가 로그인한 사람의 폴더 아래로만 만들고,
// 형식·크기를 서명에 묶는다(브라우저가 다른 크기·형식으로 보내면 R2가 403). 비밀 파일(.env 등)은
// 서명해 주지 않는다 — 예전 브라우저 거르기는 실수 방지였을 뿐, 이제 서버가 막는다.
//
//   app       { folder: UUID, files: [{ path, size }] } → files/{uid}/{folder}/{path}  (최대 2000개·합 25MB)
//   video     { ext, size }                            → files/{uid}/videos/{UUID}.{ext}  (20MB)
//   thumbnail { ext, size }                            → files/{uid}/thumbnails/{UUID}.{ext}  (5MB)
//   avatar    { ext, size }                            → avatars/{uid}/avatar.{ext}  (5MB)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VIDEO_EXT = new Set(["mp4", "webm", "mov", "m4v"]);
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

type Kind = "app" | "video" | "thumbnail" | "avatar";

function bad(message: string, code = "BAD_REQUEST") {
  return apiError({ status: 400, message, code });
}

function sizeOk(n: unknown, max: number): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= max;
}

export async function POST(req: NextRequest) {
  const { t } = await getT();
  try {
    const auth = await requireUser(t.api.loginRequired);
    if (auth instanceof NextResponse) return auth;
    const uid = auth.user.id;

    if (!(await rateLimit({ name: "storage-sign", key: uid, windowSeconds: 3600, max: 120 }))) {
      return apiError({ status: 429, message: t.api.tooManyRequests, code: "RATE_LIMITED" });
    }

    const rawBody = await readJsonOr(req, MAX_MEDIUM_JSON_BYTES, null);

    if (rawBody === BODY_TOO_LARGE) return bodyTooLarge();

    const body = rawBody as Record<string, unknown> | null;
    const kind = body?.kind as Kind | undefined;
    const contentType = typeof body?.contentType === "string" ? body.contentType : null;

    if (kind === "app") {
      const folder = body?.folder;
      const files = body?.files;
      if (typeof folder !== "string" || !UUID_RE.test(folder)) return bad("folder must be a UUID");
      if (!Array.isArray(files) || !files.length || files.length > MAX_ZIP_ENTRIES) return bad("bad file list");
      let total = 0;
      const items: { path: string; size: number }[] = [];
      for (const f of files as { path?: unknown; size?: unknown }[]) {
        const rel = typeof f?.path === "string" ? safeRelativePath(f.path) : null;
        if (!rel || rel.split("/").some((s) => s === "" || s === ".")) return bad("bad file path", "BAD_FILE_PATH");
        if (secretFileKind(rel)) return bad("secret files are not accepted", "SECRET_FILE");
        if (!sizeOk(f.size, MAX_UPLOAD_BYTES)) return bad("file too large", "TOO_LARGE");
        total += f.size;
        items.push({ path: rel, size: f.size });
      }
      if (total > MAX_UPLOAD_BYTES) return bad("upload too large", "TOO_LARGE");
      if (new Set(items.map((i) => i.path)).size !== items.length) return bad("duplicate path");
      const targets = await Promise.all(items.map(async (i): Promise<PresignedPut> => {
        const s = await presignUserPut("project-files", `${uid}/${folder}/${i.path}`, i.size);
        return { ...s, path: i.path };
      }));
      return NextResponse.json({ ok: true, folder, targets });
    }

    if (kind === "video" || kind === "thumbnail" || kind === "avatar") {
      const ext = typeof body?.ext === "string" ? body.ext.toLowerCase() : "";
      const allowed = kind === "video" ? VIDEO_EXT : IMAGE_EXT;
      if (!allowed.has(ext)) return bad("unsupported file type", "BAD_TYPE");
      const max = kind === "video" ? MAX_MEDIA_VIDEO_BYTES : MAX_MEDIA_IMAGE_BYTES;
      if (!sizeOk(body?.size, max)) return bad("file too large", "TOO_LARGE");
      const bucket: UserBucket = kind === "avatar" ? "avatars" : "project-files";
      const path = kind === "avatar"
        ? `${uid}/avatar.${ext}`
        : `${uid}/${kind === "video" ? "videos" : "thumbnails"}/${crypto.randomUUID()}.${ext}`;
      const target = await presignUserPut(bucket, path, body!.size as number, contentType);
      return NextResponse.json({ ok: true, target });
    }

    return bad("unknown kind");
  } catch (err) {
    return apiError({ status: 500, message: t.api.retryLater, code: "SIGN_FAILED", cause: err });
  }
}
