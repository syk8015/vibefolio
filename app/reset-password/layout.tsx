import type { Metadata } from "next";
import { localizedTitle } from "@/lib/i18n/metadata";

export function generateMetadata(): Promise<Metadata> {
  return localizedTitle("비밀번호 재설정 | nookframe", "Reset password | nookframe");
}

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
