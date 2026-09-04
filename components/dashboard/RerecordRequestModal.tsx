"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { copyText } from "@/lib/clipboard";
import { DemoScriptPanel } from "@/components/dashboard/projects/DemoScriptPanel";
import type { DBProject } from "@/components/dashboard/projects/types";
import { useT } from "@/lib/i18n/client";

// 재촬영 모달 — 사람은 말로, 대본은 AI가 (2026-08-25 사용자 확정 설계).
//
// 옛 모달은 "바꾸고 싶은 점을 적으면 관리자가 다시 찍어준다"는 요청 접수함이었다.
// 이제는 루프의 앞뒤 두 칸을 여기서 다 돈다:
//   ① 영상을 보고 불만을 적는다 → 사이트가 원본 대본·작품 정보·토큰까지 담은
//      재촬영 프롬프트를 만들어 클립보드에 넣는다(새 세션 AI도 이것만 있으면 된다).
//   ② AI가 새 대본을 제출하면(pending_demo_script) 여기서 그 대본을 눈으로 확인하고
//      [이 대본으로 재촬영]을 누른다 — 촬영은 편당 비용이 드니 사람이 마지막 게이트다.
// 작품당 1회는 바로 촬영되고, 그 다음부터는 관리자 승인으로 넘어간다.
export function RerecordRequestModal({
  project,
  onClose,
  onDone,
}: {
  project: DBProject;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { t } = useT();
  const pending = project.pending_demo_script ?? null;
  // 대기 중인 대본이 있으면 ②부터 — 단 [수정사항 다시 적기]로 ①로 되돌아갈 수 있다.
  const [mode, setMode] = useState<"ask" | "review">(pending ? "review" : "ask");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copyPrompt() {
    const trimmed = note.trim();
    if (!trimmed) {
      setError(t.rerecord.emptyReason);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/rerecord-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: trimmed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      await copyText(body.prompt);
      setCopied(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.rerecord.requestFailed);
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/apply-rerecord`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      onDone(body.status === "queued" ? t.rerecord.queued : t.rerecord.awaitingApproval);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.rerecord.requestFailed);
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} ariaLabel={t.rerecord.title}>
      <div className="flex flex-col gap-4" style={{ maxHeight: "72vh", overflowY: "auto" }}>
        <div>
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            {mode === "review" ? t.rerecord.pendingTitle : t.rerecord.title}
          </h2>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            {mode === "review" ? t.rerecord.pendingBody : t.rerecord.bodyV2}
          </p>
        </div>
        <div className="text-xs vf-mono truncate" style={{ color: "var(--text-secondary)" }}>
          {project.title}
        </div>

        {mode === "review" && pending ? (
          <>
            {project.pending_script_note && (
              <div>
                <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", margin: 0 }}>
                  {t.rerecord.aiNote}
                </p>
                <p className="text-sm" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", margin: "2px 0 0" }}>
                  {project.pending_script_note}
                </p>
              </div>
            )}
            <DemoScriptPanel script={pending} />
            <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", margin: 0 }}>
              {project.rerecord_self_used ? t.rerecord.approvalHint : t.rerecord.selfFreeHint}
            </p>
          </>
        ) : (
          <>
            <textarea
              value={note}
              onChange={(e) => { setNote(e.target.value); setCopied(false); }}
              rows={5}
              maxLength={1000}
              autoFocus
              placeholder={t.rerecord.placeholderV2}
              className="vf-input w-full resize-none"
              style={{ fontFamily: "var(--font-nunito)" }}
            />
            {copied && (
              <p className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", margin: 0 }}>
                {t.rerecord.afterCopy}
              </p>
            )}
            {/* 지금 걸려 있는 대본 — 읽기 전용(onChange 없음). 불만을 적는 칸보다
                아래에 둬서 "무엇을 적을지"가 먼저 보이게 한다(2026-09-05 요청 7).
                어느 스텝이 문제였는지 짚어야 AI가 정확히 고친다. */}
            {project.demo_script && (
              <div>
                <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", lineHeight: 1.6, margin: "0 0 8px" }}>
                  {t.rerecord.currentScriptHint}
                </p>
                <DemoScriptPanel script={project.demo_script} />
              </div>
            )}
          </>
        )}

        {error && <p className="text-sm" style={{ color: "#8e3535" }}>{error}</p>}

        <div className="flex justify-end gap-2 flex-wrap">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-1.5 rounded-full text-sm disabled:opacity-50"
            style={{ background: "var(--surface-soft)", color: "var(--text-secondary)", cursor: "pointer" }}
          >
            {t.rerecord.cancel}
          </button>
          {mode === "review" ? (
            <>
              <button
                onClick={() => { setMode("ask"); setCopied(false); }}
                disabled={busy}
                className="px-4 py-1.5 rounded-full text-sm disabled:opacity-50"
                style={{ background: "var(--surface-soft)", color: "var(--text-secondary)", cursor: "pointer" }}
              >
                {t.rerecord.askAgain}
              </button>
              <button
                onClick={apply}
                disabled={busy}
                className="vf-button-primary px-4 py-1.5 text-sm disabled:opacity-50"
                style={{ cursor: "pointer" }}
              >
                {busy ? t.rerecord.applying : t.rerecord.apply}
              </button>
            </>
          ) : (
            <button
              onClick={copyPrompt}
              disabled={busy}
              className="vf-button-primary px-4 py-1.5 text-sm disabled:opacity-50"
              style={{ cursor: "pointer" }}
            >
              {busy ? t.rerecord.copying : copied ? t.rerecord.copied : t.rerecord.copyPrompt}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
