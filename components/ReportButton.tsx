"use client";

import { useState } from "react";
import Modal from "@/components/Modal";

// 신고 (T6) — footer-link trigger + small soft-fill modal, POSTs /api/report.
// Lives in the public theater/watch footers (server components), so all the
// interactivity is isolated here, CopyLinkButton-style.

// The theater footer is Korean, the watch page is an English viral surface —
// same component, copy switched by locale.
const COPY = {
  ko: {
    trigger: "신고",
    title: "무엇이 문제인가요?",
    reasons: [
      { value: "spam", label: "스팸/광고" },
      { value: "adult", label: "성인물·유해 콘텐츠" },
      { value: "impersonation", label: "사칭" },
      { value: "copyright", label: "저작권 침해" },
      { value: "other", label: "기타" },
    ],
    detailPlaceholder: "자세한 내용이 있으면 적어주세요 (선택)",
    cancel: "취소",
    submit: "신고하기",
    sending: "접수 중…",
    doneTitle: "신고가 접수됐어요",
    doneBody: "확인 후 필요한 조치를 할게요. 알려주셔서 고마워요.",
    close: "닫기",
    genericError: "잠시 후 다시 시도해 주세요.",
    networkError: "네트워크 오류가 났어요. 잠시 후 다시 시도해 주세요.",
  },
  en: {
    trigger: "Report",
    title: "What's wrong with this content?",
    reasons: [
      { value: "spam", label: "Spam / ads" },
      { value: "adult", label: "Adult or harmful content" },
      { value: "impersonation", label: "Impersonation" },
      { value: "copyright", label: "Copyright infringement" },
      { value: "other", label: "Something else" },
    ],
    detailPlaceholder: "Add details if you'd like (optional)",
    cancel: "Cancel",
    submit: "Submit report",
    sending: "Sending…",
    doneTitle: "Report received",
    doneBody: "We'll take a look and act on it. Thanks for letting us know.",
    close: "Close",
    genericError: "Please try again in a moment.",
    networkError: "Network error — please try again in a moment.",
  },
} as const;

const DETAIL_MAX = 500;

export default function ReportButton({
  targetType,
  targetId,
  locale = "ko",
}: {
  targetType: "profile" | "project";
  targetId: string;
  locale?: "ko" | "en";
}) {
  const t = COPY[locale];
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [detail, setDetail] = useState("");
  const [phase, setPhase] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  function close() {
    setOpen(false);
    // Keep "done" so reopening shows the receipt instead of a fresh form.
    if (phase !== "done") {
      setPhase("idle");
      setErrorMsg("");
    }
  }

  async function submit() {
    if (!reason || phase === "sending") return;
    setPhase("sending");
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, reason, detail: detail.trim() || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        setPhase("done");
      } else {
        setErrorMsg(data?.error ?? t.genericError);
        setPhase("error");
      }
    } catch {
      setErrorMsg(t.networkError);
      setPhase("error");
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          color: "var(--text-muted)",
          fontFamily: "var(--font-nunito)",
          fontSize: "0.75rem",
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
        }}
      >
        {t.trigger}
      </button>

      {open && (
        <Modal onClose={close} ariaLabel="콘텐츠 신고" maxWidth="24rem">
            {phase === "done" ? (
              <>
                <p
                  style={{
                    color: "var(--text-primary)",
                    fontFamily: "var(--font-nunito)",
                    fontSize: "0.95rem",
                    fontWeight: 700,
                  }}
                >
                  {t.doneTitle}
                </p>
                <p
                  className="mt-2"
                  style={{
                    color: "var(--text-secondary)",
                    fontFamily: "var(--font-nunito)",
                    fontSize: "0.85rem",
                    lineHeight: 1.6,
                  }}
                >
                  {t.doneBody}
                </p>
                <div className="mt-5 flex justify-end">
                  <button className="vf-button-primary" onClick={close}>
                    {t.close}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p
                  style={{
                    color: "var(--text-primary)",
                    fontFamily: "var(--font-nunito)",
                    fontSize: "0.95rem",
                    fontWeight: 700,
                  }}
                >
                  {t.title}
                </p>

                <div className="mt-4 flex flex-col gap-1.5">
                  {t.reasons.map((r) => (
                    <button
                      key={r.value}
                      className="vf-selectable text-left"
                      data-active={reason === r.value}
                      onClick={() => setReason(r.value)}
                    >
                      {reason === r.value ? "✓ " : ""}
                      {r.label}
                    </button>
                  ))}
                </div>

                <textarea
                  className="vf-input mt-3 w-full"
                  rows={3}
                  maxLength={DETAIL_MAX}
                  placeholder={t.detailPlaceholder}
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  style={{ resize: "none" }}
                />

                {phase === "error" && (
                  <p
                    className="mt-2"
                    style={{
                      color: "#b34747",
                      fontFamily: "var(--font-nunito)",
                      fontSize: "0.8rem",
                    }}
                  >
                    {errorMsg}
                  </p>
                )}

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button className="vf-button-ghost" onClick={close}>
                    {t.cancel}
                  </button>
                  <button
                    className="vf-button-primary"
                    onClick={submit}
                    disabled={!reason || phase === "sending"}
                  >
                    {phase === "sending" ? t.sending : t.submit}
                  </button>
                </div>
              </>
            )}
        </Modal>
      )}
    </>
  );
}
