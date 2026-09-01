import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { screenshotUrl } from "@/lib/thumbnail";
import { MAX_UPLOAD_BYTES, getMimeType } from "@/lib/upload-safety";
import { CONTENT_TYPES, AI_TOOLS } from "@/lib/projectTaxonomy";
import {
  AiToolLogo,
  isUploadedProject,
  expandUploadEntries,
  summarizeDropped,
} from "./helpers";
import { type ProjectForm, AI_TOOLS_INITIAL } from "./types";
import { useT } from "@/lib/i18n/client";

// 대시보드 프로젝트 **수정** 폼(평면 레이아웃 오버레이 모달).
//
// 2026-08-25: 단계식 추가 위저드(7~8스텝) 삭제 — 새로 올리는 길은 AI 하나로
// 통일했다(사용자 확정). 이미 올린 작품의 제목·설명·파일 교체는 여전히 사람이
// 해야 하므로 이 수정 폼은 남는다. 추가 진입점은 AddProjectModal → ConnectPanel.
export function ProjectFormModal({ title, initialForm, onClose, onSubmit, submitLabel, userId }: {
  title: string;
  initialForm: ProjectForm;
  onClose: () => void;
  onSubmit: (form: ProjectForm) => void;
  submitLabel: string;
  userId: string;
}) {
  const { t } = useT();
  // 업로드로 만든 프로젝트의 demo_url은 내부 preview 경로다 — "url"로 시작하면
  // 수정 모달의 데모 URL 칸에 /api/preview/… 가 그대로 찍힌다(게다가 type=url
  // 검증에 걸려 저장도 안 된다). 파일 모드에서 시작해 연결 상태로 보여준다.
  const [uploadMode, setUploadMode] = useState<"url" | "files">(
    isUploadedProject(initialForm.demo_url) ? "files" : "url",
  );
  const [form, setForm] = useState({ ...initialForm });
  const [selectedTools, setSelectedTools] = useState<string[]>(initialForm.tags);
  const [showAllTools, setShowAllTools] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [thumbnailUploading, setThumbnailUploading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [uploadDone, setUploadDone] = useState(false);
  // 안전상 저장하지 않은 비밀 파일 요약(.env·.git/ 등). 조용히 버리면 "왜 내
  // 앱이 안 도나"가 되므로 업로드 결과 옆에 그대로 보여준다.
  const [droppedFiles, setDroppedFiles] = useState<string[]>([]);
  const [videoMode, setVideoMode] = useState<"file" | "url">("file");
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoError, setVideoError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Always show tools that are already selected even if collapsed
  const hiddenSelectedCount = selectedTools.filter(id =>
    !AI_TOOLS.slice(0, AI_TOOLS_INITIAL).find(t => t.id === id)
  ).length;
  const visibleTools = showAllTools
    ? AI_TOOLS
    : [
        ...AI_TOOLS.slice(0, AI_TOOLS_INITIAL),
        // Append selected tools from the hidden section so they're always visible
        ...AI_TOOLS.slice(AI_TOOLS_INITIAL).filter(t => selectedTools.includes(t.id)),
      ];

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleVideoFile(file: File) {
    setVideoError("");
    const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
    if (file.size > MAX_VIDEO_BYTES) {
      setVideoError(t.projectForm.videoTooLarge((file.size / 1024 / 1024).toFixed(1)));
      return;
    }

    // Check duration via HTML5 metadata
    const duration = await new Promise<number>((resolve, reject) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); resolve(v.duration); };
      v.onerror = () => { URL.revokeObjectURL(v.src); reject(); };
      v.src = URL.createObjectURL(file);
    }).catch(() => -1);

    if (duration < 0) {
      setVideoError(t.projectForm.videoUnreadable);
      return;
    }
    if (duration > 30) {
      setVideoError(t.projectForm.videoTooLong(duration.toFixed(1)));
      return;
    }

    setVideoUploading(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
    const videoId = crypto.randomUUID();
    const storagePath = `${userId}/videos/${videoId}.${ext}`;
    const { error: upErr } = await supabase.storage.from("project-files")
      .upload(storagePath, file, { upsert: true, contentType: file.type || "video/mp4" });

    if (upErr) {
      setVideoError(t.projectForm.uploadFailed(upErr.message));
      setVideoUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from("project-files").getPublicUrl(storagePath);
    setForm(prev => ({ ...prev, video_url: publicUrl }));
    setVideoUploading(false);
  }

  async function handleFilesUpload(fileList: FileList) {
    setUploadError("");
    setUploadDone(false);
    setDroppedFiles([]);
    const rawFiles = Array.from(fileList);
    if (!rawFiles.length) return;

    setUploading(true);
    setUploadProgress(0);

    // zip은 브라우저에서 풀어서 일반 파일처럼 취급.
    let entries: { relativePath: string; data: Blob }[];
    try {
      const expanded = await expandUploadEntries(rawFiles);
      entries = expanded.entries;
      setDroppedFiles(summarizeDropped(expanded.dropped, t.api.secretFileKinds));
      if (entries.length === 0 && expanded.dropped.length > 0) {
        setUploadError(t.projectForm.onlySecretFiles);
        setUploading(false);
        return;
      }
    } catch (err) {
      setUploadError(err instanceof Error ? t.projectForm.zipFailed(err.message) : t.projectForm.zipUnreadable);
      setUploading(false);
      return;
    }

    const totalSize = entries.reduce((acc, e) => acc + e.data.size, 0);
    if (totalSize > MAX_UPLOAD_BYTES) {
      setUploadError(t.projectForm.tooLarge((totalSize / 1024 / 1024).toFixed(1)));
      setUploading(false);
      return;
    }

    const supabase = createClient();
    const projectId = crypto.randomUUID();
    let indexHtmlStoragePath: string | null = null;

    for (let i = 0; i < entries.length; i++) {
      const { relativePath, data } = entries[i];
      const storagePath = `${userId}/${projectId}/${relativePath}`;
      const { error } = await supabase.storage.from("project-files")
        .upload(storagePath, data, { upsert: true, contentType: getMimeType(relativePath) });

      if (!error) {
        if (relativePath === "index.html" || (relativePath.endsWith(".html") && !indexHtmlStoragePath)) {
          indexHtmlStoragePath = storagePath;
        }
      }
      setUploadProgress(Math.round(((i + 1) / entries.length) * 100));
    }

    if (indexHtmlStoragePath) {
      setForm(prev => ({ ...prev, demo_url: `/api/preview/${indexHtmlStoragePath}` }));
      setUploading(false);
      setUploadDone(true);
    } else {
      // No HTML → demo_url stays empty and the trigger silently no-ops. Tell the
      // user instead of letting them wonder why nothing happened (input matrix #2).
      setUploading(false);
      setUploadError(t.projectForm.noHtml);
    }
  }

  function toggleTool(id: string) {
    setSelectedTools(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  }

  async function handleThumbnailUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setThumbnailUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${userId}/thumbnails/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("project-files")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (!error) {
        const { data } = supabase.storage.from("project-files").getPublicUrl(path);
        setForm(prev => ({ ...prev, thumbnail: data.publicUrl }));
      }
    } catch { /* ignore */ }
    setThumbnailUploading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      let finalForm = { ...form, tags: selectedTools } as ProjectForm;
      // 썸네일 자동 생성 (사용자가 직접 올린 게 없을 때만).
      if (!finalForm.thumbnail && finalForm.demo_url) {
        const isUpload = finalForm.demo_url.startsWith("/api/preview/");
        if (isUpload) {
          // 업로드 프로젝트도 외부 URL과 동일하게 thum.io로 실제 화면을 찍는다.
          // preview 경로는 상대 URL이라 thum.io가 접근할 수 있게 절대 URL로 변환.
          finalForm = {
            ...finalForm,
            thumbnail: screenshotUrl(`${window.location.origin}${finalForm.demo_url}`),
          };
        } else {
          // 외부 URL: og:image가 있으면 그걸, 없으면 thum.io 스크린샷 fallback.
          try {
            const res = await fetch("/api/og-thumbnail", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: finalForm.demo_url }),
            });
            const { imageUrl } = await res.json();
            if (imageUrl) finalForm = { ...finalForm, thumbnail: imageUrl };
          } catch { /* ignore */ }
        }
      }
      await onSubmit(finalForm);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t.projectForm.saveFailed);
    }
    setSaving(false);
  }

  // ── Wizard mode (추가): in-place takeover of the ProjectsTab content area ──

  // ── Edit mode (수정): overlay modal with the flat field layout ──
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6"
      style={{ background: "var(--overlay-strong)", backdropFilter: "blur(16px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative flex overflow-hidden"
        style={{
          width: "min(42rem, calc(100vw - 2rem))",
          maxHeight: "92vh",
          background: "var(--surface)",
          borderRadius: 20,
          boxShadow: "0 20px 60px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.04)",
        }}
      >

        {/* Floating top-right controls */}
        <div className="absolute top-4 right-4 z-20 flex gap-2">
          <button onClick={onClose}
            className="vf-soft-fill flex items-center justify-center rounded-full"
            style={{ width: 32, height: 32, cursor: "pointer" }}
            aria-label={t.projectForm.closeAria}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>


        {/* Form panel — scrolls under the sticky title so the save row is always
            reachable on short viewports */}
        <div
          className="flex flex-col overflow-y-auto"
          style={{ flex: 1, minWidth: 0 }}
        >

        {/* Header (edit mode keeps the original title) */}
        <div className="sticky top-0 z-10 flex items-center gap-3 px-6 py-4"
          style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
          <h2 className="flex-1 vf-serif-display" style={{ fontSize: "1.2rem", fontWeight: 500, margin: 0 }}>
            {title}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-5">

          <div className="vf-seg-track">
            {(["url", "files"] as const).map(mode => {
              const active = uploadMode === mode;
              return (
                <button key={mode} type="button" onClick={() => setUploadMode(mode)}
                  data-active={active}
                  className="vf-selectable flex-1 py-2 rounded-lg text-sm">
                  {mode === "url" ? `🔗 ${t.projectForm.urlOptionTitle}` : `📁 ${t.projectForm.filesOptionTitle}`}
                </button>
              );
            })}
          </div>

          {/* File upload */}
          <div>
          {uploadMode === "files" && (
            <div className="flex flex-col gap-3">
              {/* 기존 업로드 연결 상태 — 내부 경로 대신 사실만 말해준다 */}
              {isUploadedProject(form.demo_url) && !uploadDone && (
                <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl"
                  style={{ background: "var(--surface-soft)" }}>
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M2.5 7l3 3 6-6.5" stroke="var(--text-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <p className="text-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
                    {t.projectForm.existingUpload}
                  </p>
                </div>
              )}
              {/* Guide notice */}
              <div className="flex gap-2.5 px-3.5 py-3 rounded-xl"
                style={{ background: "var(--surface-soft)" }}>
                <span style={{ fontSize: "0.85rem", flexShrink: 0, marginTop: "1px" }}>💡</span>
                <div style={{ fontFamily: "var(--font-nunito)", fontSize: "0.72rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
                  <span style={{ fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-serif), 'Noto Serif KR', serif" }}>{t.projectForm.editGuideTitle}</span>
                  {t.projectForm.editGuide1}<code className="vf-mono" style={{ background: "var(--surface)", padding: "1px 5px", borderRadius: 4, fontSize: "0.68rem", color: "var(--text-primary)" }}>npm run build</code>{t.projectForm.editGuide2}
                  <code className="vf-mono" style={{ background: "var(--surface)", padding: "1px 5px", borderRadius: 4, fontSize: "0.68rem", color: "var(--text-primary)" }}>dist/</code>{t.projectForm.editGuide3}
                </div>
              </div>

              <input ref={fileInputRef} type="file" className="hidden" multiple
                accept=".html,.css,.js,.ts,.jsx,.tsx,.json,.svg,.png,.jpg,.jpeg,.gif,.webp,.woff,.woff2,.ttf,.zip"
                onChange={e => e.target.files && handleFilesUpload(e.target.files)} />
              <input ref={folderInputRef} type="file" className="hidden"
                {...{ webkitdirectory: "", multiple: true } as React.InputHTMLAttributes<HTMLInputElement>}
                onChange={e => e.target.files && handleFilesUpload(e.target.files)} />
              <div className="flex flex-col items-center gap-3 p-6 rounded-xl"
                onDragOver={e => { e.preventDefault(); e.currentTarget.setAttribute("data-drag", "1"); }}
                onDragLeave={e => e.currentTarget.removeAttribute("data-drag")}
                onDrop={e => {
                  e.preventDefault();
                  e.currentTarget.removeAttribute("data-drag");
                  if (e.dataTransfer.files.length) handleFilesUpload(e.dataTransfer.files);
                }}
                style={{ background: "var(--surface-soft)" }}>
                <div className="text-3xl">📂</div>
                <p className="text-xs text-center" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
                  {t.projectForm.dropHelpEdit}
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="vf-soft-fill rounded-full"
                    style={{ padding: "0.5rem 1rem", fontSize: "0.8rem", fontFamily: "var(--font-nunito)", fontWeight: 500, cursor: "pointer" }}>
                    {t.projectForm.pickFiles}
                  </button>
                  <button type="button" onClick={() => folderInputRef.current?.click()}
                    className="vf-soft-fill rounded-full"
                    style={{ padding: "0.5rem 1rem", fontSize: "0.8rem", fontFamily: "var(--font-nunito)", fontWeight: 500, cursor: "pointer" }}>
                    {t.projectForm.pickFolder}
                  </button>
                </div>
              </div>
              {uploading && (
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between text-xs vf-mono"
                    style={{ color: "var(--text-secondary)" }}>
                    <span>{t.projectForm.uploading}</span><span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full" style={{ background: "var(--border)" }}>
                    <div className="h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%`, background: "var(--text-primary)" }} />
                  </div>
                </div>
              )}
              {uploadDone && !uploading && (
                <p className="text-sm flex items-center gap-1.5" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2.5 7l3 3 6-6.5" stroke="var(--text-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {t.projectForm.uploadDoneEdit}
                </p>
              )}
              {uploadError && (
                <p className="text-sm" style={{ color: "#b34747", fontFamily: "var(--font-nunito)" }}>
                  {uploadError}
                </p>
              )}
              {droppedFiles.length > 0 && !uploading && (
                <div
                  className="text-sm rounded-lg px-3 py-2.5"
                  style={{
                    background: "var(--blue-tint)",
                    color: "var(--text-secondary)",
                    fontFamily: "var(--font-nunito)",
                  }}
                >
                  <p style={{ color: "var(--text-primary)" }}>{t.projectForm.secretFilesSkipped}</p>
                  <ul className="mt-1 space-y-0.5">
                    {droppedFiles.map((line) => (
                      <li key={line}>· {line}</li>
                    ))}
                  </ul>
                  <p className="mt-1.5">{t.projectForm.secretFilesWhy}</p>
                </div>
              )}
            </div>
          )}

          {/* URL input — 내부 preview 경로는 여기 노출하지 않는다(파일 탭이 연결
              상태를 보여줌). 입력하면 그 외부 URL로 교체된다. */}
          {uploadMode === "url" && (
            <Field label={t.projectForm.demoUrlLabel}>
              <input className="vf-input" name="demo_url" type="url"
                placeholder="https://myproject.vercel.app"
                value={isUploadedProject(form.demo_url) ? "" : form.demo_url}
                onChange={handleChange} />
            </Field>
          )}
          </div>{/* end step 2 wrapper */}

          {/* 핵심 기능 소개 — 위저드에만 있던 칸. 초안 카드가 이 값을 보여주며
              "수정" 버튼을 주는데 정작 모달에 칸이 없어 한 번 쓰면 못 고쳤다. */}
          <div>
            <Field label={t.projectForm.hintLabelEdit}>
              <textarea className="vf-input" name="demo_user_hint" rows={2}
                placeholder={t.projectForm.hintPlaceholder}
                value={form.demo_user_hint ?? ""} onChange={handleChange}
                maxLength={500}
                style={{ resize: "vertical", lineHeight: 1.6 }} />
            </Field>
            <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
              {t.projectForm.hintHelp}
            </p>
          </div>

          {/* 구동 영상 (선택) — 대표 작품 hero에서 자동 재생 */}
          <div>
            <label className="vf-label">{t.projectForm.videoLabelOptional}</label>
            <p className="text-xs mb-2" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
              {t.projectForm.videoAutoplayHelp}
            </p>

            {form.video_url ? (
              <div className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: "var(--surface-soft)" }}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "var(--surface)" }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <polygon points="3,2 13,8 3,14" fill="var(--text-primary)" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs mb-0.5" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontWeight: 600 }}>
                    {t.projectForm.videoConnected}
                  </p>
                  <p className="text-xs truncate vf-mono" style={{ color: "var(--text-muted)", fontSize: "0.65rem" }}>
                    {form.video_url}
                  </p>
                </div>
                <button type="button"
                  onClick={() => { setForm(prev => ({ ...prev, video_url: "" })); setVideoError(""); }}
                  className="vf-button-danger"
                  style={{ padding: "0.4rem 0.7rem", fontSize: "0.72rem" }}>
                  {t.projectForm.remove}
                </button>
              </div>
            ) : (
              <>
                {/* Mode toggle */}
                <div className="vf-seg-track mb-2 w-fit">
                  {(["file", "url"] as const).map(m => {
                    const active = videoMode === m;
                    return (
                      <button key={m} type="button" onClick={() => setVideoMode(m)}
                        data-active={active}
                        className="vf-selectable px-3 py-1 rounded-md text-xs">
                        {m === "file" ? t.projectForm.modeFile : t.projectForm.modeUrl}
                      </button>
                    );
                  })}
                </div>

                {videoMode === "file" ? (
                  <>
                    <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleVideoFile(f); }} />
                    <button type="button" disabled={videoUploading}
                      onClick={() => videoInputRef.current?.click()}
                      className="vf-soft-fill w-full py-2.5 rounded-xl text-sm"
                      style={{ fontFamily: "var(--font-nunito)", fontWeight: 500, cursor: videoUploading ? "not-allowed" : "pointer" }}>
                      {videoUploading ? t.projectForm.uploading : t.projectForm.videoPickInline}
                    </button>
                  </>
                ) : (
                  <input className="vf-input" type="url" name="video_url"
                    placeholder={t.projectForm.videoUrlPlaceholder}
                    value={form.video_url} onChange={handleChange} />
                )}
                {videoError && (
                  <p className="text-xs mt-2" style={{ color: "#b34747", fontFamily: "var(--font-nunito)" }}>
                    {videoError}
                  </p>
                )}
              </>
            )}
          </div>

          <div className="flex flex-col gap-5">
          {/* 프로젝트 이름 + 연도 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label={t.projectForm.nameLabel}>
                <input className="vf-input" name="title" placeholder="My Awesome Project"
                  value={form.title} onChange={handleChange} required />
              </Field>
            </div>
            <Field label={t.projectForm.yearLabel}>
              <input className="vf-input" name="year" placeholder="2025"
                value={form.year} onChange={handleChange} />
            </Field>
          </div>

          {/* 설명 */}
          <Field label={t.projectForm.descLabel}>
            <textarea className="vf-input" name="description" placeholder={t.projectForm.descPlaceholder}
              value={form.description} onChange={handleChange} rows={2}
              style={{ resize: "vertical" }} />
          </Field>
          </div>{/* end step 3 wrapper */}

          {/* 콘텐츠 유형 — 풀 너비 */}
          <div>
            <label className="vf-label">{t.projectForm.contentTypeLabel}</label>
            <div className="flex flex-wrap gap-1.5">
              {CONTENT_TYPES.map(ct => {
                const active = form.content_type === ct.id;
                return (
                  <button key={ct.id} type="button"
                    onClick={() => setForm(prev => ({ ...prev, content_type: active ? null : ct.id }))}
                    data-active={active}
                    className="vf-selectable px-2.5 py-1 rounded-full text-xs">
                    {active && <span style={{ fontSize: "0.7em" }}>✓</span>} {ct.emoji} {(t.contentTypes as Record<string, string>)[ct.id] ?? ct.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 썸네일 업로드 */}
          <div>
            <label className="vf-label">
              {t.projectForm.thumbLabel}
              <span className="ml-1.5" style={{ color: "var(--text-muted)", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
                {t.projectForm.thumbAutoNote}
              </span>
            </label>
            <input ref={thumbnailInputRef} type="file" className="hidden" accept="image/*"
              onChange={handleThumbnailUpload} />
            <div
              onClick={() => thumbnailInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.currentTarget.setAttribute("data-drag", "1"); }}
              onDragLeave={e => e.currentTarget.removeAttribute("data-drag")}
              onDrop={e => {
                e.preventDefault();
                e.currentTarget.removeAttribute("data-drag");
                const file = e.dataTransfer.files[0];
                if (file && file.type.startsWith("image/")) {
                  const dt = new DataTransfer();
                  dt.items.add(file);
                  if (thumbnailInputRef.current) {
                    thumbnailInputRef.current.files = dt.files;
                    thumbnailInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
                  }
                }
              }}
              className="flex items-center justify-center gap-3 w-full rounded-xl transition-colors cursor-pointer"
              style={{
                height: 48,
                background: "var(--surface-soft)",
              }}
            >
              {thumbnailUploading ? (
                <div className="w-4 h-4 rounded-full border-2 animate-spin"
                  style={{ borderColor: "var(--text-primary)", borderTopColor: "transparent" }} />
              ) : form.thumbnail ? (
                <>
                  <span className="flex items-center gap-1.5" style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                      <path d="M2.5 7l3 3 6-6.5" stroke="var(--text-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {t.projectForm.uploadDone}
                  </span>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setForm(prev => ({ ...prev, thumbnail: "" })); }}
                    style={{ fontSize: "0.7rem", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-nunito)", padding: 0 }}
                  >
                    {t.projectForm.remove}
                  </button>
                </>
              ) : (
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
                  {t.projectForm.dropOrClick}
                </span>
              )}
            </div>
          </div>

          {/* 썸네일 유형 */}
          <div>
            <label className="vf-label">{t.projectForm.thumbTypeLabel}</label>
            <div className="flex gap-2">
              {(["image", "video"] as const).map(mode => {
                const active = form.type === mode;
                return (
                  <button key={mode} type="button"
                    onClick={() => setForm(prev => ({ ...prev, type: mode }))}
                    data-active={active}
                    className="vf-selectable flex-1 py-2 rounded-xl text-sm">
                    {active && <span style={{ marginRight: 4 }}>✓</span>}{mode === "image" ? t.projectForm.typeImage : t.projectForm.typeVideo}
                  </button>
                );
              })}
            </div>
          </div>

          {/* AI 도구 */}
          <div>
            <label className="vf-label">
              {t.projectForm.aiToolsLabel}{" "}
              <span style={{ color: "var(--text-muted)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>{t.projectForm.multiSelect}</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {visibleTools.map(tool => {
                const active = selectedTools.includes(tool.id);
                return (
                  <button key={tool.id} type="button" onClick={() => toggleTool(tool.id)}
                    data-active={active}
                    className="vf-selectable flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs">
                    {active && <span style={{ fontSize: "0.7em" }}>✓</span>}
                    <AiToolLogo id={tool.id} size={13} />
                    <span>{tool.id}</span>
                  </button>
                );
              })}
              <button type="button"
                onClick={() => setShowAllTools(v => !v)}
                className="vf-soft-fill px-2.5 py-1 rounded-full text-xs"
                style={{
                  fontFamily: "var(--font-nunito)",
                  fontWeight: 500,
                  cursor: "pointer",
                }}>
                {showAllTools
                  ? t.projectForm.collapse
                  : t.projectForm.showMore(AI_TOOLS.length - AI_TOOLS_INITIAL - hiddenSelectedCount)}
              </button>
            </div>
          </div>

          {/* 한 마디 */}
          <div>
            <Field label={t.projectForm.commentLabel}>
              <input className="vf-input" name="comment" placeholder={t.projectForm.commentPlaceholder}
                value={form.comment} onChange={handleChange} />
            </Field>
          </div>

          {/* Save error */}
          {saveError && (
            <div className="px-4 py-3 rounded-xl text-xs"
              style={{ background: "rgba(179, 71, 71, 0.08)", color: "#8e3535", fontFamily: "var(--font-nunito)", lineHeight: 1.6 }}>
              ⚠ {saveError}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1 pb-1">
            <button type="button" onClick={onClose}
              className="vf-soft-fill flex-1 rounded-full"
              style={{ padding: "0.65rem 1rem", fontFamily: "var(--font-nunito)", fontSize: "0.85rem", fontWeight: 500, cursor: "pointer" }}>
              {t.projectForm.cancel}
            </button>
            <button type="submit" disabled={saving || uploading}
              className="vf-soft-fill flex-1 rounded-full"
              style={{ padding: "0.65rem 1rem", fontFamily: "var(--font-nunito)", fontSize: "0.85rem", fontWeight: 600, cursor: (saving || uploading) ? "not-allowed" : "pointer" }}>
              {saving ? t.projectForm.saving : submitLabel}
            </button>
          </div>

        </form>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="vf-label">{label}</label>
      {children}
    </div>
  );
}
