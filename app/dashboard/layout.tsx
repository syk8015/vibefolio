import ServerLocaleProvider from "@/components/ServerLocaleProvider";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <ServerLocaleProvider>{children}</ServerLocaleProvider>;
}
