"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { useT } from "@/lib/i18n/client";

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
  const { t } = useT();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError(t.rerecord.emptyReason);
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
      setError(err instanceof Error ? err.message : t.rerecord.requestFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} ariaLabel={t.rerecord.title}>
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            {t.rerecord.title}
          </h2>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            {t.rerecord.body}
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
          placeholder={t.rerecord.placeholder}
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
            {t.rerecord.cancel}
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="vf-button-primary px-4 py-1.5 text-sm disabled:opacity-50"
            style={{ cursor: "pointer" }}
          >
            {busy ? t.rerecord.sending : t.rerecord.send}
          </button>
        </div>
      </div>
    </Modal>
  );
}
