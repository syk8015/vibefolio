import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { apiError } from "@/lib/apiError";
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

function storagePathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const i = url.indexOf(PUBLIC_OBJECT_PREFIX);
  if (i === -1) return null;
  const path = url.slice(i + PUBLIC_OBJECT_PREFIX.length);
  return path ? decodeURIComponent(path) : null;
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return apiError({ status: 401, message: "로그인이 필요해요.", code: "UNAUTHORIZED" });
    }

    const { data: project, error: selErr } = await supabase
      .from("projects")
      .select("id, user_id, video_url, thumbnail")
      .eq("id", id)
      .single();
    if (selErr || !project) {
      return apiError({ status: 404, message: "프로젝트를 찾을 수 없어요.", code: "NOT_FOUND" });
    }
    if (project.user_id !== user.id) {
      return apiError({ status: 403, message: "이 프로젝트에 대한 권한이 없어요.", code: "FORBIDDEN" });
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Supabase: project folder (BFS — list is one level deep; directory
    // placeholders come back with id === null) + standalone video/thumbnail.
    const paths: string[] = [];
    const queue = [`${project.user_id}/${id}`];
    while (queue.length) {
      const dir = queue.shift()!;
      const { data } = await admin.storage.from(BUCKET).list(dir, { limit: 1000 });
      for (const entry of data ?? []) {
        const full = `${dir}/${entry.name}`;
        if (entry.id === null) queue.push(full);
        else paths.push(full);
      }
    }
    const videoPath = storagePathFromPublicUrl(project.video_url);
    if (videoPath) paths.push(videoPath);
    const thumbPath = storagePathFromPublicUrl(project.thumbnail);
    if (thumbPath) paths.push(thumbPath);

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

    logger.info("project assets purged", { projectId: id, sbRemoved, r2Removed });
    return NextResponse.json({ ok: true, sbRemoved, r2Removed });
  } catch (err) {
    return apiError({
      status: 500,
      message: "잠시 후 다시 시도해 주세요.",
      code: "INTERNAL",
      cause: err,
    });
  }
}
