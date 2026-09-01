// Upload the finished demo.mp4 (+ poster) and mark the project done.
//
// The Mac holds no storage credentials any more (see local-runner/api.ts): it asks
// the server for a short-lived, single-key signed URL and streams the bytes
// straight to the bucket. Key naming, the R2-vs-Supabase choice and the prune are
// all decided server-side (app/api/worker/assets) — this file only moves bytes.
//
// manual-* projectIds are dry-runs: they upload under _test/ and DON'T touch a
// project row.
import { readFile } from "node:fs/promises";
import { apiGet, apiPost, apiPostQuiet, putSigned, type SignedTarget } from "./api";

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

type SignResponse = {
  backend: "r2" | "supabase";
  ts: number;
  prefix: string;
  video: SignedTarget;
  poster: SignedTarget | null;
};

// The @handle burned into the endcap (profiles.username via the project's owner).
// null for dry-runs / any lookup failure — the caller falls back to a placeholder,
// and an endcap without a handle beats a failed take.
export async function fetchUsername(projectId: string): Promise<string | null> {
  if (projectId.startsWith("manual-")) return null;
  try {
    const res = await apiGet<{ handle: string | null }>(
      `/api/worker/jobs/${encodeURIComponent(projectId)}`,
    );
    return res.handle ?? null;
  } catch {
    return null;
  }
}

// The poster is optional decoration. Its upload is non-fatal on BOTH backends:
// the video is already in the bucket by this point, and losing a whole take over
// a thumbnail would be absurd. (The pre-relay Supabase path already tolerated
// this; the R2 path threw. This is the deliberate direction to unify on.)
async function putPoster(
  target: SignedTarget | null,
  buf: Buffer | null,
): Promise<{ key: string | null; url: string | null }> {
  if (!target || !buf) return { key: null, url: null };
  try {
    await putSigned(target, buf);
    return { key: target.key, url: target.publicUrl };
  } catch (err) {
    console.error(`[upload] poster upload failed (non-fatal): ${err instanceof Error ? err.message : err}`);
    return { key: null, url: null };
  }
}

// Upload a moderation-flagged take WITHOUT touching the DB pointer (that's the
// worker's job: held + demo_moderation row). Keys use the NORMAL versioned naming
// on purpose: on admin approve the quarantined URL becomes demo_video_url as-is,
// and posterFromDemoUrl's `/demo(-\d+)?\.mp4` derivation must keep working.
// "Quarantine" is purely the absence of the DB link.
// Unlike uploadAndMarkDone there is NO prune: the project's previous GOOD take may
// still be live at this prefix.
export async function uploadQuarantined(
  projectId: string,
  videoPath: string,
  posterPath?: string,
): Promise<QuarantineUpload> {
  const buf = await readFile(videoPath);
  const posterBuf = posterPath ? await readFile(posterPath) : null;
  const sign = await apiPost<SignResponse>("/api/worker/assets", {
    op: "sign-upload",
    projectId,
    quarantine: true,
    withPoster: !!posterBuf,
  });
  await putSigned(sign.video, buf);
  const poster = await putPoster(sign.poster, posterBuf);
  return {
    videoUrl: sign.video.publicUrl,
    posterUrl: poster.url,
    videoKey: sign.video.key,
    posterKey: poster.key,
    storage: sign.backend,
  };
}

export async function uploadAndMarkDone(
  projectId: string,
  videoPath: string,
  posterPath?: string,
): Promise<UploadResult> {
  const buf = await readFile(videoPath);
  const posterBuf = posterPath ? await readFile(posterPath) : null;
  const isRealProject = !projectId.startsWith("manual-");

  const sign = await apiPost<SignResponse>("/api/worker/assets", {
    op: "sign-upload",
    projectId,
    withPoster: !!posterBuf,
  });
  await putSigned(sign.video, buf);
  const poster = await putPoster(sign.poster, posterBuf);

  // Drop older takes at this prefix, keeping the one just published. Non-fatal:
  // stale objects cost a little storage, a thrown prune would strand a good film.
  if (sign.backend === "r2") {
    await apiPostQuiet("/api/worker/assets", { op: "prune", projectId, keepTs: sign.ts });
  }

  if (isRealProject) {
    // Server-side this retries a transient DB blip before giving up — the video is
    // already uploaded and must not be stranded as "failed" (audit C-D1).
    await apiPost(`/api/worker/jobs/${encodeURIComponent(projectId)}`, {
      op: "done",
      videoUrl: sign.video.publicUrl,
    });
  }

  return { storagePath: sign.video.key, publicUrl: sign.video.publicUrl, posterUrl: poster.url ?? undefined };
}
