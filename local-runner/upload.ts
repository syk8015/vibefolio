// Upload the finished demo.mp4 to storage and mark the project done.
//
// Storage backend: Cloudflare R2 when configured (versioned key demo-{ts}.mp4 so
// each re-record gets a fresh immutable URL + free egress for og:video unfurls),
// otherwise a Supabase Storage fallback on the fixed demo.mp4 key (byte-identical
// to the pre-R2 behaviour) so the pipeline keeps working before R2 is provisioned.
//
// service-role key bypasses RLS for the DB write. manual-* projectIds are dry-runs:
// upload under _test/ and DON'T touch the DB.
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { DEMO_BUCKET } from "./config";
import { isR2Configured, uploadToR2, pruneR2PrefixExcept } from "../lib/r2";

export type UploadResult = { storagePath: string; publicUrl: string };

export async function uploadAndMarkDone(
  projectId: string,
  videoPath: string,
): Promise<UploadResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (.env.local)");
  }
  const supabase = createClient(url, serviceKey);
  const buf = await readFile(videoPath);
  const isRealProject = !projectId.startsWith("manual-");

  let userId: string | null = null;
  if (isRealProject) {
    const { data, error } = await supabase
      .from("projects")
      .select("user_id")
      .eq("id", projectId)
      .single();
    if (error) throw new Error(`projects select failed: ${error.message}`);
    userId = data.user_id;
  }

  const prefix = isRealProject ? `${userId}/${projectId}/` : `_test/${projectId}/`;

  let storagePath: string;
  let publicUrl: string;
  if (isR2Configured()) {
    // Versioned key → immutable URL per re-record; prune older versions after.
    const ts = Date.now();
    storagePath = `${prefix}demo-${ts}.mp4`;
    publicUrl = await uploadToR2(storagePath, buf, "video/mp4");
    await pruneR2PrefixExcept(prefix, String(ts)).catch((e) =>
      console.error("[upload] R2 prune failed (non-fatal):", (e as Error).message),
    );
  } else {
    // Supabase fallback: fixed key + upsert (no orphans), same as before R2.
    storagePath = `${prefix}demo.mp4`;
    const { error: uploadErr } = await supabase.storage
      .from(DEMO_BUCKET)
      .upload(storagePath, buf, { contentType: "video/mp4", upsert: true });
    if (uploadErr) throw new Error(`storage upload failed: ${uploadErr.message}`);
    publicUrl = supabase.storage.from(DEMO_BUCKET).getPublicUrl(storagePath).data.publicUrl;
  }

  if (isRealProject) {
    const { error: updErr } = await supabase
      .from("projects")
      .update({
        demo_video_url: publicUrl,
        demo_build_status: "done",
        demo_generated_at: new Date().toISOString(),
      })
      .eq("id", projectId);
    if (updErr) throw new Error(`projects update failed: ${updErr.message}`);
  }

  return { storagePath, publicUrl };
}
