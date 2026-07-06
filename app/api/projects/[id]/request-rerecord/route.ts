import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { apiError } from "@/lib/apiError";

// A project gets ONE auto demo. Re-recording a landed video (or getting another
// take after the retry budget is spent) is not self-serve — the owner files a
// request that says what they want changed, and an admin approves it on /admin.
// This route only records the ask; nothing is spent until approval.

const REASON_MAX = 1000;
const IN_FLIGHT = ["pending", "building", "recording", "editing"];

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

    let reason = "";
    try {
      const body = await req.json();
      reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    } catch {
      reason = "";
    }
    if (!reason) {
      return apiError({
        status: 400,
        message: "무엇을 어떻게 바꾸고 싶은지 적어주세요.",
        code: "REASON_REQUIRED",
      });
    }
    if (reason.length > REASON_MAX) reason = reason.slice(0, REASON_MAX);

    const { data: project, error: selErr } = await supabase
      .from("projects")
      .select("id, user_id, demo_build_status")
      .eq("id", id)
      .single();
    if (selErr || !project) {
      return apiError({ status: 404, message: "프로젝트를 찾을 수 없어요.", code: "NOT_FOUND" });
    }
    if (project.user_id !== user.id) {
      return apiError({ status: 403, message: "이 프로젝트에 대한 권한이 없어요.", code: "FORBIDDEN" });
    }
    if (IN_FLIGHT.includes(project.demo_build_status ?? "")) {
      return apiError({
        status: 409,
        message: "지금 시연 영상을 만드는 중이에요. 끝난 뒤에 요청해 주세요.",
        code: "IN_FLIGHT",
      });
    }

    // Writes to the approval queue go through the service role (users have no
    // insert policy on demo_requests). Ownership was just verified above.
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: existing } = await admin
      .from("demo_requests")
      .select("id")
      .eq("project_id", id)
      .eq("kind", "rerecord")
      .eq("status", "pending")
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ ok: true, already: true });
    }

    const { error: insErr } = await admin.from("demo_requests").insert({
      project_id: id,
      user_id: user.id,
      kind: "rerecord",
      reason,
    });
    if (insErr) {
      // Unique partial index (one pending per project+kind) can race two submits;
      // treat the collision as "already requested" rather than an error.
      if (insErr.code === "23505") {
        return NextResponse.json({ ok: true, already: true });
      }
      return apiError({
        status: 500,
        message: "요청을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
        code: "DB_INSERT_FAILED",
        cause: insErr,
        context: { projectId: id },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError({
      status: 500,
      message: "잠시 후 다시 시도해 주세요.",
      code: "INTERNAL",
      cause: err,
    });
  }
}
