import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { ingestAuth } from "@/app/api/ingest/shared";
import {
  normalizeDemoScript, substantialStepCount,
  DEMO_SCRIPT_MIN_STEPS, DEMO_SCRIPT_MIN_SUBSTANTIAL,
} from "@/lib/demoScript";
import { rateLimit } from "@/lib/rate-limit";

// POST /api/ingest/rerecord/[id] — AI가 다시 쓴 촬영 대본을 **대기 상태로** 받는다.
//
// 공개된 작품의 내용은 PAT 경로가 절대 못 바꾼다(초안 전용 규칙). 그런데 영상이
// 마음에 안 들 때 대본을 다시 쓰는 건 AI 몫이어야 한다 — 그래서 여기서 받는 건
// projects.demo_script가 아니라 pending_demo_script다. 공개 데이터는 그대로 두고,
// 소유자가 대시보드에서 새 대본을 확인하고 [재촬영]을 눌러야 승격된다.
// 이 경계 덕분에 (1) PAT가 공개 콘텐츠를 갈아치울 수 없고 (2) 촬영 비용이 나가기
// 전에 사람 눈이 한 번 들어간다.
//
// 파이프라인 컬럼(demo_build_status 등)은 여기서 절대 건드리지 않는다 — 인제스트
// 불변식(PAT 경로엔 auth.uid()가 없어 request_demo()와 안 맞는다) 그대로.

const NOTE_MAX = 1000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await ingestAuth(req);
  if (auth.fail) return auth.fail;
  const { userId, t } = auth;

  try {
    const { id } = await params;

    const allowed = await rateLimit({ name: "rerecord", key: userId, windowSeconds: 3600, max: 20 });
    if (!allowed) {
      return apiError({ status: 429, message: t.api.tooManyRequests, code: "RATE_LIMITED" });
    }

    let payload: { demoScript?: unknown; note?: unknown } = {};
    try {
      payload = await req.json();
    } catch {
      return apiError({ status: 400, message: t.api.jsonBodyInvalid, code: "BAD_JSON" });
    }

    // 대본 게이트는 생성 경로와 같은 규칙 — 재촬영이 품질을 낮추는 길이 되면 안 된다.
    const script = normalizeDemoScript(payload?.demoScript);
    const steps = script?.steps.length ?? 0;
    if (steps === 0) {
      return apiError({ status: 400, message: t.api.scriptRequired, code: "SCRIPT_REQUIRED" });
    }
    if (steps < DEMO_SCRIPT_MIN_STEPS) {
      return apiError({ status: 400, message: t.api.scriptTooThin(steps), code: "SCRIPT_TOO_THIN" });
    }
    // 재촬영 대본도 발행 대본과 같은 바를 넘어야 한다 — 여기가 느슨하면 "한 번
    // 거절당한 대본을 재촬영 입구로 우회 제출"하는 길이 열린다.
    const solid = script ? substantialStepCount(script) : 0;
    if (solid < DEMO_SCRIPT_MIN_SUBSTANTIAL) {
      return apiError({
        status: 400,
        message: t.api.scriptStepsVague(solid, steps),
        code: "SCRIPT_STEPS_VAGUE",
      });
    }

    const admin = createAdminClient();
    const { data: project, error: selErr } = await admin
      .from("projects")
      .select("id, user_id, title")
      .eq("id", id)
      .maybeSingle();
    if (selErr || !project) {
      return apiError({ status: 404, message: t.api.projectNotFound, code: "NOT_FOUND" });
    }
    // 서비스롤로 읽었으니 소유권은 여기서 직접 본다(RLS가 안 걸린다).
    if (project.user_id !== userId) {
      return apiError({ status: 403, message: t.api.projectForbidden, code: "FORBIDDEN" });
    }

    const note = typeof payload?.note === "string" ? payload.note.trim().slice(0, NOTE_MAX) : null;

    const { error: updErr } = await admin
      .from("projects")
      .update({
        pending_demo_script: script,
        pending_script_at: new Date().toISOString(),
        pending_script_note: note,
      })
      .eq("id", id);
    if (updErr) {
      return apiError({
        status: 500, message: t.api.retryLater, code: "DB_UPDATE_FAILED",
        cause: updErr, context: { projectId: id },
      });
    }

    // 에코 — 발행 경로와 같은 원칙: "무엇이 실제로 저장됐는지"를 그대로 돌려줘야
    // AI가 조용한 폐기(형식 어긋난 스텝 드랍)를 알아챌 수 있다.
    return NextResponse.json({
      ok: true,
      projectId: id,
      pending: true,
      accepted: {
        demoScriptSteps: steps,
        demoScriptDropped:
          Array.isArray((payload?.demoScript as { steps?: unknown[] })?.steps) &&
          ((payload?.demoScript as { steps?: unknown[] }).steps?.length ?? 0) > steps,
        note,
      },
      // 다음에 무슨 일이 일어나는지 AI가 사람에게 전달할 수 있게 명시한다.
      next: t.api.rerecordPendingNext,
    });
  } catch (err) {
    return apiError({ status: 500, message: t.api.retryLater, code: "INTERNAL", cause: err });
  }
}
