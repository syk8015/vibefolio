"use client";

import { useState, useEffect, useMemo } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { classifyTrafficSource } from "@/lib/traffic-source";
import { useT } from "@/lib/i18n/client";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";

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

// 유입 라벨은 /admin 관제탑과 같은 분류기 하나만 쓴다. referrer 호스트만 보면
// 카톡·인스타 인앱 브라우저(Referer 미전송)가 전부 "직접 방문"으로 붕괴하는데,
// user_agent는 처음부터 저장돼 있었다 — 그걸 조회해서 채널을 되살린다.
// 분류기는 admin(한국어 고정)과 공유라 한국어 라벨을 뱉는다 — 표시할 때만 번역.
function sourceLabel(v: Pick<ViewRow, "referrer" | "user_agent">, t: Dictionary): string {
  const label = classifyTrafficSource({ referrer: v.referrer, userAgent: v.user_agent });
  return (t.visits.sourceLabels as Record<string, string>)[label] ?? label;
}

function countryName(code: string, t: Dictionary): string {
  return (t.visits.countryNames as Record<string, string>)[code] ?? code;
}

function timeAgo(date: string, t: Dictionary, locale: Locale): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t.visits.justNow;
  if (mins < 60) return t.visits.minsAgo(mins);
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t.visits.hoursAgo(hours);
  const days = Math.floor(hours / 24);
  if (days < 30) return t.visits.daysAgo(days);
  return new Date(date).toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US");
}

// 타일 4개는 동급 — 예전엔 "오늘"만 거대했는데, 프리런치에선 오늘=0이 대부분이라
// 빈 숫자가 화면을 지배했고 나머지 창과 크기 위계도 근거가 없었다(시안 확정).
function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="vf-card" style={{ padding: "1.1rem 1.2rem" }}>
      <p className="vf-label" style={{ marginBottom: "0.35rem" }}>
        {label}
      </p>
      <p
        className="vf-serif-display"
        style={{
          fontSize: "clamp(1.5rem, 3vw, 1.9rem)",
          fontWeight: 500,
          lineHeight: 1.1,
          margin: 0,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function BarChart({ days, counts }: { days: Date[]; counts: number[] }) {
  const { t } = useT();
  const max = Math.max(...counts, 1);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 72 }}>
        {days.map((day, i) => {
          const isToday = day.getTime() === today.getTime();
          // 0 = 바닥 눈금(2%), 1 이상 = 최소 12%부터 — 0과 1이 눈으로 갈린다.
          const pct = counts[i] === 0 ? 2 : Math.max(12, (counts[i] / max) * 100);
          return (
            <div
              key={i}
              title={t.visits.barTooltip(`${day.getMonth() + 1}/${day.getDate()}`, counts[i])}
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

      {/* X-axis labels — 첫날·7일째·마지막날·오늘만 표시 */}
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
                {isToday ? t.visits.today : `${day.getMonth() + 1}/${day.getDate()}`}
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
  const { t, locale } = useT();
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
                    {sourceLabel(v, t)}
                  </p>
                  {v.country && (
                    <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
                      {countryName(v.country, t)}
                    </p>
                  )}
                </div>
              </div>
              <span className="text-xs vf-mono" style={{ color: "var(--text-muted)" }}>
                {timeAgo(v.viewed_at, t, locale)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 방문 탭(옛 AnalyticsTab) — 명함에 누가 왔는지.
export default function VisitsTab({ user }: { user: User }) {
  const { t } = useT();
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
      const r = sourceLabel(v, t);
      counts[r] = (counts[r] ?? 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [views, t]);

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
        <div className="vf-spinner" />
      </div>
    );
  }

  const noData = totals.total === 0;
  // 행 표본(최대 500)이 전체를 못 덮으면, 표본으로 그리는 섹션(차트·유입·기록)에
  // 그 사실을 밝힌다 — 타일은 count 기반이라 영향 없음.
  const capped = totals.total > views.length;

  return (
    <div className="max-w-2xl mx-auto w-full flex flex-col gap-5">

      {/* Stat cards — 동급 2×2 */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label={t.visits.today} value={totals.today} />
        <StatCard label={t.visits.last7} value={totals.last7} />
        <StatCard label={t.visits.last30} value={totals.last30} />
        <StatCard label={t.visits.total} value={totals.total} />
      </div>

      {/* 14-day bar chart */}
      <div className="vf-card p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="vf-label" style={{ marginBottom: 0 }}>
            {t.visits.chartTitle}
          </p>
          {!noData && (
            <span className="text-xs vf-mono"
              style={{ color: "var(--text-secondary)", letterSpacing: "0.04em" }}>
              {capped ? t.visits.cappedPrefix : ""}{t.visits.dailyMax(Math.max(...chartCounts).toLocaleString())}
            </span>
          )}
        </div>
        {noData ? (
          <p className="text-xs text-center py-6" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
            {t.visits.noData}
          </p>
        ) : (
          <BarChart days={chartDays} counts={chartCounts} />
        )}
      </div>

      {/* 유입 경로 + 국가 분포 */}
      {!noData && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* 유입 경로 — noData가 아니면 행이 있고, 분류기는 행마다 라벨을
              반드시 뱉으므로(최소 "직접/알 수 없음") 빈 배열 분기가 없다 */}
          <div className="vf-card p-5">
              <p className="vf-label" style={{ marginBottom: "1rem" }}>
                {t.visits.referrers}
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
                    <div className="vf-meter">
                      <div
                        className="vf-meter-fill"
                        style={{ width: `${Math.round((count / Math.max(views.length, 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
          </div>

          {/* 국가 분포 */}
          {topCountries.length > 0 && (
            <div className="vf-card p-5">
              <p className="vf-label" style={{ marginBottom: "1rem" }}>
                {t.visits.countries}
              </p>
              <div className="flex flex-col gap-3">
                {topCountries.map(([code, count]) => (
                  <div key={code}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs flex items-center gap-1.5" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontWeight: 500 }}>
                        <span>{COUNTRY_EMOJI[code] ?? "🌐"}</span>
                        <span>{countryName(code, t)}</span>
                      </span>
                      <span className="text-xs vf-mono ml-2 shrink-0" style={{ color: "var(--text-secondary)", letterSpacing: "0.04em" }}>
                        {count}
                      </span>
                    </div>
                    <div className="vf-meter">
                      <div
                        className="vf-meter-fill"
                        style={{ width: `${Math.round((count / Math.max(views.length, 1)) * 100)}%` }}
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
            {t.visits.history}
          </p>
          {capped && (
            <span className="text-xs vf-mono" style={{ color: "var(--text-muted)" }}>
              {t.visits.capped}
            </span>
          )}
        </div>

        {noData ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
              {t.visits.noHistory}
            </p>
          </div>
        ) : (
          <>
            <ViewGroup label={t.visits.today} rows={groupedViews.today} defaultOpen={groupedViews.today.length > 0} />
            <ViewGroup label={t.visits.groupWeek} rows={groupedViews.week} />
            <ViewGroup label={t.visits.groupMonth} rows={groupedViews.month} />
            {groupedViews.older.length > 0 && (
              <ViewGroup label={t.visits.groupOlder} rows={groupedViews.older} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
