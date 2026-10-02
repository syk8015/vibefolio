"use client";

import { useState } from "react";
import type { DemoScript } from "@/lib/demoScript";
import { DemoScriptPanel } from "@/components/dashboard/projects/DemoScriptPanel";

export type AdminRequestItem = {
  id: string;
  kind: "over_cap" | "rerecord";
  reason: string | null;
  createdAt: string;
  projectTitle: string;
  demoUrl: string | null;
  hasVideo: boolean;
  username: string | null;
  // 재촬영: AI가 새로 낸 대본(승인하면 이걸로 찍는다) · 지금 대본 · AI 메모. 승인 전에 눈으로 본다.
  pendingScript: DemoScript | null;
  currentScript: DemoScript | null;
  aiNote: string | null;
};

const KIND_LABEL: Record<AdminRequestItem["kind"], string> = {
  rerecord: "재촬영 요청",
  over_cap: "하루 한도 초과",
};

export function AdminRequestList({ items }: { items: AdminRequestItem[] }) {
  const [rows, setRows] = useState(items);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 펼친 대본 — 요청 id별로 "new"(새 대본) | "current"(지금 대본).
  const [open, setOpen] = useState<Record<string, "new" | "current" | undefined>>({});
  const toggle = (id: string, which: "new" | "current") =>
    setOpen((prev) => ({ ...prev, [id]: prev[id] === which ? undefined : which }));

  async function decide(id: string, action: "approve" | "reject") {
    // 거절 이유는 사용자에게 메일로 간다(비워도 됨). 취소하면 거절하지 않는다.
    let note: string | null = null;
    if (action === "reject") {
      note = window.prompt("거절할게요. 사용자 메일에 실을 이유를 적어 주세요(비워도 돼요).", "");
      if (note === null) return;
    }
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/demo-requests/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(note ? { note } : {}) }),
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

          {r.kind === "rerecord" && (r.pendingScript || r.currentScript) && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {r.pendingScript && (
                  <button
                    type="button" onClick={() => toggle(r.id, "new")} aria-expanded={open[r.id] === "new"}
                    data-active={open[r.id] === "new"} className="vf-selectable px-3 py-1 rounded-full text-xs"
                  >
                    새 대본 {r.pendingScript.steps.length}장면
                  </button>
                )}
                {r.currentScript && (
                  <button
                    type="button" onClick={() => toggle(r.id, "current")} aria-expanded={open[r.id] === "current"}
                    data-active={open[r.id] === "current"} className="vf-selectable px-3 py-1 rounded-full text-xs"
                  >
                    지금 대본 {r.currentScript.steps.length}장면
                  </button>
                )}
                {!r.pendingScript && (
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>새 대본 없음 — 승인하면 지금 대본으로 다시 찍어요</span>
                )}
              </div>
              {open[r.id] === "new" && r.pendingScript && (
                <>
                  {r.aiNote && (
                    <p className="text-xs" style={{ color: "var(--text-secondary)", margin: 0 }}>AI 메모 · {r.aiNote}</p>
                  )}
                  <DemoScriptPanel script={r.pendingScript} />
                </>
              )}
              {open[r.id] === "current" && r.currentScript && <DemoScriptPanel script={r.currentScript} />}
            </div>
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
