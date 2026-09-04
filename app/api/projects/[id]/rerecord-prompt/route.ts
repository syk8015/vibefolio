import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { requireUser } from "@/lib/routeAuth";
import { getT, getLocale } from "@/lib/i18n/server";
import { generateToken } from "@/lib/apiToken";
import { AUTO_TOKEN_NAME } from "@/lib/connectSnippets";
import { rerecordPrompt } from "@/lib/rerecordPrompt";
import { normalizeDemoScript } from "@/lib/demoScript";

// POST /api/projects/[id]/rerecord-prompt — 재촬영 프롬프트를 만들어 준다.
//
// 사람은 영상을 보고 말로 불만을 적는다("16초에서 그거 클릭하지 마"). 이 라우트는
// 그 말 + 지금 걸려 있는 대본 전문 + 작품 정보 + 제출용 토큰을 하나의 프롬프트로
// 묶는다 — **재촬영은 새 세션의 AI가 맡을 수 있어서** 프롬프트 하나로 맥락이
// 완결돼야 하기 때문이다(사용자 확정 설계 2026-08-25).
//
// 여기서는 아무것도 촬영되지 않고 과금되지도 않는다. 실제 재촬영은 AI가 새 대본을
// 제출(/api/ingest/rerecord/[id])하고 소유자가 대시보드에서 확인한 뒤에 시작된다.

const NOTE_MAX = 1000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { t } = await getT();
  try {
    const { id } = await params;

    const auth = await requireUser(t.api.loginRequired);
    if (auth instanceof NextResponse) return auth;
    const { user, supabase } = auth;

    let note = "";
    try {
      const body = await req.json();
      note = typeof body?.note === "string" ? body.note.trim() : "";
    } catch {
      note = "";
    }
    if (!note) {
      return apiError({ status: 400, message: t.api.rerecordReasonRequired, code: "NOTE_REQUIRED" });
    }
    if (note.length > NOTE_MAX) note = note.slice(0, NOTE_MAX);

    // 소유자 확인은 RLS가 아니라 여기서 명시적으로 — 아래 토큰 발급이 서비스롤이라
    // 남의 프로젝트 id로 프롬프트(+토큰)를 받아가는 길을 만들면 안 된다.
    const { data: project, error: selErr } = await supabase
      .from("projects")
      .select("id, user_id, title, description, demo_url, content_type, tags, demo_access, demo_script")
      .eq("id", id)
      .single();
    if (selErr || !project) {
      return apiError({ status: 404, message: t.api.projectNotFound, code: "NOT_FOUND" });
    }
    if (project.user_id !== user.id) {
      return apiError({ status: 403, message: t.api.projectForbidden, code: "FORBIDDEN" });
    }

    const admin = createAdminClient();

    // 프롬프트에 심을 토큰은 ConnectPanel과 같은 규약: 자동발급분(prompt-auto)은
    // 항상 하나만 살아 있게 이전 것을 폐기하고 새로 발급한다. raw는 이 응답에만
    // 존재하고 DB엔 sha256만 남는다.
    await admin
      .from("api_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("name", AUTO_TOKEN_NAME)
      .is("revoked_at", null);
    const { raw, hash, prefix } = generateToken();
    const { error: tokErr } = await admin.from("api_tokens").insert({
      user_id: user.id,
      token_hash: hash,
      token_prefix: prefix,
      name: AUTO_TOKEN_NAME,
    });
    if (tokErr) {
      return apiError({
        status: 500, message: t.api.retryLater, code: "TOKEN_ISSUE_FAILED",
        cause: tokErr, context: { projectId: id },
      });
    }

    const locale = await getLocale();
    const prompt = rerecordPrompt(
      req.nextUrl.origin,
      {
        projectId: project.id as string,
        title: (project.title as string) ?? "",
        description: (project.description as string) ?? "",
        demoUrl: (project.demo_url as string) ?? "",
        contentType: (project.content_type as string | null) ?? null,
        tags: (project.tags as string[]) ?? [],
        demoAccess: project.demo_access ?? null,
        currentScript: normalizeDemoScript(project.demo_script),
        note,
      },
      locale === "en" ? "en" : "ko",
      raw,
    );

    return NextResponse.json({ ok: true, prompt });
  } catch (err) {
    return apiError({ status: 500, message: t.api.retryLater, code: "INTERNAL", cause: err });
  }
}
