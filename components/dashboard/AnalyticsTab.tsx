"use client";

import { useState, useEffect, useMemo } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { classifyTrafficSource } from "@/lib/traffic-source";

interface ViewRow {
  id: string;
  viewed_at: string;
  referrer: string | null;
  country: string | null;
  user_agent: string | null;
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

// 유입 라벨은 /admin 관제탑과 같은 분류기 하나만 쓴다. referrer 호스트만 보면
// 카톡·인스타 인앱 브라우저(Referer 미전송)가 전부 "직접 방문"으로 붕괴하는데,
// user_agent는 처음부터 저장돼 있었다 — 그걸 조회해서 채널을 되살린다.
function sourceLabel(v: Pick<ViewRow, "referrer" | "user_agent">): string {
  return classifyTrafficSource({ referrer: v.referrer, userAgent: v.user_agent });
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

function StatCard({ label, value, dominant }: { label: string; value: number; dominant?: boolean }) {
  return (
    <div
      className={dominant ? "vf-card-accent col-span-2 sm:col-span-2" : "vf-card"}
      style={{
        padding: dominant ? "1.5rem 1.5rem" : "1.1rem 1.2rem",
      }}
    >
      <p className="vf-label" style={{ marginBottom: dominant ? "0.5rem" : "0.35rem" }}>
        {label}
      </p>
      <p
        className="vf-serif-display"
        style={{
          fontSize: dominant ? "clamp(2.5rem, 6vw, 3.5rem)" : "clamp(1.5rem, 3vw, 2rem)",
          fontWeight: 500,
          lineHeight: 1.1,
          margin: 0,
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
                  ? "var(--text-primary)"
                  : counts[i] > 0 ? "var(--blue-tint-strong)" : "var(--surface-soft)",
                transition: "height 0.4s ease",
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
                fontFamily: "var(--font-mono), monospace",
                fontWeight: isToday ? 600 : 400,
                color: isToday ? "var(--text-primary)" : "var(--text-muted)",
                opacity: showLabel ? 1 : 0,
                letterSpacing: "0.02em",
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
          <span className="text-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontWeight: 500 }}>
            {label}
          </span>
        </div>
        <span
          className="text-xs vf-mono"
          style={{ color: "var(--text-secondary)", letterSpacing: "0.04em" }}
        >
          {rows.length}
        </span>
      </button>

      {open && (
        <div>
          {rows.map((v) => (
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
                  <p className="text-xs" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontWeight: 500 }}>
                    {sourceLabel(v)}
                  </p>
                  {v.country && (
                    <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
                      {COUNTRY_NAME[v.country] ?? v.country}
                    </p>
                  )}
                </div>
              </div>
              <span className="text-xs vf-mono" style={{ color: "var(--text-muted)" }}>
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
  // 타일 숫자는 행 표본이 아니라 DB count — 행 조회는 500행에서 멈추므로 그걸
  // 세면 "전체 조회"가 501부터 얼어붙는다. 네 창 모두 로컬 0시 기준 캘린더
  // 경계("최근 7일" = 오늘 포함 7일)로 통일해 타일끼리 시간 정의가 안 갈린다.
  const [totals, setTotals] = useState({ total: 0, today: 0, last7: 0, last30: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const from7 = new Date(todayStart); from7.setDate(from7.getDate() - 6);
      const from30 = new Date(todayStart); from30.setDate(from30.getDate() - 29);
      const countSince = (since?: Date) => {
        let q = supabase
          .from("portfolio_views")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", user.id);
        if (since) q = q.gte("viewed_at", since.toISOString());
        return q;
      };
      const [rows, all, today, last7, last30] = await Promise.all([
        supabase
          .from("portfolio_views")
          .select("id, viewed_at, referrer, country, user_agent")
          .eq("profile_id", user.id)
          .order("viewed_at", { ascending: false })
          .limit(500),
        countSince(),
        countSince(todayStart),
        countSince(from7),
        countSince(from30),
      ]);
      setViews((rows.data as ViewRow[]) ?? []);
      setTotals({
        total: all.count ?? 0,
        today: today.count ?? 0,
        last7: last7.count ?? 0,
        last30: last30.count ?? 0,
      });
      setLoading(false);
    }
    load();
  }, [user.id]);

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
      const r = sourceLabel(v);
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

  // 방문 기록 그룹화 — 경계가 빈틈없이 이어지는 완전한 분할. 이전엔 30일 초과
  // 행이 합계에는 있는데 어느 그룹에도 안 나와 "찾아갈 수 없는 숫자"가 됐다.
  const groupedViews = useMemo(() => {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(todayStart); monthStart.setDate(monthStart.getDate() - 30);
    const g = { today: [] as ViewRow[], week: [] as ViewRow[], month: [] as ViewRow[], older: [] as ViewRow[] };
    for (const v of views) {
      const d = new Date(v.viewed_at);
      if (d >= todayStart) g.today.push(v);
      else if (d >= weekStart) g.week.push(v);
      else if (d >= monthStart) g.month.push(v);
      else g.older.push(v);
    }
    return g;
  }, [views]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 rounded-full border-2 animate-spin"
          style={{ borderColor: "var(--text-primary)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  const noData = totals.total === 0;
  // 행 표본(최대 500)이 전체를 못 덮으면, 표본으로 그리는 섹션(차트·유입·기록)에
  // 그 사실을 밝힌다 — 타일은 count 기반이라 영향 없음.
  const capped = totals.total > views.length;

  return (
    <div className="max-w-2xl mx-auto w-full flex flex-col gap-5">

      {/* Stat cards — dominant 오늘 + secondary trio */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="오늘" value={totals.today} dominant />
        <StatCard label="최근 7일" value={totals.last7} />
        <StatCard label="최근 30일" value={totals.last30} />
        <StatCard label="전체 조회" value={totals.total} />
      </div>

      {/* 14-day bar chart */}
      <div className="vf-card p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="vf-label" style={{ marginBottom: 0 }}>
            최근 14일 방문 추이
          </p>
          {!noData && (
            <span className="text-xs vf-mono"
              style={{ color: "var(--text-secondary)", letterSpacing: "0.04em" }}>
              {capped ? "최근 500회 기준 · " : ""}일 최고 {Math.max(...chartCounts).toLocaleString()}회
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
            <div className="vf-card p-5">
              <p className="vf-label" style={{ marginBottom: "1rem" }}>
                유입 경로
              </p>
              <div className="flex flex-col gap-3">
                {topReferrers.map(([ref, count]) => (
                  <div key={ref}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs truncate" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontWeight: 500 }}>
                        {ref}
                      </span>
                      <span className="text-xs vf-mono ml-2 shrink-0" style={{ color: "var(--text-secondary)", letterSpacing: "0.04em" }}>
                        {count}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-soft)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.round((count / Math.max(views.length, 1)) * 100)}%`,
                          background: "var(--text-primary)",
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
            <div className="vf-card p-5">
              <p className="vf-label" style={{ marginBottom: "1rem" }}>
                방문 국가
              </p>
              <div className="flex flex-col gap-3">
                {topCountries.map(([code, count]) => (
                  <div key={code}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs flex items-center gap-1.5" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontWeight: 500 }}>
                        <span>{COUNTRY_EMOJI[code] ?? "🌐"}</span>
                        <span>{COUNTRY_NAME[code] ?? code}</span>
                      </span>
                      <span className="text-xs vf-mono ml-2 shrink-0" style={{ color: "var(--text-secondary)", letterSpacing: "0.04em" }}>
                        {count}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-soft)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.round((count / Math.max(views.length, 1)) * 100)}%`,
                          background: "var(--text-primary)",
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
      <div className="vf-card overflow-hidden">
        <div
          className="px-5 py-3 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <p className="vf-label" style={{ marginBottom: 0 }}>
            방문 기록
          </p>
          {capped && (
            <span className="text-xs vf-mono" style={{ color: "var(--text-muted)" }}>
              최근 500회 기준
            </span>
          )}
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
            <ViewGroup label="어제 ~ 7일 전" rows={groupedViews.week} />
            <ViewGroup label="8 ~ 30일 전" rows={groupedViews.month} />
            {groupedViews.older.length > 0 && (
              <ViewGroup label="30일 이전" rows={groupedViews.older} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
