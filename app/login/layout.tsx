import type { Metadata } from "next";
import { localizedTitle } from "@/lib/i18n/metadata";
import ServerLocaleProvider from "@/components/ServerLocaleProvider";

export function generateMetadata(): Promise<Metadata> {
  return localizedTitle("로그인 | Nookframe", "Log in | Nookframe");
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <ServerLocaleProvider>{children}</ServerLocaleProvider>;
}
