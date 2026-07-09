import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk";
import { createClient } from "@/lib/supabase/server";
import { detectDemoSource } from "@/lib/demoSource";
import { resolveBuildPayload } from "@/lib/demoPayload";
import { apiError } from "@/lib/apiError";
import { trackServerEvent } from "@/lib/analytics";
import { AnalyticsEvent } from "@/lib/analytics-events";
import type { buildAndRecord, BuildPayload } from "@/src/trigger/build-and-record";

// Shape returned by the request_demo() SQL function (supabase/migration_demo_quota.sql).
type QuotaResult = {
  ok: boolean;
  status?: string;
  code?: string;
  reason?: "global" | "user";
  deduped?: boolean;
};

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

    // Uploaded projects need a build (zip) vs static-serve (live_url) decision;
    // resolveBuildPayload centralises it so the admin approval route stays in sync.
    const payload: BuildPayload = await resolveBuildPayload(
      supabase,
      id,
      source,
      req.nextUrl.origin,
    );

    // Atomic admission (cost guard). request_demo() checks every cap and writes
    // the pending/held row in ONE locked transaction, so concurrent fires can't
    // slip past the quota. It is also now the ONLY way to set the demo_* columns
    // — the guard trigger blocks direct end-user writes — so this is the single
    // choke point for spend.
    // Caps live inside request_demo() (server-authoritative) — never passed from
    // here, or a caller could invoke the RPC directly with inflated limits.
    const { data: quota, error: rpcErr } = await supabase.rpc("request_demo", {
      p_project_id: id,
      p_source_type: payload.sourceType,
      p_source_value: payload.sourceValue,
    });
    if (rpcErr) {
      return apiError({
        status: 500,
        message: "데모 상태를 업데이트하지 못했어요. 잠시 후 다시 시도해 주세요.",
        code: "DB_UPDATE_FAILED",
        cause: rpcErr,
        context: { projectId: id },
      });
    }

    const result = (quota ?? {}) as QuotaResult;
    if (!result.ok) {
      switch (result.code) {
        case "UNAUTHORIZED":
          return apiError({ status: 401, message: "로그인이 필요해요.", code: "UNAUTHORIZED" });
        case "NOT_FOUND":
          return apiError({ status: 404, message: "프로젝트를 찾을 수 없어요.", code: "NOT_FOUND" });
        case "FORBIDDEN":
          return apiError({ status: 403, message: "이 프로젝트에 대한 권한이 없어요.", code: "FORBIDDEN" });
        case "ALREADY_HAS_DEMO":
          return apiError({
            status: 409,
            message: "이미 시연 영상이 있어요. 다시 만들려면 '재촬영 요청'으로 바꾸고 싶은 점을 알려주세요.",
            code: "ALREADY_HAS_DEMO",
          });
        case "ATTEMPT_LIMIT":
          return apiError({
            status: 409,
            message: "자동 생성 재시도 한도를 다 썼어요. '재촬영 요청'으로 관리자 승인을 받아주세요.",
            code: "ATTEMPT_LIMIT",
          });
        default:
          return apiError({ status: 400, message: "자동 시연을 시작할 수 없어요.", code: result.code ?? "REJECTED" });
      }
    }

    // Held for admin review — nothing is spent. The row is already 'held'; the
    // dashboard shows the fallback image + a review badge (not an error).
    if (result.status === "held") {
      await trackServerEvent(AnalyticsEvent.DemoHeld, {
        userId: user.id,
        props: { projectId: id, reason: result.reason ?? null },
      });
      return NextResponse.json({
        ok: true,
        held: true,
        message:
          result.reason === "global"
            ? "오늘 자동 시연 생성이 많아 잠시 대기열에 넣었어요. 관리자 확인 후 생성돼요."
            : "하루 자동 시연 한도를 넘어 관리자 승인 대기로 전환했어요. 승인 전까지는 이미지로 표시돼요.",
      });
    }

    // Only a FRESH admit (not a dedupe hit on an already-queued row) should kick
    // off a run — otherwise a double-fire would spawn a second recording.
    const admitted = result.status === "pending" && !result.deduped;
    const sourceMeta = { type: payload.sourceType, value: payload.sourceValue };

    // Server-authoritative: a fresh admit means a real recording job just entered
    // the pipeline (denominator of build success rate). Dedupe hits / already
    // in-flight rows are NOT re-counted.
    if (admitted) {
      await trackServerEvent(AnalyticsEvent.DemoRequested, {
        userId: user.id,
        props: {
          projectId: id,
          sourceType: payload.sourceType,
          runner: process.env.DEMO_RUNNER === "local" ? "local" : "cloud",
        },
      });
    }

    // DEMO_RUNNER=local routes jobs to the M5 recording worker instead of the
    // E2B cloud task: the pending row written by request_demo IS the queue entry —
    // local-runner/worker.ts polls it, claims it and records on real hardware.
    if (process.env.DEMO_RUNNER === "local") {
      return NextResponse.json({ ok: true, runId: "local-queue", queued: admitted, source: sourceMeta });
    }

    if (!admitted) {
      // Already queued / in flight — don't fire a second cloud run.
      return NextResponse.json({ ok: true, runId: null, deduped: true, source: sourceMeta });
    }

    // Trailing debounce is a second-line collapse for click bursts; the queue's
    // concurrencyLimit caps how many ever run in parallel.
    const handle = await tasks.trigger<typeof buildAndRecord>(
      "build-and-record",
      payload,
      { debounce: { key: `demo-${id}`, delay: "8s", mode: "trailing" } },
    );

    return NextResponse.json({ ok: true, runId: handle.id, source: sourceMeta });
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
