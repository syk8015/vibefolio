import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { detectDemoSource, liveUrlIssue } from "@/lib/demoSource";
import { resolveBuildPayload, DemoSourceError } from "@/lib/demoPayload";
import { assertSafePublicUrl, SsrfError } from "@/lib/ssrf";
import { apiError } from "@/lib/apiError";
import { isAdminEmail } from "@/lib/demoQuota";

// Admin decision on a held / re-record request. Approving is the ONE privileged
// path that enqueues a demo past the normal caps: it sets the project to pending
// (service role → exempt from the guard trigger) and logs an 'approved' event so
// the spend still counts toward the global wallet ceiling.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: requestId } = await params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdminEmail(user.email)) {
      // Don't reveal the endpoint to non-admins.
      return apiError({ status: 404, message: "찾을 수 없어요.", code: "NOT_FOUND" });
    }

    let action = "";
    let note: string | null = null;
    try {
      const body = await req.json();
      action = typeof body?.action === "string" ? body.action : "";
      note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 1000) : null;
    } catch {
      action = "";
    }
    if (action !== "approve" && action !== "reject") {
      return apiError({ status: 400, message: "action은 approve 또는 reject여야 해요.", code: "BAD_ACTION" });
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: request, error: reqErr } = await admin
      .from("demo_requests")
      .select("id, project_id, user_id, kind, status")
      .eq("id", requestId)
      .single();
    if (reqErr || !request) {
      return apiError({ status: 404, message: "요청을 찾을 수 없어요.", code: "NOT_FOUND" });
    }
    if (request.status !== "pending") {
      return apiError({ status: 409, message: "이미 처리된 요청이에요.", code: "ALREADY_DECIDED" });
    }

    const decidedAt = new Date().toISOString();

    if (action === "reject") {
      await admin
        .from("demo_requests")
        .update({ status: "rejected", admin_note: note, decided_at: decidedAt })
        .eq("id", requestId);
      return NextResponse.json({ ok: true, status: "rejected" });
    }

    // approve → resolve source and enqueue.
    const { data: project, error: projErr } = await admin
      .from("projects")
      // pending_demo_script = 재촬영 루프에서 AI가 제출해 승인을 기다리는 새 대본.
      .select("id, user_id, demo_url, pending_demo_script")
      .eq("id", request.project_id)
      .single();
    if (projErr || !project) {
      return apiError({ status: 404, message: "프로젝트를 찾을 수 없어요.", code: "NOT_FOUND" });
    }

    const source = detectDemoSource(project.demo_url);
    if (!source) {
      return apiError({
        status: 400,
        message: "자동 시연을 만들 수 없는 소스예요. 소스 URL을 확인해 주세요.",
        code: "UNSUPPORTED_SOURCE",
      });
    }

    // This route resolves the payload with the SERVICE-ROLE client, which bypasses
    // storage RLS — so it must apply the same source guards the self-serve route
    // does, or an admin approval becomes a cross-tenant read/SSRF primitive. For an
    // external live_url: reject content hosts + DNS-resolve for private/reserved IPs.
    if (source.type === "live_url" && !source.value.startsWith("/api/preview/")) {
      const issue = liveUrlIssue(source.value);
      if (issue) {
        return apiError({
          status: 400,
          code: issue.kind === "content-host" ? "CONTENT_HOST" : "PRIVATE_HOST",
          message: "촬영할 수 없는 소스 주소예요. 소스 URL을 확인해 주세요.",
        });
      }
      try {
        await assertSafePublicUrl(source.value);
      } catch (e) {
        if (e instanceof SsrfError) {
          return apiError({ status: 400, code: "PRIVATE_HOST", message: "공개로 접속되는 주소가 아니에요." });
        }
        throw e;
      }
    }

    // ownerId = the project's owner. Binds a /api/preview source to that owner so an
    // attacker-set demo_url can't make the service-role client read another user's
    // upload (F3). Throws DemoSourceError on a foreign preview path.
    let payload;
    try {
      payload = await resolveBuildPayload(admin, project.id, project.user_id, source, req.nextUrl.origin);
    } catch (e) {
      if (e instanceof DemoSourceError) {
        return apiError({ status: 400, message: "소스 주소를 확인해 주세요.", code: "UNSUPPORTED_SOURCE" });
      }
      throw e;
    }

    // 대기 중인 새 대본이 있으면 승인과 동시에 승격한다 — 재촬영 루프(2026-08-25)의
    // 2회차 경로: AI가 제출한 대본은 승인 전까지 pending에 머물고, 공개 데이터는
    // 그대로다. 여기서 갈아끼워야 승인된 촬영이 "새 대본으로" 찍힌다.
    const promote = project.pending_demo_script
      ? {
          demo_script: project.pending_demo_script,
          pending_demo_script: null,
          pending_script_at: null,
          pending_script_note: null,
        }
      : {};

    const { error: updErr } = await admin
      .from("projects")
      .update({
        ...promote,
        demo_source_type: payload.sourceType,
        demo_source_value: payload.sourceValue,
        demo_build_status: "pending",
        demo_build_error: null,
      })
      .eq("id", project.id);
    if (updErr) {
      return apiError({
        status: 500,
        message: "승인 처리에 실패했어요. 잠시 후 다시 시도해 주세요.",
        code: "DB_UPDATE_FAILED",
        cause: updErr,
        context: { requestId, projectId: project.id },
      });
    }

    // Atomically claim the request (pending→approved). Two concurrent approvals
    // (an admin double-click) both pass the advisory check above, so this conditional
    // update is the real gate: only the first flips the row; the loser stops here — so
    // the wallet spend + task trigger below run exactly once. Placed after the source
    // validation so a rejected-source approval leaves the request pending for retry.
    const { data: claimed } = await admin
      .from("demo_requests")
      .update({ status: "approved", admin_note: note, decided_at: decidedAt })
      .eq("id", requestId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!claimed) {
      return apiError({ status: 409, message: "이미 처리된 요청이에요.", code: "ALREADY_DECIDED" });
    }

    // Count the approved spend toward the global wallet ceiling (once, post-claim).
    await admin.from("demo_events").insert({
      user_id: request.user_id,
      project_id: project.id,
      kind: "approved",
    });

    // The pending row is the queue entry — the local recording worker drains it.

    return NextResponse.json({ ok: true, status: "approved" });
  } catch (err) {
    return apiError({
      status: 500,
      message: "잠시 후 다시 시도해 주세요.",
      code: "INTERNAL",
      cause: err,
    });
  }
}
