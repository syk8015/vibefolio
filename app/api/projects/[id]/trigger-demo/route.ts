import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk";
import { createClient } from "@/lib/supabase/server";
import { detectDemoSource, liveUrlIssue } from "@/lib/demoSource";
import { resolveBuildPayload, DemoSourceError } from "@/lib/demoPayload";
import { assertSafePublicUrl, SsrfError } from "@/lib/ssrf";
import { apiError } from "@/lib/apiError";
import { trackServerEvent } from "@/lib/analytics";
import { AnalyticsEvent } from "@/lib/analytics-events";
import { sendEmail, alertRecipients } from "@/lib/email";
import { adminAlertEmail, SITE_URL } from "@/lib/email-templates";
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
      .select("id, user_id, title, demo_url")
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

    // Guard external live URLs (not our own /api/preview uploads): a content host
    // pasted into the demo field would film someone else's site, and a private /
    // localhost address would point the recorder at itself or an internal host.
    if (source.type === "live_url" && !source.value.startsWith("/api/preview/")) {
      const issue = liveUrlIssue(source.value);
      if (issue?.kind === "content-host") {
        return apiError({
          status: 400,
          code: "CONTENT_HOST",
          message: `${issue.host}는 자동 시연으로 촬영하는 '내 작품' 주소가 아니에요. 영상 링크라면 '구동 영상' 칸에 넣어주세요.`,
        });
      }
      if (issue?.kind === "private-host") {
        return apiError({
          status: 400,
          code: "PRIVATE_HOST",
          message: "localhost나 내부 주소는 촬영할 수 없어요. 공개로 접속되는 배포 URL로 올려주세요.",
        });
      }
      // Full SSRF defense: DNS-resolve the host and reject any private/reserved IP
      // (catches domains that resolve inward, decimal/hex IP notations, etc.).
      try {
        await assertSafePublicUrl(source.value);
      } catch (e) {
        if (e instanceof SsrfError) {
          return apiError({
            status: 400,
            code: "PRIVATE_HOST",
            message: "공개 인터넷에서 접속되는 주소가 아니에요. 배포된 공개 URL로 올려주세요.",
          });
        }
        throw e;
      }
    }

    // Uploaded projects need a build (zip) vs static-serve (live_url) decision;
    // resolveBuildPayload centralises it so the admin approval route stays in sync.
    // ownerId (= this user, ownership already checked above) binds a /api/preview
    // source to its owner so it can't point the recorder at another user's upload.
    let payload: BuildPayload;
    try {
      payload = await resolveBuildPayload(
        supabase,
        id,
        user.id,
        source,
        req.nextUrl.origin,
      );
    } catch (e) {
      if (e instanceof DemoSourceError) {
        return apiError({ status: 400, message: "자동 시연을 만들 수 없는 소스예요.", code: "UNSUPPORTED_SOURCE" });
      }
      throw e;
    }

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
      // 승인 대기 알림 (T4): "보통 24h내" 약속은 관리자가 큐를 봐야 지켜진다.
      // deduped 재발화(이미 held인 행 재클릭)는 메일도 재발송하지 않는다.
      if (!result.deduped) {
        await sendEmail({
          to: alertRecipients(),
          ...adminAlertEmail({
            title: "시연 승인 대기 — 한도 초과 요청",
            lines: [
              `프로젝트: ${project.title ?? "(제목 없음)"} (${id})`,
              result.reason === "global"
                ? "사유: 전역 일일 한도 초과."
                : "사유: 유저 일일 한도 초과.",
              "승인 전까지 대시보드에는 폴백 이미지로 표시돼요.",
            ],
            ctaLabel: "승인 콘솔 열기",
            ctaUrl: `${SITE_URL}/admin`,
          }),
        });
      }
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
