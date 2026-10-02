import type { Metadata } from "next";
import { localizedTitle } from "@/lib/i18n/metadata";

export function generateMetadata(): Promise<Metadata> {
  return localizedTitle("비밀번호 찾기 | Nookframe", "Forgot password | Nookframe");
}

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
