"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { toPreviewUrl } from "@/lib/previewOrigin";
import { CONTENT_TYPES } from "@/lib/projectTaxonomy";
import { isStepWired } from "@/lib/demoScript";
import { descriptionShapeIssue, descriptionTooLong, lineCols, DESCRIPTION_LINE_COLS_MAX } from "@/lib/descriptionShape";
import { buildDraftFixPrompt } from "@/lib/draftFixPrompt";
import { AiToolLogo } from "./helpers";
import { DemoScriptPanel } from "./DemoScriptPanel";
import { type DBProject } from "./types";
import { useT } from "@/lib/i18n/client";

// 초안 검토 모달 — [확인하고 공개]의 "확인"을 실제로 할 수 있는 화면.
//
// 2026-09-04 재편(인터뷰 ④⑥). 전에는 미리보기·설명·힌트·대본·한마디·유형… 이
// 같은 무게로 한 줄씩 쌓여 있어 "공개해도 되나"를 판단하려면 끝까지 훑어야 했다.
// 판단에 필요한 건 셋뿐이다 — ①명함에 어떻게 보이나 ②로봇이 뭘 찍나(대본·로그인)
// ③뭘 여나. 그래서 위에 **명함 렌더 + 판정 칩 3개**를 두고, 앱 미리보기와 대본이
// 그 다음, 나머지는 접는다.
//
// 살짝 고치기: 명함 렌더의 제목·소개글·한마디는 글자를 누르면 그 자리에서 고쳐진다
// (서버 게이트와 같은 규칙으로 막는다 — lib/descriptionShape). 대본은 빼기·순서만.
// 그 이상은 [AI에게 고쳐달라기] — 사람은 불만 한 줄, 고치는 건 AI(재촬영 루프와 동일).
export type DraftPatch = Partial<Pick<DBProject, "title" | "description" | "comment" | "demo_script">>;

export function DraftReviewModal({ draft, onClose, onPublish, onEdit, onDelete, onSave }: {
  draft: DBProject;
  onClose: () => void;
  onPublish: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSave: (patch: DraftPatch) => Promise<void>;
}) {
  const { t, locale } = useT();
  const isFile = draft.demo_url.startsWith("/api/preview/");
  // 파일 업로드는 샌드박스 오리진으로, 외부 URL은 그대로 임베드 시도.
  // 실행형 코드 zip(비HTML 앵커, 2026-08-20)은 미리보기가 소스 원문이라 임베드 안 함.
  const isEmbeddableFile = isFile && /\.html?$/i.test(draft.demo_url.split(/[?#]/)[0]);
  const previewSrc = isFile
    ? (isEmbeddableFile ? toPreviewUrl(draft.demo_url) : undefined)
    : /^https?:\/\//.test(draft.demo_url) ? draft.demo_url : undefined;
  // 인제스트 수동 영상은 스토리지 직링크(mp4/webm) — <video>로 바로 튼다.
  // youtube 등 페이지 URL이면 video 태그가 못 여니 iframe 미리보기로 폴백.
  const directVideo = /\.(mp4|webm|mov)(\?|$)/i.test(draft.video_url) ? draft.video_url : undefined;
  const ct = CONTENT_TYPES.find((c) => c.id === draft.content_type);
  const ctLabel = ct ? (t.contentTypes as Record<string, string>)[ct.id] ?? ct.label : null;

  // ── 인라인 편집 ─────────────────────────────────────────────────────────
  type Field = "title" | "description" | "comment";
  const [editing, setEditing] = useState<Field | null>(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const begin = (f: Field) => {
    if (saving) return;
    setSaveError(null);
    setValue(f === "title" ? draft.title : f === "description" ? draft.description : draft.comment);
    setEditing(f);
  };
  const cancel = () => { setEditing(null); setSaveError(null); };

  // 서버 게이트와 같은 판정 — 여기서 통과한 글은 발행에서도 통과한다.
  const validate = (f: Field, v: string): string | null => {
    const trimmed = v.trim();
    if (f === "title") return trimmed ? null : t.projects.reviewTitleEmpty;
    if (f === "description") {
      if (descriptionTooLong(trimmed)) return t.api.descriptionTooLong(200);
      const issue = descriptionShapeIssue(trimmed);
      if (!issue) return null;
      if (issue.kind === "empty") return t.projects.reviewDescEmpty;
      if (issue.kind === "lines") return t.projects.reviewDescLines(issue.lines);
      return t.projects.reviewDescLongLine(issue.line);
    }
    return null;
  };

  const save = async () => {
    if (!editing) return;
    const f = editing;
    const trimmed = value.trim();
    const problem = validate(f, trimmed);
    if (problem) { setSaveError(problem); return; }
    const current = f === "title" ? draft.title : f === "description" ? draft.description : draft.comment;
    if (trimmed === current) { cancel(); return; }
    setSaving(true);
    try {
      await onSave({ [f]: trimmed } as DraftPatch);
      setEditing(null);
    } catch {
      setSaveError(t.projects.reviewSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  const onKey = (e: React.KeyboardEvent, multiline: boolean) => {
    if (e.key === "Escape") { e.preventDefault(); cancel(); }
    if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); }
  };

  // 소개글 계기판 — 줄 수·가장 긴 줄의 칸 수. 서버 게이트가 보는 숫자 그대로.
  const descLines = value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const descMaxCols = descLines.length ? Math.max(...descLines.map(lineCols)) : 0;
  const descIssue = editing === "description" ? validate("description", value) : null;

  // ── 대본 살짝 고치기 ────────────────────────────────────────────────────
  const [scriptError, setScriptError] = useState<string | null>(null);
  const saveScript = async (next: NonNullable<DBProject["demo_script"]>) => {
    setScriptError(null);
    try {
      await onSave({ demo_script: next });
    } catch {
      setScriptError(t.projects.reviewSaveFailed);
    }
  };

  // ── AI에게 고쳐달라기 ───────────────────────────────────────────────────
  const [fixOpen, setFixOpen] = useState(false);
  const [fixNote, setFixNote] = useState("");
  const [fixBusy, setFixBusy] = useState(false);
  const [fixState, setFixState] = useState<"idle" | "copied" | "failed">("idle");
  const copyFix = async () => {
    if (!fixNote.trim() || fixBusy) return;
    setFixBusy(true);
    setFixState("idle");
    try {
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body.token !== "string") throw new Error("token");
      const prompt = buildDraftFixPrompt({
        title: draft.title,
        description: draft.description,
        builderNote: draft.comment,
        demoHighlights: draft.demo_user_hint,
        tags: draft.tags ?? [],
        contentType: draft.content_type,
        deployUrl: isFile ? null : draft.demo_url,
        demoScript: draft.demo_script,
        demoAccess: draft.demo_access,
        note: fixNote.trim(),
        token: body.token,
        origin: window.location.origin,
      }, locale);
      await navigator.clipboard.writeText(prompt);
      setFixState("copied");
    } catch {
      setFixState("failed");
    } finally {
      setFixBusy(false);
    }
  };

  // ── 판정 칩 ────────────────────────────────────────────────────────────
  const steps = draft.demo_script?.steps ?? [];
  const wired = steps.filter(isStepWired).length;
  const hasOwnVideo = !!draft.video_url;
  const access = draft.demo_access;
  const scriptChip = hasOwnVideo
    ? { text: t.projects.reviewAccessVideo, warn: false }
    : steps.length
      ? { text: `${t.projects.scriptSteps(steps.length)} · ${wired === steps.length ? t.projects.scriptPrecise : t.projects.scriptPartial(wired, steps.length)}`, warn: wired !== steps.length }
      : { text: t.projects.scriptNone, warn: true };
  const accessChip = hasOwnVideo
    ? null
    : access?.url
      ? { text: `${t.projects.reviewAccessUrl} · ${access.url}`, sub: access.note, warn: false }
      : access?.noLogin
        ? { text: t.projects.reviewAccessNoLogin, sub: access.note, warn: false }
        : access?.impossible
          ? { text: t.projects.reviewAccessImpossible, sub: access.note, warn: true }
          : { text: t.projects.reviewAccessMissing, sub: undefined, warn: true };
  const opensChip = isFile
    ? t.projects.reviewOpensFile
    : /github\.com\//i.test(draft.demo_url)
      ? `${t.projects.reviewOpensRepo} · ${draft.demo_url.replace(/^https?:\/\/(www\.)?github\.com\//i, "")}`
      : draft.demo_url.replace(/^https?:\/\//, "").replace(/\/$/, "");

  // ── 스타일 ─────────────────────────────────────────────────────────────
  const fieldLabelStyle: React.CSSProperties = {
    color: "var(--text-muted)", fontFamily: "var(--font-nunito)",
    fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
  };
  const fieldValueStyle: React.CSSProperties = {
    color: "var(--text-primary)", fontFamily: "var(--font-nunito)",
    fontSize: "0.88rem", lineHeight: 1.7, whiteSpace: "pre-wrap", margin: 0,
  };
  const emptyValue = <span style={{ color: "var(--text-muted)" }}>—</span>;
  // 명함 렌더는 실제 명함(TheaterStage)처럼 작품 위에 얹힌 흰 글씨다 — 테마와 무관하게
  // 어두운 바탕이 정직하다(라이트에서도 명함은 포스터 위에 뜬다).
  const cardBg = "linear-gradient(180deg, #2a241f 0%, #1a1612 100%)";
  const editableStyle: React.CSSProperties = { cursor: "text", borderRadius: 6, transition: "background 0.15s" };
  const inputStyle: React.CSSProperties = {
    width: "100%", background: "rgba(255,255,255,0.08)", color: "#fff", border: "none", outline: "none",
    borderRadius: 8, padding: "6px 8px", fontFamily: "var(--font-nunito)",
  };
  const chipStyle = (warn: boolean): React.CSSProperties => ({
    background: warn ? "rgba(179,71,71,0.10)" : "var(--surface-soft)",
    color: warn ? "#b34747" : "var(--text-primary)",
    fontFamily: "var(--font-nunito)", fontSize: "0.78rem", fontWeight: 500,
    padding: "8px 12px", borderRadius: 12, minWidth: 0,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6"
      style={{ background: "var(--overlay-strong)", backdropFilter: "blur(16px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative flex flex-col overflow-hidden"
        style={{
          width: "min(56rem, calc(100vw - 2rem))",
          maxHeight: "92vh",
          background: "var(--surface)",
          borderRadius: 20,
          boxShadow: "0 20px 60px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-6 pt-5 pb-4"
          style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="vf-serif-display" style={{ fontSize: "1.2rem", fontWeight: 500, margin: 0 }}>
                {draft.title || t.projects.untitled}
              </h2>
              <span className="px-2 py-0.5 rounded-full shrink-0"
                style={{ background: "var(--surface-soft)", color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontSize: "0.6rem", fontWeight: 600 }}>
                {t.projects.draftBadge}
              </span>
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", margin: 0 }}>
              {t.projects.reviewIntro} {t.projects.reviewEditHint}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="vf-soft-fill flex items-center justify-center rounded-full shrink-0"
            style={{ width: 32, height: 32, cursor: "pointer" }}
            aria-label={t.projectForm.closeAria}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 flex flex-col gap-5">
          {/* ① 명함 렌더 — 글자를 누르면 그 자리에서 고친다 */}
          <div>
            <label className="vf-label" style={{ margin: "0 0 8px", display: "block" }}>{t.projects.reviewCardLabel}</label>
            <div className="rounded-2xl" style={{ background: cardBg, padding: "22px 24px 20px" }}>
              {editing === "title" ? (
                <input ref={inputRef as React.RefObject<HTMLInputElement>} value={value} onChange={e => setValue(e.target.value)}
                  onKeyDown={e => onKey(e, false)} disabled={saving}
                  className="vf-serif-display" style={{ ...inputStyle, fontSize: "1.35rem", fontWeight: 500 }} />
              ) : (
                <h3 className="vf-serif-display" onClick={() => begin("title")} title={t.projects.reviewEditHint}
                  style={{ ...editableStyle, fontSize: "1.35rem", fontWeight: 500, margin: 0, color: "#fff", textShadow: "0 2px 16px rgba(0,0,0,0.55)", padding: "2px 4px", marginLeft: -4 }}>
                  {draft.title || t.projects.untitled}
                </h3>
              )}

              {editing === "description" ? (
                <div style={{ marginTop: 8 }}>
                  <textarea ref={inputRef as React.RefObject<HTMLTextAreaElement>} value={value} onChange={e => setValue(e.target.value)}
                    onKeyDown={e => onKey(e, true)} rows={3} disabled={saving}
                    style={{ ...inputStyle, fontSize: 14, lineHeight: 1.55, resize: "vertical", maxWidth: 440 }} />
                  <p className="text-xs" style={{ margin: "4px 0 0", fontFamily: "var(--font-nunito)", color: descIssue ? "#f0a3a3" : "rgba(255,255,255,0.6)" }}>
                    {descIssue ?? t.projects.reviewDescMeter(descLines.length, descMaxCols, DESCRIPTION_LINE_COLS_MAX)}
                  </p>
                </div>
              ) : (
                <p onClick={() => begin("description")} title={t.projects.reviewEditHint}
                  style={{
                    ...editableStyle, fontSize: 14, color: draft.description ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.4)",
                    marginTop: 8, lineHeight: 1.55, maxWidth: 440, fontFamily: "var(--font-nunito)",
                    textShadow: "0 1px 8px rgba(0,0,0,0.5)", whiteSpace: "pre-line",
                    display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 3, overflow: "hidden",
                    padding: "2px 4px", marginLeft: -4,
                  }}>
                  {draft.description || t.projects.reviewDescEmpty}
                </p>
              )}

              {editing === "comment" ? (
                <input ref={inputRef as React.RefObject<HTMLInputElement>} value={value} onChange={e => setValue(e.target.value)}
                  onKeyDown={e => onKey(e, false)} disabled={saving} placeholder={t.projects.reviewNotePlaceholder}
                  style={{ ...inputStyle, fontSize: 13, marginTop: 12, maxWidth: 440 }} />
              ) : (
                <div onClick={() => begin("comment")} title={t.projects.reviewEditHint}
                  className="inline-block"
                  style={{
                    ...editableStyle, marginTop: 12, fontSize: 13, fontFamily: "var(--font-nunito)",
                    background: "rgba(255,255,255,0.12)", color: draft.comment ? "#fff" : "rgba(255,255,255,0.45)",
                    padding: "6px 12px", borderRadius: 14, maxWidth: 440,
                  }}>
                  {draft.comment || t.projects.reviewNotePlaceholder}
                </div>
              )}

              {draft.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5" style={{ marginTop: 14 }}>
                  {draft.tags.map(tag => (
                    <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                      style={{ background: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.85)", fontFamily: "var(--font-nunito)", fontSize: "0.62rem" }}>
                      <AiToolLogo id={tag} size={11} />{tag}
                    </span>
                  ))}
                </div>
              )}

              {editing && (
                <div className="flex items-center gap-2" style={{ marginTop: 12 }}>
                  <button type="button" onClick={() => void save()} disabled={saving || !!descIssue}
                    className="rounded-full" style={{ background: "#fff", color: "#1a1612", border: "none", padding: "6px 14px", fontSize: "0.78rem", fontWeight: 600, fontFamily: "var(--font-nunito)", cursor: "pointer", opacity: saving || descIssue ? 0.5 : 1 }}>
                    {t.projects.reviewEditSave}
                  </button>
                  <button type="button" onClick={cancel} disabled={saving}
                    style={{ background: "transparent", color: "rgba(255,255,255,0.7)", border: "none", padding: "6px 10px", fontSize: "0.78rem", fontFamily: "var(--font-nunito)", cursor: "pointer" }}>
                    {t.projects.reviewEditCancel}
                  </button>
                  {saveError && editing !== "description" && (
                    <span className="text-xs" style={{ color: "#f0a3a3", fontFamily: "var(--font-nunito)" }}>{saveError}</span>
                  )}
                  {saveError && editing === "description" && !descIssue && (
                    <span className="text-xs" style={{ color: "#f0a3a3", fontFamily: "var(--font-nunito)" }}>{saveError}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ② 판정 칩 3개 — 로봇이 뭘 찍고, 어떻게 들어가고, 뭘 여나 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div style={chipStyle(scriptChip.warn)}>
              <p style={{ ...fieldLabelStyle, margin: "0 0 2px", color: "inherit", opacity: 0.7 }}>{t.projects.reviewVerdictScript}</p>
              <p style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{scriptChip.text}</p>
            </div>
            {accessChip && (
              <div style={chipStyle(accessChip.warn)}>
                <p style={{ ...fieldLabelStyle, margin: "0 0 2px", color: "inherit", opacity: 0.7 }}>{t.projects.reviewVerdictAccess}</p>
                <p style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={accessChip.text}>{accessChip.text}</p>
                {accessChip.sub && (
                  <p style={{ margin: "2px 0 0", fontSize: "0.7rem", opacity: 0.75, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={accessChip.sub}>{accessChip.sub}</p>
                )}
              </div>
            )}
            <div style={chipStyle(false)}>
              <p style={{ ...fieldLabelStyle, margin: "0 0 2px", color: "inherit", opacity: 0.7 }}>{t.projects.reviewVerdictOpens}</p>
              <p className="vf-mono" style={{ margin: 0, fontSize: "0.72rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={draft.demo_url}>{opensChip}</p>
            </div>
          </div>

          {/* ③ 앱 미리보기 */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <label className="vf-label" style={{ margin: 0 }}>{t.projects.reviewPreviewLabel}</label>
              {previewSrc && (
                <a href={previewSrc} target="_blank" rel="noopener noreferrer"
                  className="text-xs"
                  style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontWeight: 600, textDecoration: "underline", whiteSpace: "nowrap" }}>
                  {t.projects.menuOpen}
                </a>
              )}
            </div>
            <div className="relative w-full rounded-xl overflow-hidden"
              style={{ aspectRatio: "16 / 10", background: "var(--surface-soft)" }}>
              {directVideo ? (
                <video src={directVideo} controls playsInline
                  className="absolute inset-0 w-full h-full"
                  style={{ objectFit: "contain", background: "#000" }} />
              ) : previewSrc ? (
                <iframe
                  src={previewSrc}
                  title={draft.title || t.projects.untitled}
                  className="absolute inset-0 w-full h-full"
                  style={{ border: "none" }}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                />
              ) : draft.thumbnail ? (
                <Image src={draft.thumbnail} unoptimized alt={draft.title || t.projects.untitled}
                  fill className="object-cover" sizes="(max-width: 896px) 100vw, 896px" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
                    {t.projects.reviewNoPreview}
                  </p>
                </div>
              )}
            </div>
            {previewSrc && !isFile && !directVideo && (
              <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
                {t.projects.reviewEmbedTip}
              </p>
            )}
          </div>

          {/* ④ 촬영 대본 — 공개하면 이대로 찍힌다. 빼기·순서는 여기서, 나머진 AI에게 */}
          <div>
            <DemoScriptPanel script={draft.demo_script} onChange={hasOwnVideo ? undefined : saveScript} />
            {scriptError && (
              <p className="text-xs mt-1.5" style={{ color: "#b34747", fontFamily: "var(--font-nunito)", margin: "6px 0 0" }}>{scriptError}</p>
            )}
          </div>

          {/* ⑤ AI에게 고쳐달라기 */}
          {fixOpen && (
            <div className="rounded-2xl" style={{ background: "var(--surface-soft)", padding: "14px 16px" }}>
              <p className="text-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", margin: "0 0 8px" }}>
                {t.projects.reviewFixLead}
              </p>
              <textarea value={fixNote} onChange={e => { setFixNote(e.target.value); setFixState("idle"); }}
                rows={3} placeholder={t.projects.reviewFixPlaceholder} className="vf-input w-full"
                style={{ fontSize: "0.85rem", lineHeight: 1.6, background: "var(--surface)" }} />
              <div className="flex items-center gap-3 flex-wrap" style={{ marginTop: 8 }}>
                <button type="button" onClick={() => void copyFix()} disabled={fixBusy || !fixNote.trim()}
                  className="vf-button-primary" style={{ fontSize: "0.8rem", padding: "0.5rem 1rem", opacity: fixBusy || !fixNote.trim() ? 0.5 : 1 }}>
                  {t.projects.reviewFixCopy}
                </button>
                {fixState === "copied" && (
                  <span className="text-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>{t.projects.reviewFixCopied}</span>
                )}
                {fixState === "failed" && (
                  <span className="text-xs" style={{ color: "#b34747", fontFamily: "var(--font-nunito)" }}>{t.projects.reviewFixFailed}</span>
                )}
              </div>
            </div>
          )}

          {/* ⑥ 그 밖에 — 판단에 안 쓰이는 것들은 접는다 */}
          <details>
            <summary className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", cursor: "pointer", fontWeight: 600 }}>
              {t.projects.reviewMore}
            </summary>
            <div className="flex flex-col gap-4" style={{ marginTop: 12 }}>
              <div>
                <p style={fieldLabelStyle}>{t.projectForm.hintLabel}</p>
                <p style={fieldValueStyle}>{draft.demo_user_hint || emptyValue}</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <p style={fieldLabelStyle}>{t.projectForm.contentTypeLabel}</p>
                  <p style={fieldValueStyle}>{ct ? `${ct.emoji} ${ctLabel}` : emptyValue}</p>
                </div>
                <div>
                  <p style={fieldLabelStyle}>{t.projectForm.yearLabel}</p>
                  <p style={fieldValueStyle}>{draft.year || emptyValue}</p>
                </div>
                <div className="col-span-2 md:col-span-1">
                  <p style={fieldLabelStyle}>{t.projectForm.aiToolsLabel}</p>
                  <p style={fieldValueStyle}>{draft.tags.length ? draft.tags.join(" · ") : emptyValue}</p>
                </div>
              </div>
              <div>
                <p style={fieldLabelStyle}>{t.projectForm.demoUrlLabel}</p>
                <p className="vf-mono" style={{ ...fieldValueStyle, fontSize: "0.75rem", wordBreak: "break-all" }}>
                  {isFile ? t.projects.reviewFileUpload : (draft.demo_url || emptyValue)}
                </p>
              </div>
            </div>
          </details>
        </div>

        {/* Footer actions */}
        <div className="flex items-center gap-2 px-6 py-4 flex-wrap"
          style={{ borderTop: "1px solid var(--border)" }}>
          <button type="button" onClick={onDelete} className="vf-button-ghost"
            style={{ fontSize: "0.8rem", padding: "0.5rem 1rem", color: "#b34747" }}>
            {t.projects.menuDelete}
          </button>
          <div className="flex-1" />
          <button type="button" onClick={() => setFixOpen(v => !v)}
            className="vf-button-ghost"
            style={{ fontSize: "0.8rem", padding: "0.5rem 1rem", background: fixOpen ? "var(--surface-soft)" : undefined }}>
            {t.projects.reviewFixWithAi}
          </button>
          <button type="button" onClick={onEdit}
            className="vf-soft-fill rounded-full"
            style={{ padding: "0.55rem 1.2rem", fontFamily: "var(--font-nunito)", fontSize: "0.85rem", fontWeight: 500, cursor: "pointer" }}>
            {t.projects.menuEdit}
          </button>
          <button type="button" onClick={onPublish} className="vf-button-primary"
            style={{ fontSize: "0.85rem", padding: "0.55rem 1.3rem" }}>
            {t.projects.confirmPublish}
          </button>
        </div>
      </div>
    </div>
  );
}
