import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isLocale } from "@/lib/i18n/config";

// POST /api/account/locale — 언어 토글이 fire-and-forget으로 쏘는 저장 경로.
// UI 언어는 NEXT_LOCALE 쿠키가 담당하고, 여기서는 로그인 상태일 때만
// profiles.locale을 갱신한다(로그아웃 상태에서 발송되는 이메일의 언어 근거,
// supabase/migration_profiles_locale.sql). RLS(own-row update)로 쓰므로
// 서비스롤이 필요 없다.
//
// 어떤 실패(비로그인·컬럼 미적용·DB 블립)도 토글 UX에 영향이 없어야 하므로
// 조용히 ok를 돌려준다 — apiError 표준 포맷을 안 쓰는 이유(클라이언트가 응답을
// 무시하는 fire-and-forget 계약).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const locale = body?.locale;
    if (!isLocale(locale)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("profiles").update({ locale }).eq("id", user.id);
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
