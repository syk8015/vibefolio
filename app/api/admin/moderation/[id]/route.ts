import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { isAdminEmail } from "@/lib/demoQuota";
import { isR2Configured, deleteR2Objects } from "@/lib/r2";
import { formatDemoFailure, DEMO_FAILURE_COPY } from "@/lib/demo-failure";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { demoReadyEmail, demoFailedEmail, SITE_URL } from "@/lib/email-templates";
import { trackServerEvent } from "@/lib/analytics";
import { AnalyticsEvent } from "@/lib/analytics-events";

// Admin decision on a moderation-held take (/admin 모더레이션 인박스).
//   approve → publish: demo_video_url gets the quarantined URL, status done,
//             완료 메일 발송. The publish is CONDITIONAL on the project still
//             being held — a newer take may have replaced this quarantine (its
//             files may even be pruned), and publishing a stale one would point
//             the card at a dead or wrong video.
//   reject  → delete the quarantined objects, status failed with the 'policy'
//             code (dashboard badge + 실패 메일 share the copy).

// Same bucket constant as local-runner/config.ts DEMO_BUCKET — not imported
// because that module loads .env.local at import time (worker-only side effect).
const DEMO_BUCKET = "project-files";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdminEmail(user.email)) {
      // Don't reveal the endpoint to non-admins.
      return apiError({ status: 404, message: "찾을 수 없어요.", code: "NOT_FOUND" });
    }

    let action = "";
    try {
      const body = await req.json();
      action = typeof body?.action === "string" ? body.action : "";
    } catch {
      action = "";
    }
    if (action !== "approve" && action !== "reject") {
      return apiError({ status: 400, message: "action은 approve 또는 reject여야 해요.", code: "BAD_ACTION" });
    }

    const admin = createAdminClient();

    const { data: item, error: itemErr } = await admin
      .from("demo_moderation")
      .select("id, project_id, video_url, poster_url, video_key, poster_key, storage, created_at, status")
      .eq("id", id)
      .single();
    if (itemErr || !item) {
      return apiError({ status: 404, message: "검토 항목을 찾을 수 없어요.", code: "NOT_FOUND" });
    }
    if (item.status !== "open") {
      return apiError({ status: 409, message: "이미 처리된 항목이에요.", code: "ALREADY_DECIDED" });
    }

    const { data: project } = await admin
      .from("projects")
      .select("id, user_id, title")
      .eq("id", item.project_id)
      .single();

    // Claim the queue row first (open → decided). The conditional update is the
    // double-click / two-tab race guard.
    const decidedAt = new Date().toISOString();
    const nextStatus = action === "approve" ? "approved" : "rejected";
    const { data: claimed, error: claimErr } = await admin
      .from("demo_moderation")
      .update({ status: nextStatus, resolved_at: decidedAt })
      .eq("id", id)
      .eq("status", "open")
      .select("id")
      .maybeSingle();
    if (claimErr) {
      return apiError({
        status: 500,
        message: "처리하지 못했어요. 잠시 후 다시 시도해 주세요.",
        code: "DB_UPDATE_FAILED",
        cause: claimErr,
        context: { moderationId: id },
      });
    }
    if (!claimed) {
      return apiError({ status: 409, message: "이미 처리된 항목이에요.", code: "ALREADY_DECIDED" });
    }

    const ownerEmail = project
      ? await admin.auth.admin
          .getUserById(project.user_id)
          .then((r) => r.data.user?.email ?? null)
          .catch(() => null)
      : null;

    if (action === "approve") {
      // Publish, but only if the project is still parked on THIS quarantine.
      const { data: published, error: pubErr } = await admin
        .from("projects")
        .update({
          demo_video_url: item.video_url,
          demo_build_status: "done",
          demo_build_error: null,
          demo_generated_at: item.created_at,
        })
        .eq("id", item.project_id)
        .eq("demo_build_status", "held")
        .select("id")
        .maybeSingle();
      if (pubErr || !published) {
        // Stale quarantine (newer take already replaced it) or DB blip — undo the
        // claim so the item stays actionable instead of silently half-approved.
        await admin
          .from("demo_moderation")
          .update({ status: "open", resolved_at: null })
          .eq("id", id);
        if (pubErr) {
          return apiError({
            status: 500,
            message: "게시하지 못했어요. 잠시 후 다시 시도해 주세요.",
            code: "DB_UPDATE_FAILED",
            cause: pubErr,
            context: { moderationId: id, projectId: item.project_id },
          });
        }
        return apiError({
          status: 409,
          message: "프로젝트가 더 이상 보류 상태가 아니에요(새 촬영으로 대체된 듯). 거절로 정리해 주세요.",
          code: "NOT_HELD_ANYMORE",
        });
      }

      await trackServerEvent(AnalyticsEvent.DemoSucceeded, {
        userId: project?.user_id ?? null,
        props: { projectId: item.project_id, via: "moderation-approve" },
      });

      // 완료 메일 — worker의 notifyDemoReady와 같은 표면(베스트에포트).
      if (isEmailConfigured() && ownerEmail && project) {
        try {
          const { data: prof } = await admin
            .from("profiles")
            .select("username")
            .eq("id", project.user_id)
            .single();
          const watchUrl = prof?.username
            ? `${SITE_URL}/${encodeURIComponent(prof.username)}/${project.id}`
            : `${SITE_URL}/dashboard`;
          await sendEmail({
            to: ownerEmail,
            ...demoReadyEmail({
              projectTitle: project.title || "내 프로젝트",
              watchUrl,
              posterUrl: item.poster_url ?? undefined,
            }),
          });
        } catch {
          // 메일 실패는 게시를 되돌릴 이유가 아니다.
        }
      }

      return NextResponse.json({ ok: true, status: "approved" });
    }

    // ── reject ────────────────────────────────────────────────────────────────
    // Delete the quarantined objects. Idempotent both ways (missing keys are
    // fine), and best-effort: a storage blip must not strand the decision — the
    // objects are unlinked either way and storage-audit can sweep stragglers.
    try {
      const keys = [item.video_key, item.poster_key].filter((k): k is string => !!k);
      if (item.storage === "r2" && isR2Configured()) {
        await deleteR2Objects(keys);
      } else if (item.storage === "supabase" && keys.length) {
        await admin.storage.from(DEMO_BUCKET).remove(keys);
      }
    } catch (err) {
      console.error(`[moderation] quarantine delete failed (non-fatal): ${err instanceof Error ? err.message : err}`);
    }

    // held → failed[policy]. Conditional: if a newer take already moved the row
    // on, leave the project alone — deleting the quarantine was the real action.
    await admin
      .from("projects")
      .update({
        demo_build_status: "failed",
        demo_build_error: formatDemoFailure("policy", "관리자 검토에서 게시가 거절됐어요."),
      })
      .eq("id", item.project_id)
      .eq("demo_build_status", "held");

    await trackServerEvent(AnalyticsEvent.DemoFailed, {
      userId: project?.user_id ?? null,
      props: { projectId: item.project_id, reason: "policy" },
    });

    if (isEmailConfigured() && ownerEmail && project) {
      try {
        await sendEmail({
          to: ownerEmail,
          ...demoFailedEmail({
            projectTitle: project.title || "내 프로젝트",
            copy: DEMO_FAILURE_COPY.policy,
          }),
        });
      } catch {
        // best-effort
      }
    }

    return NextResponse.json({ ok: true, status: "rejected" });
  } catch (err) {
    return apiError({
      status: 500,
      message: "잠시 후 다시 시도해 주세요.",
      code: "INTERNAL",
      cause: err,
    });
  }
}
