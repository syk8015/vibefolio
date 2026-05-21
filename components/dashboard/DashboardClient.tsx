"use client";

import { useState, useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import ProfileTab from "./ProfileTab";
import ProjectsTab from "./ProjectsTab";
import CustomTab from "./CustomTab";
import AnalyticsTab from "./AnalyticsTab";
import ThemeToggle from "@/components/ThemeToggle";

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
        <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "8px" }}>
          <div className="w-2 h-2 rounded-full" style={{ background: "var(--blue)", boxShadow: "0 0 8px var(--blue)" }} />
          <span className="font-black text-base" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
            Vibefolio
          </span>
        </Link>

        <div className="flex items-center gap-2 md:gap-3">
          <ThemeToggle />
          {/* Preview link — text hidden on mobile, icon only */}
          <Link
            href={`/${username}`}
            className="flex items-center gap-1.5 px-2.5 md:px-4 py-2 rounded-full text-sm font-bold transition-opacity hover:opacity-75"
            style={{ border: "1px solid var(--border-bright)", color: "var(--text-primary)", fontFamily: "var(--font-nunito)", textDecoration: "none" }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M1.5 11.5L11.5 1.5M11.5 1.5H5.5M11.5 1.5V7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="hidden md:inline">내 명함 보기</span>
          </Link>

          {/* Avatar */}
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black overflow-hidden"
            style={{ background: "var(--blue)", color: "var(--bg)", fontFamily: "var(--font-nunito)", flexShrink: 0 }}
          >
            {avatarUrl
              ? <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
              : avatarLetter}
          </div>
          {/* Logout — hidden on mobile */}
          <button
            onClick={handleLogout}
            className="hidden md:block text-xs font-bold px-3 py-1.5 rounded-full transition-opacity hover:opacity-70"
            style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", background: "none", border: "none", cursor: "pointer" }}
          >
            로그아웃
          </button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-10">

        {/* Welcome banner */}
        {showWelcome && (
          <div className="relative mb-8 p-4 rounded-2xl overflow-hidden"
            style={{ background: "var(--blue-tint)", border: "1px solid var(--border-bright)" }}>
            <div className="absolute inset-0 opacity-5"
              style={{ background: "linear-gradient(135deg, var(--blue) 0%, transparent 60%)" }} />
            <div className="relative flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: "var(--blue)", boxShadow: "0 0 12px var(--blue-glow)" }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M7 1l1.5 3.5L12 5.5l-2.5 2.5.5 3.5L7 10l-3 1.5.5-3.5L2 5.5l3.5-1z" fill="#fff" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-black mb-0.5" style={{ color: "var(--blue-bright)", fontFamily: "var(--font-nunito)" }}>
                    명함이 준비됐어요!
                  </p>
                  <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
                    이제 프로젝트를 추가해서 명함을 채워볼게요.{" "}
                    <button
                      onClick={() => setTab("projects")}
                      className="font-black underline transition-opacity hover:opacity-75"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--blue)", fontFamily: "var(--font-nunito)", padding: 0 }}>
                      첫 프로젝트 추가하기 →
                    </button>
                  </p>
                </div>
              </div>
              <button onClick={() => setShowWelcome(false)}
                className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-opacity hover:opacity-60"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", cursor: "pointer", color: "var(--text-muted)" }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Page header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-black mb-1" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", letterSpacing: "-0.02em" }}>
            대시보드
          </h1>
          <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
            vibefolio.com/<span style={{ color: "var(--blue)" }}>{username}</span>
          </p>
        </div>

        {/* Tabs */}
        <div className="flex justify-center mb-8 overflow-x-auto">
          <div
            className="flex gap-1 p-1 rounded-xl shrink-0"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            {(["profile", "projects", "analytics", "custom"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-3 sm:px-5 py-2 rounded-lg text-sm font-bold transition-all duration-150 whitespace-nowrap"
                style={{
                  background: tab === t ? (t === "custom" ? "#f59e0b" : "var(--blue)") : "transparent",
                  color: tab === t ? (t === "custom" ? "#000" : "#fff") : "var(--text-secondary)",
                  fontFamily: "var(--font-nunito)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {t === "profile" ? "프로필" : t === "projects" ? "프로젝트" : t === "analytics" ? "분석" : "커스텀"}
              </button>
            ))}
          </div>
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
