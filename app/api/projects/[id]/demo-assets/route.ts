import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, bodyTooLarge } from "@/lib/apiError";
import { requireUser } from "@/lib/routeAuth";
import { getT } from "@/lib/i18n/server";
import { logger } from "@/lib/logger";
import { isR2Configured, deleteR2Prefix } from "@/lib/r2";
import { listFilesDeep, removeFiles } from "@/lib/storageList";
import { removeStaleFiles } from "@/lib/ingestStore";
import { userStorageClient, userFilePathFromUrl, withUserStorage } from "@/lib/userStorage";
import { BODY_TOO_LARGE, readJsonOr, MAX_SMALL_JSON_BYTES } from "@/lib/upload-safety";

// 사용자 파일은 2026-10-01부터 R2(files/…, lib/userStorage.ts), 그 전 것은 옛 Supabase 버킷에
// 있다 — 경로 모양이 같아서 지울 땐 두 곳 모두에서 지운다(없는 키 지우기는 둘 다 무해).
//
// Purge ALL of a project's storage when it is deleted:
//   - Supabase project-files: the {userId}/{projectId}/ folder (uploaded source +
//     auto-demo mp4/poster) plus the standalone uploaded video ({userId}/videos/…)
//     and thumbnail ({userId}/thumbnails/…) objects.
//   - Cloudflare R2: the {userId}/{projectId}/ demo assets.
//
// Runs SERVER-SIDE with the service-role key because the storage RLS silently
// blocked the old client-side removal — deletes appeared to work while files were
// stranded. Ownership is verified from the project row (which must still exist), so
// the client calls this before deleting the row.

const BUCKET = "project-files";
const PREVIEW_PREFIX = "/api/preview/";

// R2 주소(media.nookframe.com/files/…)와 옛 Supabase 공개 주소 둘 다 같은 경로로 읽는다.
function storagePathFromPublicUrl(url: string | null | undefined): string | null {
  const r = userFilePathFromUrl(url);
  return r && r.bucket === BUCKET ? r.path : null;
}

type Admin = ReturnType<typeof createAdminClient>;
/** 두 저장소(R2 = 지금, Supabase = 옛 파일)에서 같은 경로들을 지운다. R2 쪽 개수를 돌려준다. */
async function removeEverywhere(admin: Admin, paths: string[]): Promise<number> {
  const n = await removeFiles(userStorageClient, BUCKET, paths);
  await removeFiles(admin, BUCKET, paths);
  return n;
}
/** 폴더를 두 저장소에서 통째로 지운다. */
async function removeFolderEverywhere(admin: Admin, dir: string): Promise<number> {
  const n = await removeFiles(userStorageClient, BUCKET, await listFilesDeep(userStorageClient, BUCKET, dir));
  await removeFiles(admin, BUCKET, await listFilesDeep(admin, BUCKET, dir));
  return n;
}

// 업로드한 소스 폴더는 행이 생기기 전에 클라이언트가 만든 UUID 아래로 올라간다
// (`{uid}/{업로드UUID}/…`). 그 UUID는 DB가 발급하는 행 id와 다르므로 `{uid}/{id}`
// BFS로는 절대 안 걸리고, 프로젝트를 지워도 소스 폴더만 영원히 남았다(감사 M16).
// 남은 단서가 demo_url의 프리뷰 경로뿐이라 거기서 폴더를 되찾는다.
//
// demo_url도 유저가 쓰는 컬럼이다 — 세그먼트를 디코드 전에 쪼개고(%2F로 경로를
// 늘리는 수를 막는다) 첫 세그먼트가 소유자 uid일 때만 통과시킨다.
function uploadFolderFromPreviewUrl(
  demoUrl: string | null | undefined,
  ownerId: string,
): string | null {
  if (!demoUrl || !demoUrl.startsWith(PREVIEW_PREFIX)) return null;
  const segs = demoUrl.slice(PREVIEW_PREFIX.length).split("?")[0].split("/");
  if (segs.length < 3) return null;
  const decode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };
  const owner = decode(segs[0]);
  const folder = decode(segs[1]);
  if (owner !== ownerId) return null;
  if (!folder || folder.includes("/") || folder.includes("..")) return null;
  return `${owner}/${folder}`;
}


export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { t } = await getT();
  try {
    const { id } = await params;

    const auth = await requireUser(t.api.loginRequired);
    if (auth instanceof NextResponse) return auth;
    const { user, supabase } = auth;

    const { data: project, error: selErr } = await supabase
      .from("projects")
      .select("id, user_id, video_url, thumbnail, demo_url")
      .eq("id", id)
      .single();
    if (selErr || !project) {
      return apiError({ status: 404, message: t.api.projectNotFound, code: "NOT_FOUND" });
    }
    if (project.user_id !== user.id) {
      return apiError({ status: 403, message: t.api.projectForbidden, code: "FORBIDDEN" });
    }

    const admin = createAdminClient();

    // 폴더 BFS·페이지 넘김(1000개 초과 폴더)은 listFilesDeep.
    // Project folder + the uploaded-source folder (different id — see
    // uploadFolderFromPreviewUrl) + standalone video/thumbnail, in R2 and legacy Supabase.
    let sbRemoved = await removeFolderEverywhere(admin, `${project.user_id}/${id}`);
    const uploadDir = uploadFolderFromPreviewUrl(project.demo_url, project.user_id);
    if (uploadDir && uploadDir !== `${project.user_id}/${id}`) {
      sbRemoved += await removeFolderEverywhere(admin, uploadDir);
    }
    const paths: string[] = [];
    // video_url and thumbnail are user-writable columns: a user could point them at
    // another account's storage object and have this service-role remove wipe it.
    // Ownership of the project is verified above, so a legitimate own-asset path is
    // always under the owner's `${user_id}/` prefix — reject anything cross-tenant.
    // (The folder BFS above is already safe: it is rooted at that same prefix.)
    const ownerPrefix = `${project.user_id}/`;
    const videoPath = storagePathFromPublicUrl(project.video_url);
    if (videoPath && videoPath.startsWith(ownerPrefix)) paths.push(videoPath);
    const thumbPath = storagePathFromPublicUrl(project.thumbnail);
    if (thumbPath && thumbPath.startsWith(ownerPrefix)) paths.push(thumbPath);

    sbRemoved += await removeEverywhere(admin, paths);

    // R2: demo mp4 + poster.
    let r2Removed = 0;
    if (isR2Configured()) {
      r2Removed = await deleteR2Prefix(`${project.user_id}/${id}/`);
    }

    // Finally delete the row itself — server-side, in this same request, so the whole
    // delete (storage + row) is ONE call the client fires with keepalive. Even if the
    // user closes the tab the instant the row disappears from the list, the server
    // still runs to here; there is no client-side second request left to be cut off.
    // Ownership was verified above; the RLS-scoped user client is a second guard.
    const { error: rowErr } = await supabase.from("projects").delete().eq("id", id);
    if (rowErr) throw new Error(`row delete failed: ${rowErr.message}`);

    logger.info("project deleted", { projectId: id, sbRemoved, r2Removed });
    return NextResponse.json({ ok: true, sbRemoved, r2Removed, rowDeleted: true });
  } catch (err) {
    return apiError({
      status: 500,
      message: t.api.retryLater,
      code: "INTERNAL",
      cause: err,
    });
  }
}

// 수정 저장 후 교체·제거된 이전 업로드 영상/썸네일과 옛 작품 폴더를 청소한다. 예전엔 클라이언트가
// storage.remove()를 직접 불렀는데 스토리지 RLS가 조용히 막아(+catch{}) 파일이
// 계속 쌓였다 — 삭제 라우트가 서버로 옮겨진 것과 같은 이유(감사 #18).
//
// 클라이언트가 보내는 "이전 URL"은 신뢰하지 않는다. 두 겹으로 막는다:
//   ① 소유자 프리픽스(`{uid}/`) 밖의 경로는 버린다 — 남의 URL을 넣어 서비스롤로
//      남의 파일을 지우게 하는 크로스테넌트 삭제(선행 blocker와 같은 모양) 차단.
//   ② 업데이트가 끝난 행을 다시 읽어, 지금도 쓰이는 경로면 버린다 — 사용 중인
//      자기 파일을 지워 자기 프로젝트를 깨뜨리는 것도 막는다.
// 옛 작품 폴더(prevDemoUrl)는 폴더째 지우므로 한 겹 더: 이름이 UUID(업로드 폴더·행
// 폴더만 그렇다 — thumbnails/·videos/는 못 고른다)이고, 주인의 어느 작품도 그 폴더를
// 쓰지 않을 때만. 행 폴더(`{uid}/{id}`, Connect 업로드)면 _media·_upload와 지금 쓰는
// 영상·썸네일은 남긴다(인제스트가 파일→URL로 바꿀 때와 같은 청소).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { t } = await getT();
  try {
    const { id } = await params;

    const auth = await requireUser(t.api.loginRequired);
    if (auth instanceof NextResponse) return auth;
    const { user, supabase } = auth;

    const body = await readJsonOr(req, MAX_SMALL_JSON_BYTES, null);

    if (body === BODY_TOO_LARGE) return bodyTooLarge();
    const candidates = [body?.prevVideoUrl, body?.prevThumbnail]
      .filter((u): u is string => typeof u === "string" && u.length > 0);
    const prevDemoUrl = typeof body?.prevDemoUrl === "string" ? body.prevDemoUrl : null;
    if (!candidates.length && !prevDemoUrl) return NextResponse.json({ ok: true, removed: 0 });

    const { data: project, error: selErr } = await supabase
      .from("projects")
      .select("id, user_id, video_url, thumbnail, demo_url, demo_video_url")
      .eq("id", id)
      .single();
    if (selErr || !project) {
      return apiError({ status: 404, message: t.api.projectNotFound, code: "NOT_FOUND" });
    }
    if (project.user_id !== user.id) {
      return apiError({ status: 403, message: t.api.projectForbidden, code: "FORBIDDEN" });
    }

    const ownerPrefix = `${user.id}/`;
    const inUse = new Set(
      [project.video_url, project.thumbnail]
        .map(storagePathFromPublicUrl)
        .filter((p): p is string => !!p),
    );
    const stale = [...new Set(candidates.map(storagePathFromPublicUrl))]
      .filter((p): p is string => !!p && p.startsWith(ownerPrefix) && !inUse.has(p));

    const oldDir = uploadFolderFromPreviewUrl(prevDemoUrl, user.id);
    const oldFolder = oldDir?.slice(ownerPrefix.length) ?? null;
    let folderGone = false;
    if (oldDir && oldFolder && UUID_RE.test(oldFolder)
      && oldDir !== uploadFolderFromPreviewUrl(project.demo_url, user.id)) {
      // 주인의 다른 작품이 이 폴더를 행 폴더로 쓰거나 demo_url로 가리키면 손대지 않는다.
      const [{ data: asRow, error: e1 }, { data: asUrl, error: e2 }] = await Promise.all([
        supabase.from("projects").select("id").eq("user_id", user.id).eq("id", oldFolder).neq("id", id).limit(1),
        supabase.from("projects").select("id").eq("user_id", user.id)
          .like("demo_url", `${PREVIEW_PREFIX}${oldDir}/%`).limit(1),
      ]);
      if (e1 || e2) throw new Error(`folder use check failed: ${(e1 ?? e2)!.message}`);
      folderGone = !asRow?.length && !asUrl?.length;
    }
    if (!stale.length && !folderGone) return NextResponse.json({ ok: true, removed: 0 });

    const admin = createAdminClient();
    let removed = 0;
    if (stale.length) {
      removed += await removeEverywhere(admin, stale);
    }
    if (folderGone && oldFolder === id) {
      const keep = new Set(
        [...inUse, storagePathFromPublicUrl(project.demo_video_url)].filter((p): p is string => !!p),
      );
      removed += await removeStaleFiles(withUserStorage(admin), user.id, id, keep);
      await removeStaleFiles(admin, user.id, id, keep);
    } else if (folderGone) {
      removed += await removeFolderEverywhere(admin, oldDir!);
    }

    logger.info("swapped assets purged", { projectId: id, removed, folder: folderGone });
    return NextResponse.json({ ok: true, removed });
  } catch (err) {
    return apiError({
      status: 500,
      message: t.api.retryLater,
      code: "INTERNAL",
      cause: err,
    });
  }
}
