import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { logger } from "@/lib/logger";

// `system_status` is default-deny RLS (service role only), so the dashboard can't
// read `demo_paused` itself — but the demo badge needs it. Nothing on the request
// side checks the pause flag: while the pipeline is stopped the queue still accepts
// work, and a spinner reading "보통 1–3분" would sit there forever with no action
// available (RerecordButton hides while in-flight). This hands the UI the single
// boolean it needs to say "점검 중" instead.
//
// Auth-gated: the badge only ever renders for a signed-in owner, and there's no
// reason to publish our operational posture to anonymous callers.

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return apiError({ status: 401, message: "로그인이 필요해요.", code: "UNAUTHORIZED" });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("system_status")
      .select("demo_paused")
      .eq("id", "singleton")
      .single();

    // A read failure must NOT become a false "점검 중" — claiming the pipeline is
    // down when it may be fine is the worse lie. Fall back to the normal spinner
    // path; the slow-job notice still rescues the user from a dead end.
    if (error) {
      logger.warn("demo status: system_status read failed", { error });
      return NextResponse.json({ ok: true, paused: false });
    }

    return NextResponse.json({ ok: true, paused: !!data?.demo_paused });
  } catch (err) {
    return apiError({
      status: 500,
      message: "시연 상태를 불러오지 못했어요.",
      code: "INTERNAL",
      cause: err,
    });
  }
}
