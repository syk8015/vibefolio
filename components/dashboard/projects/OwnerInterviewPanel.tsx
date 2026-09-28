"use client";

import { useEffect, useRef, useState } from "react";
import {
  normalizeOwnerInterview, OWNER_ANSWER_MAX, OWNER_HIDE_ITEM_MAX, OWNER_INTERVIEW_KEYS,
  type OwnerInterview, type OwnerInterviewKey,
} from "@/lib/ownerInterview";
import { useT } from "@/lib/i18n/client";

// 초안 검토 창의 "주인 인터뷰" 칸(2026-09-29 사용자 확정: 필수) — docs/owner-interview-real-record.md §2.
//
// 올리는 AI가 먼저 묻고 받은 주인의 답을 보여 주고, 주인이 "내 말이 맞아요"에 체크해야 공개
// 버튼이 눌린다. AI가 꾸며 쓴 답을 사람이 걸러내는 마지막 자리다. 답은 눌러서 그 자리에서
// 고친다 — 저장은 서버(/api/ingest/drafts/[id] PATCH)가 생성 게이트와 같은 판정으로 한다.
// 답은 작품 페이지에 따로 나가지 않는다(09-29: 새 칸 없음) — 대본·말풍선·가리기에만 쓰인다.

type Field = OwnerInterviewKey | "hide";
const FIELDS: readonly Field[] = [...OWNER_INTERVIEW_KEYS, "hide"];

export function OwnerInterviewPanel({ interview, loading, confirmed, onConfirmChange, onSave, headId }: {
  interview: OwnerInterview | null;
  /** 비공개 칸을 아직 못 받았다 — "인터뷰 없음"이라고 거짓말하지 않게 자리표시만. */
  loading: boolean;
  confirmed: boolean;
  onConfirmChange: (next: boolean) => void;
  onSave: (next: OwnerInterview) => Promise<void>;
  headId: string;
}) {
  const { t } = useT();
  const [editing, setEditing] = useState<Field | null>(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const begin = (f: Field) => {
    if (!interview || saving) return;
    setError(null);
    setValue(f === "hide" ? interview.hide.join(", ") : interview[f]);
    setEditing(f);
  };
  const cancel = () => { setEditing(null); setError(null); };

  const save = async () => {
    if (!interview || !editing) return;
    const draft = { ...interview, [editing]: value };
    // 서버와 같은 판정 — 여기서 통과한 답은 저장에서도 통과한다.
    const checked = normalizeOwnerInterview(draft);
    if (checked.issue) {
      setError(
        checked.issue.kind === "too-long"
          ? t.projects.reviewInterviewTooLong(checked.issue.key === "hide" ? OWNER_HIDE_ITEM_MAX : OWNER_ANSWER_MAX)
          : t.projects.reviewInterviewEmpty,
      );
      return;
    }
    setSaving(true);
    try {
      await onSave(checked.value);
      setEditing(null);
      setError(null);
    } catch {
      setError(t.projects.reviewSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); cancel(); }
    if (e.key === "Enter" && (editing === "hide" || e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); }
  };

  const small: React.CSSProperties = {
    margin: 0, fontFamily: "var(--font-nunito)", fontSize: 13, lineHeight: 1.55, color: "var(--text-secondary)",
  };
  const answerStyle: React.CSSProperties = {
    margin: 0, fontFamily: "var(--font-nunito)", fontSize: 15, fontWeight: 600, lineHeight: 1.55,
    color: "var(--text-primary)", cursor: "text", borderRadius: 6, padding: "1px 4px", marginLeft: -4,
    overflowWrap: "anywhere",
  };
  const inputStyle: React.CSSProperties = {
    width: "100%", fontFamily: "var(--font-nunito)", fontSize: 15, lineHeight: 1.55,
    background: "var(--surface)", color: "var(--text-primary)", border: "none", outline: "none",
    borderRadius: 8, padding: "6px 8px", resize: "vertical",
  };

  return (
    <section aria-labelledby={headId}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1" style={{ marginBottom: 6 }}>
        <h3
          id={headId}
          style={{
            margin: 0, fontFamily: "var(--font-nunito)", fontSize: "1.15rem", fontWeight: 700,
            letterSpacing: "-0.015em", color: "var(--text-primary)",
          }}
        >
          {t.projects.reviewInterviewTitle}
        </h3>
      </div>

      {loading ? (
        <p style={small}>{t.projects.reviewInterviewLoading}</p>
      ) : !interview ? (
        <p className="rounded-2xl" style={{ ...small, color: "var(--text-primary)", background: "var(--surface-sunken)", padding: "14px 16px" }}>
          {t.projects.reviewInterviewMissing}
        </p>
      ) : (
        <>
          <p style={{ ...small, marginBottom: 10 }}>{t.projects.reviewInterviewLead}</p>
          <ul className="rounded-2xl" style={{ listStyle: "none", margin: 0, padding: 0, overflow: "hidden", background: "var(--surface-soft)" }}>
            {FIELDS.map((f, i) => {
              const shown = f === "hide"
                ? (interview.hide.length ? interview.hide.join(", ") : t.projects.reviewInterviewHideNone)
                : interview[f];
              return (
                <li
                  key={f}
                  style={{
                    padding: "13px 16px", display: "flex", flexDirection: "column", gap: 3,
                    borderTop: i === 0 ? undefined : "1px solid var(--surface)",
                  }}
                >
                  <span style={{ ...small, display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {f === "hide" && <LockGlyph />}
                    {t.projects.reviewInterviewQ[f]}
                  </span>
                  {editing === f ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {f === "hide" ? (
                        <input
                          ref={inputRef as React.RefObject<HTMLInputElement>}
                          value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={onKey}
                          disabled={saving} placeholder={t.projects.reviewInterviewHidePlaceholder} style={inputStyle}
                        />
                      ) : (
                        <textarea
                          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                          value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={onKey}
                          disabled={saving} rows={2} style={inputStyle}
                        />
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button" onClick={() => void save()} disabled={saving}
                          className="vf-button-primary" style={{ fontSize: "0.8rem", padding: "0.4rem 0.9rem", opacity: saving ? 0.5 : 1 }}
                        >
                          {t.projects.reviewEditSave}
                        </button>
                        <button
                          type="button" onClick={cancel} disabled={saving}
                          className="vf-button-ghost" style={{ fontSize: "0.8rem", padding: "0.4rem 0.9rem" }}
                        >
                          {t.projects.reviewEditCancel}
                        </button>
                        {error && <span style={{ ...small, color: "#b34747" }}>{error}</span>}
                      </div>
                    </div>
                  ) : (
                    <p
                      role="button" tabIndex={0}
                      onClick={() => begin(f)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); begin(f); } }}
                      title={t.projects.reviewEditHint}
                      style={{ ...answerStyle, color: f === "hide" && !interview.hide.length ? "var(--text-muted)" : answerStyle.color }}
                    >
                      {shown}
                    </p>
                  )}
                  <span style={small}>{t.projects.reviewInterviewUse[f]}</span>
                </li>
              );
            })}
          </ul>

          <label
            className="flex items-center gap-2.5 rounded-xl"
            style={{ marginTop: 12, padding: "12px 14px", background: "var(--surface-soft)", cursor: "pointer" }}
          >
            <input
              type="checkbox" checked={confirmed} onChange={(e) => onConfirmChange(e.target.checked)}
              disabled={!!editing}
              style={{ width: 18, height: 18, margin: 0, accentColor: "var(--text-primary)", flexShrink: 0 }}
            />
            <span style={{ fontFamily: "var(--font-nunito)", fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
              {t.projects.reviewInterviewConfirm}
            </span>
          </label>
        </>
      )}
    </section>
  );
}

function LockGlyph() {
  return (
    <svg width="12" height="13" viewBox="0 0 12 13" fill="none" aria-hidden>
      <rect x="1.5" y="5.5" width="9" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3.5 5.5V4a2.5 2.5 0 015 0v1.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
