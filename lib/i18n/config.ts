// i18n 공통 상수 — 서버/클라 양쪽에서 import 가능 (next/headers 금지)

export type Locale = "ko" | "en";

export const LOCALES: readonly Locale[] = ["ko", "en"];
export const DEFAULT_LOCALE: Locale = "ko";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: unknown): value is Locale {
  return value === "ko" || value === "en";
}

// Accept-Language·navigator.languages는 선호 순서로 오므로
// q값 파싱 없이 첫 매치를 쓴다. 둘 다 없으면 null(호출부가 기본값 결정).
export function matchLanguageTags(tags: readonly string[]): Locale | null {
  for (const raw of tags) {
    const tag = raw.split(";")[0].trim().toLowerCase();
    if (tag.startsWith("ko")) return "ko";
    if (tag.startsWith("en")) return "en";
  }
  return null;
}

// 언어 정보(쿠키·Accept-Language)가 없는 요청 = 거의 링크 미리보기·검색 로봇. 주 대상이 영어권이라
// 영어로 답하고(2026-11-05, 그전엔 ko), 한국어 채널인 카카오톡의 미리보기 로봇(kakaotalk-scrap)만
// 한국어. 사람 방문자는 브라우저가 늘 Accept-Language를 보내므로 이 길로 오지 않는다.
// DEFAULT_LOCALE(받는 사람 언어를 모를 때의 메일 등)은 그대로 ko다.
export function fallbackLocale(userAgent: string | null | undefined): Locale {
  return /kakaotalk/i.test(userAgent ?? "") ? "ko" : "en";
}
