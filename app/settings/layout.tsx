import type { Metadata } from "next";
import ServerLocaleProvider from "@/components/ServerLocaleProvider";

// 설정은 로그인한 사람만 보는 화면 — 검색에서 뺀다. 문구뿐인 첫 화면이라 대시보드처럼 서버가
// 언어를 정한다(ServerLocaleProvider — 영어 사용자가 한순간 한국어를 보지 않게).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <ServerLocaleProvider>{children}</ServerLocaleProvider>;
}
