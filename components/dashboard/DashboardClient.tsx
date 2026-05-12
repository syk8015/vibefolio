"use client";

import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import ProfileTab from "./ProfileTab";
import ProjectsTab from "./ProjectsTab";
import CustomTab from "./CustomTab";
import AnalyticsTab from "./AnalyticsTab";
import ThemeToggle from "@/components/ThemeToggle";

type Tab = "profile" | "projects" | "analytics" | "custom";

export default function DashboardClient({ user }: { user: User }) {
  const [tab, setTab] = useState<Tab>("profile");
  const router = useRouter();

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
        className="sticky top-0 z-40 flex items-center justify-between px-6 py-4"
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

        <div className="flex items-center gap-3">
          <ThemeToggle />
          {/* Preview link */}
          <Link
            href={`/${username}`}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-opacity hover:opacity-75"
            style={{ border: "1px solid var(--border-bright)", color: "var(--text-primary)", fontFamily: "var(--font-nunito)", textDecoration: "none" }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M1.5 11.5L11.5 1.5M11.5 1.5H5.5M11.5 1.5V7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            내 명함 보기
          </Link>

          {/* Avatar + logout */}
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black overflow-hidden"
              style={{ background: "var(--blue)", color: "#fff", fontFamily: "var(--font-nunito)" }}
            >
              {avatarUrl
                ? <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
                : avatarLetter}
            </div>
            <button
              onClick={handleLogout}
              className="text-xs font-bold px-3 py-1.5 rounded-full transition-opacity hover:opacity-70"
              style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", background: "none", border: "none", cursor: "pointer" }}
            >
              로그아웃
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-10">

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
        <div className="flex justify-center mb-8">
        <div
          className="flex gap-1 p-1 rounded-xl"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          {(["profile", "projects", "analytics", "custom"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-5 py-2 rounded-lg text-sm font-bold transition-all duration-150"
              style={{
                background: tab === t ? (t === "custom" ? "#f59e0b" : "var(--blue)") : "transparent",
                color: tab === t ? (t === "custom" ? "#000" : "#fff") : "var(--text-secondary)",
                fontFamily: "var(--font-nunito)",
                border: "none",
                cursor: "pointer",
              }}
            >
              {t === "profile" ? "프로필" : t === "projects" ? "프로젝트" : t === "analytics" ? "분석" : "🚧 커스텀"}
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
