"use client";

import { useState } from "react";

// Open content reports with a resolve action — mirrors AdminRequestList's
// optimistic row-removal pattern.

export type ReportItem = {
  id: string;
  targetType: "profile" | "project";
  targetLabel: string;
  targetUrl: string;
  reason: string;
  detail: string | null;
  reporter: string; // "로그인 uid 앞8" 또는 "비로그인 (iphash 앞8)"
  createdAt: string;
};

const REASON_LABEL: Record<string, string> = {
  spam: "스팸/광고",
  adult: "성인물·유해",
  impersonation: "사칭",
  copyright: "저작권",
  other: "기타",
};

export function ReportInbox({ items }: { items: ReportItem[] }) {
  const [rows, setRows] = useState(items);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reports/${id}`, { method: "POST" });
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
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        열린 신고가 없어요. 🕊
      </p>
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
        <div
          key={r.id}
          className="flex flex-col gap-2 pb-3"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="px-2 py-0.5 rounded-full shrink-0"
              style={{
                background: "var(--surface-soft)",
                color: "#b34747",
                fontSize: "0.58rem",
                fontWeight: 700,
                letterSpacing: "0.04em",
              }}
            >
              {REASON_LABEL[r.reason] ?? r.reason}
            </span>
            <a
              href={r.targetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold truncate"
              style={{ color: "var(--text-primary)" }}
            >
              {r.targetLabel}
            </a>
          </div>
          {r.detail && (
            <p
              className="text-sm px-3 py-2 rounded-lg whitespace-pre-wrap"
              style={{ background: "var(--surface-soft)", color: "var(--text-primary)" }}
            >
              {r.detail}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="vf-mono" style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
              {r.reporter} · {new Date(r.createdAt).toLocaleString("ko-KR")}
            </span>
            <button
              onClick={() => resolve(r.id)}
              disabled={busy === r.id}
              className="px-4 py-1.5 rounded-full text-sm transition-colors disabled:opacity-50"
              style={{ background: "var(--surface-soft)", color: "var(--text-secondary)", cursor: "pointer" }}
            >
              {busy === r.id ? "처리 중…" : "해결됨으로 표시"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
