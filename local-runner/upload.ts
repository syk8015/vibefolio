// Upload the finished demo.mp4 (+ poster) to storage and mark the project done.
//
// Storage backend: Cloudflare R2 when configured (versioned keys demo-{ts}.mp4 /
// poster-{ts}.jpg so each re-record gets a fresh immutable URL + free egress for
// og:video unfurls), otherwise a Supabase Storage fallback on the fixed keys
// (byte-identical to the pre-R2 behaviour) so the pipeline keeps working before
// R2 is provisioned.
//
// service-role key bypasses RLS for the DB write. manual-* projectIds are dry-runs:
// upload under _test/ and DON'T touch the DB.
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { DEMO_BUCKET } from "./config";
import { isR2Configured, uploadToR2, pruneR2PrefixExcept } from "../lib/r2";

export type UploadResult = { storagePath: string; publicUrl: string; posterUrl?: string };

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (.env.local)");
  }
  return createClient(url, serviceKey);
}

// The @handle burned into the endcap. profiles.username via the project's owner.
// null for dry-runs / missing config (caller falls back to a placeholder).
export async function fetchUsername(projectId: string): Promise<string | null> {
  if (projectId.startsWith("manual-")) return null;
  try {
    const supabase = serviceClient();
    const { data: proj } = await supabase
      .from("projects")
      .select("user_id")
      .eq("id", projectId)
      .single();
    if (!proj?.user_id) return null;
    const { data: prof } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", proj.user_id)
      .single();
    return prof?.username ?? null;
  } catch {
    return null;
  }
}

export async function uploadAndMarkDone(
  projectId: string,
  videoPath: string,
  posterPath?: string,
): Promise<UploadResult> {
  const supabase = serviceClient();
  const buf = await readFile(videoPath);
  const posterBuf = posterPath ? await readFile(posterPath) : null;
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
  let posterUrl: string | undefined;
  if (isR2Configured()) {
    // Versioned keys (shared ts so the prune keeps both) → immutable URLs.
    const ts = Date.now();
    storagePath = `${prefix}demo-${ts}.mp4`;
    publicUrl = await uploadToR2(storagePath, buf, "video/mp4");
    if (posterBuf) {
      posterUrl = await uploadToR2(`${prefix}poster-${ts}.jpg`, posterBuf, "image/jpeg");
    }
    await pruneR2PrefixExcept(prefix, String(ts)).catch((e) =>
      console.error("[upload] R2 prune failed (non-fatal):", (e as Error).message),
    );
  } else {
    // Supabase fallback: fixed keys + upsert (no orphans), same as before R2.
    storagePath = `${prefix}demo.mp4`;
    const { error: uploadErr } = await supabase.storage
      .from(DEMO_BUCKET)
      .upload(storagePath, buf, { contentType: "video/mp4", upsert: true });
    if (uploadErr) throw new Error(`storage upload failed: ${uploadErr.message}`);
    publicUrl = supabase.storage.from(DEMO_BUCKET).getPublicUrl(storagePath).data.publicUrl;
    if (posterBuf) {
      const posterKey = `${prefix}poster.jpg`;
      const { error: pErr } = await supabase.storage
        .from(DEMO_BUCKET)
        .upload(posterKey, posterBuf, { contentType: "image/jpeg", upsert: true });
      if (!pErr) {
        posterUrl = supabase.storage.from(DEMO_BUCKET).getPublicUrl(posterKey).data.publicUrl;
      }
    }
  }

  if (isRealProject) {
    const { error: updErr } = await supabase
      .from("projects")
      .update({
        demo_video_url: publicUrl,
        demo_poster_url: posterUrl ?? null,
        demo_build_status: "done",
        demo_generated_at: new Date().toISOString(),
      })
      .eq("id", projectId);
    if (updErr) throw new Error(`projects update failed: ${updErr.message}`);
  }

  return { storagePath, publicUrl, posterUrl };
}
