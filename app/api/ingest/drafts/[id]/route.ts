import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { getT } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { rateLimit } from "@/lib/rate-limit";
import { bearerFromHeader } from "@/lib/apiToken";
import { normalizeTags, normalizeContentType } from "@/lib/projectTaxonomy";
import { normalizeDemoAccess } from "@/lib/demoAccess";
import { logger } from "@/lib/logger";
import { ingestAuth, publicUrlGate, strOrNull, type IngestDict } from "../../shared";

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
): Promise<{ id: string } | NextResponse> {
  const { data: row, error } = await admin
    .from("projects")
    .select("id, user_id, is_draft")
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
  return { id: row.id as string };
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
    const upd: Record<string, unknown> = {};
    if ("title" in payload) {
      const title = strOrNull(payload.title);
      if (!title) {
        return apiError({ status: 400, message: t.api.titleRequired, code: "TITLE_REQUIRED" });
      }
      upd.title = title;
    }
    if ("description" in payload) upd.description = strOrNull(payload.description) ?? "";
    if ("builderNote" in payload) upd.comment = strOrNull(payload.builderNote) ?? "";
    if ("demoHighlights" in payload) {
      upd.demo_user_hint = typeof payload.demoHighlights === "string"
        ? payload.demoHighlights.trim().slice(0, 500) || null
        : null;
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
      upd.demo_access = norm.access;
    }
    if (!Object.keys(upd).length) {
      return apiError({ status: 400, message: t.api.draftNoFields, code: "NO_FIELDS" });
    }

    const { error: updErr } = await admin.from("projects").update(upd).eq("id", draft.id);
    if (updErr) {
      return apiError({ status: 500, message: t.api.retryLater, code: "DB_UPDATE_FAILED", cause: updErr });
    }
    return NextResponse.json({
      ok: true,
      projectId: draft.id,
      reviewUrl: `${req.nextUrl.origin}/dashboard?review=${draft.id}`,
    });
  } catch (err) {
    const tc = bearerFromHeader(req.headers.get("authorization")) ? getDictionary("en") : (await getT()).t;
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
    const tc = bearerFromHeader(req.headers.get("authorization")) ? getDictionary("en") : (await getT()).t;
    return apiError({ status: 500, message: tc.api.retryLater, code: "INTERNAL", cause: err });
  }
}
