import { LocaleProvider } from "@/lib/i18n/client";
import { getLocale } from "@/lib/i18n/server";

// 루트 레이아웃은 쿠키를 못 읽어(읽으면 정적 페이지 전부가 동적으로 강등) SSR이 늘
// ko로 나가고, 영어 사용자는 마운트 뒤 en으로 바뀌는 한순간 한국어를 본다(B17).
// 로그인·가입·대시보드처럼 첫 화면이 문구뿐인 곳은 여기서 서버가 언어를 정해
// 안쪽 프로바이더로 덮는다 — 이 라우트만 동적 렌더가 되고 번쩍임이 없어진다.
export default async function ServerLocaleProvider({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return <LocaleProvider initialLocale={locale}>{children}</LocaleProvider>;
}
