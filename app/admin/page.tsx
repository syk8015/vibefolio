import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/routeAuth";
import { hasErrorReporter } from "@/lib/logger";
import { isR2Configured, r2Usage } from "@/lib/r2";
import { parseDemoFailure } from "@/lib/demo-failure";
import { AnalyticsEvent } from "@/lib/analytics-events";
import { classifyTrafficSource } from "@/lib/traffic-source";
import { AdminRequestList, type AdminRequestItem } from "./AdminRequestList";
import { ReportInbox, type ReportItem } from "./ReportInbox";
import { ModerationInbox, type ModerationItem } from "./ModerationInbox";
import {
  Ledger,
  type LedgerEntry,
  AlertTicker,
  SectionTitle,
  MonoAside,
  Panel,
  ColumnChart,
  RatioRing,
  StatSpark,
  Funnel,
  StatusBars,
  RankList,
  EventBreakdown,
  statusMeta,
  ago,
  fmtBytes,
} from "./panels";

// 관제탑 — the whole admin surface on one full-width screen, read in triage
// order: ① 생존 (is the machine alive) → ② 손이 필요한 것 (approvals, reports)
// → ③ 시연 파이프라인 (throughput, quality) → ④ 성장 (funnel, spread, reach).
// Gated to ADMIN_EMAILS; 404 to everyone else. Always rendered fresh.
export const dynamic = "force-dynamic";

// Mirrors HEARTBEAT_STALE_MIN in app/api/cron/health/route.ts (route files can't
// export extra symbols, so the threshold is duplicated here on purpose).
const HEARTBEAT_STALE_MIN = 12;
// External cron runs every 5 minutes; 12min ≈ two missed ticks.
const CRON_STALE_MIN = 12;

const WINDOW_DAYS = 30;
const CHART_DAYS = 14;
const DAY_MS = 86_400_000;
const dayKey = (iso: string) => iso.slice(0, 10); // YYYY-MM-DD (UTC)

// Referrer URL → bare host for ranking ("어디서 왔나"). Nulls (direct visits,
// referrer-stripping browsers) bucket together instead of disappearing.
function refHost(ref: unknown): string {
  if (typeof ref !== "string" || !ref) return "(직접/알 수 없음)";
  try {
    return new URL(ref).hostname.replace(/^www\./, "");
  } catch {
    return "(직접/알 수 없음)";
  }
}

function topCounts(map: Record<string, number>, n: number): { label: string; count: number }[] {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([label, count]) => ({ label, count }));
}

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

// Status tokens for this page only — validated against both paper surfaces
// (see panels.tsx header). Follows the site convention: :root default +
// [data-theme="dark"] override, no media query.
const OPS_TOKENS = `
.nf-ops { --ops-ok: #2e7d4a; --ops-warn: #a5741f; --ops-bad: #b53f3f; }
[data-theme="dark"] .nf-ops { --ops-ok: #3f9e60; --ops-warn: #bd831f; --ops-bad: #cd5f4a; }
`;

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) notFound();

  const admin = createAdminClient();
  const now = Date.now();
  const since = new Date(now - WINDOW_DAYS * DAY_MS).toISOString();

  const [
    reqsRes,
    sysRes,
    statusRes,
    recentRes,
    profileCountRes,
    reportsRes,
    moderationRes,
    eventsRes,
    viewsRes,
  ] = await Promise.all([
    admin
      .from("demo_requests")
      .select("id, project_id, user_id, kind, reason, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
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
    admin
      .from("demo_moderation")
      .select("id, project_id, video_url, poster_url, categories, reason, model, created_at")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("analytics_events")
      .select("event, created_at, props")
      .gte("created_at", since)
      .order("created_at", { ascending: true }),
    // ⚠️ portfolio_views is a remote-only table (no local SQL) and its timestamp
    // column is `viewed_at`, not created_at — checked against the live schema.
    admin
      .from("portfolio_views")
      .select("referrer, country, viewed_at, user_agent")
      .gte("viewed_at", since)
      .order("viewed_at", { ascending: false })
      .limit(5000),
  ]);

  // ── approval queue ─────────────────────────────────────────────────────────
  const requests = reqsRes.data ?? [];
  const reqProjectIds = [...new Set(requests.map((r) => r.project_id))];
  const reqUserIds = [...new Set(requests.map((r) => r.user_id))];
  const [{ data: reqProjects }, { data: reqProfiles }] = await Promise.all([
    reqProjectIds.length
      ? admin.from("projects").select("id, title, demo_url, demo_build_status, demo_video_url").in("id", reqProjectIds)
      : Promise.resolve({ data: [] as never[] }),
    reqUserIds.length
      ? admin.from("profiles").select("id, username").in("id", reqUserIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);
  const pById = new Map((reqProjects ?? []).map((p) => [p.id, p]));
  const uById = new Map((reqProfiles ?? []).map((u) => [u.id, u]));
  const approvalItems: AdminRequestItem[] = requests.map((r) => {
    const p = pById.get(r.project_id);
    const u = uById.get(r.user_id);
    return {
      id: r.id,
      kind: r.kind as AdminRequestItem["kind"],
      reason: r.reason,
      createdAt: r.created_at,
      projectTitle: p?.title ?? "(삭제된 프로젝트)",
      demoUrl: p?.demo_url ?? null,
      hasVideo: !!p?.demo_video_url,
      username: u?.username ?? null,
    };
  });

  // ── liveness ───────────────────────────────────────────────────────────────
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
  const sentryWired = hasErrorReporter();

  // ── pipeline ───────────────────────────────────────────────────────────────
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

  // ── report inbox ───────────────────────────────────────────────────────────
  const rawReports = reportsRes.data ?? [];
  const rpProfileIds = rawReports.filter((r) => r.target_type === "profile").map((r) => r.target_id);
  const rpProjectIds = rawReports.filter((r) => r.target_type === "project").map((r) => r.target_id);
  const [{ data: rProfiles }, { data: rProjects }] = await Promise.all([
    rpProfileIds.length
      ? admin.from("profiles").select("id, username").in("id", rpProfileIds)
      : Promise.resolve({ data: [] as { id: string; username: string }[] }),
    rpProjectIds.length
      ? admin.from("projects").select("id, title, user_id").in("id", rpProjectIds)
      : Promise.resolve({ data: [] as { id: string; title: string | null; user_id: string }[] }),
  ]);
  const rpOwnerIds = [...new Set((rProjects ?? []).map((p) => p.user_id))];
  const { data: rOwners } = rpOwnerIds.length
    ? await admin.from("profiles").select("id, username").in("id", rpOwnerIds)
    : { data: [] as { id: string; username: string }[] };
  const rOwnerById = new Map((rOwners ?? []).map((o) => [o.id, o.username]));
  const rProfileById = new Map((rProfiles ?? []).map((p) => [p.id, p.username]));
  const rProjectById = new Map((rProjects ?? []).map((p) => [p.id, p]));
  const reports: ReportItem[] = rawReports.map((r) => {
    const reporter = r.reporter_user_id
      ? `로그인 ${r.reporter_user_id.slice(0, 8)}`
      : `비로그인 ${r.reporter_key.slice(0, 8)}`;
    if (r.target_type === "profile") {
      const username = rProfileById.get(r.target_id) ?? "?";
      return {
        id: r.id, targetType: "profile" as const,
        targetLabel: `@${username}`, targetUrl: `/${username}`,
        reason: r.reason, detail: r.detail, reporter, createdAt: r.created_at,
      };
    }
    const project = rProjectById.get(r.target_id);
    const username = project ? (rOwnerById.get(project.user_id) ?? "?") : "?";
    return {
      id: r.id, targetType: "project" as const,
      targetLabel: `${project?.title ?? "(삭제된 프로젝트)"} · @${username}`,
      targetUrl: project ? `/${username}/${project.id}` : "#",
      reason: r.reason, detail: r.detail, reporter, createdAt: r.created_at,
    };
  });

  // ── moderation inbox ───────────────────────────────────────────────────────
  // Missing table (migration_demo_moderation.sql not applied yet) degrades to a
  // notice instead of breaking the tower — same policy as analytics_events.
  const moderationMissing =
    moderationRes.error?.code === "PGRST205" ||
    moderationRes.error?.code === "42P01" ||
    (typeof moderationRes.error?.message === "string" &&
      moderationRes.error.message.includes("schema cache"));
  const rawModeration = moderationRes.data ?? [];
  const modProjectIds = [...new Set(rawModeration.map((m) => m.project_id))];
  const { data: modProjects } = modProjectIds.length
    ? await admin.from("projects").select("id, title, user_id").in("id", modProjectIds)
    : { data: [] as { id: string; title: string | null; user_id: string }[] };
  const modOwnerIds = [...new Set((modProjects ?? []).map((p) => p.user_id))];
  const { data: modOwners } = modOwnerIds.length
    ? await admin.from("profiles").select("id, username").in("id", modOwnerIds)
    : { data: [] as { id: string; username: string }[] };
  const modProjectById = new Map((modProjects ?? []).map((p) => [p.id, p]));
  const modOwnerById = new Map((modOwners ?? []).map((o) => [o.id, o.username]));
  const moderationItems: ModerationItem[] = rawModeration.map((m) => {
    const project = modProjectById.get(m.project_id);
    return {
      id: m.id,
      projectTitle: project?.title ?? "(삭제된 프로젝트)",
      username: project ? (modOwnerById.get(project.user_id) ?? null) : null,
      videoUrl: m.video_url,
      posterUrl: m.poster_url,
      categories: (m.categories ?? []) as string[],
      reason: m.reason,
      model: m.model,
      createdAt: m.created_at,
    };
  });

  // ── metrics (30d) ──────────────────────────────────────────────────────────
  const metricsMissing =
    eventsRes.error?.code === "PGRST205" ||
    eventsRes.error?.code === "42P01" ||
    (typeof eventsRes.error?.message === "string" && eventsRes.error.message.includes("schema cache"));
  const rows = (eventsRes.data ?? []) as {
    event: string;
    created_at: string;
    props: Record<string, unknown> | null;
  }[];
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.event] = (counts[r.event] ?? 0) + 1;
  const requested = counts[AnalyticsEvent.DemoRequested] ?? 0;
  const succeeded = counts[AnalyticsEvent.DemoSucceeded] ?? 0;
  const failed = counts[AnalyticsEvent.DemoFailed] ?? 0;
  const successRate = requested > 0 ? Math.round((succeeded / requested) * 100) : null;
  const shares =
    (counts[AnalyticsEvent.ShareCopied] ?? 0) + (counts[AnalyticsEvent.DemoDownloaded] ?? 0);
  const shareRate = succeeded > 0 ? Math.round((shares / succeeded) * 100) : null;

  const days: string[] = [];
  for (let i = CHART_DAYS - 1; i >= 0; i--) days.push(dayKey(new Date(now - i * DAY_MS).toISOString()));
  const daily = new Map(days.map((d) => [d, { requested: 0, succeeded: 0, failed: 0 }]));
  for (const r of rows) {
    const bucket = daily.get(dayKey(r.created_at));
    if (!bucket) continue;
    if (r.event === AnalyticsEvent.DemoRequested) bucket.requested++;
    else if (r.event === AnalyticsEvent.DemoSucceeded) bucket.succeeded++;
    else if (r.event === AnalyticsEvent.DemoFailed) bucket.failed++;
  }
  const maxDaily = Math.max(1, ...days.map((d) => daily.get(d)!.requested));
  const failed14 = days.reduce((a, d) => a + daily.get(d)!.failed, 0);
  const funnelSteps = [
    { label: "가입", value: counts[AnalyticsEvent.SignupCompleted] ?? 0 },
    { label: "프로젝트 생성", value: counts[AnalyticsEvent.ProjectCreated] ?? 0 },
    { label: "시연 요청", value: requested },
    { label: "시연 성공", value: succeeded },
    { label: "공유·다운로드", value: shares },
  ];
  const funnelMax = Math.max(1, ...funnelSteps.map((f) => f.value));
  const allEvents = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  // 못 찍는 네이티브 앱 수요 (2026-08-26). 클라우드 폰(Appetize)은 월 구독이라
  // "실제로 올리려는 사람이 있나"를 먼저 센다 — 이 숫자가 붙기 전엔 착수 안 함.
  // 인제스트 zip 거절과 워커의 not-a-webapp이 같은 이벤트로 모인다.
  const nativeCounts: Record<string, number> = {};
  let nativeTotal = 0;
  for (const r of rows) {
    if (r.event !== AnalyticsEvent.NativeAppRejected) continue;
    nativeTotal++;
    const platform = typeof r.props?.platform === "string" ? r.props.platform : "unknown";
    const source = typeof r.props?.source === "string" ? r.props.source : "?";
    bump(nativeCounts, `${platform} · ${source}`);
  }

  // ── 유입 · 확산 (T7 — 실사용 소스 분해) ─────────────────────────────────────
  const views = viewsRes.data ?? [];
  const viewChannelCounts: Record<string, number> = {};
  const viewRefCounts: Record<string, number> = {};
  const viewCountryCounts: Record<string, number> = {};
  for (const v of views) {
    // 채널 = UA 인앱 시그니처(카톡·인스타·Threads…) → 리퍼러 도메인 → 직접.
    // 인앱 브라우저는 Referer를 지우지만 UA는 남기므로 소급 분류가 된다.
    bump(viewChannelCounts, classifyTrafficSource({ referrer: v.referrer, userAgent: v.user_agent }));
    bump(viewRefCounts, refHost(v.referrer));
    bump(viewCountryCounts, (v.country as string | null) ?? "(알 수 없음)");
  }

  const shareKindCounts: Record<string, number> = {};
  const watchRefCounts: Record<string, number> = {};
  const watchProjectCounts: Record<string, number> = {};
  const signupSourceCounts: Record<string, number> = {};
  const SHARE_KIND_LABEL: Record<string, string> = {
    watch_link: "워치 링크 복사",
    x_post: "X 포스트",
  };
  for (const r of rows) {
    const p = r.props ?? {};
    if (r.event === AnalyticsEvent.ShareCopied) {
      const kind = typeof p.kind === "string" ? (SHARE_KIND_LABEL[p.kind] ?? p.kind) : "기타 복사";
      bump(shareKindCounts, kind);
    } else if (r.event === AnalyticsEvent.DemoDownloaded) {
      bump(shareKindCounts, "영상 다운로드");
    } else if (r.event === AnalyticsEvent.WatchView) {
      // channel은 /api/analytics가 서버측에서 스탬프. 구이벤트(스탬프 이전)는
      // referrer/via로 재분류해 같은 축으로 합산.
      bump(
        watchRefCounts,
        typeof p.channel === "string"
          ? p.channel
          : classifyTrafficSource({ referrer: p.referrer, via: p.via }),
      );
      if (typeof p.projectId === "string") bump(watchProjectCounts, p.projectId);
    } else if (r.event === AnalyticsEvent.SignupCompleted) {
      const source =
        (typeof p.utm_source === "string" && p.utm_source) || refHost(p.ref ?? null);
      bump(signupSourceCounts, source);
    }
  }

  // Top watch-attributed projects need titles for display.
  const watchTop = topCounts(watchProjectCounts, 6);
  const { data: watchProjects } = watchTop.length
    ? await admin.from("projects").select("id, title").in("id", watchTop.map((w) => w.label))
    : { data: [] as { id: string; title: string | null }[] };
  const watchTitleById = new Map((watchProjects ?? []).map((p) => [p.id, p.title]));
  const watchTopRows = watchTop.map((w) => ({
    label: watchTitleById.get(w.label) ?? "(삭제된 프로젝트)",
    count: w.count,
  }));

  // ── 30d daily series for sparklines (signups, card views) ─────────────────
  const days30: string[] = [];
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) days30.push(dayKey(new Date(now - i * DAY_MS).toISOString()));
  const signupsByDay = new Map(days30.map((d) => [d, 0]));
  const viewsByDay = new Map(days30.map((d) => [d, 0]));
  for (const r of rows) {
    if (r.event !== AnalyticsEvent.SignupCompleted) continue;
    const k = dayKey(r.created_at);
    if (signupsByDay.has(k)) signupsByDay.set(k, signupsByDay.get(k)! + 1);
  }
  for (const v of views) {
    const k = dayKey(v.viewed_at as string);
    if (viewsByDay.has(k)) viewsByDay.set(k, viewsByDay.get(k)! + 1);
  }
  const signupSpark = days30.map((d) => signupsByDay.get(d)!);
  const viewSpark = days30.map((d) => viewsByDay.get(d)!);
  const signups30 = funnelSteps[0].value;
  const overallConv = signups30 > 0 ? Math.round((shares / signups30) * 100) : null;

  // ── storage ────────────────────────────────────────────────────────────────
  let storage: { objects: number; bytes: number } | null = null;
  let storageError = false;
  if (isR2Configured()) {
    try {
      storage = await r2Usage();
    } catch {
      storageError = true;
    }
  }

  // ── ① 생존 — system ledger + verdict ──────────────────────────────────────
  const systemEntries: LedgerEntry[] = [
    {
      label: "녹화 워커",
      value: paused ? "일시정지" : workerStale ? "멈춤" : "가동",
      sub: paused
        ? "의도적 정지 · 시연 요청은 대기열 보존"
        : `하트비트 ${ago(lastSeen, now)}`,
      state: paused ? "warn" : workerStale ? "bad" : "ok",
    },
    {
      label: "워치독 크론",
      value: cronStale ? "끊김" : "가동",
      sub: `틱 ${ago(cronTick, now)}`,
      state: cronStale ? "bad" : "ok",
    },
    {
      label: "Sentry",
      value: sentryWired ? "수신 중" : "미배선",
      sub: sentryWired ? "reporterWired" : "instrumentation 확인",
      state: sentryWired ? "ok" : "bad",
    },
    {
      label: "R2 저장소",
      value: storage ? fmtBytes(storage.bytes) : storageError ? "조회 실패" : "미설정",
      sub: storage
        ? `파일 ${storage.objects}개`
        : storageError
          ? "Cloudflare 대시보드 확인"
          : "Supabase Storage 폴백",
      state: storage ? "ok" : storageError ? "bad" : "plain",
    },
  ];
  const nBad = systemEntries.filter((e) => e.state === "bad").length;
  const nWarn = systemEntries.filter((e) => e.state === "warn").length;
  const firstIssue =
    systemEntries.find((e) => e.state === "bad") ?? systemEntries.find((e) => e.state === "warn");
  const latestAlert = alertEntries[0] ?? null;
  const alertFresh = latestAlert ? now - Date.parse(latestAlert[1]) < DAY_MS : false;
  const ledger: LedgerEntry[] = [
    {
      label: "시스템",
      value: nBad > 0 ? `이상 ${nBad}건` : nWarn > 0 ? `주의 ${nWarn}건` : "정상 운항",
      sub: firstIssue ? `${firstIssue.label} 확인` : "워커·크론·Sentry·R2 정상",
      state: nBad > 0 ? "bad" : nWarn > 0 ? "warn" : "ok",
      emph: true,
    },
    ...systemEntries,
    {
      label: "최근 경보",
      value: alertEntries.length > 0 ? alertEntries.length : "없음",
      sub: latestAlert ? `마지막 ${ago(latestAlert[1], now)}` : "기록 없음",
      state: alertFresh ? "warn" : "plain",
    },
  ];

  const todoCount = approvalItems.length + reports.length + moderationItems.length;

  return (
    <main
      className="nf-ops mx-auto px-5 lg:px-10 py-10"
      style={{ maxWidth: "1680px", fontFamily: "var(--font-nunito)", color: "var(--text-primary)" }}
    >
      <style>{OPS_TOKENS}</style>

      {/* Header */}
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-6">
        {/* 폰에서는 제목과 시각을 세로로 — 한 줄에 붙이면 제목이 두 동강 나고
            그 사이로 타임스탬프가 끼어든다(2026-08-27 실기기 확인). */}
        <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-4">
          <h1 className="vf-serif-display" style={{ fontSize: "1.9rem" }}>관제탑</h1>
          <span className="vf-mono" style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
            {new Date(now).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} KST · 새로고침하면 갱신
          </span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {[
            ["홍보 클립 관리", "/admin/promo"],
            ["Vercel", "https://vercel.com/dashboard"],
            ["Supabase", "https://supabase.com/dashboard/project/nepwsgrtonmexgqplcdp"],
            ["R2", "https://dash.cloudflare.com/?to=/:account/r2"],
            ["cron-job.org", "https://console.cron-job.org"],
            ["Resend", "https://resend.com/emails"],
            ["Sentry", "https://sentry.io"],
            // 도메인 속성이라 resource_id는 sc-domain: 접두사가 붙는다(URL 속성과 다름).
            ["Search Console", "https://search.google.com/search-console?resource_id=sc-domain%3Anookframe.com"],
            ["사이트맵 상태", "https://search.google.com/search-console/sitemaps?resource_id=sc-domain%3Anookframe.com"],
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
        </div>
      </div>

      {/* ① 생존 — annunciator ledger (verdict first) + alert log line */}
      <div className="mb-8">
        <Ledger entries={ledger} />
        <AlertTicker entries={alertEntries} now={now} />
      </div>

      {/* ② 손이 필요한 것 */}
      <section className="mb-8">
        <SectionTitle
          aside={
            <MonoAside tone={todoCount > 0 ? "warn" : undefined}>
              승인 {approvalItems.length} · 신고 {reports.length} · 모더레이션 {moderationItems.length}
              {todoCount > 0 ? " — 결정 필요" : ""}
            </MonoAside>
          }
        >
          손이 필요한 것
        </SectionTitle>
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          <div className="xl:col-span-7 flex flex-col gap-5">
            <Panel
              title={`시연 승인 대기 · ${approvalItems.length}`}
              aside={<MonoAside>승인하면 바로 촬영 대기열로</MonoAside>}
            >
              <AdminRequestList items={approvalItems} />
            </Panel>
            <Panel
              title={`모더레이션 검토 · ${moderationItems.length}`}
              aside={<MonoAside>승인=게시 · 거절=격리 파일 삭제</MonoAside>}
            >
              {moderationMissing ? (
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  demo_moderation 테이블이 아직 없어요 —{" "}
                  <code className="vf-mono">supabase/migration_demo_moderation.sql</code> 적용 필요.
                </p>
              ) : (
                <ModerationInbox items={moderationItems} />
              )}
            </Panel>
          </div>
          <div className="xl:col-span-5">
            <Panel title={`신고 인박스 · ${reports.length}`}>
              <ReportInbox items={reports} />
            </Panel>
          </div>
        </div>
      </section>

      {/* ③ 시연 파이프라인 */}
      <section className="mb-8">
        <SectionTitle
          aside={
            <MonoAside>
              대기 {pendingCount} · 진행 {inFlightCount}
              {metricsMissing ? "" : ` · 실패 ${failed} (${WINDOW_DAYS}일)`}
            </MonoAside>
          }
        >
          시연 파이프라인
        </SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-5 items-start">
          <div className="xl:col-span-5">
            <Panel
              title={`일별 시연 (${CHART_DAYS}일)`}
              aside={metricsMissing ? undefined : <MonoAside>실패 {failed14} · {CHART_DAYS}일</MonoAside>}
            >
              {metricsMissing ? <MetricsMissingNotice /> : (
                <ColumnChart days={days} daily={daily} maxDaily={maxDaily} />
              )}
            </Panel>
          </div>
          <div className="xl:col-span-4">
            <Panel
              title="시연 상태"
              aside={<MonoAside>대기 {pendingCount} · 진행 {inFlightCount}</MonoAside>}
            >
              <StatusBars distribution={distribution} />
              {recent.length > 0 && (
                <div className="flex flex-col gap-1.5 mt-4 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                  <span className="vf-label" style={{ margin: 0, color: "var(--text-muted)" }}>최근 10건</span>
                  {recent.map((r) => {
                    const meta = statusMeta(r.demo_build_status as string);
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
                            {" "}· @{usernameById.get(r.user_id) ?? "?"}
                          </span>
                          {failure && (
                            <span className="vf-mono" style={{ fontSize: "0.68rem", color: "var(--ops-bad)" }}>
                              {" "}[{failure.code}]
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
            </Panel>
          </div>
          <div className="xl:col-span-3">
            <Panel title={`빌드 성공률 (${WINDOW_DAYS}일)`}>
              {metricsMissing ? <MetricsMissingNotice /> : (
                <div className="flex flex-col items-center gap-3 py-2">
                  <RatioRing pct={successRate} />
                  <div
                    className="vf-mono text-center"
                    style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}
                  >
                    성공 {succeeded} / 요청 {requested} · 실패 {failed}
                  </div>
                </div>
              )}
            </Panel>
          </div>
        </div>
      </section>

      {/* ④ 성장 */}
      <section>
        <SectionTitle
          aside={
            <MonoAside>
              {metricsMissing ? "" : `가입 ${signups30} · `}조회 {views.length} · {WINDOW_DAYS}일
            </MonoAside>
          }
        >
          성장
        </SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-5 items-start mb-5">
          <div className="xl:col-span-5">
            <Panel
              title={`퍼널 (${WINDOW_DAYS}일)`}
              aside={
                metricsMissing || overallConv === null ? undefined : (
                  <MonoAside>가입→공유 {overallConv}%</MonoAside>
                )
              }
            >
              {metricsMissing ? <MetricsMissingNotice /> : (
                <Funnel steps={funnelSteps} max={funnelMax} />
              )}
            </Panel>
          </div>
          <div className="xl:col-span-4">
            <Panel title="공유 · 확산" aside={<MonoAside>목표 30%</MonoAside>}>
              {metricsMissing ? <MetricsMissingNotice /> : (
                <>
                  <div className="flex items-center gap-4 mb-4">
                    <RatioRing pct={shareRate} size={96} goal={30} />
                    <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                      성공한 시연 {succeeded}건 중 {shares}건이 공유·다운로드로 이어졌어요.
                      <div className="vf-mono mt-1" style={{ fontSize: "0.66rem", color: "var(--text-muted)" }}>
                        링 눈금 = 목표 30%
                      </div>
                    </div>
                  </div>
                  <RankList rows={topCounts(shareKindCounts, 5)} empty="아직 공유 행동이 없어요." />
                  {Object.keys(watchRefCounts).length > 0 && (
                    <div className="mt-4">
                      <div className="vf-label" style={{ color: "var(--text-muted)" }}>watch 유입 채널</div>
                      <RankList rows={topCounts(watchRefCounts, 6)} empty="" />
                    </div>
                  )}
                  {watchTopRows.length > 0 && (
                    <div className="mt-4">
                      <div className="vf-label" style={{ color: "var(--text-muted)" }}>watch 귀속 상위</div>
                      <RankList rows={watchTopRows} empty="" />
                    </div>
                  )}
                </>
              )}
            </Panel>
          </div>
          <div className="xl:col-span-3">
            <Panel title="규모">
              <div className="flex flex-col gap-4">
                <StatSpark
                  label="가입자"
                  value={profileCountRes.count ?? 0}
                  points={signupSpark}
                  sub={`최근 ${WINDOW_DAYS}일 +${signups30} · profiles 총계`}
                />
                <div style={{ borderTop: "1px solid var(--border)" }} />
                <StatSpark
                  label="프레임 조회"
                  value={views.length}
                  points={viewSpark}
                  sub={`일별 추이 · ${WINDOW_DAYS}일`}
                />
              </div>
            </Panel>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-start">
          <Panel
            title="프레임 조회 유입 채널"
            aside={<MonoAside>조회 {views.length}</MonoAside>}
          >
            <RankList rows={topCounts(viewChannelCounts, 8)} empty="아직 조회가 없어요." />
            {topCounts(viewRefCounts, 6).some((r) => r.label !== "(직접/알 수 없음)") && (
              <div className="mt-4">
                <div className="vf-label" style={{ color: "var(--text-muted)" }}>리퍼러 도메인 원본</div>
                <RankList rows={topCounts(viewRefCounts, 6)} empty="" />
              </div>
            )}
          </Panel>
          <Panel title="조회 국가">
            <RankList rows={topCounts(viewCountryCounts, 8)} empty="아직 조회가 없어요." />
          </Panel>
          <Panel
            title="못 찍는 네이티브 앱 요청"
            aside={<MonoAside>{nativeTotal}건 / {WINDOW_DAYS}일</MonoAside>}
          >
            <RankList
              rows={topCounts(nativeCounts, 8)}
              empty="아직 없어요 — 요청이 쌓이면 그때 클라우드 폰(Appetize) 도입을 판단."
            />
          </Panel>
          <Panel title="가입 유입 소스">
            <RankList
              rows={topCounts(signupSourceCounts, 8)}
              empty="아직 없어요 — 이 배포부터 첫 방문 referrer/UTM이 가입에 붙어요."
            />
          </Panel>
        </div>
        {/* 원본 이벤트 카운트 — 진단용이라 접어 둔다 */}
        <details className="mt-6" style={{ borderTop: "1px solid var(--border)" }}>
          <summary
            className="vf-mono"
            style={{ fontSize: "0.7rem", color: "var(--text-muted)", cursor: "pointer", padding: "10px 0" }}
          >
            이벤트 원본 카운트 ({WINDOW_DAYS}일) · {allEvents.length}종
          </summary>
          <div style={{ maxWidth: "560px", paddingBottom: "12px" }}>
            {metricsMissing ? <MetricsMissingNotice /> : <EventBreakdown events={allEvents} />}
          </div>
        </details>
      </section>
    </main>
  );
}

function MetricsMissingNotice() {
  return (
    <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
      analytics_events 테이블이 아직 없어요 —{" "}
      <code className="vf-mono">supabase/migration_analytics.sql</code> 적용 필요.
    </p>
  );
}
