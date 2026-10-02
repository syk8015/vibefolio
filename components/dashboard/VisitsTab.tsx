"use client";

import { useState, useEffect, useMemo } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { classifyTrafficSource, isOutsideSource } from "@/lib/traffic-source";
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
function sourceName(label: string, t: Dictionary): string {
  return (t.visits.sourceLabels as Record<string, string>)[label] ?? label;
}

function sourceLabel(v: Pick<ViewRow, "referrer" | "user_agent">, t: Dictionary): string {
  return sourceName(classifyTrafficSource({ referrer: v.referrer, userAgent: v.user_agent }), t);
}

// 출처 이름의 끝소리에 받침이 있는지 — "카카오톡이 / 유튜브가"의 이/가 고르기. 한글은 글자로 정확히,
// 영문 이름·도메인은 읽는 소리로 어림한다(LinkedIn·Reddit·Slack·Google·.com·.app → 받침,
// X·Threads·.io·.dev → 없음). "공유 링크(앱 미상)"처럼 끝의 (…)는 떼고 본다.
function endsWithFinalSound(name: string): boolean {
  const w = name.replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
  const c = w.charCodeAt(w.length - 1);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 !== 0;
  if (/\d$/.test(w)) return /[013678]$/.test(w); // 0·1·3·6·7·8은 읽는 소리에 받침이 있다
  const tail = w.slice(w.lastIndexOf(".") + 1);
  // 한두 글자 끝(X, .kr, .io)은 글자 이름으로 읽는다 — L·M·N·R만 받침
  if (/^[a-z]{1,2}$/.test(tail)) return /[lmnr]$/.test(tail);
  return /(?:[lmn]|ng|le|[aeiou]c?k|[aeiou]t|[aeiou]p|pp)$/.test(w);
}

// 칸 제목 — 본문 글꼴 14px(10-02 덜어내기 2차). 전역 .vf-label(고정폭·자간)은 한글을 "유 입 경 로"처럼
// 띄엄띄엄 읽히게 해서 이 탭에서만 바꾼다 — 명함 탭 이름표와 같은 이유(09-26). .vf-label은 다른 화면이 쓴다.
const SECTION_LABEL: React.CSSProperties = {
  margin: 0, fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-nunito)",
};
// 제목 옆·아래 작은 글(일 최고·500회 기준) — 한글이 섞여 있어 고정폭 대신 본문 글꼴.
const SIDE_NOTE: React.CSSProperties = {
  fontSize: "0.8125rem", color: "var(--text-secondary)", fontFamily: "var(--font-nunito)",
};

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

// 요약 카드 오른쪽의 7일 선 그래프 — 아래 14일 막대의 마지막 7칸과 같은 숫자. 점은 방문이 있던 날과
// 오늘에만(오늘은 채운 점). 숫자는 카드 글이 이미 말하므로 그림은 화면 읽기에서 뺀다.
function Sparkline({ days, counts }: { days: Date[]; counts: number[] }) {
  const { t } = useT();
  const W = 168, H = 44;
  const max = Math.max(...counts, 1);
  const last = counts.length - 1;
  const x = (i: number) => 5 + i * ((W - 10) / last);
  const y = (n: number) => H - 5 - (n / max) * (H - 14);
  const pts = counts.map((n, i) => `${x(i).toFixed(1)},${y(n).toFixed(1)}`);
  return (
    <div className="shrink-0" style={{ width: W, display: "grid", gap: 5 }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none" aria-hidden="true"
        style={{ display: "block", color: "var(--text-primary)" }}>
        <path d={`M${pts.join(" L")} L${x(last).toFixed(1)},${H - 5} L${x(0).toFixed(1)},${H - 5} Z`}
          fill="currentColor" fillOpacity={0.06} />
        <polyline points={pts.join(" ")} stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
        {counts.map((n, i) => (n > 0 || i === last) && (
          <circle key={i} cx={x(i)} cy={y(n)} r={i === last ? 3.4 : 2.4}
            stroke="currentColor" strokeWidth={1.3}
            style={{ fill: i === last ? "var(--text-primary)" : "var(--surface)" }} />
        ))}
      </svg>
      <div className="vf-mono flex justify-between" style={{ fontSize: "0.75rem", color: "var(--text-muted)", letterSpacing: "0.02em" }}>
        <span>{days[0].getMonth() + 1}/{days[0].getDate()}</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{t.visits.today}</span>
      </div>
    </div>
  );
}

// 요약 카드 작은 줄의 숫자 하나 — 진하게.
function Num({ n }: { n: number }) {
  return <b style={{ color: "var(--text-primary)", fontWeight: 600 }}>{n.toLocaleString()}</b>;
}

const DOT = <span aria-hidden="true" style={{ opacity: 0.5, margin: "0 0.45em" }}>·</span>;

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

      {/* X-axis labels — 첫날·7일째·마지막날·오늘만 표시.
          칸 폭은 막대 하나(폰에서 ~20px)라 "오늘"·"12/31"이 칸보다 넓다. 줄바꿈을 막고
          양 끝 라벨은 카드 안쪽으로 붙인다 — 가운데 정렬이면 마지막 라벨이 카드 밖으로
          넘쳐 "오/늘"로 쪼개졌다(09-22 폰 실측). */}
      <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 6 }}>
        {days.map((day, i) => {
          const isToday = day.getTime() === today.getTime();
          const showLabel = i === 0 || i === 6 || i === 13 || isToday;
          const edge = i === 0 ? "flex-start" : i === days.length - 1 ? "flex-end" : "center";
          return (
            <div key={i} style={{ flex: 1, minWidth: 0, display: "flex", justifyContent: edge }}>
              <span style={{
                whiteSpace: "nowrap",
                fontSize: "0.75rem",
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

  // 같은 줄은 한 줄로 — 출처·나라·"N시간 전"이 모두 같은 방문을 묶고 개수만 붙인다.
  // 링크 한 번 돌면 "직접/알 수 없음 · 한국 · 8시간 전"이 열몇 줄 그대로 반복됐다.
  const merged = useMemo(() => {
    const out: { key: string; v: ViewRow; source: string; ago: string; count: number }[] = [];
    const byKey = new Map<string, (typeof out)[number]>();
    for (const v of rows) {
      const source = sourceLabel(v, t);
      const ago = timeAgo(v.viewed_at, t, locale);
      const key = `${source}|${v.country ?? ""}|${ago}`;
      const hit = byKey.get(key);
      if (hit) { hit.count += 1; continue; }
      const row = { key, v, source, ago, count: 1 };
      byKey.set(key, row);
      out.push(row);
    }
    return out;
  }, [rows, t, locale]);

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
          <span className="text-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontWeight: 500, fontSize: "0.8125rem" }}>
            {label}
          </span>
        </div>
        <span
          className="text-xs vf-mono"
          style={{ color: "var(--text-secondary)", letterSpacing: "0.04em", fontSize: "0.8125rem" }}
        >
          {rows.length}
        </span>
      </button>

      {open && (
        <div>
          {merged.map(({ key, v, source, ago, count }) => (
            <div
              key={key}
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
                  <p className="text-sm" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontWeight: 500 }}>
                    {source}
                    {count > 1 && (
                      <span
                        className="vf-mono"
                        style={{ marginLeft: 8, padding: "1px 7px", borderRadius: 999, background: "var(--surface-soft)", color: "var(--text-secondary)", fontSize: "0.8125rem", fontWeight: 400 }}
                      >
                        ×{count}
                      </span>
                    )}
                  </p>
                  {v.country && (
                    <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.8125rem" }}>
                      {countryName(v.country, t)}
                    </p>
                  )}
                </div>
              </div>
              <span className="text-xs vf-mono" style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                {ago}
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
  // 요약 카드 숫자는 행 표본이 아니라 DB count — 행 조회는 500행에서 멈추므로 그걸
  // 세면 "전체"가 501부터 얼어붙는다. 네 숫자 모두 로컬 0시 기준 캘린더
  // 경계("최근 7일" = 오늘 포함 7일)로 통일해 숫자끼리 시간 정의가 안 갈린다.
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

  // 유입 경로 — 분류기 라벨(한국어)로 세고 표시할 때만 번역한다. 요약 카드의 "밖에서 온 방문" 한 줄도
  // 같은 숫자에서 고른다(우리 사이트 안·직접/알 수 없음·로컬 테스트는 뺀 1위, 없으면 줄을 숨긴다).
  const sourceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of views) {
      const label = classifyTrafficSource({ referrer: v.referrer, userAgent: v.user_agent });
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [views]);
  const topReferrers = sourceCounts.slice(0, 5);
  const topOutsideLabel = sourceCounts.find(([label]) => isOutsideSource(label))?.[0];
  const topOutside = topOutsideLabel ? sourceName(topOutsideLabel, t) : null;

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
  // 그 사실을 밝힌다 — 요약 카드 숫자는 count 기반이라 영향 없음.
  const capped = totals.total > views.length;

  return (
    <div className="max-w-2xl mx-auto w-full flex flex-col gap-5">

      {/* 요약 카드(10-02 덜어내기 2차) — 숫자 네 칸을 한 장으로: 큰 줄 "최근 7일 방문 N회" + 작은 줄
          "오늘 · 30일 · 전체". 오른쪽은 같은 7일 선 그래프, 아래는 밖에서 온 방문 1위 한 줄.
          세는 건 사람이 아니라 방문(회)이다. */}
      <div className="vf-card" style={{ padding: "22px 24px" }}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <div className="flex-1" style={{ minWidth: "12rem" }}>
            <p className="vf-serif-display" style={{ margin: 0, fontSize: "1.875rem", fontWeight: 600, lineHeight: 1.25, fontVariantNumeric: "tabular-nums" }}>
              {t.visits.weekBefore && <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}>{t.visits.weekBefore}</span>}
              {t.visits.weekCount(totals.last7)}
              {t.visits.weekAfter && <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}>{t.visits.weekAfter}</span>}
            </p>
            <p style={{ ...SIDE_NOTE, margin: "8px 0 0" }}>
              {t.visits.today} <Num n={totals.today} />{DOT}
              {t.visits.last30} <Num n={totals.last30} />{DOT}
              {t.visits.total} <Num n={totals.total} />
            </p>
          </div>
          {!noData && !capped && <Sparkline days={chartDays.slice(-7)} counts={chartCounts.slice(-7)} />}
        </div>
        {topOutside && (
          <p style={{ margin: "18px 0 0", paddingTop: 14, borderTop: "1px solid var(--border)", fontSize: "0.875rem", color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
            {t.visits.topSourceBefore}
            <b style={{ fontWeight: 600 }}>{topOutside}</b>
            {t.visits.topSourceAfter(endsWithFinalSound(topOutside))}
          </p>
        )}
      </div>

      {/* 14-day bar chart */}
      <div className="vf-card p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <p style={SECTION_LABEL}>
            {t.visits.chartTitle}
          </p>
          {!noData && (
            <span style={SIDE_NOTE}>
              {capped ? t.visits.cappedPrefix : ""}{t.visits.dailyMax(Math.max(...chartCounts).toLocaleString())}
            </span>
          )}
        </div>
        {noData ? (
          <p className="text-sm text-center py-6" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
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
              <p style={{ ...SECTION_LABEL, marginBottom: "1rem" }}>
                {t.visits.referrers}
              </p>
              <div className="flex flex-col gap-3">
                {topReferrers.map(([ref, count]) => (
                  <div key={ref}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm truncate" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontWeight: 500 }}>
                        {sourceName(ref, t)}
                      </span>
                      <span className="text-sm vf-mono ml-2 shrink-0" style={{ color: "var(--text-secondary)", letterSpacing: "0.04em" }}>
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
              <p style={{ ...SECTION_LABEL, marginBottom: "1rem" }}>
                {t.visits.countries}
              </p>
              <div className="flex flex-col gap-3">
                {topCountries.map(([code, count]) => (
                  <div key={code}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm flex items-center gap-1.5" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontWeight: 500 }}>
                        <span>{COUNTRY_EMOJI[code] ?? "🌐"}</span>
                        <span>{countryName(code, t)}</span>
                      </span>
                      <span className="text-sm vf-mono ml-2 shrink-0" style={{ color: "var(--text-secondary)", letterSpacing: "0.04em" }}>
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
          <p style={SECTION_LABEL}>
            {t.visits.history}
          </p>
          {capped && (
            <span style={{ ...SIDE_NOTE, color: "var(--text-muted)" }}>
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
