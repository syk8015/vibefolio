// 홍보 성과 막대 목록 — /admin/panels.tsx의 RankList를 안 쓰는 이유: 그쪽은
// 라벨 폭이 9rem 고정이라 태그라인처럼 긴 문장이 잘려서 뭐가 뭔지 못 읽고,
// 지표도 하나(count)뿐이다. 여기선 유입/가입 두 개를 같이 봐야 한다.
// 서버 컴포넌트(상호작용 없음).
export type PerfRow = { label: string; sub?: string | null; visits: number; signups: number };

export default function PerfRank({
  rows,
  empty,
  limit = 12,
}: {
  rows: PerfRow[];
  empty: string;
  limit?: number;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        {empty}
      </p>
    );
  }
  const shown = rows.slice(0, limit);
  const max = Math.max(1, ...rows.map((r) => r.visits));
  return (
    <div className="flex flex-col gap-2">
      {shown.map((r) => {
        const conv = r.visits > 0 ? Math.round((r.signups / r.visits) * 100) : null;
        return (
          <div key={r.label} className="flex flex-col gap-1">
            <div className="flex items-baseline gap-2">
              <span className="text-sm truncate flex-1" style={{ color: "var(--text-secondary)" }}>
                {r.label}
              </span>
              <span
                className="vf-mono shrink-0"
                style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}
              >
                유입 {r.visits} · 가입 {r.signups}
                {conv !== null && r.signups > 0 ? ` · ${conv}%` : ""}
              </span>
            </div>
            <div className="relative rounded" style={{ height: "0.5rem", background: "var(--surface-sunken)" }}>
              <div
                className="absolute inset-y-0 left-0 rounded"
                style={{ width: `${(r.visits / max) * 100}%`, background: "var(--blue-tint-strong)" }}
              />
              {r.signups > 0 && (
                <div
                  className="absolute inset-y-0 left-0 rounded"
                  style={{ width: `${(r.signups / max) * 100}%`, background: "var(--blue)", opacity: 0.55 }}
                />
              )}
            </div>
          </div>
        );
      })}
      {rows.length > shown.length && (
        <p style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
          … 그 외 {rows.length - shown.length}개는 아직 유입이 없어요.
        </p>
      )}
    </div>
  );
}
