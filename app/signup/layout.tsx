import type { Metadata } from "next";
import { localizedTitle } from "@/lib/i18n/metadata";
import ServerLocaleProvider from "@/components/ServerLocaleProvider";

export function generateMetadata(): Promise<Metadata> {
  return localizedTitle("회원가입 | nookframe", "Sign up | nookframe");
}

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <ServerLocaleProvider>{children}</ServerLocaleProvider>;
}
