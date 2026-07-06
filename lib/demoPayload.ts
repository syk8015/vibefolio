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

// Turn a detected demo source into the job payload. Uploaded projects live at
// /api/preview/{userId}/{projectId}/index.html: if that folder has a package.json
// the job must BUILD it (zip mode, passed the storage prefix); otherwise it's a
// static site we just serve and record (live_url mode, needs an absolute URL).
// Shared by the trigger-demo route and the admin approval route so the two never
// disagree on how a source is built.
export async function resolveBuildPayload(
  client: StorageClient,
  projectId: string,
  source: DemoSource,
  origin: string,
): Promise<BuildPayload> {
  if (source.type === "live_url" && source.value.startsWith("/api/preview/")) {
    const prefix = source.value
      .replace(/^\/api\/preview\//, "")
      .replace(/\/[^/]+$/, ""); // strip filename → {userId}/{projectId}
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
