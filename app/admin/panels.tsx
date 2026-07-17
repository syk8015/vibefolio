// Presentational pieces for the unified /admin control tower. All server
// components — interactivity lives in AdminRequestList / ReportInbox.
//
// Status colors are page-scoped tokens (--ops-ok/--ops-warn/--ops-bad) defined
// in page.tsx, validated against both paper surfaces (dataviz six-checks:
// lightness band, chroma floor, CVD separation, contrast — light #2e7d4a/
// #a5741f/#b53f3f on #fdfaf3, dark #3f9e60/#bd831f/#cd5f4a on #1a1612).
// A colored dot never stands alone — every state ships with its text label.

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

// ── Annunciator ledger ────────────────────────────────────────────────────────
// The page's signature: one full-width strip between hairlines — a cockpit
// annunciator panel set in paper. Each system gets a dot+label, a serif value,
// and a mono sub-line; entries divide with vertical hairlines, not cards.

export type LedgerEntry = {
  label: string;
  value: string | number;
  sub: string;
  state: LedgerState;
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
          className="flex-1 min-w-[9rem] px-4 py-4"
          style={i > 0 ? { borderLeft: "1px solid var(--border)" } : undefined}
        >
          <div className="flex items-center gap-1.5">
            {e.state !== "plain" && (
              <span
                aria-hidden
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: STATE_COLOR[e.state] }}
              />
            )}
            <span className="vf-label" style={{ color: "var(--text-muted)" }}>
              {e.label}
            </span>
          </div>
          <div
            className="vf-serif-display"
            style={{
              fontSize: "1.55rem",
              lineHeight: 1.15,
              marginTop: "0.3rem",
              fontVariantNumeric: "tabular-nums",
              color: e.state === "bad" ? "var(--ops-bad)" : "var(--text-primary)",
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

// ── Column & panel scaffolding ───────────────────────────────────────────────

export function ColumnTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="vf-label"
      style={{ color: "var(--text-muted)", marginBottom: "0.75rem", display: "block" }}
    >
      {children}
    </h2>
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
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

// ── Charts (ink-only: succeeded = solid ink, requested = ink tint — a subset
// pair on one hue, so no categorical palette is needed; 2 series → legend) ────

export function DailyChart({
  days,
  daily,
  maxDaily,
}: {
  days: string[];
  daily: Map<string, { requested: number; succeeded: number; failed: number }>;
  maxDaily: number;
}) {
  return (
    <>
      <div className="flex items-center gap-4 mb-3">
        <LegendChip swatch="var(--blue-tint-strong)" label="요청" />
        <LegendChip swatch="var(--blue)" label="성공" />
      </div>
      <div className="flex flex-col gap-1.5">
        {days.map((d) => {
          const b = daily.get(d)!;
          return (
            <div
              key={d}
              className="flex items-center gap-3"
              title={`${d} · 요청 ${b.requested} · 성공 ${b.succeeded} · 실패 ${b.failed}`}
            >
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
                  style={{ width: `${(b.succeeded / maxDaily) * 100}%`, background: "var(--blue)" }}
                />
              </div>
              <span
                className="vf-mono shrink-0 text-right"
                style={{
                  fontSize: "0.68rem",
                  width: "3rem",
                  color: "var(--text-secondary)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {b.succeeded}/{b.requested}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function LegendChip({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden
        className="inline-block w-3 h-3 rounded"
        style={{ background: swatch }}
      />
      <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>{label}</span>
    </span>
  );
}

export function Funnel({
  steps,
  max,
}: {
  steps: { label: string; value: number }[];
  max: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      {steps.map((f) => (
        <div key={f.label} className="flex items-center gap-3" title={`${f.label} ${f.value}`}>
          <span
            className="text-sm shrink-0"
            style={{ width: "6rem", color: "var(--text-secondary)" }}
          >
            {f.label}
          </span>
          <div
            className="relative flex-1 rounded"
            style={{ height: "1.4rem", background: "var(--surface-sunken)" }}
          >
            <div
              className="absolute inset-y-0 left-0 rounded flex items-center px-2"
              style={{ width: `${(f.value / max) * 100}%`, background: "var(--blue-tint)" }}
            >
              <span
                className="vf-mono"
                style={{
                  fontSize: "0.7rem",
                  color: "var(--text-primary)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {f.value}
              </span>
            </div>
          </div>
        </div>
      ))}
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

export function DistributionChips({ distribution }: { distribution: Record<string, number> }) {
  const known = Object.keys(STATUS_META).filter((s) => distribution[s]);
  if (known.length === 0) {
    return (
      <span className="text-sm" style={{ color: "var(--text-muted)" }}>
        시연이 아직 없어요.
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {known.map((status) => (
        <span
          key={status}
          className="px-2.5 py-1 rounded-full text-xs"
          style={{
            background: "var(--surface-soft)",
            color: STATUS_META[status].color,
            fontWeight: 700,
          }}
        >
          {STATUS_META[status].label} {distribution[status]}
        </span>
      ))}
    </div>
  );
}

export function AlertList({
  entries,
  now,
}: {
  entries: [string, string][];
  now: number;
}) {
  const ALERT_LABEL: Record<string, string> = {
    "worker-stale": "워커 하트비트 끊김",
    reaped: "스턱 잡 정리",
    "pending-no-worker": "대기열 있음 · 워커 무응답",
    "pending-not-draining": "대기열이 빠지지 않음",
    "stuck-query-failed": "워치독 DB 조회 실패",
    "reap-update-failed": "워치독 정리 실패",
  };
  if (entries.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        기록된 경보가 없어요.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      {entries.map(([key, sentAt]) => (
        <div
          key={key}
          className="flex items-center justify-between text-sm py-1 gap-3"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <span style={{ color: "var(--text-primary)" }}>{ALERT_LABEL[key] ?? key}</span>
          <span
            className="vf-mono shrink-0"
            style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}
          >
            {ago(sentAt, now)}
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
          <div
            className="relative flex-1 rounded"
            style={{ height: "0.85rem", background: "var(--surface-sunken)" }}
          >
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
