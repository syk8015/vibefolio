import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { requireUser } from "@/lib/routeAuth";
import { getT } from "@/lib/i18n/server";
import { logger } from "@/lib/logger";
import { isR2Configured, deleteR2Prefix } from "@/lib/r2";

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
const PUBLIC_OBJECT_PREFIX = "/storage/v1/object/public/project-files/";
const PREVIEW_PREFIX = "/api/preview/";

function storagePathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const i = url.indexOf(PUBLIC_OBJECT_PREFIX);
  if (i === -1) return null;
  const path = url.slice(i + PUBLIC_OBJECT_PREFIX.length);
  return path ? decodeURIComponent(path) : null;
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

    // list는 한 겹만 보므로 BFS. 디렉터리 플레이스홀더는 id === null로 돌아온다.
    const listFolderFiles = async (root: string): Promise<string[]> => {
      const files: string[] = [];
      const queue = [root];
      while (queue.length) {
        const dir = queue.shift()!;
        const { data } = await admin.storage.from(BUCKET).list(dir, { limit: 1000 });
        for (const entry of data ?? []) {
          const full = `${dir}/${entry.name}`;
          if (entry.id === null) queue.push(full);
          else files.push(full);
        }
      }
      return files;
    };

    // Supabase: project folder + the uploaded-source folder (different id — see
    // uploadFolderFromPreviewUrl) + standalone video/thumbnail.
    const paths: string[] = await listFolderFiles(`${project.user_id}/${id}`);
    const uploadDir = uploadFolderFromPreviewUrl(project.demo_url, project.user_id);
    if (uploadDir && uploadDir !== `${project.user_id}/${id}`) {
      paths.push(...(await listFolderFiles(uploadDir)));
    }
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

    let sbRemoved = 0;
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      const { error } = await admin.storage.from(BUCKET).remove(chunk);
      if (error) throw new Error(`storage remove failed: ${error.message}`);
      sbRemoved += chunk.length;
    }

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

// 수정 저장 후 교체·제거된 이전 업로드 영상/썸네일을 청소한다. 예전엔 클라이언트가
// storage.remove()를 직접 불렀는데 스토리지 RLS가 조용히 막아(+catch{}) 파일이
// 계속 쌓였다 — 삭제 라우트가 서버로 옮겨진 것과 같은 이유(감사 #18).
//
// 클라이언트가 보내는 "이전 URL"은 신뢰하지 않는다. 두 겹으로 막는다:
//   ① 소유자 프리픽스(`{uid}/`) 밖의 경로는 버린다 — 남의 URL을 넣어 서비스롤로
//      남의 파일을 지우게 하는 크로스테넌트 삭제(선행 blocker와 같은 모양) 차단.
//   ② 업데이트가 끝난 행을 다시 읽어, 지금도 쓰이는 경로면 버린다 — 사용 중인
//      자기 파일을 지워 자기 프로젝트를 깨뜨리는 것도 막는다.
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

    const body = await req.json().catch(() => null);
    const candidates = [body?.prevVideoUrl, body?.prevThumbnail]
      .filter((u): u is string => typeof u === "string" && u.length > 0);
    if (!candidates.length) return NextResponse.json({ ok: true, removed: 0 });

    const { data: project, error: selErr } = await supabase
      .from("projects")
      .select("id, user_id, video_url, thumbnail")
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
    if (!stale.length) return NextResponse.json({ ok: true, removed: 0 });

    const admin = createAdminClient();
    const { error } = await admin.storage.from(BUCKET).remove(stale);
    if (error) throw new Error(`storage remove failed: ${error.message}`);

    logger.info("swapped assets purged", { projectId: id, removed: stale.length });
    return NextResponse.json({ ok: true, removed: stale.length });
  } catch (err) {
    return apiError({
      status: 500,
      message: t.api.retryLater,
      code: "INTERNAL",
      cause: err,
    });
  }
}
