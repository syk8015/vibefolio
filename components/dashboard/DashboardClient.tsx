"use client";

import { useState, useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { copyText } from "@/lib/clipboard";
import { StampSeal } from "@/components/theater/Meishi";
import ProjectsTab from "./ProjectsTab";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/LanguageToggle";
import { useT } from "@/lib/i18n/client";

// "projects" is the default tab, so it stays in the initial bundle. The other
// two tabs are split into their own chunks and only fetched when opened.
const TabFallback = () => (
  <div className="flex justify-center py-20">
    <div className="vf-spinner" />
  </div>
);
const CardTab = dynamic(() => import("./CardTab"), { loading: TabFallback });
const VisitsTab = dynamic(() => import("./VisitsTab"), { loading: TabFallback });

// 탭 id = 유저가 보는 이름과 같은 뜻(작품·명함·방문) — 옛 settings("연결")처럼
// 라벨과 어긋난 내부 이름을 다시 만들지 않는다. 라벨은 컴포넌트 안에서 사전으로.
type Tab = "projects" | "card" | "visits";

// The dashboard's copy of the profiles row — the same row the public card reads.
// Display values (name, avatar, username) come from here, never auth metadata:
// the two can drift apart and the card is the one visitors actually see.
export interface DashboardProfile {
  id: string;
  username: string;
  name: string | null;
  bio: string | null;
  avatar_url: string | null;
  social_links: string[] | null;
  twitter: string | null;
  github: string | null;
}

export default function DashboardClient({ user, profile, publishedCount, totalCount }: {
  user: User;
  profile: DashboardProfile;
  publishedCount: number;
  totalCount: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useT();
  const TAB_LABEL: Record<Tab, string> = {
    projects: t.dashboard.tabProjects,
    card: t.dashboard.tabCard,
    visits: t.dashboard.tabVisits,
  };
  // ?tab=(탭 상태) · ?welcome=1(온보딩 배너) · ?review=<id>(초안 검토 딥링크)는
  // 마운트 시 1회 소비하는 진입 파라미터 — lazy init으로 읽고, 이펙트는 URL
  // 정리만 한다. (마운트 중 같은 페이지로 재네비게이션하는 진입 경로는 없음.)
  const [tab, setTab] = useState<Tab>(() => {
    if (searchParams.get("review")) return "projects";
    const t = searchParams.get("tab");
    return t === "card" || t === "visits" ? t : "projects";
  });
  const [showWelcome, setShowWelcome] = useState(() => searchParams.get("welcome") === "1");
  const [reviewId] = useState<string | null>(() => searchParams.get("review"));
  const [addrCopied, setAddrCopied] = useState(false);

  useEffect(() => {
    if (searchParams.get("welcome") === "1" || searchParams.get("review")) {
      // Clean the one-shot params without reload; ?tab= is re-written by switchTab.
      window.history.replaceState({}, "", "/dashboard");
    }
  }, [searchParams]);

  // 탭을 URL에 반영 — 새로고침·링크 공유가 지금 보던 탭으로 돌아온다.
  // (replaceState라 히스토리 스택은 쌓지 않는다 — 뒤로가기는 대시보드 밖으로.)
  function switchTab(t: Tab) {
    setTab(t);
    window.history.replaceState({}, "", t === "projects" ? "/dashboard" : `/dashboard?tab=${t}`);
  }

  const username = profile.username || user.email?.split("@")[0] || "me";
  const name = profile.name || username;
  const cardUrl = `nookframe.com/${username}`;

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  async function copyAddress() {
    if (await copyText(`https://${cardUrl}`)) {
      setAddrCopied(true);
      setTimeout(() => setAddrCopied(false), 1600);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>

      {/* Top nav — 계정 유틸만. 아이덴티티는 아래 미니 명함이 맡는다. */}
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
          <button
            onClick={handleLogout}
            className="text-xs px-3 py-1.5 rounded-full transition-opacity hover:opacity-70"
            style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", background: "none", border: "none", cursor: "pointer" }}
          >
            {t.dashboard.logout}
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
                    {t.dashboard.welcomeTitle}
                  </p>
                  <p className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
                    {t.dashboard.welcomeBody}{" "}
                    <button
                      onClick={() => switchTab("projects")}
                      className="vf-button-text underline"
                      style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                      {t.dashboard.welcomeCta}
                    </button>
                  </p>
                </div>
              </div>
              <button onClick={() => setShowWelcome(false)}
                aria-label={t.dashboard.welcomeClose}
                className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors hover:opacity-60"
                style={{ background: "var(--surface-soft)", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Identity header — 실물 명함(MeishiBig)의 축소판. 같은 문법만 쓴다:
            세리프 이름 · mono 핸들 · No.=공개 작품 수 · 이니셜 도장. 대시보드가
            보여주는 "내 명함"과 방문자가 받는 명함이 어긋나지 않게 하는 장치. */}
        <div className="flex flex-wrap items-center gap-x-7 gap-y-5 mb-9">
          <div
            className="relative shrink-0"
            style={{
              background: "var(--surface)",
              borderRadius: 4,
              boxShadow: "var(--shadow-card-small)",
              padding: "16px 20px 13px",
              minWidth: 196,
            }}
          >
            <p className="vf-serif-display" style={{ fontSize: "1.3rem", fontWeight: 600, margin: 0, lineHeight: 1.2 }}>
              {name}
            </p>
            <p className="vf-mono" style={{ fontSize: "0.7rem", color: "var(--text-secondary)", margin: "3px 0 0", letterSpacing: "0.02em" }}>
              @{username}
            </p>
            <p className="vf-mono" style={{ fontSize: "0.58rem", color: "var(--text-muted)", margin: "14px 0 0", letterSpacing: "0.12em", textTransform: "uppercase" }}>
              No. {String(publishedCount).padStart(2, "0")} · {new Date().getFullYear()}
            </p>
            <StampSeal size={26} label={name.charAt(0).toUpperCase()} style={{ position: "absolute", right: 14, bottom: 12 }} />
          </div>

          <div className="flex flex-col items-start gap-2">
            <button
              onClick={copyAddress}
              title={t.dashboard.copyAddress}
              className="vf-mono flex items-center gap-1.5 rounded-full transition-colors"
              style={{
                background: "var(--surface-soft)",
                border: "none",
                cursor: "pointer",
                padding: "0.35rem 0.8rem",
                fontSize: "0.72rem",
                color: "var(--text-secondary)",
              }}
            >
              nookframe.com/<span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{username}</span>
              {addrCopied ? (
                <span style={{ color: "var(--text-primary)" }}>{t.dashboard.copied}</span>
              ) : (
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M8.5 3.5v-1a1.5 1.5 0 0 0-1.5-1.5H2.5A1.5 1.5 0 0 0 1 2.5V7a1.5 1.5 0 0 0 1.5 1.5h1" stroke="currentColor" strokeWidth="1.3"/>
                </svg>
              )}
            </button>
            <Link
              href={`/${username}`}
              className="vf-button-ghost"
              style={{ padding: "0.45rem 0.9rem", fontSize: "0.78rem" }}
            >
              {t.dashboard.viewFrame}
              <svg width="11" height="11" viewBox="0 0 13 13" fill="none">
                <path d="M1.5 11.5L11.5 1.5M11.5 1.5H5.5M11.5 1.5V7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div
          className="flex mb-10"
          style={{ borderBottom: "1px solid var(--border)", gap: "0.25rem" }}
        >
          {(["projects", "card", "visits"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              data-active={tab === t}
              className="vf-tab"
            >
              {TAB_LABEL[t]}
              {t === "projects" && totalCount > 0 && (
                <span className="vf-mono" style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginLeft: 5 }}>
                  {totalCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "projects" ? (
          <ProjectsTab user={user} username={username} reviewProjectId={reviewId} />
        ) : tab === "card" ? (
          <CardTab user={user} profile={profile} />
        ) : (
          <VisitsTab user={user} />
        )}
      </div>
    </div>
  );
}
