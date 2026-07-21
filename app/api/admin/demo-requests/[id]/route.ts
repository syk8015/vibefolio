import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { detectDemoSource } from "@/lib/demoSource";
import { resolveBuildPayload } from "@/lib/demoPayload";
import { apiError } from "@/lib/apiError";
import { isAdminEmail } from "@/lib/demoQuota";
import type { buildAndRecord } from "@/src/trigger/build-and-record";

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
      .select("id, demo_url")
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

    const payload = await resolveBuildPayload(admin, project.id, source, req.nextUrl.origin);

    const { error: updErr } = await admin
      .from("projects")
      .update({
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

    // Local runner drains the pending row via the worker. In cloud mode, fire the
    // task (mirrors the trigger-demo route).
    if (process.env.DEMO_RUNNER !== "local") {
      await tasks.trigger<typeof buildAndRecord>("build-and-record", payload, {
        debounce: { key: `demo-${project.id}`, delay: "8s", mode: "trailing" },
      });
    }

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
