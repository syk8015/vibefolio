import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { detectDemoSource, liveUrlIssue } from "@/lib/demoSource";
import { resolveBuildPayload, DemoSourceError } from "@/lib/demoPayload";
import { assertSafePublicUrl, SsrfError } from "@/lib/ssrf";
import { apiError } from "@/lib/apiError";
import { getT } from "@/lib/i18n/server";
import { sendEmail, alertRecipients } from "@/lib/email";
import { adminAlertEmail, SITE_URL } from "@/lib/email-templates";

// POST /api/projects/[id]/apply-rerecord — 대기 중인 새 대본으로 재촬영을 시작한다.
//
// 루프의 마지막 칸(2026-08-25 설계): 사람이 말로 불만 → 사이트가 프롬프트 →
// AI가 새 대본 제출(pending) → **여기서 사람이 확인하고 실행**.
//
// 승인 정책(사용자 확정): 작품당 **1회는 소유자가 바로**, 그 다음부터는 관리자
// 승인. "한 번은 다시 찍을 수 있다"는 경험을 주면서 반복 낭비는 막는 절충이다.
//
// 촬영 트리거가 쿠키 인증 경로에만 있는 것은 보안 불변식이다(PAT엔 auth.uid()가
// 없어 request_demo()와 안 맞는다). 그래서 AI는 대본만 제출하고, 실행은 로그인한
// 사람만 누른다 — 이 파일이 그 경계다.

const IN_FLIGHT = ["pending", "building", "recording", "editing"];

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
      .select("id, user_id, title, demo_url, demo_build_status, pending_demo_script, pending_script_note, rerecord_self_used")
      .eq("id", id)
      .single();
    if (selErr || !project) {
      return apiError({ status: 404, message: t.api.projectNotFound, code: "NOT_FOUND" });
    }
    if (project.user_id !== user.id) {
      return apiError({ status: 403, message: t.api.projectForbidden, code: "FORBIDDEN" });
    }
    if (!project.pending_demo_script) {
      return apiError({ status: 400, message: t.api.rerecordNoPendingScript, code: "NO_PENDING_SCRIPT" });
    }
    if (IN_FLIGHT.includes(project.demo_build_status ?? "")) {
      return apiError({ status: 409, message: t.api.rerecordInFlight, code: "IN_FLIGHT" });
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // ── 2회차부터: 관리자 승인 대기열로. 대본은 pending에 그대로 두고, 승인
    //    라우트가 승격시킨다(그래야 승인 전엔 공개 데이터가 안 바뀐다).
    if (project.rerecord_self_used) {
      const reason = (project.pending_script_note as string | null)?.trim()
        || t.api.rerecordDefaultReason;
      const { data: existing } = await admin
        .from("demo_requests")
        .select("id")
        .eq("project_id", id)
        .eq("kind", "rerecord")
        .eq("status", "pending")
        .maybeSingle();
      if (!existing) {
        const { error: insErr } = await admin.from("demo_requests").insert({
          project_id: id, user_id: user.id, kind: "rerecord", reason,
        });
        // 23505 = 같은 프로젝트에 이미 대기 중(부분 유니크 인덱스) → 접수로 본다.
        if (insErr && insErr.code !== "23505") {
          return apiError({
            status: 500, message: t.api.rerecordSaveFailed, code: "DB_INSERT_FAILED",
            cause: insErr, context: { projectId: id },
          });
        }
        await sendEmail({
          to: alertRecipients(),
          ...adminAlertEmail({
            title: "재촬영 승인 요청 (새 대본 대기)",
            lines: [
              `프로젝트: ${project.title ?? "(제목 없음)"} (${id})`,
              `AI 메모: ${reason.length > 200 ? reason.slice(0, 200) + "…" : reason}`,
              "승인하면 대기 중인 새 대본으로 재촬영이 시작돼요.",
            ],
            ctaLabel: "승인 콘솔 열기",
            ctaUrl: `${SITE_URL}/admin`,
          }),
        });
      }
      return NextResponse.json({ ok: true, status: "awaiting_approval" });
    }

    // ── 1회차: 소유자가 바로 실행. 소스 검증은 관리자 승인 경로와 같은 3겹
    //    (형식 판별 → live URL 이슈 → SSRF/사설망 + 소유자 바인딩).
    const source = detectDemoSource((project.demo_url as string) ?? "");
    if (!source) {
      return apiError({ status: 400, message: t.api.badUrl, code: "UNSUPPORTED_SOURCE" });
    }
    if (source.type === "live_url") {
      if (liveUrlIssue(source.value)) {
        return apiError({ status: 400, message: t.api.badUrl, code: "UNSUPPORTED_SOURCE" });
      }
      try {
        await assertSafePublicUrl(source.value);
      } catch (e) {
        if (e instanceof SsrfError) {
          return apiError({ status: 400, message: t.api.privateHost, code: "PRIVATE_HOST" });
        }
        throw e;
      }
    }

    let payload;
    try {
      payload = await resolveBuildPayload(admin, project.id, project.user_id, source, req.nextUrl.origin);
    } catch (e) {
      if (e instanceof DemoSourceError) {
        return apiError({ status: 400, message: t.api.badUrl, code: "UNSUPPORTED_SOURCE" });
      }
      throw e;
    }

    // 대본 승격 + 큐잉을 한 번의 업데이트로. rerecord_self_used를 **같은 문장에서**
    // true로 올려, 두 번 눌러도 두 번 찍히지 않게 한다(아래 조건부 매칭이 실제 게이트).
    // 옛 영상(demo_video_url)은 지우지 않는다 — 새 영상이 나올 때까지 공개 명함이
    // 빈칸이 되면 안 되고, 워커가 성공 시 덮어쓴다.
    const { data: claimed, error: updErr } = await admin
      .from("projects")
      .update({
        demo_script: project.pending_demo_script,
        pending_demo_script: null,
        pending_script_at: null,
        pending_script_note: null,
        rerecord_self_used: true,
        demo_source_type: payload.sourceType,
        demo_source_value: payload.sourceValue,
        demo_build_status: "pending",
        demo_build_error: null,
      })
      .eq("id", id)
      .eq("rerecord_self_used", false)
      .select("id")
      .maybeSingle();
    if (updErr) {
      return apiError({
        status: 500, message: t.api.retryLater, code: "DB_UPDATE_FAILED",
        cause: updErr, context: { projectId: id },
      });
    }
    if (!claimed) {
      // 그 사이 다른 탭이 먼저 소진했다 — 두 번째부터는 승인 경로다.
      return apiError({ status: 409, message: t.api.rerecordAlreadyUsed, code: "ALREADY_USED" });
    }

    // 지출 기록 — 관리자 승인분과 같은 kind로 센다(전역 지갑 상한에 걸리게).
    await admin.from("demo_events").insert({
      user_id: user.id, project_id: id, kind: "approved",
    });

    return NextResponse.json({ ok: true, status: "queued" });
  } catch (err) {
    return apiError({ status: 500, message: t.api.retryLater, code: "INTERNAL", cause: err });
  }
}
