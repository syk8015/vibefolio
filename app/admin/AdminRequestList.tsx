"use client";

import { useState } from "react";

export type AdminRequestItem = {
  id: string;
  kind: "over_cap" | "rerecord";
  reason: string | null;
  createdAt: string;
  projectTitle: string;
  demoUrl: string | null;
  hasVideo: boolean;
  username: string | null;
};

const KIND_LABEL: Record<AdminRequestItem["kind"], string> = {
  rerecord: "재촬영 요청",
  over_cap: "하루 한도 초과",
};

export function AdminRequestList({ items }: { items: AdminRequestItem[] }) {
  const [rows, setRows] = useState(items);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, action: "approve" | "reject") {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/demo-requests/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "처리에 실패했어요.");
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div
        className="vf-card text-center py-12 text-sm"
        style={{ color: "var(--text-secondary)" }}
      >
        대기 중인 요청이 없어요. 🎬
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div
          className="px-3 py-2 rounded-lg text-sm"
          style={{ background: "rgba(179,71,71,0.12)", color: "#8e3535" }}
        >
          {error}
        </div>
      )}
      {rows.map((r) => (
        <div key={r.id} className="vf-card flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="px-2 py-0.5 rounded-full shrink-0"
                  style={{
                    background: r.kind === "rerecord" ? "var(--text-primary)" : "var(--surface-soft)",
                    color: r.kind === "rerecord" ? "var(--bg)" : "var(--text-secondary)",
                    fontSize: "0.58rem",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                  }}
                >
                  {KIND_LABEL[r.kind]}
                </span>
                <span className="font-semibold truncate">{r.projectTitle}</span>
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                @{r.username ?? "?"} · {new Date(r.createdAt).toLocaleString("ko-KR")}
                {r.hasVideo && " · 기존 영상 있음"}
              </div>
            </div>
          </div>

          {r.reason && (
            <p
              className="text-sm px-3 py-2 rounded-lg whitespace-pre-wrap"
              style={{ background: "var(--surface-soft)", color: "var(--text-primary)" }}
            >
              {r.reason}
            </p>
          )}

          {r.demoUrl && (
            <a
              href={r.demoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs vf-mono truncate"
              style={{ color: "var(--blue)" }}
            >
              {r.demoUrl}
            </a>
          )}

          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => decide(r.id, "reject")}
              disabled={busy === r.id}
              className="px-4 py-1.5 rounded-full text-sm transition-colors disabled:opacity-50"
              style={{ background: "var(--surface-soft)", color: "var(--text-secondary)", cursor: "pointer" }}
            >
              거절
            </button>
            <button
              onClick={() => decide(r.id, "approve")}
              disabled={busy === r.id}
              className="vf-button-primary px-4 py-1.5 text-sm disabled:opacity-50"
              style={{ cursor: "pointer" }}
            >
              {busy === r.id ? "처리 중…" : "승인 · 촬영"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
