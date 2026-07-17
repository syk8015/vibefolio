import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/demoQuota";
import { hasErrorReporter } from "@/lib/logger";
import { isR2Configured, r2Usage } from "@/lib/r2";
import { parseDemoFailure } from "@/lib/demo-failure";
import { StatCard } from "../StatCard";
import { ReportInbox, type ReportItem } from "./ReportInbox";

// 운영 관제 — scattered monitoring in one screen (worker/cron liveness, alerts,
// demo pipeline, report inbox, storage, users). Same email gate as /admin.
// Everything here is read-mostly; the one action (resolve report) goes through
// /api/admin/reports/[id].
export const dynamic = "force-dynamic";

// Mirrors HEARTBEAT_STALE_MIN in app/api/cron/health/route.ts (route files can't
// export extra symbols, so the threshold is duplicated here on purpose).
const HEARTBEAT_STALE_MIN = 12;
// External cron is registered at 5-minute intervals; 12min ≈ two missed ticks.
const CRON_STALE_MIN = 12;

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: "대기", color: "var(--text-secondary)" },
  building: { label: "빌드", color: "var(--blue)" },
  recording: { label: "촬영", color: "var(--blue)" },
  editing: { label: "편집", color: "var(--blue)" },
  done: { label: "완료", color: "var(--text-primary)" },
  failed: { label: "실패", color: "#b34747" },
  held: { label: "보류", color: "var(--text-secondary)" },
};

const ALERT_LABEL: Record<string, string> = {
  "worker-stale": "워커 하트비트 끊김",
  reaped: "스턱 잡 정리",
  "pending-no-worker": "대기열 있음 · 워커 무응답",
  "pending-not-draining": "대기열이 빠지지 않음",
  "stuck-query-failed": "워치독 DB 조회 실패",
  "reap-update-failed": "워치독 정리 실패",
};

function ago(iso: string | null | undefined, now: number): string {
  if (!iso) return "기록 없음";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "기록 없음";
  const min = Math.max(0, Math.round((now - t) / 60_000));
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h}시간 전`;
  return `${Math.round(h / 24)}일 전`;
}

function fmtBytes(n: number): string {
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)} GB`;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

export default async function AdminOpsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) notFound();

  const admin = createAdminClient();
  const now = Date.now();

  const [sysRes, statusRes, recentRes, profileCountRes, reportsRes] = await Promise.all([
    admin
      .from("system_status")
      .select("worker_last_seen_at, worker_status, demo_paused, alerts_state")
      .eq("id", "singleton")
      .single(),
    admin.from("projects").select("demo_build_status").not("demo_build_status", "is", null),
    admin
      .from("projects")
      .select("id, user_id, title, demo_build_status, demo_status_changed_at, demo_build_error")
      .not("demo_build_status", "is", null)
      .order("demo_status_changed_at", { ascending: false, nullsFirst: false })
      .limit(10),
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin
      .from("content_reports")
      .select("id, target_type, target_id, reason, detail, reporter_user_id, reporter_key, created_at")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  // ── worker / cron liveness ────────────────────────────────────────────────
  const sys = sysRes.data;
  const lastSeen = sys?.worker_last_seen_at ?? null;
  const workerStale = !lastSeen || now - Date.parse(lastSeen) > HEARTBEAT_STALE_MIN * 60_000;
  const paused = !!sys?.demo_paused;
  const alertsState = (sys?.alerts_state ?? {}) as Record<string, string>;
  const cronTick = alertsState["_cron_last_tick"] ?? null;
  const cronStale = !cronTick || now - Date.parse(cronTick) > CRON_STALE_MIN * 60_000;

  const alertEntries = Object.entries(alertsState)
    .filter(([k]) => k !== "_cron_last_tick")
    .sort((a, b) => Date.parse(b[1]) - Date.parse(a[1]));

  // ── pipeline ──────────────────────────────────────────────────────────────
  const distribution: Record<string, number> = {};
  for (const r of statusRes.data ?? []) {
    const s = r.demo_build_status as string;
    distribution[s] = (distribution[s] ?? 0) + 1;
  }
  const pendingCount = distribution["pending"] ?? 0;
  const inFlightCount =
    (distribution["building"] ?? 0) + (distribution["recording"] ?? 0) + (distribution["editing"] ?? 0);

  const recent = recentRes.data ?? [];
  const ownerIds = [...new Set(recent.map((r) => r.user_id))];
  const { data: owners } = ownerIds.length
    ? await admin.from("profiles").select("id, username").in("id", ownerIds)
    : { data: [] as { id: string; username: string }[] };
  const usernameById = new Map((owners ?? []).map((o) => [o.id, o.username]));

  // ── report inbox ──────────────────────────────────────────────────────────
  const rawReports = reportsRes.data ?? [];
  const reportProfileIds = rawReports.filter((r) => r.target_type === "profile").map((r) => r.target_id);
  const reportProjectIds = rawReports.filter((r) => r.target_type === "project").map((r) => r.target_id);
  const [{ data: rProfiles }, { data: rProjects }] = await Promise.all([
    reportProfileIds.length
      ? admin.from("profiles").select("id, username").in("id", reportProfileIds)
      : Promise.resolve({ data: [] as { id: string; username: string }[] }),
    reportProjectIds.length
      ? admin.from("projects").select("id, title, user_id").in("id", reportProjectIds)
      : Promise.resolve({ data: [] as { id: string; title: string | null; user_id: string }[] }),
  ]);
  const reportProjectOwners = [...new Set((rProjects ?? []).map((p) => p.user_id))];
  const { data: rOwners } = reportProjectOwners.length
    ? await admin.from("profiles").select("id, username").in("id", reportProjectOwners)
    : { data: [] as { id: string; username: string }[] };
  const rOwnerById = new Map((rOwners ?? []).map((o) => [o.id, o.username]));
  const rProfileById = new Map((rProfiles ?? []).map((p) => [p.id, p.username]));
  const rProjectById = new Map((rProjects ?? []).map((p) => [p.id, p]));

  const reports: ReportItem[] = rawReports.map((r) => {
    if (r.target_type === "profile") {
      const username = rProfileById.get(r.target_id) ?? "?";
      return {
        id: r.id,
        targetType: "profile" as const,
        targetLabel: `@${username}`,
        targetUrl: `/${username}`,
        reason: r.reason,
        detail: r.detail,
        reporter: r.reporter_user_id
          ? `로그인 ${r.reporter_user_id.slice(0, 8)}`
          : `비로그인 ${r.reporter_key.slice(0, 8)}`,
        createdAt: r.created_at,
      };
    }
    const project = rProjectById.get(r.target_id);
    const username = project ? (rOwnerById.get(project.user_id) ?? "?") : "?";
    return {
      id: r.id,
      targetType: "project" as const,
      targetLabel: `${project?.title ?? "(삭제된 프로젝트)"} · @${username}`,
      targetUrl: project ? `/${username}/${project.id}` : "#",
      reason: r.reason,
      detail: r.detail,
      reporter: r.reporter_user_id
        ? `로그인 ${r.reporter_user_id.slice(0, 8)}`
        : `비로그인 ${r.reporter_key.slice(0, 8)}`,
      createdAt: r.created_at,
    };
  });

  // ── storage ───────────────────────────────────────────────────────────────
  let storage: { objects: number; bytes: number } | null = null;
  let storageError = false;
  if (isR2Configured()) {
    try {
      storage = await r2Usage();
    } catch {
      storageError = true;
    }
  }

  const sentryWired = hasErrorReporter();
  const userCount = profileCountRes.count ?? 0;

  return (
    <main
      className="max-w-3xl mx-auto px-5 py-12"
      style={{ fontFamily: "var(--font-nunito)", color: "var(--text-primary)" }}
    >
      <div className="flex items-center justify-between mb-1">
        <h1 className="vf-serif-display text-2xl">관제</h1>
        <div className="flex gap-4">
          <Link href="/admin" className="text-sm vf-mono" style={{ color: "var(--text-muted)" }}>
            승인 대기 →
          </Link>
          <Link href="/admin/metrics" className="text-sm vf-mono" style={{ color: "var(--text-muted)" }}>
            지표 →
          </Link>
        </div>
      </div>
      <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
        워커·크론·경보·신고를 한 화면에. 자동 새로고침은 없어요 — 다시 보려면 새로고침.
      </p>

      {/* Liveness stat row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
        <StatCard
          label="녹화 워커"
          value={paused ? "일시정지" : workerStale ? "멈춤" : "가동"}
          hint={`하트비트 ${ago(lastSeen, now)}${sys?.worker_status ? ` · ${sys.worker_status}` : ""}`}
          accent={!workerStale && !paused}
        />
        <StatCard
          label="워치독 크론"
          value={cronStale ? "끊김" : "가동"}
          hint={`마지막 틱 ${ago(cronTick, now)}`}
          accent={!cronStale}
        />
        <StatCard
          label="Sentry"
          value={sentryWired ? "수신 중" : "미배선"}
          hint={sentryWired ? "reporterWired" : "instrumentation 확인"}
        />
        <StatCard label="가입자" value={userCount} hint="profiles 총계" />
        <StatCard
          label="시연 대기열"
          value={pendingCount}
          hint={inFlightCount > 0 ? `진행 중 ${inFlightCount}` : "진행 중 없음"}
        />
        <StatCard
          label="열린 신고"
          value={reports.length}
          hint={reports.length > 0 ? "아래 인박스 확인" : "없음"}
          accent={reports.length > 0}
        />
      </div>

      {/* Alerts */}
      <section className="vf-card p-5 mb-8">
        <h2 className="text-sm font-semibold mb-3">최근 경보 (메일 발송 기준)</h2>
        {alertEntries.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            기록된 경보가 없어요.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {alertEntries.map(([key, sentAt]) => (
              <div
                key={key}
                className="flex items-center justify-between text-sm py-1"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <span style={{ color: "var(--text-primary)" }}>{ALERT_LABEL[key] ?? key}</span>
                <span className="vf-mono" style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                  {ago(sentAt, now)}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3" style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
          같은 경보는 6시간에 한 번만 메일이 가요. 개별 발생은 Sentry에서.
        </p>
      </section>

      {/* Demo pipeline */}
      <section className="vf-card p-5 mb-8">
        <h2 className="text-sm font-semibold mb-3">시연 파이프라인</h2>
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(STATUS_META).map(([status, meta]) =>
            distribution[status] ? (
              <span
                key={status}
                className="px-2.5 py-1 rounded-full text-xs"
                style={{ background: "var(--surface-soft)", color: meta.color, fontWeight: 700 }}
              >
                {meta.label} {distribution[status]}
              </span>
            ) : null,
          )}
          {Object.keys(distribution).length === 0 && (
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>
              시연이 아직 없어요.
            </span>
          )}
        </div>
        {recent.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {recent.map((r) => {
              const meta = STATUS_META[r.demo_build_status as string] ?? {
                label: r.demo_build_status as string,
                color: "var(--text-secondary)",
              };
              const failure =
                r.demo_build_status === "failed" ? parseDemoFailure(r.demo_build_error) : null;
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-3 text-sm py-1"
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <span style={{ color: meta.color, fontWeight: 700, width: "2.6rem", flexShrink: 0 }}>
                    {meta.label}
                  </span>
                  <span className="truncate flex-1" style={{ color: "var(--text-primary)" }}>
                    {r.title ?? "(제목 없음)"}
                    <span style={{ color: "var(--text-muted)" }}>
                      {" "}
                      · @{usernameById.get(r.user_id) ?? "?"}
                    </span>
                    {failure && (
                      <span className="vf-mono" style={{ fontSize: "0.68rem", color: "#b34747" }}>
                        {" "}
                        [{failure.code}]
                      </span>
                    )}
                  </span>
                  <span
                    className="vf-mono shrink-0"
                    style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}
                  >
                    {ago(r.demo_status_changed_at, now)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Report inbox */}
      <section className="vf-card p-5 mb-8">
        <h2 className="text-sm font-semibold mb-3">신고 인박스</h2>
        <ReportInbox items={reports} />
      </section>

      {/* Storage */}
      <section className="vf-card p-5 mb-8">
        <h2 className="text-sm font-semibold mb-3">R2 저장소</h2>
        {storage ? (
          <p className="text-sm" style={{ color: "var(--text-primary)" }}>
            <strong className="vf-serif-display" style={{ fontSize: "1.3rem" }}>
              {fmtBytes(storage.bytes)}
            </strong>
            <span style={{ color: "var(--text-muted)" }}> · 파일 {storage.objects}개</span>
          </p>
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {storageError
              ? "R2 조회에 실패했어요 — Cloudflare 대시보드에서 확인해 주세요."
              : "R2 환경변수가 없어요 (Supabase Storage 폴백 사용 중)."}
          </p>
        )}
      </section>

      {/* External consoles */}
      <footer
        className="flex flex-wrap gap-x-5 gap-y-2 pt-4"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        {[
          ["Vercel", "https://vercel.com/dashboard"],
          ["Supabase", "https://supabase.com/dashboard/project/nepwsgrtonmexgqplcdp"],
          ["Cloudflare R2", "https://dash.cloudflare.com/?to=/:account/r2"],
          ["cron-job.org", "https://console.cron-job.org"],
          ["Resend", "https://resend.com/emails"],
          ["Sentry", "https://sentry.io"],
        ].map(([label, href]) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="vf-mono text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            {label} ↗
          </a>
        ))}
      </footer>
    </main>
  );
}
