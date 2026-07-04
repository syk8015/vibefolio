import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk";
import { createClient } from "@/lib/supabase/server";
import { detectDemoSource } from "@/lib/demoSource";
import { apiError } from "@/lib/apiError";
import type { buildAndRecord, BuildPayload } from "@/src/trigger/build-and-record";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return apiError({ status: 401, message: "로그인이 필요해요.", code: "UNAUTHORIZED" });
    }

    const { data: project, error: selErr } = await supabase
      .from("projects")
      .select("id, user_id, demo_url")
      .eq("id", id)
      .single();
    if (selErr || !project) {
      return apiError({ status: 404, message: "프로젝트를 찾을 수 없어요.", code: "NOT_FOUND" });
    }
    if (project.user_id !== user.id) {
      return apiError({ status: 403, message: "이 프로젝트에 대한 권한이 없어요.", code: "FORBIDDEN" });
    }

    const source = detectDemoSource(project.demo_url);
    if (!source) {
      return apiError({
        status: 400,
        message: "자동 시연을 만들 수 없는 소스예요.",
        code: "UNSUPPORTED_SOURCE",
      });
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
      // Never surface the raw DB error to the client — log it server-side and
      // return a friendly message (the client renders this in the demo badge).
      return apiError({
        status: 500,
        message: "데모 상태를 업데이트하지 못했어요. 잠시 후 다시 시도해 주세요.",
        code: "DB_UPDATE_FAILED",
        cause: updErr,
        context: { projectId: id },
      });
    }

    // DEMO_RUNNER=local routes jobs to the M5 recording worker instead of the
    // E2B cloud task: the pending row written above IS the queue entry —
    // local-runner/worker.ts polls it, claims it (pending→building, conditional
    // update), records on real hardware and marks done/failed. Re-record bursts
    // collapse into the single row, so no explicit debounce is needed there.
    if (process.env.DEMO_RUNNER === "local") {
      return NextResponse.json({
        ok: true,
        runId: "local-queue",
        source: { type: payload.sourceType, value: payload.sourceValue },
      });
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
  } catch (err) {
    // Last line of defence: any unexpected throw (Supabase/Trigger.dev/network)
    // returns the standard error shape instead of a raw 500 + stack trace.
    return apiError({
      status: 500,
      message: "잠시 후 다시 시도해 주세요.",
      code: "INTERNAL",
      cause: err,
    });
  }
}
