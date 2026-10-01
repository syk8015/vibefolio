"use client";

import { useEffect, useRef, useState } from "react";
import {
  normalizeOwnerInterview, OWNER_ANSWER_MAX, OWNER_HIDE_ITEM_MAX, OWNER_INTERVIEW_KEYS,
  type OwnerInterview, type OwnerInterviewKey,
} from "@/lib/ownerInterview";
import { useT } from "@/lib/i18n/client";

// 초안 검토 창의 주인 인터뷰 확인(2026-09-29 사용자 확정: 필수) — docs/owner-interview-real-record.md §2.
//
// 2026-10-01 덜어내기 "라": 체크 한 줄 "인터뷰 답이 내 말과 같아요" + [답 보기]. 답은 [답 보기]를
// 누르거나 체크하면 펼쳐진다(확인한 답을 바로 눈앞에 둔다). 체크해야 공개 버튼이 눌린다 —
// AI가 꾸며 쓴 답을 사람이 걸러내는 마지막 자리다. 답은 눌러서 그 자리에서 고친다 — 저장은
// 서버(/api/ingest/drafts/[id] PATCH)가 생성 게이트와 같은 판정으로 한다.
// 답은 작품 페이지에 따로 나가지 않는다(09-29: 새 칸 없음) — 대본·말풍선·가리기에만 쓰인다.

type Field = OwnerInterviewKey | "hide";

export function OwnerInterviewPanel({ interview, loading, confirmed, onConfirmChange, open, onOpenChange, onSave, listId }: {
  interview: OwnerInterview | null;
  /** 비공개 칸을 아직 못 받았다 — "인터뷰 없음"이라고 거짓말하지 않게 자리표시만. */
  loading: boolean;
  confirmed: boolean;
  onConfirmChange: (next: boolean) => void;
  /** 답 목록이 펼쳐져 있나 — 검토 창이 쥔다(펼치면 명함이 작아진다). */
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onSave: (next: OwnerInterview) => Promise<void>;
  listId: string;
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

  // 인터뷰 없이 올라온 옛 초안 — 확인할 답이 없으니 체크 대신 길을 말한다(공개는 막힌 채).
  if (!loading && !interview) {
    return (
      <p
        className="rounded-2xl"
        style={{ ...small, color: "var(--text-primary)", background: "var(--surface-soft)", padding: "14px 16px" }}
      >
        {t.projects.reviewInterviewMissing}
      </p>
    );
  }

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

  // 가릴 것은 비었으면 줄을 두지 않는다 — 대신 목록 끝의 작은 [가릴 것 추가]로 적는다.
  const fields: Field[] = interview && (interview.hide.length || editing === "hide")
    ? [...OWNER_INTERVIEW_KEYS, "hide"]
    : [...OWNER_INTERVIEW_KEYS];

  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      <div
        className="flex items-center rounded-2xl"
        style={{ gap: 12, padding: "14px 16px", background: "var(--surface-soft)" }}
      >
        <label className="flex items-center" style={{ gap: 12, flex: 1, minWidth: 0, cursor: loading || editing ? "default" : "pointer" }}>
          <input
            type="checkbox" checked={confirmed}
            onChange={(e) => {
              onConfirmChange(e.target.checked);
              // 체크하면 답을 펼친다 — 무엇에 "맞아요"라고 했는지 바로 보이게.
              if (e.target.checked) onOpenChange(true);
            }}
            disabled={loading || !!editing}
            style={{ width: 20, height: 20, margin: 0, accentColor: "var(--text-primary)", flexShrink: 0 }}
          />
          <span style={{ fontFamily: "var(--font-nunito)", fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
            {t.projects.reviewInterviewConfirm}
          </span>
        </label>
        <button
          type="button"
          // 고치던 답이 있으면 접을 때 버린다 — 안 그러면 보이지 않는 편집 때문에 체크 칸이 잠긴 채 남는다.
          onClick={() => { if (open) cancel(); onOpenChange(!open); }}
          aria-expanded={open} aria-controls={listId}
          className="vf-button-text"
          style={{ flexShrink: 0, textDecoration: "underline", textUnderlineOffset: 3 }}
        >
          {open ? t.projects.reviewFold : t.projects.reviewSeeAnswers}
        </button>
      </div>

      {open && (
        !interview ? (
          <p id={listId} style={{ ...small, padding: "0 4px" }}>{t.projects.reviewInterviewLoading}</p>
        ) : (
          <ul
            id={listId} aria-label={t.projects.reviewInterviewTitle} className="rounded-2xl"
            style={{ listStyle: "none", margin: 0, padding: 0, overflow: "hidden", background: "var(--surface-soft)" }}
          >
            {fields.map((f, i) => (
              <li
                key={f}
                style={{
                  // 업그레이드(10-01): 명함 틀·세 단계가 들어온 만큼 한 줄씩 촘촘하게(10→8)
                  padding: "8px 16px", display: "flex", flexDirection: "column", gap: 2,
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
                      {error && <span style={{ ...small, color: "var(--danger)" }}>{error}</span>}
                    </div>
                  </div>
                ) : (
                  <p
                    role="button" tabIndex={0}
                    onClick={() => begin(f)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); begin(f); } }}
                    title={t.projects.reviewEditHint}
                    style={answerStyle}
                  >
                    {f === "hide" ? interview.hide.join(", ") : interview[f]}
                  </p>
                )}
              </li>
            ))}
            {!fields.includes("hide") && (
              <li style={{ padding: "6px 16px 8px", borderTop: "1px solid var(--surface)" }}>
                <button
                  type="button" onClick={() => begin("hide")}
                  className="vf-button-text" style={{ fontSize: 13, gap: 6 }}
                >
                  <LockGlyph />
                  {t.projects.reviewInterviewHideAdd}
                </button>
              </li>
            )}
          </ul>
        )
      )}
    </div>
  );
}

const small: React.CSSProperties = {
  margin: 0, fontFamily: "var(--font-nunito)", fontSize: 13, lineHeight: 1.55, color: "var(--text-secondary)",
};
const answerStyle: React.CSSProperties = {
  margin: 0, fontFamily: "var(--font-nunito)", fontSize: 15, fontWeight: 600, lineHeight: 1.5,
  color: "var(--text-primary)", cursor: "text", borderRadius: 6, padding: "1px 4px", marginLeft: -4,
  overflowWrap: "anywhere",
};
const inputStyle: React.CSSProperties = {
  width: "100%", fontFamily: "var(--font-nunito)", fontSize: 15, lineHeight: 1.55,
  background: "var(--surface)", color: "var(--text-primary)", border: "none", outline: "none",
  borderRadius: 8, padding: "6px 8px", resize: "vertical",
};

function LockGlyph() {
  return (
    <svg width="12" height="13" viewBox="0 0 12 13" fill="none" aria-hidden>
      <rect x="1.5" y="5.5" width="9" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3.5 5.5V4a2.5 2.5 0 015 0v1.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
