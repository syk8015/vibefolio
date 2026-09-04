import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { detectDemoSource, liveUrlIssue } from "@/lib/demoSource";
import { normalizeDemoAccess } from "@/lib/demoAccess";
import { resolveBuildPayload, DemoSourceError, type BuildPayload } from "@/lib/demoPayload";
import { assertSafePublicUrl, SsrfError } from "@/lib/ssrf";
import { apiError } from "@/lib/apiError";
import { getT } from "@/lib/i18n/server";
import { trackServerEvent } from "@/lib/analytics";
import { AnalyticsEvent } from "@/lib/analytics-events";
import { sendEmail, alertRecipients } from "@/lib/email";
import { adminAlertEmail, SITE_URL } from "@/lib/email-templates";

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
  const { t } = await getT();
  try {
    const { id } = await params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return apiError({ status: 401, message: t.api.loginRequired, code: "UNAUTHORIZED" });
    }

    const { data: project, error: selErr } = await supabase
      .from("projects")
      .select("id, user_id, title, demo_url, demo_access")
      .eq("id", id)
      .single();
    if (selErr || !project) {
      return apiError({ status: 404, message: t.api.projectNotFound, code: "NOT_FOUND" });
    }
    if (project.user_id !== user.id) {
      return apiError({ status: 403, message: t.api.projectForbidden, code: "FORBIDDEN" });
    }

    const source = detectDemoSource(project.demo_url);
    if (!source) {
      return apiError({
        status: 400,
        message: t.api.unsupportedSource,
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
          message: t.api.contentHost(issue.host),
        });
      }
      if (issue?.kind === "private-host") {
        return apiError({
          status: 400,
          code: "PRIVATE_HOST",
          message: t.api.privateHost,
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
            message: t.api.notPublicUrl,
          });
        }
        throw e;
      }
    }

    // demo_access (Connect 요청2) is a user-content column — owners can write it
    // directly through RLS, bypassing ingest's checks — so the publish gate
    // re-validates here: absolute entry URLs get the same content-host /
    // private-host / SSRF treatment as demo_url. The worker re-checks at the
    // sink and its netguard is the final backstop. Storage only — the payload
    // stays untouched; the worker reads demo_access off the job row.
    const demoAccess = normalizeDemoAccess(project.demo_access);
    if (demoAccess.issue === "bad-url") {
      return apiError({ status: 400, message: t.api.demoAccessBadUrl, code: "BAD_DEMO_ACCESS" });
    }
    // url = 데모 진입, altUrl = 촬영 전 정찰의 두 번째 후보(피드백 B-4). 워커가
    // 실제로 여는 주소라는 점에서 둘의 위험은 같으므로 같은 게이트를 태운다.
    for (const accessUrl of [demoAccess.access?.url, demoAccess.access?.altUrl]) {
      if (!accessUrl || accessUrl.startsWith("/")) continue;
      const issue = liveUrlIssue(accessUrl);
      if (issue?.kind === "content-host") {
        return apiError({
          status: 400,
          code: "CONTENT_HOST",
          message: t.api.contentHost(issue.host),
        });
      }
      if (issue?.kind === "private-host") {
        return apiError({
          status: 400,
          code: "PRIVATE_HOST",
          message: t.api.privateHost,
        });
      }
      try {
        await assertSafePublicUrl(accessUrl);
      } catch (e) {
        if (e instanceof SsrfError) {
          return apiError({
            status: 400,
            code: "PRIVATE_HOST",
            message: t.api.notPublicUrl,
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
        return apiError({ status: 400, message: t.api.unsupportedSource, code: "UNSUPPORTED_SOURCE" });
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
        message: t.api.demoUpdateFailed,
        code: "DB_UPDATE_FAILED",
        cause: rpcErr,
        context: { projectId: id },
      });
    }

    const result = (quota ?? {}) as QuotaResult;
    if (!result.ok) {
      switch (result.code) {
        case "UNAUTHORIZED":
          return apiError({ status: 401, message: t.api.loginRequired, code: "UNAUTHORIZED" });
        case "NOT_FOUND":
          return apiError({ status: 404, message: t.api.projectNotFound, code: "NOT_FOUND" });
        case "FORBIDDEN":
          return apiError({ status: 403, message: t.api.projectForbidden, code: "FORBIDDEN" });
        case "ALREADY_HAS_DEMO":
          return apiError({
            status: 409,
            message: t.api.alreadyHasDemo,
            code: "ALREADY_HAS_DEMO",
          });
        case "ATTEMPT_LIMIT":
          return apiError({
            status: 409,
            message: t.api.attemptLimit,
            code: "ATTEMPT_LIMIT",
          });
        default:
          return apiError({ status: 400, message: t.api.demoStartFailed, code: result.code ?? "REJECTED" });
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
        message: result.reason === "global" ? t.api.heldGlobal : t.api.heldUser,
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
          runner: "local",
        },
      });
    }

    // The pending row written by request_demo IS the queue entry — the local
    // recording worker (local-runner/worker.ts) polls it, claims it and records on
    // real hardware. Nothing else consumes the queue.
    return NextResponse.json({ ok: true, runId: "local-queue", queued: admitted, source: sourceMeta });
  } catch (err) {
    // Last line of defence: any unexpected throw (Supabase/network)
    // returns the standard error shape instead of a raw 500 + stack trace.
    return apiError({
      status: 500,
      message: t.api.retryLater,
      code: "INTERNAL",
      cause: err,
    });
  }
}
