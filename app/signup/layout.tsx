import type { Metadata } from "next";
import LocalizedTitle from "@/components/LocalizedTitle";
import ServerLocaleProvider from "@/components/ServerLocaleProvider";

export const metadata: Metadata = { title: "회원가입 | Nookframe" };

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return (
    <ServerLocaleProvider>
      <LocalizedTitle ko="회원가입 | Nookframe" en="Sign up | Nookframe" />
      {children}
    </ServerLocaleProvider>
  );
}
