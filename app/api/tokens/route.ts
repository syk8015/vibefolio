import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { generateToken, MAX_TOKENS_PER_USER } from "@/lib/apiToken";

// POST /api/tokens — 로그인한 유저가 새 개인 액세스 토큰(PAT)을 발급한다.
// raw 토큰은 이 응답에서 딱 한 번만 노출된다(DB엔 sha256 해시만 저장). 발급/조회는
// 서비스롤 경로 — api_tokens 엔 insert RLS 정책이 없어 클라 직접 쓰기는 막혀 있다.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return apiError({ status: 401, message: "로그인이 필요해요.", code: "UNAUTHORIZED" });
    }

    const admin = createAdminClient();
    const { count } = await admin
      .from("api_tokens")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("revoked_at", null);
    if ((count ?? 0) >= MAX_TOKENS_PER_USER) {
      return apiError({
        status: 409,
        message: `토큰은 최대 ${MAX_TOKENS_PER_USER}개까지 만들 수 있어요. 안 쓰는 토큰을 폐기해 주세요.`,
        code: "TOKEN_LIMIT",
      });
    }

    let name: string | null = null;
    try {
      const body = await req.json();
      if (typeof body?.name === "string") name = body.name.trim().slice(0, 80) || null;
    } catch {
      /* name은 선택 — 본문 없어도 됨 */
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
        message: "토큰을 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
        code: "DB_INSERT_FAILED",
        cause: error,
      });
    }

    // raw는 여기서만. 클라이언트는 이 값을 복사해 NOOKFRAME_TOKEN으로 저장한다.
    return NextResponse.json({ ok: true, token: raw, prefix });
  } catch (err) {
    return apiError({ status: 500, message: "잠시 후 다시 시도해 주세요.", code: "INTERNAL", cause: err });
  }
}
