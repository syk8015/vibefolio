// Presentational pieces for the unified /admin control tower. All server
// components — interactivity lives in AdminRequestList / ReportInbox.
//
// Status colors are page-scoped tokens (--ops-ok/--ops-warn/--ops-bad) defined
// in page.tsx, validated against both paper surfaces (dataviz six-checks).
// A colored dot never stands alone — every state ships with its text label.
// Chart series NEVER reuse status colors: magnitude/trend is always the ink
// pair (--blue solid / --blue-tint-strong), a same-hue lightness pair.

export type LedgerState = "ok" | "warn" | "bad" | "plain";

export function ago(iso: string | null | undefined, now: number): string {
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

export function fmtBytes(n: number): string {
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)} GB`;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

const STATE_COLOR: Record<Exclude<LedgerState, "plain">, string> = {
  ok: "var(--ops-ok)",
  warn: "var(--ops-warn)",
  bad: "var(--ops-bad)",
};

// ── Annunciator ledger (v2) ──────────────────────────────────────────────────
// System-liveness only (verdict + worker/cron/Sentry/R2/alerts). Action counts
// and growth numbers moved to their own bands — the old strip mixed all four
// categories, which is why anomalies didn't pop. `emph` marks the verdict cell
// (wider, larger serif). bad/warn values take the status color so a scan of
// the strip surfaces problems without reading the sub-lines.

export type LedgerEntry = {
  label: string;
  value: string | number;
  sub: string;
  state: LedgerState;
  emph?: boolean;
};

export function Ledger({ entries }: { entries: LedgerEntry[] }) {
  return (
    <div
      className="flex flex-wrap"
      style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}
    >
      {entries.map((e, i) => (
        <div
          key={e.label}
          className="px-4 py-4"
          style={{
            flex: e.emph ? "1.5 1 0%" : "1 1 0%",
            minWidth: e.emph ? "11rem" : "9rem",
            ...(i > 0 ? { borderLeft: "1px solid var(--border)" } : {}),
          }}
        >
          <div className="flex items-center gap-1.5">
            {e.state !== "plain" && (
              <span
                aria-hidden
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: STATE_COLOR[e.state] }}
              />
            )}
            <span className="vf-label" style={{ margin: 0, color: "var(--text-muted)" }}>
              {e.label}
            </span>
          </div>
          <div
            className="vf-serif-display"
            style={{
              fontSize: e.emph ? "1.9rem" : "1.55rem",
              lineHeight: 1.15,
              marginTop: "0.3rem",
              fontVariantNumeric: "tabular-nums",
              color:
                e.state === "bad"
                  ? "var(--ops-bad)"
                  : e.state === "warn"
                    ? "var(--ops-warn)"
                    : "var(--text-primary)",
            }}
          >
            {e.value}
          </div>
          <div
            className="vf-mono"
            style={{ fontSize: "0.66rem", color: "var(--text-muted)", marginTop: "0.15rem" }}
          >
            {e.sub}
          </div>
        </div>
      ))}
    </div>
  );
}

// Cockpit message line under the ledger — recent alert log, one mono line,
// renders nothing when the log is empty.
const ALERT_LABEL: Record<string, string> = {
  "worker-stale": "워커 하트비트 끊김",
  reaped: "스턱 잡 정리",
  "pending-no-worker": "대기열 있음 · 워커 무응답",
  "pending-not-draining": "대기열이 빠지지 않음",
  "stuck-query-failed": "워치독 DB 조회 실패",
  "reap-update-failed": "워치독 정리 실패",
};

export function AlertTicker({
  entries,
  now,
  max = 4,
}: {
  entries: [string, string][];
  now: number;
  max?: number;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-2">
      <span className="vf-label" style={{ margin: 0, color: "var(--text-muted)" }}>
        경보 로그
      </span>
      {entries.slice(0, max).map(([key, sentAt]) => (
        <span key={key} className="vf-mono" style={{ fontSize: "0.68rem", color: "var(--text-secondary)" }}>
          {ALERT_LABEL[key] ?? key}{" "}
          <span style={{ color: "var(--text-muted)" }}>{ago(sentAt, now)}</span>
        </span>
      ))}
      {entries.length > max && (
        <span className="vf-mono" style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
          +{entries.length - max}
        </span>
      )}
    </div>
  );
}

// ── Section & panel scaffolding ──────────────────────────────────────────────
// Full-width bands in triage order (생존 → 손 → 파이프라인 → 성장). Each band
// header carries a summary aside so the category's key numbers are readable
// without entering the panels.

export function SectionTitle({
  children,
  aside,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-3">
      <h2 className="vf-label" style={{ margin: 0, color: "var(--text-muted)" }}>
        {children}
      </h2>
      {aside}
    </div>
  );
}

export function MonoAside({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "warn" | "bad";
}) {
  return (
    <span
      className="vf-mono"
      style={{
        fontSize: "0.68rem",
        color: tone ? `var(--ops-${tone})` : "var(--text-muted)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {children}
    </span>
  );
}

export function Panel({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="vf-card p-5">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

// ── Charts (ink-only) ────────────────────────────────────────────────────────
// requested = ink tint, succeeded = solid ink — a lightness pair on one hue,
// so no categorical palette; 2 series → legend. Numbers are tabular-nums.

function LegendChip({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className="inline-block w-3 h-3 rounded" style={{ background: swatch }} />
      <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>{label}</span>
    </span>
  );
}

// Vertical column chart for the 14-day demo trend — replaces the horizontal
// row-bar list so the time axis reads left→right and dips/spikes are visible
// at a glance. Track = sunken paper, requested = tint, succeeded = solid ink.
export function ColumnChart({
  days,
  daily,
  maxDaily,
  height = 150,
}: {
  days: string[];
  daily: Map<string, { requested: number; succeeded: number; failed: number }>;
  maxDaily: number;
  height?: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-4">
          <LegendChip swatch="var(--blue-tint-strong)" label="요청" />
          <LegendChip swatch="var(--blue)" label="성공" />
        </div>
        <MonoAside>최대 {maxDaily}/일</MonoAside>
      </div>
      <div style={{ display: "flex", gap: "4px", height }}>
        {days.map((d, i) => {
          const b = daily.get(d)!;
          const showLabel = i % 2 === (days.length - 1) % 2;
          return (
            <div
              key={d}
              className="flex-1 flex flex-col min-w-0"
              style={{ gap: "4px" }}
              title={`${d} · 요청 ${b.requested} · 성공 ${b.succeeded} · 실패 ${b.failed}`}
            >
              <div
                className="relative flex-1 overflow-hidden"
                style={{ background: "var(--surface-sunken)", borderRadius: "4px" }}
              >
                <div
                  className="absolute left-0 right-0 bottom-0"
                  style={{
                    height: `${(b.requested / maxDaily) * 100}%`,
                    background: "var(--blue-tint-strong)",
                    borderRadius: "3px 3px 0 0",
                  }}
                />
                <div
                  className="absolute left-0 right-0 bottom-0"
                  style={{
                    height: `${(b.succeeded / maxDaily) * 100}%`,
                    background: "var(--blue)",
                    borderRadius: "3px 3px 0 0",
                  }}
                />
              </div>
              <span
                className="vf-mono text-center"
                style={{ fontSize: "0.6rem", height: "0.9rem", color: "var(--text-muted)" }}
              >
                {showLabel ? d.slice(8) : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Ratio donut — success rate, share rate. Track = ink tint, arc = solid ink;
// optional goal tick (e.g. share-rate target 30%) as a radial hairline.
export function RatioRing({
  pct,
  size = 116,
  stroke = 10,
  goal,
}: {
  pct: number | null;
  size?: number;
  stroke?: number;
  goal?: number;
}) {
  const r = 50 - stroke / 2 - 2;
  const C = 2 * Math.PI * r;
  const frac = pct === null ? 0 : Math.max(0, Math.min(100, pct)) / 100;
  let tick: React.ReactNode = null;
  if (goal != null) {
    const a = (goal / 100) * 2 * Math.PI - Math.PI / 2;
    const ri = r - stroke / 2 - 1.5;
    const ro = r + stroke / 2 + 1.5;
    tick = (
      <line
        x1={50 + Math.cos(a) * ri}
        y1={50 + Math.sin(a) * ri}
        x2={50 + Math.cos(a) * ro}
        y2={50 + Math.sin(a) * ro}
        stroke="var(--text-secondary)"
        strokeWidth={1.6}
      />
    );
  }
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--blue-tint-strong)" strokeWidth={stroke} />
        {frac > 0 && (
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="var(--blue)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${frac * C} ${C}`}
            transform="rotate(-90 50 50)"
          />
        )}
        {tick}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="vf-serif-display"
          style={{ fontSize: "1.5rem", fontVariantNumeric: "tabular-nums" }}
        >
          {pct === null ? "—" : `${pct}%`}
        </span>
      </div>
    </div>
  );
}

// 30-day trend sparkline — ink line over ink-tint area. Data is a plain daily
// count array computed server-side.
export function Sparkline({ points, height = 34 }: { points: number[]; height?: number }) {
  const W = 100;
  const H = 32;
  const max = Math.max(1, ...points);
  const step = points.length > 1 ? W / (points.length - 1) : W;
  const xy = points.map(
    (v, i) => [i * step, H - 2 - (v / max) * (H - 5)] as const,
  );
  const line = xy.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height, display: "block" }}
      aria-hidden
    >
      <path d={`${line} L${W},${H} L0,${H} Z`} fill="var(--blue-tint-strong)" />
      <path d={line} fill="none" stroke="var(--blue)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// Big serif stat + its 30-day sparkline (가입자, 명함 조회).
export function StatSpark({
  label,
  value,
  sub,
  points,
}: {
  label: string;
  value: string | number;
  sub: string;
  points: number[];
}) {
  return (
    <div>
      <span className="vf-label" style={{ margin: 0, color: "var(--text-muted)" }}>{label}</span>
      <div
        className="vf-serif-display"
        style={{ fontSize: "1.8rem", lineHeight: 1.15, marginTop: "0.2rem", fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </div>
      <div style={{ margin: "8px 0 5px" }}>
        <Sparkline points={points} />
      </div>
      <div className="vf-mono" style={{ fontSize: "0.66rem", color: "var(--text-muted)" }}>{sub}</div>
    </div>
  );
}

// Funnel with step-to-step conversion — the bar shows magnitude vs. the first
// step, the right mono cell shows % of the PREVIOUS step, which is the number
// that actually says where users fall off.
export function Funnel({
  steps,
  max,
}: {
  steps: { label: string; value: number }[];
  max: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      {steps.map((f, i) => {
        const prev = i > 0 ? steps[i - 1].value : null;
        const conv = prev === null ? null : prev > 0 ? Math.round((f.value / prev) * 100) : null;
        return (
          <div
            key={f.label}
            className="flex items-center gap-3"
            title={conv === null ? `${f.label} ${f.value}` : `${f.label} ${f.value} · 이전 단계의 ${conv}%`}
          >
            <span className="text-sm shrink-0" style={{ width: "6rem", color: "var(--text-secondary)" }}>
              {f.label}
            </span>
            <div className="relative flex-1 rounded" style={{ height: "1.4rem", background: "var(--surface-sunken)" }}>
              <div
                className="absolute inset-y-0 left-0 rounded flex items-center px-2"
                style={{
                  width: `${(f.value / max) * 100}%`,
                  minWidth: "1.7rem",
                  background: "var(--blue-tint-strong)",
                }}
              >
                <span
                  className="vf-mono"
                  style={{ fontSize: "0.7rem", color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}
                >
                  {f.value}
                </span>
              </div>
            </div>
            <span
              className="vf-mono shrink-0 text-right"
              style={{ fontSize: "0.68rem", width: "3.4rem", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}
            >
              {conv === null ? "" : `→ ${conv}%`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Lists ────────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: "대기", color: "var(--text-secondary)" },
  building: { label: "빌드", color: "var(--blue)" },
  recording: { label: "촬영", color: "var(--blue)" },
  editing: { label: "편집", color: "var(--blue)" },
  done: { label: "완료", color: "var(--ops-ok)" },
  failed: { label: "실패", color: "var(--ops-bad)" },
  held: { label: "보류", color: "var(--ops-warn)" },
};

export function statusMeta(status: string) {
  return STATUS_META[status] ?? { label: status, color: "var(--text-secondary)" };
}

// Pipeline stage distribution as magnitude rows — replaces the chip cloud so
// counts are comparable. Bars stay ink-tint (magnitude only); the status word
// carries the status color, always as text.
export function StatusBars({ distribution }: { distribution: Record<string, number> }) {
  const known = Object.keys(STATUS_META).filter((s) => distribution[s]);
  if (known.length === 0) {
    return (
      <span className="text-sm" style={{ color: "var(--text-muted)" }}>
        시연이 아직 없어요.
      </span>
    );
  }
  const max = Math.max(1, ...known.map((s) => distribution[s]));
  return (
    <div className="flex flex-col gap-1.5">
      {known.map((status) => (
        <div
          key={status}
          className="flex items-center gap-3"
          title={`${STATUS_META[status].label} ${distribution[status]}`}
        >
          <span
            className="text-sm shrink-0"
            style={{ width: "2.8rem", fontWeight: 700, color: STATUS_META[status].color }}
          >
            {STATUS_META[status].label}
          </span>
          <div className="relative flex-1 rounded" style={{ height: "0.85rem", background: "var(--surface-sunken)" }}>
            <div
              className="absolute inset-y-0 left-0 rounded"
              style={{
                width: `${(distribution[status] / max) * 100}%`,
                background: "var(--blue-tint-strong)",
              }}
            />
          </div>
          <span
            className="vf-mono shrink-0 text-right"
            style={{ fontSize: "0.7rem", width: "2.2rem", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}
          >
            {distribution[status]}
          </span>
        </div>
      ))}
    </div>
  );
}

// Ranked breakdown (referrer hosts, share channels, signup sources…) — label +
// tint bar + tabular count. Single-hue magnitude, so no categorical palette.
export function RankList({
  rows,
  empty,
}: {
  rows: { label: string; count: number }[];
  empty: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        {empty}
      </p>
    );
  }
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3" title={`${r.label} ${r.count}`}>
          <span
            className="text-sm shrink-0 truncate"
            style={{ width: "9rem", color: "var(--text-secondary)" }}
          >
            {r.label}
          </span>
          <div className="relative flex-1 rounded" style={{ height: "0.85rem", background: "var(--surface-sunken)" }}>
            <div
              className="absolute inset-y-0 left-0 rounded"
              style={{ width: `${(r.count / max) * 100}%`, background: "var(--blue-tint-strong)" }}
            />
          </div>
          <span
            className="vf-mono shrink-0 text-right"
            style={{
              fontSize: "0.7rem",
              width: "2.6rem",
              color: "var(--text-secondary)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {r.count}
          </span>
        </div>
      ))}
    </div>
  );
}

export function EventBreakdown({ events }: { events: [string, number][] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        아직 이벤트가 없어요.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      {events.map(([event, n]) => (
        <div
          key={event}
          className="flex items-center justify-between py-0.5"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <span className="vf-mono" style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
            {event}
          </span>
          <span style={{ fontSize: "0.8rem", fontVariantNumeric: "tabular-nums" }}>{n}</span>
        </div>
      ))}
    </div>
  );
}
