"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/LanguageToggle";
import { useT } from "@/lib/i18n/client";

// 로그인 뒤 작업 화면(대시보드·설정)의 위쪽 줄 — 계정 유틸만. 아이덴티티는 대시보드의 미니 명함이
// 맡는다. [설정]은 09-26에 생겼다(시안=claude.ai/artifact/JG1rHep7VpWvfWbBBJo6og).
export default function AppNav({ current }: { current?: "settings" }) {
  const { t } = useT();
  const router = useRouter();

  async function handleLogout() {
    // 이 기기만 — 기본값 global은 다른 기기 세션까지 푼다(app/api/auth/logout 참고).
    await createClient().auth.signOut({ scope: "local" });
    router.push("/");
    router.refresh();
  }

  const onSettings = current === "settings";
  return (
    <nav
      className="sticky top-0 z-40 flex items-center justify-between px-4 md:px-6 py-3 md:py-4"
      style={{
        background: "var(--nav-bg)",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center" }}>
        <span style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono), monospace", fontWeight: 500, fontSize: "0.95rem", letterSpacing: "-0.01em" }}>
          nookframe
        </span>
      </Link>
      <div className="flex items-center gap-2 md:gap-3">
        <LanguageToggle />
        <ThemeToggle />
        <Link
          href="/settings"
          aria-current={onSettings ? "page" : undefined}
          className="text-sm px-2 md:px-3 py-1.5 rounded-full transition-opacity hover:opacity-70"
          style={{
            color: onSettings ? "var(--text-primary)" : "var(--text-secondary)",
            background: onSettings ? "var(--surface-soft)" : "transparent",
            fontWeight: onSettings ? 600 : 400,
            fontFamily: "var(--font-nunito)", textDecoration: "none", whiteSpace: "nowrap",
          }}
        >
          {t.landing.settings}
        </Link>
        <button
          onClick={handleLogout}
          className="text-sm px-2 md:px-3 py-1.5 rounded-full transition-opacity hover:opacity-70"
          style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}
        >
          {t.dashboard.logout}
        </button>
      </div>
    </nav>
  );
}
