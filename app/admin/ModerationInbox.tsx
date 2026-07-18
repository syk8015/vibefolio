"use client";

import { useState } from "react";

// Moderation-held takes awaiting a publish/reject decision — mirrors the
// ReportInbox optimistic row-removal pattern. The video link opens the
// quarantined mp4 directly (unlinked object; only this console knows the URL).

export type ModerationItem = {
  id: string;
  projectTitle: string;
  username: string | null;
  videoUrl: string;
  posterUrl: string | null;
  categories: string[];
  reason: string | null;
  model: string | null;
  createdAt: string;
};

const CATEGORY_LABEL: Record<string, string> = {
  adult: "성인물",
  violence: "폭력·고어",
  hate: "혐오",
  illegal: "불법",
  scam: "피싱·사기",
  malware: "멀웨어",
  csam: "아동 성착취",
  other: "기타",
};

export function ModerationInbox({ items }: { items: ModerationItem[] }) {
  const [rows, setRows] = useState(items);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, action: "approve" | "reject") {
    if (action === "reject" && !window.confirm("격리된 영상 파일을 삭제하고 실패(정책)로 처리해요. 계속할까요?")) {
      return;
    }
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/moderation/${id}`, {
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
        검토 대기 중인 시연이 없어요. 🕊
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
            {r.categories.map((c) => (
              <span
                key={c}
                className="px-2 py-0.5 rounded-full shrink-0"
                style={{
                  background: "var(--surface-soft)",
                  color: "#b34747",
                  fontSize: "0.58rem",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                }}
              >
                {CATEGORY_LABEL[c] ?? c}
              </span>
            ))}
            <span className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
              {r.projectTitle}
              {r.username && (
                <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> · @{r.username}</span>
              )}
            </span>
          </div>

          <a href={r.videoUrl} target="_blank" rel="noopener noreferrer" className="block">
            {r.posterUrl ? (
              // Quarantine poster is a plain unlinked storage object — next/image
              // 최적화 프록시를 태울 이유가 없다(유저 이미지 unoptimized 규칙과 동류).
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={r.posterUrl}
                alt={`${r.projectTitle} 격리 프레임`}
                className="rounded-xl"
                style={{ width: "100%", maxWidth: 360, display: "block" }}
              />
            ) : (
              <span className="text-sm underline" style={{ color: "var(--text-secondary)" }}>
                격리 영상 열기 ↗
              </span>
            )}
          </a>

          {r.reason && (
            <p
              className="text-sm px-3 py-2 rounded-lg whitespace-pre-wrap"
              style={{ background: "var(--surface-soft)", color: "var(--text-primary)" }}
            >
              {r.reason}
            </p>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="vf-mono" style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
              {r.model ?? "?"} · {new Date(r.createdAt).toLocaleString("ko-KR")}
              {" · "}
              <a href={r.videoUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
                영상 ↗
              </a>
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => decide(r.id, "reject")}
                disabled={busy === r.id}
                className="px-4 py-1.5 rounded-full text-sm transition-colors disabled:opacity-50"
                style={{ background: "rgba(179,71,71,0.12)", color: "#8e3535", cursor: "pointer" }}
              >
                {busy === r.id ? "처리 중…" : "거절 · 삭제"}
              </button>
              <button
                onClick={() => decide(r.id, "approve")}
                disabled={busy === r.id}
                className="px-4 py-1.5 rounded-full text-sm transition-colors disabled:opacity-50"
                style={{ background: "var(--surface-soft)", color: "var(--text-secondary)", cursor: "pointer" }}
              >
                {busy === r.id ? "처리 중…" : "승인 · 게시"}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
