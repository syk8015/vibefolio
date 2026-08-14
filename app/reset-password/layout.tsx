import type { Metadata } from "next";
import LocalizedTitle from "@/components/LocalizedTitle";

export const metadata: Metadata = { title: "비밀번호 재설정 | Nookframe" };

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <LocalizedTitle ko="비밀번호 재설정 | Nookframe" en="Reset password | Nookframe" />
      {children}
    </>
  );
}
