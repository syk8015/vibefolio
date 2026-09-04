import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { rateLimit } from "@/lib/rate-limit";
import { normalizeTags, normalizeContentType } from "@/lib/projectTaxonomy";
import {
  normalizeDemoAccess, demoAccessAnswered, demoAccessEvidenceMissing, type DemoAccess,
} from "@/lib/demoAccess";
import {
  normalizeDemoScript, substantialStepCount,
  DEMO_SCRIPT_MIN_STEPS, DEMO_SCRIPT_MIN_SUBSTANTIAL, type DemoScript,
} from "@/lib/demoScript";
import { probeSelectors, selectorsOf, composeProbeUrl, type SelectorCheck } from "@/lib/demoScriptReview";
import { logger } from "@/lib/logger";
import {
  ingestAuth, publicUrlGate, strOrNull, type IngestDict, buildAccepted, buildScriptReview,
  descriptionTooLong, DESCRIPTION_MAX, missingScriptColumn,
  descriptionShapeIssue, descriptionShapeMessage,
  pickApiT,
} from "../../shared";

// PATCH·DELETE /api/ingest/drafts/[id] — Nookframe Connect 초안 수정·삭제(요청4).
// is_draft=true 행만 허용: 공개된 프로젝트는 409로 거부해 PAT의 폭발반경(자기
// 초안뿐)을 유지한다. URL·파일(아티팩트) 교체는 여기서 안 받는다 — 같은 URL로
// publish를 다시 실행하면 upsert가 그 초안을 갱신한다(검증 경로 단일화).

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

// 소유·초안 확인 공통부. NextResponse면 그대로 return.
async function loadDraft(
  admin: SupabaseAdmin,
  id: string,
  userId: string,
  t: IngestDict,
): Promise<{ id: string; hasOwnVideo: boolean; demoUrl: string; demoAccess: DemoAccess | null } | NextResponse> {
  const { data: row, error } = await admin
    .from("projects")
    // video_url = 제작자가 직접 준 시연 영상(있으면 자동 촬영을 안 한다) —
    // 대본 게이트의 면제 근거라 여기서 같이 읽는다. demo_url·demo_access는 대본이
    // 바뀔 때 셀렉터 실재 확인(점검표)이 여는 주소.
    .select("id, user_id, is_draft, video_url, demo_url, demo_access")
    .eq("id", id)
    .maybeSingle();
  if (error || !row) {
    return apiError({ status: 404, message: t.api.projectNotFound, code: "NOT_FOUND" });
  }
  if (row.user_id !== userId) {
    return apiError({ status: 403, message: t.api.projectForbidden, code: "FORBIDDEN" });
  }
  if (!row.is_draft) {
    return apiError({ status: 409, message: t.api.finalizeNotDraft, code: "NOT_DRAFT" });
  }
  return {
    id: row.id as string,
    hasOwnVideo: !!(row.video_url as string | null),
    demoUrl: (row.demo_url as string | null) ?? "",
    demoAccess: normalizeDemoAccess(row.demo_access).access,
  };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await ingestAuth(req);
    if (auth.fail) return auth.fail;
    const { userId, t } = auth;

    const allowed = await rateLimit({ name: "ingest-manage", key: userId, windowSeconds: 3600, max: 60 });
    if (!allowed) {
      return apiError({ status: 429, message: t.api.tooManyRequests, code: "RATE_LIMITED" });
    }

    let payload: Record<string, unknown>;
    try {
      payload = (await req.json()) as Record<string, unknown>;
    } catch {
      return apiError({ status: 400, message: t.api.jsonBodyInvalid, code: "BAD_JSON" });
    }
    if (!payload || typeof payload !== "object") {
      return apiError({ status: 400, message: t.api.jsonBodyInvalid, code: "BAD_JSON" });
    }

    // 아티팩트(URL·파일)는 이 경로로 못 바꾼다 — publish 재실행(upsert)로 안내.
    if ("deployUrl" in payload || "appUrl" in payload || "uploads" in payload || "dir" in payload) {
      return apiError({ status: 400, message: t.api.draftUrlImmutable, code: "ARTIFACT_IMMUTABLE" });
    }

    const admin = createAdminClient();
    const draft = await loadDraft(admin, id, userId, t);
    if (draft instanceof NextResponse) return draft;

    // 보낸 키만 갱신 — 검증은 /api/ingest 생성 경로와 같은 규칙.
    const { hasOwnVideo } = draft;
    const upd: Record<string, unknown> = {};
    if ("title" in payload) {
      const title = strOrNull(payload.title);
      if (!title) {
        return apiError({ status: 400, message: t.api.titleRequired, code: "TITLE_REQUIRED" });
      }
      upd.title = title;
    }
    if ("description" in payload) {
      const desc = strOrNull(payload.description) ?? "";
      if (descriptionTooLong(desc)) {
        return apiError({
          status: 400, message: t.api.descriptionTooLong(DESCRIPTION_MAX), code: "DESCRIPTION_TOO_LONG",
        });
      }
      const descIssue = descriptionShapeIssue(desc);
      if (descIssue) {
        return apiError({
          status: 400,
          message: descriptionShapeMessage(descIssue, t),
          code: "DESCRIPTION_SHAPE",
        });
      }
      upd.description = desc;
    }
    if ("builderNote" in payload) upd.comment = strOrNull(payload.builderNote) ?? "";
    if ("demoHighlights" in payload) {
      upd.demo_user_hint = typeof payload.demoHighlights === "string"
        ? payload.demoHighlights.trim().slice(0, 500) || null
        : null;
    }
    if ("demoScript" in payload) {
      // 생성 경로의 대본 게이트를 수정에서도 지킨다 — 여기로 대본을 비우면
      // "게이트를 통과한 뒤 도로 부실해지는" 우회가 된다(초안은 아직 촬영 전이라
      // 이 값이 그대로 필름이 된다). 영상 동봉분은 애초에 자동 촬영을 안 하므로 면제.
      const next = normalizeDemoScript(payload.demoScript);
      const steps = next?.steps.length ?? 0;
      if (!hasOwnVideo && steps === 0) {
        return apiError({ status: 400, message: t.api.scriptRequired, code: "SCRIPT_REQUIRED" });
      }
      if (!hasOwnVideo && steps < DEMO_SCRIPT_MIN_STEPS) {
        return apiError({ status: 400, message: t.api.scriptTooThin(steps), code: "SCRIPT_TOO_THIN" });
      }
      const solid = next ? substantialStepCount(next) : 0;
      if (!hasOwnVideo && solid < DEMO_SCRIPT_MIN_SUBSTANTIAL) {
        return apiError({
          status: 400,
          message: t.api.scriptStepsVague(solid, steps),
          code: "SCRIPT_STEPS_VAGUE",
        });
      }
      upd.demo_script = next;
    }
    if ("tags" in payload) upd.tags = normalizeTags(payload.tags);
    if ("contentType" in payload) upd.content_type = normalizeContentType(payload.contentType);
    if ("demoAccess" in payload) {
      const norm = normalizeDemoAccess(payload.demoAccess);
      if (norm.issue === "bad-url") {
        return apiError({ status: 400, message: t.api.demoAccessBadUrl, code: "BAD_DEMO_ACCESS" });
      }
      // url(데모 진입)·altUrl(촬영 전 정찰 후보, 피드백 B-4) 둘 다 워커가 실제로
      // 여는 주소 — 생성 경로와 같은 게이트를 태운다.
      for (const u of [norm.access?.url, norm.access?.altUrl]) {
        if (!u || u.startsWith("/")) continue;
        const gate = await publicUrlGate(u, t);
        if (gate) return gate;
      }
      // 대본 게이트와 같은 이유로 수정 경로도 막는다: 여기로 demoAccess를 비우면
      // 생성 게이트를 통과한 뒤 도로 "로그인 화면만 찍히는 초안"이 되는 우회가 된다.
      // 초안은 아직 촬영 전이라 이 값이 그대로 촬영 조건이 된다.
      if (!hasOwnVideo && !demoAccessAnswered(norm.access)) {
        return apiError({
          status: 400,
          message: t.api.demoAccessRequired,
          code: "DEMO_ACCESS_REQUIRED",
        });
      }
      const missing = hasOwnVideo ? null : demoAccessEvidenceMissing(norm.access);
      if (missing) {
        return apiError({
          status: 400,
          message: t.api.demoAccessEvidence(missing),
          code: "DEMO_ACCESS_EVIDENCE",
        });
      }
      upd.demo_access = norm.access;
    }
    if (!Object.keys(upd).length) {
      return apiError({ status: 400, message: t.api.draftNoFields, code: "NO_FIELDS" });
    }

    // 대본 점검표의 셀렉터 확인 — 대본이 바뀐 요청에서만, 생성 경로와 같은 규칙
    // (DB 갱신과 겹쳐 돌리고 응답 직전에 받는다). demoAccess를 같이 바꿨으면 그걸로.
    let selectorProbe: Promise<SelectorCheck> | null = null;
    const nextScript = upd.demo_script as DemoScript | null | undefined;
    if (!hasOwnVideo && nextScript && /^https?:\/\//i.test(draft.demoUrl)) {
      const access = "demo_access" in upd ? (upd.demo_access as DemoAccess | null) : draft.demoAccess;
      selectorProbe = probeSelectors(composeProbeUrl(draft.demoUrl, access), selectorsOf(nextScript));
    }

    // 갱신된 행을 그대로 돌려받아 에코를 만든다(C-1) — 보낸 키만 바뀌므로
    // "요청 payload"로는 최종 상태를 알 수 없다. 저장된 행이 유일한 진실.
    const AFTER_COLS =
      "title, description, comment, demo_user_hint, demo_script, tags, content_type, demo_access, demo_url";
    let { data: after, error: updErr } = await admin
      .from("projects")
      .update(upd)
      .eq("id", draft.id)
      .select(AFTER_COLS)
      .single();
    // migration_demo_script.sql 적용 전 디그레이드(ingest 생성 경로와 동일 정책).
    if (missingScriptColumn(updErr)) {
      delete upd.demo_script;
      if (!Object.keys(upd).length) {
        return apiError({ status: 400, message: t.api.draftNoFields, code: "NO_FIELDS" });
      }
      ({ data: after, error: updErr } = await admin
        .from("projects")
        .update(upd)
        .eq("id", draft.id)
        .select(AFTER_COLS.replace(", demo_script", ""))
        .single());
    }
    if (updErr) {
      return apiError({ status: 500, message: t.api.retryLater, code: "DB_UPDATE_FAILED", cause: updErr });
    }
    const storedScript = ((after as { demo_script?: unknown } | null)?.demo_script ?? null) as DemoScript | null;
    // 점검표는 저장된(=촬영될) 대본 기준. 대본을 안 바꾼 PATCH에도 숫자는 싣고,
    // 셀렉터 확인은 대본이 바뀐 요청에서만 붙는다.
    const scriptReview = !hasOwnVideo && storedScript
      ? buildScriptReview(storedScript, selectorProbe ? await selectorProbe : null, t)
      : undefined;
    return NextResponse.json({
      ok: true,
      projectId: draft.id,
      reviewUrl: `${req.nextUrl.origin}/dashboard?review=${draft.id}`,
      accepted: buildAccepted(payload as Record<string, unknown>, {
        title: after?.title ?? "",
        description: after?.description ?? "",
        comment: after?.comment ?? "",
        demoHint: after?.demo_user_hint ?? null,
        demoScript: storedScript,
        tags: after?.tags ?? [],
        contentTypeId: after?.content_type ?? null,
        demoAccess: after?.demo_access ?? null,
        entryUrl: after?.demo_url ?? null,
      }, normalizeTags, scriptReview),
    });
  } catch (err) {
    const tc = await pickApiT(req);
    return apiError({ status: 500, message: tc.api.retryLater, code: "INTERNAL", cause: err });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await ingestAuth(req);
    if (auth.fail) return auth.fail;
    const { userId, t } = auth;

    const allowed = await rateLimit({ name: "ingest-manage", key: userId, windowSeconds: 3600, max: 60 });
    if (!allowed) {
      return apiError({ status: 429, message: t.api.tooManyRequests, code: "RATE_LIMITED" });
    }

    const admin = createAdminClient();
    const draft = await loadDraft(admin, id, userId, t);
    if (draft instanceof NextResponse) return draft;

    // 스토리지 정리 — 인제스트 초안의 파일은 전부 행 폴더 {uid}/{id}/ 아래에 있다
    // (zip 확장·_media·_upload — 행을 먼저 만들고 그 id 폴더에 올리는 설계라,
    // demo-assets 삭제 라우트의 M16 우회 폴더 문제가 초안엔 없다). R2는 발행 후
    // 데모 산출물 전용이라 초안엔 없음. list는 한 겹만 보므로 BFS.
    const root = `${userId}/${draft.id}`;
    const files: string[] = [];
    const queue = [root];
    while (queue.length) {
      const dir = queue.shift()!;
      const { data } = await admin.storage.from("project-files").list(dir, { limit: 1000 });
      for (const entry of data ?? []) {
        const full = `${dir}/${entry.name}`;
        if (entry.id === null) queue.push(full);
        else files.push(full);
      }
    }
    for (let i = 0; i < files.length; i += 100) {
      const chunk = files.slice(i, i + 100);
      const { error } = await admin.storage.from("project-files").remove(chunk);
      if (error) throw new Error(`storage remove failed: ${error.message}`);
    }

    const { error: delErr } = await admin.from("projects").delete().eq("id", draft.id);
    if (delErr) throw new Error(`row delete failed: ${delErr.message}`);

    logger.info("ingest draft deleted", { projectId: draft.id, filesRemoved: files.length });
    return NextResponse.json({ ok: true, deleted: true, projectId: draft.id });
  } catch (err) {
    const tc = await pickApiT(req);
    return apiError({ status: 500, message: tc.api.retryLater, code: "INTERNAL", cause: err });
  }
}
