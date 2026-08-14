import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { getT } from "@/lib/i18n/server";
import { generateToken, MAX_TOKENS_PER_USER } from "@/lib/apiToken";
import { AUTO_TOKEN_NAME } from "@/lib/connectSnippets";

// POST /api/tokens — 로그인한 유저가 새 개인 액세스 토큰(PAT)을 발급한다.
// raw 토큰은 이 응답에서 딱 한 번만 노출된다(DB엔 sha256 해시만 저장). 발급/조회는
// 서비스롤 경로 — api_tokens 엔 insert RLS 정책이 없어 클라 직접 쓰기는 막혀 있다.
export async function POST(req: NextRequest) {
  const { t } = await getT();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return apiError({ status: 401, message: t.api.loginRequired, code: "UNAUTHORIZED" });
    }

    let name: string | null = null;
    let auto = false;
    try {
      const body = await req.json();
      auto = body?.auto === true;
      if (typeof body?.name === "string") name = body.name.trim().slice(0, 80) || null;
    } catch {
      /* name·auto는 선택 — 본문 없어도 됨 */
    }

    const admin = createAdminClient();

    // 자동발급(연결 패널 "프롬프트 복사") — 살아있는 자동발급 토큰은 유저당 항상
    // 1개가 되도록 이전 것을 먼저 폐기한다(복사할 때마다 새 토큰, 이전 것은 즉시 무효).
    // 폐기가 실패하면 발급도 멈춘다 — "이전 토큰은 죽었다"는 약속이 UI 문구에 있다.
    if (auto) {
      name = AUTO_TOKEN_NAME;
      const { error: revokeErr } = await admin
        .from("api_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("name", AUTO_TOKEN_NAME)
        .is("revoked_at", null);
      if (revokeErr) {
        return apiError({
          status: 500,
          message: t.api.tokenCreateFailed,
          code: "DB_REVOKE_FAILED",
          cause: revokeErr,
        });
      }
    }

    const { count } = await admin
      .from("api_tokens")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("revoked_at", null);
    if ((count ?? 0) >= MAX_TOKENS_PER_USER) {
      return apiError({
        status: 409,
        message: t.api.tokenLimit(MAX_TOKENS_PER_USER),
        code: "TOKEN_LIMIT",
      });
    }

    const { raw, hash, prefix } = generateToken();
    const { error } = await admin.from("api_tokens").insert({
      user_id: user.id,
      token_hash: hash,
      token_prefix: prefix,
      name,
    });
    if (error) {
      return apiError({
        status: 500,
        message: t.api.tokenCreateFailed,
        code: "DB_INSERT_FAILED",
        cause: error,
      });
    }

    // raw는 여기서만. 클라이언트는 이 값을 복사해 NOOKFRAME_TOKEN으로 저장한다.
    return NextResponse.json({ ok: true, token: raw, prefix });
  } catch (err) {
    return apiError({ status: 500, message: t.api.retryLater, code: "INTERNAL", cause: err });
  }
}
