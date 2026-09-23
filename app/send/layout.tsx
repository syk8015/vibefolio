import type { Metadata } from "next";
import LocalizedTitle from "@/components/LocalizedTitle";
import ServerLocaleProvider from "@/components/ServerLocaleProvider";

// 폰 → 컴퓨터 넘기기 화면. 검색에 올릴 페이지가 아니다(랜딩에서 폰만 들어온다).
export const metadata: Metadata = {
  title: "컴퓨터로 보내기 | Nookframe",
  robots: { index: false, follow: false },
};

export default function SendLayout({ children }: { children: React.ReactNode }) {
  return (
    <ServerLocaleProvider>
      <LocalizedTitle ko="컴퓨터로 보내기 | Nookframe" en="Send to your computer | Nookframe" />
      {children}
    </ServerLocaleProvider>
  );
}
