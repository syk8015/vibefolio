import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk";
import { createClient } from "@/lib/supabase/server";
import { detectDemoSource } from "@/lib/demoSource";
import type { buildAndRecord, BuildPayload } from "@/src/trigger/build-and-record";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: project, error: selErr } = await supabase
    .from("projects")
    .select("id, user_id, demo_url")
    .eq("id", id)
    .single();
  if (selErr || !project) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (project.user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const source = detectDemoSource(project.demo_url);
  if (!source) {
    return NextResponse.json(
      { error: "unsupported source" },
      { status: 400 },
    );
  }

  // 업로드된 프로젝트(/api/preview/{userId}/{projectId}/index.html)는 package.json
  // 존재 여부로 빌드 필요 vs 정적 서빙 구분. 빌드 필요하면 zip 모드로 잡에 storage
  // prefix를 넘긴다. 잡이 직접 supabase storage에서 파일 가져와 샌드박스에서 빌드.
  let payload: BuildPayload;
  if (source.type === "live_url" && source.value.startsWith("/api/preview/")) {
    const prefix = source.value
      .replace(/^\/api\/preview\//, "")
      .replace(/\/[^/]+$/, ""); // strip filename → {userId}/{projectId}
    const { data: rootFiles } = await supabase.storage
      .from("project-files")
      .list(prefix, { limit: 1000 });
    const hasPackageJson = rootFiles?.some((f) => f.name === "package.json") ?? false;
    if (hasPackageJson) {
      payload = { projectId: id, sourceType: "zip", sourceValue: prefix };
    } else {
      payload = {
        projectId: id,
        sourceType: "live_url",
        sourceValue: `${req.nextUrl.origin}${source.value}`,
      };
    }
  } else {
    payload = {
      projectId: id,
      sourceType: source.type,
      sourceValue: source.value,
    };
  }

  const { error: updErr } = await supabase
    .from("projects")
    .update({
      demo_source_type: payload.sourceType,
      demo_source_value: payload.sourceValue,
      demo_build_status: "pending",
      demo_build_error: null,
    })
    .eq("id", id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // Cost guard: collapse re-record click bursts (and accidental double-fires) for
  // the same project into ONE run. Trailing mode means the latest payload wins, so
  // editing the source then re-recording still uses the fresh source. The task's
  // queue concurrencyLimit caps how many of these ever run in parallel.
  const handle = await tasks.trigger<typeof buildAndRecord>(
    "build-and-record",
    payload,
    { debounce: { key: `demo-${id}`, delay: "8s", mode: "trailing" } },
  );

  return NextResponse.json({
    ok: true,
    runId: handle.id,
    source: { type: payload.sourceType, value: payload.sourceValue },
  });
}
