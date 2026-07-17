// Shared stat tile for the admin pages (/admin/metrics, /admin/ops).
// Server-component friendly — no client hooks.
export function StatCard({
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
