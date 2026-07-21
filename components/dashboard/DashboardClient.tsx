"use client";

import { useState, useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import ProfileTab from "./ProfileTab";
import ThemeToggle from "@/components/ThemeToggle";

// "profile" is the default tab, so it stays in the initial bundle. The other
// three tabs (ProjectsTab alone is ~1900 lines) are split into their own chunks
// and only fetched when the user actually opens them — they never render on the
// initial dashboard paint, so this is pure bundle weight removed from first load.
const TabFallback = () => (
  <div className="flex justify-center py-20">
    <div
      className="animate-spin"
      style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid var(--border)", borderTopColor: "var(--text-secondary)" }}
    />
  </div>
);
const ProjectsTab = dynamic(() => import("./ProjectsTab"), { loading: TabFallback });
const AnalyticsTab = dynamic(() => import("./AnalyticsTab"), { loading: TabFallback });
const CustomTab = dynamic(() => import("./CustomTab"), { loading: TabFallback });

type Tab = "profile" | "projects" | "analytics" | "custom";

export default function DashboardClient({ user }: { user: User }) {
  const [tab, setTab] = useState<Tab>("profile");
  const [showWelcome, setShowWelcome] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("welcome") === "1") {
      setShowWelcome(true);
      // Clean the URL without reload
      window.history.replaceState({}, "", "/dashboard");
    }
  }, [searchParams]);

  const username = user.user_metadata?.username || user.email?.split("@")[0] || "me";
  const name = user.user_metadata?.name || username;
  const avatarLetter = name.charAt(0).toUpperCase();
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>

      {/* Top nav */}
      <nav
        className="sticky top-0 z-40 flex items-center justify-between px-4 md:px-6 py-3 md:py-4"
        style={{
          background: "var(--nav-bg)",
          backdropFilter: "blur(16px)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {/* Logo */}
        <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center" }}>
          <span style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono), monospace", fontWeight: 500, fontSize: "0.95rem", letterSpacing: "-0.01em" }}>
            nookframe
          </span>
        </Link>

        <div className="flex items-center gap-2 md:gap-3">
          <ThemeToggle />
          {/* Preview link — text hidden on mobile, icon only */}
          <Link
            href={`/${username}`}
            className="vf-button-ghost"
            style={{ padding: "0.5rem 0.9rem", fontSize: "0.8rem" }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M1.5 11.5L11.5 1.5M11.5 1.5H5.5M11.5 1.5V7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="hidden md:inline">내 명함 보기</span>
          </Link>

          {/* Avatar */}
          <div
            className="relative w-8 h-8 rounded-full flex items-center justify-center overflow-hidden"
            style={{
              background: "var(--surface-soft)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-serif), 'Noto Serif KR', serif",
              fontSize: "0.85rem",
              fontWeight: 500,
              flexShrink: 0,
            }}
          >
            {avatarUrl
              ? <Image src={avatarUrl} alt={name} fill sizes="32px" unoptimized className="object-cover" />
              : avatarLetter}
          </div>
          {/* Logout — hidden on mobile */}
          <button
            onClick={handleLogout}
            className="hidden md:block text-xs px-3 py-1.5 rounded-full transition-opacity hover:opacity-70"
            style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", background: "none", border: "none", cursor: "pointer" }}
          >
            로그아웃
          </button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-10">

        {/* Welcome banner */}
        {showWelcome && (
          <div className="vf-card-accent relative mb-8 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: "var(--text-primary)" }} />
                <div>
                  <p className="text-sm mb-1" style={{ color: "var(--text-primary)", fontFamily: "var(--font-serif), 'Noto Serif KR', serif", fontWeight: 500, fontSize: "1rem" }}>
                    명함이 준비됐어요
                  </p>
                  <p className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
                    이제 프로젝트를 추가해서 명함을 채워볼게요.{" "}
                    <button
                      onClick={() => setTab("projects")}
                      className="underline transition-opacity hover:opacity-70"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontWeight: 600, padding: 0 }}>
                      첫 프로젝트 추가하기 →
                    </button>
                  </p>
                </div>
              </div>
              <button onClick={() => setShowWelcome(false)}
                aria-label="환영 배너 닫기"
                className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors hover:opacity-60"
                style={{ background: "var(--surface-soft)", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Page header */}
        <div className="mb-10 text-center">
          <h1
            className="vf-serif-display mb-2"
            style={{ fontSize: "clamp(1.75rem, 4vw, 2.25rem)", fontWeight: 500, margin: 0, marginBottom: "0.5rem" }}
          >
            대시보드
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono), monospace", letterSpacing: "0.02em" }}>
            nookframe.com/<span style={{ color: "var(--text-primary)" }}>{username}</span>
          </p>
        </div>

        {/* Tabs — underline pattern, wraps naturally on mobile */}
        <div
          className="flex flex-wrap justify-center mb-10"
          style={{ borderBottom: "1px solid var(--border)", gap: "0.25rem" }}
        >
          {(["profile", "projects", "analytics", "custom"] as Tab[]).map((t) => {
            const active = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-4 sm:px-5 py-3 text-sm whitespace-nowrap transition-colors"
                style={{
                  background: "transparent",
                  color: active ? "var(--text-primary)" : "var(--text-secondary)",
                  fontFamily: "var(--font-nunito)",
                  fontWeight: active ? 600 : 500,
                  border: "none",
                  borderBottom: active ? "2px solid var(--text-primary)" : "2px solid transparent",
                  marginBottom: "-1px",
                  cursor: "pointer",
                }}
              >
                {t === "profile" ? "프로필" : t === "projects" ? "프로젝트" : t === "analytics" ? "분석" : "커스텀"}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {tab === "profile" ? (
          <ProfileTab user={user} />
        ) : tab === "projects" ? (
          <ProjectsTab user={user} />
        ) : tab === "analytics" ? (
          <AnalyticsTab user={user} />
        ) : (
          <CustomTab user={user} />
        )}
      </div>
    </div>
  );
}
