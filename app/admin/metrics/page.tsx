import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/demoQuota";
import { AnalyticsEvent } from "@/lib/analytics-events";

// Product analytics panel (P0.2). Reuses the /admin email gate; 404s to everyone
// else. Aggregates raw analytics_events in TS — fine at this volume, no SQL view
// needed. The headline is build success rate = demo_succeeded / demo_requested.
export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;
const CHART_DAYS = 14;
const DAY_MS = 86_400_000;

type Row = { event: string; created_at: string };

const dayKey = (iso: string) => iso.slice(0, 10); // YYYY-MM-DD (UTC)

export default async function AdminMetricsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) notFound();

  const admin = createAdminClient();
  const since = new Date(Date.now() - WINDOW_DAYS * DAY_MS).toISOString();
  const { data, error } = await admin
    .from("analytics_events")
    .select("event, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: true });

  // 42P01 = undefined_table: migration_analytics.sql not applied yet.
  const tableMissing = error?.code === "42P01";
  const rows = (data ?? []) as Row[];

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.event] = (counts[r.event] ?? 0) + 1;

  const requested = counts[AnalyticsEvent.DemoRequested] ?? 0;
  const succeeded = counts[AnalyticsEvent.DemoSucceeded] ?? 0;
  const failed = counts[AnalyticsEvent.DemoFailed] ?? 0;
  const held = counts[AnalyticsEvent.DemoHeld] ?? 0;
  const successRate = requested > 0 ? Math.round((succeeded / requested) * 100) : null;

  // Daily series for the last CHART_DAYS days (UTC buckets).
  const days: string[] = [];
  for (let i = CHART_DAYS - 1; i >= 0; i--) {
    days.push(dayKey(new Date(Date.now() - i * DAY_MS).toISOString()));
  }
  const daily = new Map(days.map((d) => [d, { requested: 0, succeeded: 0, failed: 0 }]));
  for (const r of rows) {
    const bucket = daily.get(dayKey(r.created_at));
    if (!bucket) continue;
    if (r.event === AnalyticsEvent.DemoRequested) bucket.requested++;
    else if (r.event === AnalyticsEvent.DemoSucceeded) bucket.succeeded++;
    else if (r.event === AnalyticsEvent.DemoFailed) bucket.failed++;
  }
  const maxDaily = Math.max(1, ...days.map((d) => daily.get(d)!.requested));

  const funnel = [
    { label: "가입", value: counts[AnalyticsEvent.SignupCompleted] ?? 0 },
    { label: "프로젝트 생성", value: counts[AnalyticsEvent.ProjectCreated] ?? 0 },
    { label: "시연 요청", value: requested },
    { label: "시연 성공", value: succeeded },
  ];
  const funnelMax = Math.max(1, ...funnel.map((f) => f.value));

  const allEvents = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  return (
    <main
      className="max-w-3xl mx-auto px-5 py-12"
      style={{ fontFamily: "var(--font-nunito)", color: "var(--text-primary)" }}
    >
      <div className="flex items-center justify-between mb-1">
        <h1 className="vf-serif-display text-2xl">지표</h1>
        <Link href="/admin" className="text-sm vf-mono" style={{ color: "var(--text-muted)" }}>
          승인 대기 →
        </Link>
      </div>
      <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
        최근 {WINDOW_DAYS}일. 서버 권위 지표(요청·성공·실패)는 정확하고, 클라이언트 지표는 최선 노력이에요.
      </p>

      {tableMissing ? (
        <div className="vf-card p-5 text-sm" style={{ color: "var(--text-secondary)" }}>
          <strong style={{ color: "var(--text-primary)" }}>analytics_events 테이블이 아직 없어요.</strong>
          <br />
          <code className="vf-mono">supabase/migration_analytics.sql</code> 을 Supabase SQL Editor에서
          실행하면 지표가 채워져요. (마이그레이션은 자동 적용되지 않아요.)
        </div>
      ) : (
        <>
          {/* Headline stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <StatCard
              label="빌드 성공률"
              value={successRate === null ? "—" : `${successRate}%`}
              hint={`${succeeded}/${requested}`}
              accent
            />
            <StatCard label="시연 요청" value={requested} hint={`${WINDOW_DAYS}일`} />
            <StatCard label="성공 / 실패" value={`${succeeded} / ${failed}`} />
            <StatCard label="보류(held)" value={held} hint="관리자 승인 대기" />
          </div>

          {/* Daily requested vs succeeded */}
          <section className="vf-card p-5 mb-8">
            <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
              일별 시연 (요청 · 성공)
            </h2>
            <div className="flex flex-col gap-1.5">
              {days.map((d) => {
                const b = daily.get(d)!;
                return (
                  <div key={d} className="flex items-center gap-3">
                    <span
                      className="vf-mono shrink-0"
                      style={{ fontSize: "0.68rem", width: "3.2rem", color: "var(--text-muted)" }}
                    >
                      {d.slice(5)}
                    </span>
                    <div
                      className="relative flex-1 rounded"
                      style={{ height: "0.85rem", background: "var(--surface-sunken)" }}
                    >
                      <div
                        className="absolute inset-y-0 left-0 rounded"
                        style={{
                          width: `${(b.requested / maxDaily) * 100}%`,
                          background: "var(--blue-tint-strong)",
                        }}
                      />
                      <div
                        className="absolute inset-y-0 left-0 rounded"
                        style={{
                          width: `${(b.succeeded / maxDaily) * 100}%`,
                          background: "var(--blue)",
                        }}
                      />
                    </div>
                    <span
                      className="vf-mono shrink-0 text-right"
                      style={{ fontSize: "0.68rem", width: "3rem", color: "var(--text-secondary)" }}
                    >
                      {b.succeeded}/{b.requested}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Funnel */}
          <section className="vf-card p-5 mb-8">
            <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
              퍼널 (가입 → 시연 성공)
            </h2>
            <div className="flex flex-col gap-2">
              {funnel.map((f) => (
                <div key={f.label} className="flex items-center gap-3">
                  <span className="text-sm shrink-0" style={{ width: "6rem", color: "var(--text-secondary)" }}>
                    {f.label}
                  </span>
                  <div
                    className="relative flex-1 rounded"
                    style={{ height: "1.4rem", background: "var(--surface-sunken)" }}
                  >
                    <div
                      className="absolute inset-y-0 left-0 rounded flex items-center px-2"
                      style={{ width: `${(f.value / funnelMax) * 100}%`, background: "var(--blue-tint)" }}
                    >
                      <span className="vf-mono" style={{ fontSize: "0.7rem", color: "var(--text-primary)" }}>
                        {f.value}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Raw event breakdown */}
          <section className="vf-card p-5">
            <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
              이벤트별 ({WINDOW_DAYS}일)
            </h2>
            {allEvents.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                아직 이벤트가 없어요.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {allEvents.map(([event, n]) => (
                  <div
                    key={event}
                    className="flex items-center justify-between text-sm py-1"
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <span className="vf-mono" style={{ color: "var(--text-secondary)" }}>
                      {event}
                    </span>
                    <span style={{ color: "var(--text-primary)" }}>{n}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className={accent ? "vf-card-accent p-4" : "vf-card p-4"}>
      <div className="vf-label" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="vf-serif-display" style={{ fontSize: "1.6rem", lineHeight: 1.1, marginTop: "0.35rem" }}>
        {value}
      </div>
      {hint && (
        <div className="vf-mono" style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
          {hint}
        </div>
      )}
    </div>
  );
}
