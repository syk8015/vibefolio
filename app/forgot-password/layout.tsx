import type { Metadata } from "next";
import LocalizedTitle from "@/components/LocalizedTitle";

export const metadata: Metadata = { title: "비밀번호 찾기 | Nookframe" };

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <LocalizedTitle ko="비밀번호 찾기 | Nookframe" en="Forgot password | Nookframe" />
      {children}
    </>
  );
}
