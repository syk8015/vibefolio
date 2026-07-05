// Cloudflare R2 (S3-compatible) storage for demo videos + posters.
//
// Why R2 and not Supabase Storage for demos: once a demo mp4 unfurls as og:video,
// a single Discord/Slack unfurl can pull tens of GB of egress. R2 egress is free;
// Supabase's is metered. Everything else (uploads, avatars) stays on Supabase.
//
// Shared by THREE runtimes, so it carries zero framework deps and reads env lazily
// at call time (a missing config never throws at import — callers gate on
// isR2Configured()):
//   - Next server / API routes         → import "@/lib/r2"
//   - Trigger.dev cloud task (esbuild)  → import "../../lib/r2"
//   - local-runner worker (tsx)         → import "../lib/r2"
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

function env() {
  return {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_BUCKET,
    publicBase: process.env.R2_PUBLIC_URL_BASE,
  };
}

// True only when every R2 var is present. Callers fall back to Supabase Storage
// when this is false, so the pipeline keeps working before R2 is provisioned.
export function isR2Configured(): boolean {
  const e = env();
  return Boolean(
    e.accountId && e.accessKeyId && e.secretAccessKey && e.bucket && e.publicBase,
  );
}

let _client: S3Client | null = null;
function client(): S3Client {
  if (_client) return _client;
  const e = env();
  if (!isR2Configured()) {
    throw new Error(
      "R2 is not configured (need R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL_BASE)",
    );
  }
  _client = new S3Client({
    region: "auto",
    endpoint: `https://${e.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: e.accessKeyId!,
      secretAccessKey: e.secretAccessKey!,
    },
  });
  return _client;
}

// Public URL for a stored object. R2_PUBLIC_URL_BASE is the bucket's public base
// (r2.dev subdomain or a custom domain like https://cdn.nookframe.com).
export function r2PublicUrl(key: string): string {
  const base = (env().publicBase || "").replace(/\/+$/, "");
  return `${base}/${key.replace(/^\/+/, "")}`;
}

export async function uploadToR2(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  await client().send(
    new PutObjectCommand({
      Bucket: env().bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      // Keys are versioned (demo-{ts}.mp4), hence immutable — cache hard at the edge.
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return r2PublicUrl(key);
}

// List + delete every object under a prefix. Idempotent (no-op on an empty prefix).
// Used to clean up a project's demo assets on project deletion.
export async function deleteR2Prefix(prefix: string): Promise<number> {
  const c = client();
  const bucket = env().bucket;
  let deleted = 0;
  let token: string | undefined;
  do {
    const list = await c.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    const objects = (list.Contents ?? [])
      .filter((o) => o.Key)
      .map((o) => ({ Key: o.Key! }));
    if (objects.length) {
      await c.send(
        new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects, Quiet: true } }),
      );
      deleted += objects.length;
    }
    token = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (token);
  return deleted;
}

// Prune stale objects under a prefix, keeping any key that contains keepMarker
// (the just-written timestamp). Best-effort cleanup after a fresh upload so a
// project's prefix holds only the latest demo + poster.
export async function pruneR2PrefixExcept(
  prefix: string,
  keepMarker: string,
): Promise<void> {
  const c = client();
  const bucket = env().bucket;
  let token: string | undefined;
  do {
    const list = await c.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    const objects = (list.Contents ?? [])
      .filter((o) => o.Key && !o.Key.includes(keepMarker))
      .map((o) => ({ Key: o.Key! }));
    if (objects.length) {
      await c.send(
        new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects, Quiet: true } }),
      );
    }
    token = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (token);
}
