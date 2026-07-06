"use client";

import { useState } from "react";

// A project gets one auto demo. Re-recording a landed video isn't self-serve —
// the owner describes what to change and an admin approves it. This modal just
// files that request; nothing is spent here.
export function RerecordRequestModal({
  projectId,
  projectTitle,
  onClose,
  onSubmitted,
}: {
  projectId: string;
  projectTitle: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("바꾸고 싶은 점을 적어주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/request-rerecord`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: trimmed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "요청에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={onClose}
    >
      <div
        className="vf-card w-full max-w-md flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
        style={{ fontFamily: "var(--font-nunito)" }}
      >
        <div>
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            재촬영 요청
          </h2>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            시연 영상은 프로젝트당 한 편이에요. 무엇을 어떻게 바꾸고 싶은지 적어주시면
            관리자가 확인한 뒤 다시 촬영해 드려요.
          </p>
        </div>
        <div className="text-xs vf-mono truncate" style={{ color: "var(--text-secondary)" }}>
          {projectTitle}
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          maxLength={1000}
          autoFocus
          placeholder="예: 첫 화면 로딩이 길게 잡혔어요. 로그인 후 대시보드 화면 위주로 보여주세요."
          className="vf-input w-full resize-none"
          style={{ fontFamily: "var(--font-nunito)" }}
        />
        {error && (
          <p className="text-sm" style={{ color: "#8e3535" }}>
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-1.5 rounded-full text-sm disabled:opacity-50"
            style={{ background: "var(--surface-soft)", color: "var(--text-secondary)", cursor: "pointer" }}
          >
            취소
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="vf-button-primary px-4 py-1.5 text-sm disabled:opacity-50"
            style={{ cursor: "pointer" }}
          >
            {busy ? "보내는 중…" : "요청 보내기"}
          </button>
        </div>
      </div>
    </div>
  );
}
