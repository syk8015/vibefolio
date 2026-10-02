import type { Metadata } from "next";
import { localizedTitle } from "@/lib/i18n/metadata";
import ServerLocaleProvider from "@/components/ServerLocaleProvider";

export function generateMetadata(): Promise<Metadata> {
  return localizedTitle("회원가입 | Nookframe", "Sign up | Nookframe");
}

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <ServerLocaleProvider>{children}</ServerLocaleProvider>;
}
