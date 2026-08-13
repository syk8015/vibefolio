// 수신자 언어 조회 — 이메일 발송 경로 전용(쿠키가 없는 워커·크론·관리자 라우트).
// UI 언어는 NEXT_LOCALE 쿠키가 담당하고, profiles.locale은 로그아웃 상태에서도
// 언어를 알아야 하는 메일에만 쓴다(supabase/migration_profiles_locale.sql).
//
// 컬럼이 아직 없거나(마이그레이션 전) 값이 null이면 DEFAULT_LOCALE(ko) 폴백 —
// 어떤 실패도 메일 발송을 막지 않는다.
import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";

// supabase-js 클라이언트의 postgrest 제네릭에 구조 타입을 맞추면 TS2589
// (과도한 타입 전개)가 나서, from만 요구하고 체이닝은 느슨하게 둔다.
// 결과는 isLocale로 런타임 검증하므로 타입 구멍이 새지 않는다.
type ProfilesReader = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
};

export async function recipientLocale(
  db: ProfilesReader,
  userId: string,
): Promise<Locale> {
  try {
    const { data } = await db
      .from("profiles")
      .select("locale")
      .eq("id", userId)
      .maybeSingle();
    const value = data?.locale;
    return isLocale(value) ? value : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}
