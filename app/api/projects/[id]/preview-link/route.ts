import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requireUser } from "@/lib/routeAuth";
import { getT } from "@/lib/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toPreviewUrl } from "@/lib/previewOrigin";
import { OWNER_PREVIEW_TTL_S, splitPreviewPath, tokenizedPreviewPath } from "@/lib/previewToken";

export const dynamic = "force-dynamic";

// GET /api/projects/[id]/preview-link — 주인이 자기 초안(또는 내려진 작품)의 업로드 화면을 볼 주소
// (2026-11-02, 초안 비공개). /api/preview는 공개 작품 폴더만 누구에게나 열고, 그 밖은 폴더 하나에만 맞는
// 1시간짜리 열쇠가 든 주소로만 연다(lib/previewToken.ts). 대시보드 초안 검토 창이 열릴 때 부른다.
//
// 게이트: 로그인 + 그 행의 주인 + demo_url이 **자기 uid 폴더**를 가리킬 것(남의 폴더를 demo_url에 넣어
// 열쇠를 받아 가는 길을 막는다). 아니면 모두 같은 404.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { t } = await getT();
  try {
    const { id } = await params;
    const auth = await requireUser(t.api.loginRequired);
    if (auth instanceof NextResponse) return auth;
    const { user } = auth;
    const notFound = () => apiError({ status: 404, message: t.api.projectNotFound, code: "NOT_FOUND" });
    if (!UUID_RE.test(id)) return notFound();

    const { data: row, error } = await createAdminClient()
      .from("projects")
      .select("user_id, demo_url")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    const demoUrl = (row?.demo_url as string | null) ?? null;
    const parts = demoUrl ? splitPreviewPath(demoUrl) : null;
    if (!row || !demoUrl || !parts || parts.uid !== user.id) return notFound();

    const path = tokenizedPreviewPath(demoUrl);
    if (!path) return notFound();
    return NextResponse.json(
      { url: toPreviewUrl(path), expiresIn: OWNER_PREVIEW_TTL_S },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return apiError({ status: 500, message: t.api.retryLater, code: "INTERNAL", cause: err });
  }
}
