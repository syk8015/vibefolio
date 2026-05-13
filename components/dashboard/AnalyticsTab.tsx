"use client";

import { useState, useEffect, useMemo } from "react";
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
  VN: "🇻🇳", PH: "🇵🇭", ID: "🇮🇩", MY: "🇲🇾", NL: "🇳🇱",
};

const COUNTRY_NAME: Record<string, string> = {
  KR: "한국", US: "미국", JP: "일본", CN: "중국", GB: "영국",
  DE: "독일", FR: "프랑스", CA: "캐나다", AU: "호주", SG: "싱가포르",
  IN: "인도", BR: "브라질", TW: "대만", HK: "홍콩", TH: "태국",
  VN: "베트남", PH: "필리핀", ID: "인도네시아", MY: "말레이시아", NL: "네덜란드",
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

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: highlight ? "var(--blue-tint)" : "var(--surface)",
        border: `1px solid ${highlight ? "var(--border-bright)" : "var(--border)"}`,
      }}
    >
      <p className="text-xs font-bold mb-1" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", letterSpacing: "0.05em" }}>
        {label}
      </p>
      <p
        className="text-3xl font-black"
        style={{
          fontFamily: "var(--font-nunito)",
          background: highlight ? "linear-gradient(120deg, var(--blue), var(--blue-bright))" : undefined,
          WebkitBackgroundClip: highlight ? "text" : undefined,
          WebkitTextFillColor: highlight ? "transparent" : undefined,
          color: highlight ? undefined : "var(--text-primary)",
        }}
      >
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function BarChart({ days, counts }: { days: Date[]; counts: number[] }) {
  const max = Math.max(...counts, 1);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 72 }}>
        {days.map((day, i) => {
          const isToday = day.getTime() === today.getTime();
          const pct = Math.max(2, (counts[i] / max) * 100);
          return (
            <div
              key={i}
              title={`${day.getMonth() + 1}/${day.getDate()} — ${counts[i]}회`}
              style={{
                flex: 1,
                height: `${pct}%`,
                borderRadius: 3,
                background: isToday
                  ? "linear-gradient(180deg, var(--blue-bright), var(--blue))"
                  : counts[i] > 0 ? "var(--blue-tint)" : "var(--border)",
                border: isToday ? "none" : `1px solid ${counts[i] > 0 ? "var(--border-bright)" : "transparent"}`,
                transition: "height 0.4s ease",
                boxShadow: isToday ? "0 0 8px var(--blue-glow)" : undefined,
                cursor: "default",
              }}
            />
          );
        })}
      </div>

      {/* X-axis labels — show every 2nd day */}
      <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 6 }}>
        {days.map((day, i) => {
          const isToday = day.getTime() === today.getTime();
          const showLabel = i === 0 || i === 6 || i === 13 || isToday;
          return (
            <div key={i} style={{ flex: 1, textAlign: "center" }}>
              <span style={{
                fontSize: "0.55rem",
                fontFamily: "var(--font-nunito)",
                fontWeight: isToday ? 700 : 400,
                color: isToday ? "var(--blue-bright)" : "var(--text-muted)",
                opacity: showLabel ? 1 : 0,
              }}>
                {isToday ? "오늘" : `${day.getMonth() + 1}/${day.getDate()}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ViewGroup({
  label,
  rows,
  defaultOpen = false,
}: {
  label: string;
  rows: ViewRow[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 transition-opacity hover:opacity-70"
        style={{ background: "none", border: "none", cursor: "pointer" }}
      >
        <div className="flex items-center gap-2">
          <svg
            width="12" height="12" viewBox="0 0 12 12" fill="none"
            style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s", color: "var(--text-muted)", flexShrink: 0 }}
          >
            <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="text-xs font-bold" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
            {label}
          </span>
        </div>
        <span
          className="text-xs font-black px-2 py-0.5 rounded-full"
          style={{ background: "var(--blue-tint)", color: "var(--blue-bright)", border: "1px solid var(--border-bright)", fontFamily: "var(--font-nunito)" }}
        >
          {rows.length}
        </span>
      </button>

      {open && (
        <div>
          {rows.map((v, i) => (
            <div
              key={v.id}
              className="flex items-center justify-between px-5 py-2.5"
              style={{
                borderTop: "1px solid var(--border)",
                background: "var(--bg)",
              }}
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
                      {COUNTRY_NAME[v.country] ?? v.country}
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
        .limit(500);
      setViews((data as ViewRow[]) ?? []);
      setLoading(false);
    }
    load();
  }, [user.id]);

  const stats = useMemo(() => {
    const now = Date.now();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    return {
      total: views.length,
      today: views.filter(v => new Date(v.viewed_at) >= todayStart).length,
      last7: views.filter(v => now - new Date(v.viewed_at).getTime() < 7 * 86400000).length,
      last30: views.filter(v => now - new Date(v.viewed_at).getTime() < 30 * 86400000).length,
    };
  }, [views]);

  // 14일 바 차트 데이터
  const { chartDays, chartCounts } = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - (13 - i));
      return d;
    });
    const counts = days.map(day => {
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      return views.filter(v => {
        const t = new Date(v.viewed_at).getTime();
        return t >= day.getTime() && t < next.getTime();
      }).length;
    });
    return { chartDays: days, chartCounts: counts };
  }, [views]);

  // 유입 경로
  const topReferrers = useMemo(() => {
    const counts: Record<string, number> = {};
    views.forEach(v => {
      const r = parseReferrer(v.referrer);
      counts[r] = (counts[r] ?? 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [views]);

  // 국가
  const topCountries = useMemo(() => {
    const counts: Record<string, number> = {};
    views.forEach(v => {
      if (v.country) counts[v.country] = (counts[v.country] ?? 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [views]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 rounded-full border-2 animate-spin"
          style={{ borderColor: "var(--blue)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  // 방문 기록 그룹화
  const groupedViews = useMemo(() => {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const ago7 = new Date(Date.now() - 7 * 86400000);
    const ago30 = new Date(Date.now() - 30 * 86400000);
    return {
      today: views.filter(v => new Date(v.viewed_at) >= todayStart),
      week: views.filter(v => {
        const d = new Date(v.viewed_at);
        return d >= ago7 && d < todayStart;
      }),
      month: views.filter(v => {
        const d = new Date(v.viewed_at);
        return d >= ago30 && d < ago7;
      }),
    };
  }, [views]);

  const noData = views.length === 0;

  return (
    <div className="max-w-2xl mx-auto w-full flex flex-col gap-5">

      {/* Stat cards — 2×2 grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="오늘" value={stats.today} highlight={stats.today > 0} />
        <StatCard label="최근 7일" value={stats.last7} />
        <StatCard label="최근 30일" value={stats.last30} />
        <StatCard label="전체 조회" value={stats.total} />
      </div>

      {/* 14-day bar chart */}
      <div
        className="rounded-2xl p-5"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-bold" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", letterSpacing: "0.05em" }}>
            최근 14일 방문 추이
          </p>
          {!noData && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: "var(--blue-tint)", color: "var(--blue-bright)", border: "1px solid var(--border-bright)", fontFamily: "var(--font-nunito)" }}>
              최고 {Math.max(...chartCounts).toLocaleString()}회
            </span>
          )}
        </div>
        {noData ? (
          <p className="text-xs text-center py-6" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
            아직 방문 데이터가 없어요
          </p>
        ) : (
          <BarChart days={chartDays} counts={chartCounts} />
        )}
      </div>

      {/* 유입 경로 + 국가 분포 */}
      {!noData && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* 유입 경로 */}
          {topReferrers.length > 0 && (
            <div
              className="rounded-2xl p-5"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <p className="text-xs font-bold mb-4" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", letterSpacing: "0.05em" }}>
                유입 경로
              </p>
              <div className="flex flex-col gap-3">
                {topReferrers.map(([ref, count]) => (
                  <div key={ref}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold truncate" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
                        {ref}
                      </span>
                      <span className="text-xs font-black ml-2 shrink-0" style={{ color: "var(--blue-bright)", fontFamily: "var(--font-nunito)" }}>
                        {count}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.round((count / stats.total) * 100)}%`,
                          background: "linear-gradient(90deg, var(--blue), var(--blue-bright))",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 국가 분포 */}
          {topCountries.length > 0 && (
            <div
              className="rounded-2xl p-5"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <p className="text-xs font-bold mb-4" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", letterSpacing: "0.05em" }}>
                방문 국가
              </p>
              <div className="flex flex-col gap-3">
                {topCountries.map(([code, count]) => (
                  <div key={code}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold flex items-center gap-1.5" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
                        <span>{COUNTRY_EMOJI[code] ?? "🌐"}</span>
                        <span>{COUNTRY_NAME[code] ?? code}</span>
                      </span>
                      <span className="text-xs font-black ml-2 shrink-0" style={{ color: "var(--blue-bright)", fontFamily: "var(--font-nunito)" }}>
                        {count}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.round((count / stats.total) * 100)}%`,
                          background: "linear-gradient(90deg, var(--blue), var(--blue-bright))",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 방문 기록 — 기간별 접기/펼치기 */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div
          className="px-5 py-3"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <p className="text-xs font-bold" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", letterSpacing: "0.05em" }}>
            방문 기록
          </p>
        </div>

        {noData ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
              아직 방문 기록이 없어요
            </p>
          </div>
        ) : (
          <>
            <ViewGroup label="오늘" rows={groupedViews.today} defaultOpen={groupedViews.today.length > 0} />
            <ViewGroup label="7일 이내" rows={groupedViews.week} />
            <ViewGroup label="한달 이내" rows={groupedViews.month} />
          </>
        )}
      </div>
    </div>
  );
}
