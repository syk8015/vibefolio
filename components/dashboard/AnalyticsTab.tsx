"use client";

import { useState, useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

interface ViewRow {
  id: string;
  viewed_at: string;
  referrer: string | null;
  country: string | null;
}

const COUNTRY_EMOJI: Record<string, string> = {
  KR: "🇰🇷", US: "🇺🇸", JP: "🇯🇵", CN: "🇨🇳", GB: "🇬🇧",
  DE: "🇩🇪", FR: "🇫🇷", CA: "🇨🇦", AU: "🇦🇺", SG: "🇸🇬",
  IN: "🇮🇳", BR: "🇧🇷", TW: "🇹🇼", HK: "🇭🇰", TH: "🇹🇭",
};

function parseReferrer(ref: string | null): string {
  if (!ref) return "직접 방문";
  try {
    const host = new URL(ref).hostname.replace("www.", "");
    if (host.includes("t.co") || host.includes("twitter")) return "Twitter / X";
    if (host.includes("instagram")) return "Instagram";
    if (host.includes("linkedin")) return "LinkedIn";
    if (host.includes("github")) return "GitHub";
    if (host.includes("google")) return "Google 검색";
    if (host.includes("facebook")) return "Facebook";
    if (host.includes("kakao")) return "카카오";
    if (host.includes("naver")) return "네이버";
    if (host.includes("tiktok")) return "TikTok";
    return host;
  } catch {
    return "직접 방문";
  }
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return new Date(date).toLocaleDateString("ko-KR");
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="flex-1 rounded-2xl p-5"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <p className="text-xs font-bold mb-1" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", letterSpacing: "0.05em" }}>
        {label}
      </p>
      <p className="text-3xl font-black" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}

export default function AnalyticsTab({ user }: { user: User }) {
  const [views, setViews] = useState<ViewRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("portfolio_views")
        .select("id, viewed_at, referrer, country")
        .eq("profile_id", user.id)
        .order("viewed_at", { ascending: false })
        .limit(200);
      setViews((data as ViewRow[]) ?? []);
      setLoading(false);
    }
    load();
  }, [user.id]);

  const now = Date.now();
  const total = views.length;
  const last7 = views.filter(v => now - new Date(v.viewed_at).getTime() < 7 * 86400000).length;
  const last30 = views.filter(v => now - new Date(v.viewed_at).getTime() < 30 * 86400000).length;

  // Top referrers
  const referrerCount: Record<string, number> = {};
  views.forEach(v => {
    const r = parseReferrer(v.referrer);
    referrerCount[r] = (referrerCount[r] ?? 0) + 1;
  });
  const topReferrers = Object.entries(referrerCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto w-full">

      {/* Stats */}
      <div className="flex gap-3 mb-6">
        <StatCard label="전체 조회" value={total} />
        <StatCard label="최근 7일" value={last7} />
        <StatCard label="최근 30일" value={last30} />
      </div>

      {/* Top referrers */}
      {topReferrers.length > 0 && (
        <div
          className="rounded-2xl p-5 mb-6"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <p className="text-xs font-bold mb-4" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", letterSpacing: "0.05em" }}>
            유입 경로 TOP {topReferrers.length}
          </p>
          <div className="flex flex-col gap-2">
            {topReferrers.map(([ref, count]) => (
              <div key={ref} className="flex items-center gap-3">
                <div
                  className="flex-1 h-2 rounded-full overflow-hidden"
                  style={{ background: "var(--border)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.round((count / total) * 100)}%`,
                      background: "var(--blue)",
                    }}
                  />
                </div>
                <span className="text-xs font-bold w-24 text-right" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
                  {ref}
                </span>
                <span className="text-xs font-black w-6 text-right" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent views */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ border: "1px solid var(--border)" }}
      >
        <div
          className="px-5 py-3"
          style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}
        >
          <p className="text-xs font-bold" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", letterSpacing: "0.05em" }}>
            최근 조회 기록
          </p>
        </div>

        {views.length === 0 ? (
          <div className="px-5 py-10 text-center" style={{ background: "var(--surface)" }}>
            <p className="text-sm" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
              아직 방문 기록이 없어요
            </p>
          </div>
        ) : (
          <div style={{ background: "var(--surface)" }}>
            {views.slice(0, 50).map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between px-5 py-3"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-base">
                    {v.country ? (COUNTRY_EMOJI[v.country] ?? "🌐") : "🌐"}
                  </span>
                  <div>
                    <p className="text-xs font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
                      {parseReferrer(v.referrer)}
                    </p>
                    {v.country && (
                      <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
                        {v.country}
                      </p>
                    )}
                  </div>
                </div>
                <span className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
                  {timeAgo(v.viewed_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
