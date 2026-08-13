import { cookies, headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  matchLanguageTags,
  type Locale,
} from "./config";
import { getDictionary } from "./dictionaries";

// 주의: cookies()/headers()를 읽는 순간 그 라우트는 동적 렌더링으로 바뀐다.
// 60s 캐시가 걸린 퍼블릭 페이지(랜딩·/[username])에서는 getT를 쓰지 말고
// 클라이언트 쪽 useT로 처리할 것 — 캐시가 깨지면 언어가 섞여 나간다.

export async function getLocale(): Promise<Locale> {
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(cookie)) return cookie;
  const accept = (await headers()).get("accept-language");
  return (accept && matchLanguageTags(accept.split(","))) || DEFAULT_LOCALE;
}

export async function getT() {
  const locale = await getLocale();
  return { locale, t: getDictionary(locale) };
}
