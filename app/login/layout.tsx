import type { Metadata } from "next";
import LocalizedTitle from "@/components/LocalizedTitle";

export const metadata: Metadata = { title: "로그인 | Nookframe" };

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <LocalizedTitle ko="로그인 | Nookframe" en="Log in | Nookframe" />
      {children}
    </>
  );
}
