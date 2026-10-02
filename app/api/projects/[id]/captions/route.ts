import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { requireUser } from "@/lib/routeAuth";
import { getT } from "@/lib/i18n/server";
import { rateLimit } from "@/lib/rate-limit";
import { revalidatePortfolio } from "@/lib/revalidatePortfolio";
import type { DemoScript } from "@/lib/demoScript";
import { CAPTION_MAX, editCaptionCue, normalizeLocale, renameScriptCaption } from "@/lib/workLanguages";

// PATCH /api/projects/[id]/captions — 이미 찍힌 영상의 자막 한 줄 글 고치기(2026-10-02).
// body { locale, index, text } → 200 { ok, captions }
//
// 자막 시간표(demo_captions)는 워커만 쓰는 칸이라(가드 트리거) 주인도 사용자 키로는 못 쓴다 —
// 주인 확인 뒤 관리자 권한으로 그 한 줄의 글만 바꾼다(시각은 그대로, lib/workLanguages editCaptionCue).
// 같은 글을 단 대본 장면(비공개 demo_script)도 같이 고쳐서, 다시 찍어도 옛 글이 되살아나지 않게 한다.
// 촬영 중엔 워커가 곧 시간표를 통째로 새로 쓰므로 거절한다(고친 글이 덮여 사라진다).

const IN_FLIGHT = ["pending", "building", "recording", "editing"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { t } = await getT();
  try {
    const { id } = await params;
    const auth = await requireUser(t.api.loginRequired);
    if (auth instanceof NextResponse) return auth;
    const { user, supabase } = auth;

    if (!(await rateLimit({ name: "caption-edit", key: user.id, windowSeconds: 3600, max: 120 }))) {
      return apiError({ status: 429, message: t.api.retryLater, code: "RATE_LIMITED" });
    }

    const body = await req.json().catch(() => null) as { locale?: unknown; index?: unknown; text?: unknown } | null;
    const locale = normalizeLocale(body?.locale);
    if (!locale || typeof body?.index !== "number" || typeof body?.text !== "string") {
      return apiError({ status: 400, message: t.api.captionNotFound, code: "BAD_REQUEST" });
    }

    const { data: project, error: selErr } = await supabase
      .from("projects")
      .select("id, user_id, demo_build_status, demo_captions")
      .eq("id", id)
      .single();
    if (selErr || !project) {
      return apiError({ status: 404, message: t.api.projectNotFound, code: "NOT_FOUND" });
    }
    if (project.user_id !== user.id) {
      return apiError({ status: 403, message: t.api.projectForbidden, code: "FORBIDDEN" });
    }
    if (IN_FLIGHT.includes(project.demo_build_status ?? "")) {
      return apiError({ status: 409, message: t.api.captionInFlight, code: "IN_FLIGHT" });
    }

    const edit = editCaptionCue(project.demo_captions, locale, body.index, body.text);
    if ("issue" in edit) {
      const message = edit.issue === "empty" ? t.api.captionEmpty
        : edit.issue === "too-long" ? t.api.captionEditTooLong(CAPTION_MAX)
        : t.api.captionNotFound;
      return apiError({ status: 400, message, code: `CAPTION_${edit.issue.toUpperCase().replace("-", "_")}` });
    }

    const admin = createAdminClient();
    // 대본은 비공개 칸 — 주인 확인이 위에서 끝났으니 관리자 권한으로 읽되, user_id를 한 번 더 건다.
    const { data: priv } = await admin
      .from("projects").select("demo_script").eq("id", id).eq("user_id", user.id).single();
    // 정규화본이 아니라 저장된 그대로 위에 고친다 — 정규화가 안 쥐는 칸까지 다시 쓰면 지워진다.
    const raw = priv?.demo_script as DemoScript | null | undefined;
    const script = raw && Array.isArray(raw.steps) ? renameScriptCaption(raw, locale, edit.oldText, edit.text) : null;

    const { error: updErr } = await admin
      .from("projects")
      .update(script ? { demo_captions: edit.track, demo_script: script } : { demo_captions: edit.track })
      .eq("id", id)
      .eq("user_id", user.id);
    if (updErr) {
      return apiError({ status: 500, message: t.api.retryLater, code: "INTERNAL", cause: updErr });
    }

    revalidatePortfolio();
    return NextResponse.json({ ok: true, captions: edit.track });
  } catch (err) {
    return apiError({ status: 500, message: t.api.retryLater, code: "INTERNAL", cause: err });
  }
}
