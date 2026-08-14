"use client";

import Image from "next/image";
import { toPreviewUrl } from "@/lib/previewOrigin";
import { CONTENT_TYPES } from "@/lib/projectTaxonomy";
import { AiToolLogo } from "./helpers";
import { type DBProject } from "./types";
import { useT } from "@/lib/i18n/client";

// 초안 검토 모달 — [확인하고 공개]의 "확인"을 실제로 할 수 있는 화면.
// AI가 써 올린 전체 내용(전문 설명·핵심 기능 힌트 포함)과 작품 미리보기를
// 한눈에 보여준다. 외부 URL은 임베드가 막힐 수 있어(X-Frame-Options)
// [작품 열기 ↗] 새 탭 폴백을 항상 같이 둔다.
export function DraftReviewModal({ draft, onClose, onPublish, onEdit, onDelete }: {
  draft: DBProject;
  onClose: () => void;
  onPublish: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useT();
  const isFile = draft.demo_url.startsWith("/api/preview/");
  // 파일 업로드는 샌드박스 오리진으로, 외부 URL은 그대로 임베드 시도.
  const previewSrc = isFile
    ? toPreviewUrl(draft.demo_url)
    : /^https?:\/\//.test(draft.demo_url) ? draft.demo_url : undefined;
  // 인제스트 수동 영상은 스토리지 직링크(mp4/webm) — <video>로 바로 튼다.
  // youtube 등 페이지 URL이면 video 태그가 못 여니 iframe 미리보기로 폴백.
  const directVideo = /\.(mp4|webm|mov)(\?|$)/i.test(draft.video_url) ? draft.video_url : undefined;
  const ct = CONTENT_TYPES.find((c) => c.id === draft.content_type);
  const ctLabel = ct ? (t.contentTypes as Record<string, string>)[ct.id] ?? ct.label : null;

  const fieldLabelStyle: React.CSSProperties = {
    color: "var(--text-muted)", fontFamily: "var(--font-nunito)",
    fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
  };
  const fieldValueStyle: React.CSSProperties = {
    color: "var(--text-primary)", fontFamily: "var(--font-nunito)",
    fontSize: "0.88rem", lineHeight: 1.7, whiteSpace: "pre-wrap", margin: 0,
  };
  const emptyValue = <span style={{ color: "var(--text-muted)" }}>—</span>;

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
              {t.projects.reviewIntro}
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
          {/* Preview */}
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

          {/* AI가 쓴 내용 전체 */}
          <div className="flex flex-col gap-4">
            <div>
              <p style={fieldLabelStyle}>{t.projectForm.descLabel}</p>
              <p style={fieldValueStyle}>{draft.description || emptyValue}</p>
            </div>
            <div>
              <p style={fieldLabelStyle}>{t.projectForm.hintLabel}</p>
              <p style={fieldValueStyle}>{draft.demo_user_hint || emptyValue}</p>
            </div>
            <div>
              <p style={fieldLabelStyle}>{t.projectForm.commentLabel}</p>
              <p style={fieldValueStyle}>{draft.comment || emptyValue}</p>
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
                {draft.tags.length ? (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {draft.tags.map(tag => (
                      <span key={tag}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                        style={{ background: "var(--surface-soft)", color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
                        <AiToolLogo id={tag} size={11} />{tag}
                      </span>
                    ))}
                  </div>
                ) : <p style={fieldValueStyle}>{emptyValue}</p>}
              </div>
            </div>
            <div>
              <p style={fieldLabelStyle}>{t.projectForm.demoUrlLabel}</p>
              <p className="vf-mono" style={{ ...fieldValueStyle, fontSize: "0.75rem", wordBreak: "break-all" }}>
                {isFile ? t.projects.reviewFileUpload : (draft.demo_url || emptyValue)}
              </p>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center gap-2 px-6 py-4"
          style={{ borderTop: "1px solid var(--border)" }}>
          <button type="button" onClick={onDelete} className="vf-button-ghost"
            style={{ fontSize: "0.8rem", padding: "0.5rem 1rem", color: "#b34747" }}>
            {t.projects.menuDelete}
          </button>
          <div className="flex-1" />
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
