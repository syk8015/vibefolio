import type { Metadata } from "next";
import { localizedTitle } from "@/lib/i18n/metadata";
import ServerLocaleProvider from "@/components/ServerLocaleProvider";

// 폰 → 컴퓨터 넘기기 화면. 검색에 올릴 페이지가 아니다(랜딩에서 폰만 들어온다).
export async function generateMetadata(): Promise<Metadata> {
  return { ...(await localizedTitle("컴퓨터로 보내기 | Nookframe", "Send to your computer | Nookframe")), robots: { index: false, follow: false } };
}

export default function SendLayout({ children }: { children: React.ReactNode }) {
  return <ServerLocaleProvider>{children}</ServerLocaleProvider>;
}
