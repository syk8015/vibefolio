import { NextRequest, NextResponse } from "next/server";
import { requireWorker } from "@/lib/workerAuth";
import { apiError } from "@/lib/apiError";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { isR2Configured, presignR2Put, pruneR2PrefixExcept } from "@/lib/r2";
import { jobOwner } from "@/lib/workerOps";

// Storage for the recorder, without giving it storage credentials.
//
// The Mac has neither the R2 write keys nor the service-role key any more, so it
// cannot address the bucket itself. It asks here for a SHORT-LIVED, SINGLE-KEY
// signed URL and streams the bytes straight to the bucket (Vercel caps request
// bodies at 4.5MB — a take is tens of MB, so the bytes must not pass through this
// function).
//
// The security win is not just "fewer secrets": the object KEY is now computed
// server-side from the project's real owner, so a stolen worker secret can only
// ever write under {owner}/{projectId}/ — the F2/F5 owner-prefix invariant is
// enforced by the party that knows the answer instead of by the caller.
export const dynamic = "force-dynamic";

const DEMO_BUCKET = "project-files";
// A take is uploaded right after it finishes; 15 min covers a slow home uplink
// without leaving a usable URL lying around.
const UPLOAD_TTL_S = 900;
const DOWNLOAD_TTL_S = 1800;

type SignedTarget = { key: string; url: string; headers: Record<string, string>; publicUrl: string };

async function signSupabaseUpload(key: string, contentType: string): Promise<SignedTarget> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(DEMO_BUCKET)
    .createSignedUploadUrl(key, { upsert: true });
  if (error || !data) throw new Error(`signed upload url failed: ${error?.message ?? "no data"}`);
  const publicUrl = admin.storage.from(DEMO_BUCKET).getPublicUrl(key).data.publicUrl;
  // x-upsert must be echoed on the PUT for the upsert to actually apply.
  return { key, url: data.signedUrl, headers: { "content-type": contentType, "x-upsert": "true" }, publicUrl };
}

async function signUpload(key: string, contentType: string): Promise<SignedTarget> {
  if (isR2Configured()) {
    const { url, publicUrl, headers } = await presignR2Put(key, contentType, UPLOAD_TTL_S);
    return { key, url, headers, publicUrl };
  }
  return signSupabaseUpload(key, contentType);
}

// Recursive walk of a storage prefix. Supabase returns directory placeholders
// with id === null.
async function listRecursive(prefix: string): Promise<string[]> {
  const admin = createAdminClient();
  const out: string[] = [];
  const queue: string[] = [prefix];
  while (queue.length) {
    const dir = queue.shift()!;
    const { data, error } = await admin.storage.from(DEMO_BUCKET).list(dir, { limit: 1000 });
    if (error) throw new Error(`storage list failed at ${dir}: ${error.message}`);
    for (const entry of data ?? []) {
      const full = `${dir}/${entry.name}`;
      if (entry.id === null) queue.push(full);
      else out.push(full);
    }
  }
  return out;
}

export async function POST(req: NextRequest) {
  const denied = requireWorker(req);
  if (denied) return denied;
  try {
    const body = await req.json().catch(() => ({}));
    const op = body?.op;

    // Promo clips live outside the project tree (promo/{clipId}/) and own no user
    // data, so they take the same signing path with their own prefix.
    if (op === "sign-promo-upload") {
      const clipId = body?.clipId;
      if (typeof clipId !== "string" || !/^[0-9a-zA-Z_-]{1,64}$/.test(clipId)) {
        return apiError({ status: 400, message: "bad clipId", code: "BAD_REQUEST" });
      }
      if (!isR2Configured()) {
        return apiError({ status: 503, message: "R2 not configured", code: "R2_UNCONFIGURED" });
      }
      const ts = Date.now();
      const video = await signUpload(`promo/${clipId}/clip-${ts}.mp4`, "video/mp4");
      const poster = body?.withPoster === false
        ? null
        : await signUpload(`promo/${clipId}/poster-${ts}.jpg`, "image/jpeg");
      return NextResponse.json({ ok: true, backend: "r2", ts, video, poster });
    }

    const projectId = body?.projectId;
    if (typeof projectId !== "string" || !projectId) {
      return apiError({ status: 400, message: "projectId required", code: "BAD_REQUEST" });
    }

    // Dry runs (manual-*) park under _test/ and never touch a project row — this
    // is how the operator shoots fixtures without inventing a fake project.
    const isDryRun = projectId.startsWith("manual-");
    let prefix: string;
    if (isDryRun) {
      if (projectId.includes("/") || projectId.includes("..")) {
        return apiError({ status: 400, message: "bad projectId", code: "BAD_REQUEST" });
      }
      prefix = `_test/${projectId}/`;
    } else {
      const ownerId = await jobOwner(projectId);
      if (!ownerId) return apiError({ status: 404, message: "job not found", code: "NOT_FOUND" });
      prefix = `${ownerId}/${projectId}/`;
    }

    switch (op) {
      case "sign-upload": {
        // Key naming must stay byte-identical to the pre-relay worker:
        //  - R2 (live): versioned demo-{ts}.mp4 / poster-{ts}.jpg → immutable URLs
        //  - Supabase fallback: fixed demo.mp4 / poster.jpg + upsert (no orphans),
        //    EXCEPT a quarantined take, which must be versioned so it cannot
        //    overwrite the good demo that is currently live.
        // posterFromDemoUrl() derives the poster from the video URL, so the two
        // must share the timestamp.
        const quarantine = body?.quarantine === true;
        const versioned = isR2Configured() || quarantine;
        const ts = Date.now();
        const videoKey = versioned ? `${prefix}demo-${ts}.mp4` : `${prefix}demo.mp4`;
        const posterKey = versioned ? `${prefix}poster-${ts}.jpg` : `${prefix}poster.jpg`;
        const video = await signUpload(videoKey, "video/mp4");
        const poster = body?.withPoster === false ? null : await signUpload(posterKey, "image/jpeg");
        return NextResponse.json({
          ok: true,
          backend: isR2Configured() ? "r2" : "supabase",
          prefix, ts, video, poster,
        });
      }

      case "prune": {
        // Drop every older object under the project's prefix, keeping the take we
        // just published. NEVER called for a quarantined take: the project's
        // previous GOOD take may still be live at this prefix.
        const keepTs = body?.keepTs;
        if (typeof keepTs !== "string" && typeof keepTs !== "number") {
          return apiError({ status: 400, message: "keepTs required", code: "BAD_REQUEST" });
        }
        if (!isR2Configured()) return NextResponse.json({ ok: true, skipped: "r2-unconfigured" });
        try {
          await pruneR2PrefixExcept(prefix, String(keepTs));
        } catch (err) {
          // Non-fatal, exactly as before: the film is already published.
          logger.error("worker: R2 prune failed (non-fatal)", { error: err, projectId });
        }
        return NextResponse.json({ ok: true });
      }

      case "source-list": {
        // Signed reads of an uploaded zip source, for the E2B build. The prefix is
        // taken from the PROJECT ROW, never from the request — this is what used
        // to be a client-side owner assert in local-runner/build.ts, and it now
        // cannot be argued with by a caller holding the worker secret.
        if (isDryRun) {
          return apiError({ status: 400, message: "no source for dry runs", code: "BAD_REQUEST" });
        }
        const admin = createAdminClient();
        const { data: row, error } = await admin
          .from("projects")
          .select("demo_source_type, demo_source_value")
          .eq("id", projectId)
          .single();
        if (error || !row) {
          return apiError({ status: 404, message: "job not found", code: "NOT_FOUND" });
        }
        if (row.demo_source_type !== "zip") {
          return apiError({ status: 400, message: "source is not a zip upload", code: "BAD_REQUEST" });
        }
        const sourceValue: string = row.demo_source_value ?? "";
        // Final defence before a service-role read: the prefix must live under the
        // owner and must not traverse. An empty value would open the whole bucket.
        const firstSeg = sourceValue.split("/")[0];
        const ownerId = prefix.split("/")[0];
        if (!sourceValue || sourceValue.includes("..") || firstSeg !== ownerId) {
          return apiError({
            status: 403, message: "source prefix not authorized", code: "FORBIDDEN",
            context: { projectId }, log: true,
          });
        }
        const paths = await listRecursive(sourceValue);
        if (!paths.length) {
          return NextResponse.json({ ok: true, prefix: sourceValue, files: [] });
        }
        const { data: signed, error: signErr } = await admin.storage
          .from(DEMO_BUCKET)
          .createSignedUrls(paths, DOWNLOAD_TTL_S);
        if (signErr || !signed) {
          return apiError({
            status: 500, message: "signing source urls failed", code: "INTERNAL", cause: signErr,
          });
        }
        const files = signed
          .filter((s) => s.signedUrl && s.path)
          .map((s) => ({ path: s.path as string, url: s.signedUrl }));
        return NextResponse.json({ ok: true, prefix: sourceValue, files });
      }

      default:
        return apiError({ status: 400, message: "unknown op", code: "BAD_REQUEST" });
    }
  } catch (err) {
    return apiError({ status: 500, message: "asset op failed", code: "INTERNAL", cause: err });
  }
}
