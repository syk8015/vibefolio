import type { DemoSource } from "./demoSource";

// The job payload the recording worker consumes (projects.demo_source_type/value).
export type BuildPayload = {
  projectId: string;
  sourceType: "github" | "zip" | "live_url";
  sourceValue: string;
};

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
    // '..'·'.'·빈 칸·인코딩된 점 세그먼트는 거절 — 첫 칸만 보던 주인 확인을 `{내uid}/../{남uid}`로 비켜 갔다
    // (2026-11-03, 5단계 낮음 D1). 워커도 주소를 정규화해 다시 막지만 서버에서 먼저 끊는다.
    const segs = prefix.split("/");
    if (segs[0] !== ownerId || segs.some((x) => x === "" || x === "." || x === ".." || /%2e|%2f|%5c|\\/i.test(x))) {
      throw new DemoSourceError("preview source does not belong to the project owner");
    }
    // Runnable-code zips (2026-08-20 입구 완화): the anchor demo_url points at a
    // non-HTML file (package.json / *.py) because the bundle has no web page to
    // serve — nothing to record statically, so it always goes to the E2B build,
    // where the worker's JS/Python/terminal detection chain takes over.
    const anchorFile = source.value.split("/").pop() ?? "";
    if (!/\.html?$/i.test(anchorFile)) {
      return { projectId, sourceType: "zip", sourceValue: prefix };
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
