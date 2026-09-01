"use client";

import { useState } from "react";

// Open content reports with two actions — mirrors AdminRequestList's optimistic
// row-removal pattern.
//   "문제 없음"  → 종결만.
//   "내리기"     → 작품을 비공개(초안)로 되돌리고 종결 + 소유자에게 메일.
// 내리기는 **작품 신고에만** 뜬다 — 프로필을 숨기는 컬럼이 없어서, 못 하는 일에
// 버튼을 두는 대신 안내를 띄운다(서버도 같은 이유로 400을 낸다).

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

  async function act(id: string, action: "resolve" | "takedown") {
    // 되돌릴 수 있는 조치지만(초안 전환), 소유자에게 메일이 나가므로 한 번 묻는다.
    if (action === "takedown" && !confirm("이 작품을 비공개로 내릴까요? 소유자에게 사유가 담긴 메일이 갑니다.")) {
      return;
    }
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reports/${id}`, {
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
            <div className="flex items-center gap-2 shrink-0">
              {r.targetType === "project" ? (
                <button
                  onClick={() => act(r.id, "takedown")}
                  disabled={busy === r.id}
                  className="px-4 py-1.5 rounded-full text-sm transition-colors disabled:opacity-50"
                  style={{ background: "rgba(179,71,71,0.14)", color: "#8e3535", cursor: "pointer" }}
                >
                  비공개로 내리기
                </button>
              ) : (
                <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                  프로필은 개별 판단
                </span>
              )}
              <button
                onClick={() => act(r.id, "resolve")}
                disabled={busy === r.id}
                className="px-4 py-1.5 rounded-full text-sm transition-colors disabled:opacity-50"
                style={{ background: "var(--surface-soft)", color: "var(--text-secondary)", cursor: "pointer" }}
              >
                {busy === r.id ? "처리 중…" : "문제 없음"}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
