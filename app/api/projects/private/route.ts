import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requireUser } from "@/lib/routeAuth";
import { getT } from "@/lib/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PRIVATE_PROJECT_SELECT } from "@/lib/projectColumns";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 200;

// GET /api/projects/private[?ids=a,b] — 로그인한 주인의 작품들의 비공개 칸
// (lib/projectColumns.ts PRIVATE_PROJECT_COLUMNS). 이 칸들은 사용자 키로 SELECT가 막혀
// 있어서(supabase/migration_private_columns.sql) 대시보드가 여기서 받아 합친다.
//
// 게이트는 한 줄이다: 관리자 권한으로 읽되 `.eq("user_id", user.id)` — 남의 id를 ids에
// 넣어도 그 행은 결과에 안 나온다(에러도 없이 빠짐 → 존재 여부도 안 샌다).
export async function GET(req: NextRequest) {
  const { t } = await getT();
  try {
    const auth = await requireUser(t.api.loginRequired);
    if (auth instanceof NextResponse) return auth;
    const { user } = auth;

    const raw = req.nextUrl.searchParams.get("ids");
    const ids = raw
      ? [...new Set(raw.split(",").map((s) => s.trim()).filter((s) => UUID_RE.test(s)))].slice(0, MAX_IDS)
      : null;
    if (ids && ids.length === 0) {
      return NextResponse.json({ rows: [] }, { headers: { "Cache-Control": "no-store" } });
    }

    let q = createAdminClient().from("projects").select(PRIVATE_PROJECT_SELECT).eq("user_id", user.id);
    if (ids) q = q.in("id", ids);
    const { data, error } = await q;
    if (error) {
      return apiError({ status: 500, message: t.api.retryLater, code: "INTERNAL", cause: error });
    }
    return NextResponse.json({ rows: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return apiError({ status: 500, message: t.api.retryLater, code: "INTERNAL", cause: err });
  }
}
