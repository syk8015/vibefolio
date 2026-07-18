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

// A flagged take's artifacts: uploaded (so the admin can review in the browser)
// but NEVER written to projects.demo_video_url — every public surface reads only
// that column, so an unlinked object at an unguessable key stays effectively
// private. Keys ride along so the reject path can delete the exact objects.
export type QuarantineUpload = {
  videoUrl: string;
  posterUrl: string | null;
  videoKey: string;
  posterKey: string | null;
  storage: "r2" | "supabase";
};

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

// Upload a moderation-flagged take WITHOUT touching the DB pointer (that's the
// worker's job: held + demo_moderation row). Keys use the NORMAL versioned
// naming (demo-{ts}.mp4 / poster-{ts}.jpg) on purpose: on admin approve the
// quarantined URL becomes demo_video_url as-is, and posterFromDemo[Url]'s
// `/demo(-\d+)?\.mp4` derivation must keep working for watch/og/email posters.
// "Quarantine" is purely the absence of the DB link — the key is unguessable
// (ms timestamp) and nothing public ever lists the bucket.
// Unlike uploadAndMarkDone there is NO R2 prune: the project's previous GOOD
// take may still be live at this prefix — pruning here would kill the video
// users are watching. (The next published take's prune sweeps stale ones.)
export async function uploadQuarantined(
  projectId: string,
  videoPath: string,
  posterPath?: string,
): Promise<QuarantineUpload> {
  const supabase = serviceClient();
  const buf = await readFile(videoPath);
  const posterBuf = posterPath ? await readFile(posterPath) : null;
  const { data, error } = await supabase
    .from("projects")
    .select("user_id")
    .eq("id", projectId)
    .single();
  if (error) throw new Error(`projects select failed: ${error.message}`);
  const prefix = `${data.user_id}/${projectId}/`;
  const ts = Date.now();
  const videoKey = `${prefix}demo-${ts}.mp4`;
  const posterKeyWanted = `${prefix}poster-${ts}.jpg`;

  if (isR2Configured()) {
    const videoUrl = await uploadToR2(videoKey, buf, "video/mp4");
    let posterKey: string | null = null;
    let posterUrl: string | null = null;
    if (posterBuf) {
      posterKey = posterKeyWanted;
      posterUrl = await uploadToR2(posterKey, posterBuf, "image/jpeg");
    }
    return { videoUrl, posterUrl, videoKey, posterKey, storage: "r2" };
  }

  // Supabase fallback: versioned keys here too (the fixed demo.mp4 key would
  // overwrite the live good demo in place). Rejected keys are deleted by the
  // admin route; approved ones become the live URL.
  const { error: uploadErr } = await supabase.storage
    .from(DEMO_BUCKET)
    .upload(videoKey, buf, { contentType: "video/mp4", upsert: true });
  if (uploadErr) throw new Error(`quarantine upload failed: ${uploadErr.message}`);
  const videoUrl = supabase.storage.from(DEMO_BUCKET).getPublicUrl(videoKey).data.publicUrl;
  let posterKey: string | null = null;
  let posterUrl: string | null = null;
  if (posterBuf) {
    const { error: pErr } = await supabase.storage
      .from(DEMO_BUCKET)
      .upload(posterKeyWanted, posterBuf, { contentType: "image/jpeg", upsert: true });
    if (!pErr) {
      posterKey = posterKeyWanted;
      posterUrl = supabase.storage.from(DEMO_BUCKET).getPublicUrl(posterKeyWanted).data.publicUrl;
    }
  }
  return { videoUrl, posterUrl, videoKey, posterKey, storage: "supabase" };
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
    // The video is already uploaded — a transient DB blip here must not strand a
    // finished film as "failed" (audit C-D1). Retry briefly before giving up.
    let updErr: { message: string } | null = null;
    for (let i = 0; i < 3; i++) {
      ({ error: updErr } = await supabase
        .from("projects")
        .update({
          demo_video_url: publicUrl,
          demo_build_status: "done",
          demo_generated_at: new Date().toISOString(),
        })
        .eq("id", projectId));
      if (!updErr) break;
      console.error(`[upload] projects update failed (try ${i + 1}/3): ${updErr.message}`);
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
    if (updErr) {
      throw new Error(`projects update failed after retries: ${updErr.message} (video already at ${publicUrl})`);
    }
  }

  return { storagePath, publicUrl, posterUrl };
}
