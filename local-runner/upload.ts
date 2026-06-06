// Upload the finished demo.mp4 to Supabase Storage and mark the project done.
// Cloned from src/trigger/build-and-record.ts:600-648 (plan §5.11), with one
// difference: local Node (25) HAS native WebSocket, so the supabase-js Realtime
// client initializes fine WITHOUT injecting the `ws` transport that the Node-21
// Trigger.dev worker needed. service-role key bypasses RLS for the write.
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { DEMO_BUCKET } from "./config";

export type UploadResult = { storagePath: string; publicUrl: string };

// manual-* projectIds are dry-runs: upload under _test/ and DON'T touch the DB
// (same convention as the E2B path's `isRealProject` guard).
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

  const storagePath = isRealProject
    ? `${userId}/${projectId}/demo.mp4`
    : `_test/${projectId}/demo.mp4`;

  const { error: uploadErr } = await supabase.storage
    .from(DEMO_BUCKET)
    .upload(storagePath, buf, { contentType: "video/mp4", upsert: true });
  if (uploadErr) throw new Error(`storage upload failed: ${uploadErr.message}`);

  const {
    data: { publicUrl },
  } = supabase.storage.from(DEMO_BUCKET).getPublicUrl(storagePath);

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
