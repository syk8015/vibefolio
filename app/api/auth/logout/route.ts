import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/apiError";

// 로그아웃을 서버로 옮긴 이유는 번들이다. 랜딩 헤더의 프로필 메뉴가
// `supabase.auth.signOut()` 한 줄을 위해 supabase-js를 정적 import 하고 있었고,
// 그 탓에 **로그아웃 상태 방문자에게도** supabase 청크(전송 55KB)가 내려갔다.
// 세션은 @supabase/ssr 쿠키에 있으므로 서버에서 지우는 편이 자연스럽다.
export async function POST(request: NextRequest) {
  // 로그아웃은 부작용이 작지만 남의 사이트가 임의로 걸 이유도 없다.
  // same-origin POST만 받는다(Origin 없는 요청 = 폼/스크립트 아님 → 허용).
  const origin = request.headers.get("origin");
  // `Origin: null`(샌드박스 iframe·file:)이나 깨진 값은 URL()이 던져 500이 났다(5단계 낮음 S1-F12·D2) — 남의 출처로 본다.
  let originHost: string | null = null;
  try { originHost = origin ? new URL(origin).host : null; } catch { originHost = "invalid"; }
  if (origin && originHost !== request.headers.get("host")) {
    return apiError({ status: 403, message: "잘못된 요청입니다.", code: "FORBIDDEN" });
  }

  // scope "local" = 이 기기 세션만 끝낸다. supabase-js 기본값("global")은 폰·컴퓨터에
  // 로그인해 둔 다른 세션까지 전부 푼다(폰→컴퓨터 넘기기로 두 기기를 쓰는 사람이 있다).
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) return apiError({ status: 500, message: "로그아웃에 실패했습니다.", code: "INTERNAL", cause: error });

  return NextResponse.json({ ok: true });
}
