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
