import type { DemoSource } from "./demoSource";
import type { BuildPayload } from "@/src/trigger/build-and-record";

// Minimal shape both the SSR user client and the service-role admin client
// satisfy — we only ever call storage.list here.
type StorageClient = {
  storage: {
    from(bucket: string): {
      list(
        path: string,
        opts?: { limit?: number },
      ): Promise<{ data: { name: string }[] | null }>;
    };
  };
};

/** A demo source that isn't authorized for this owner (cross-tenant attempt). */
export class DemoSourceError extends Error {}

// Turn a detected demo source into the job payload. Uploaded projects live at
// /api/preview/{userId}/{projectId}/index.html: if that folder has a package.json
// the job must BUILD it (zip mode, passed the storage prefix); otherwise it's a
// static site we just serve and record (live_url mode, needs an absolute URL).
// Shared by the trigger-demo route and the admin approval route so the two never
// disagree on how a source is built.
//
// `ownerId` is the project's user_id and is the SECURITY boundary: `demo_url` is
// user-writable, so a caller could point their own project at
// /api/preview/{victim}/{pid}/... . Left unchecked, the admin route (service-role
// client) would storage-list the victim's prefix → zip-mode → the worker downloads
// another user's private upload; the self-serve route would fall through to
// live_url and film it. We assert the preview path's first segment == ownerId
// before deriving anything. (F2/F3/F5 audit — this is the app-layer gate; the SQL
// request_demo() and the worker's buildAndServe re-assert independently.)
export async function resolveBuildPayload(
  client: StorageClient,
  projectId: string,
  ownerId: string,
  source: DemoSource,
  origin: string,
): Promise<BuildPayload> {
  if (source.type === "live_url" && source.value.startsWith("/api/preview/")) {
    const prefix = source.value
      .replace(/^\/api\/preview\//, "")
      .replace(/\/[^/]+$/, ""); // strip filename → {userId}/{projectId}
    if (prefix.split("/")[0] !== ownerId) {
      throw new DemoSourceError("preview source does not belong to the project owner");
    }
    const { data: rootFiles } = await client.storage
      .from("project-files")
      .list(prefix, { limit: 1000 });
    const hasPackageJson = rootFiles?.some((f) => f.name === "package.json") ?? false;
    if (hasPackageJson) {
      return { projectId, sourceType: "zip", sourceValue: prefix };
    }
    return { projectId, sourceType: "live_url", sourceValue: `${origin}${source.value}` };
  }
  return { projectId, sourceType: source.type, sourceValue: source.value };
}
