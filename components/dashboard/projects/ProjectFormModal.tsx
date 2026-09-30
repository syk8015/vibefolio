import { useState, useRef, useCallback, useEffect, useId } from "react";
import Image from "next/image";
import Modal from "@/components/Modal";
import { FoldToggle } from "@/components/FoldToggle";
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

// 대시보드 작품 **수정** 창 '작품 고치기'(2026-10-01 덜어내기 · 라안).
//
// 자주 고치는 세 칸(이름·설명·한 마디)과 작품 주소 한 줄만 먼저 보인다. 나머지(유형·연도·
// AI 도구·썸네일·직접 만든 영상·핵심 기능 소개)는 '더 보기' 목록에 한 줄씩 있고, 줄의 작은
// 버튼을 누르면 그 자리에서 편집 칸이 열린다. 핵심 기능 소개(demo_user_hint)는 촬영 워커가
// 아직 읽는다(local-runner explore 브리핑) — 빼지 말 것.
//
// 작품 주소·파일 교체는 [바꾸기] → 작은 창. 거기서 올린 파일·적은 주소는 창의 [바꾸기]를
// 눌러야 폼에 들어가고, 닫으면 버린다. DB 저장은 예전처럼 [저장하기] 한 번이고, 업로드 경로·
// 검사·저장 로직은 그대로다.
//
// 2026-08-25: 단계식 추가 위저드 삭제 — 새로 올리는 길은 AI 하나로 통일(사용자 확정).
// 이미 올린 작품의 제목·설명·파일 교체는 여전히 사람이 해야 하므로 이 창은 남는다.
// 추가 진입점은 AddProjectModal → ConnectPanel.

type MoreKey = "type" | "year" | "tools" | "thumb" | "video" | "hint";

// 칸 이름표 — 명함 탭과 같은 본문 글꼴 14px(고정폭 .vf-label은 한글이 띄엄띄엄 읽혔다, 09-26).
const LABEL: React.CSSProperties = {
  display: "block", fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)",
  fontFamily: "var(--font-nunito)", marginBottom: 8,
};
// 채움 상자(soft) 줄 안의 작은 버튼 — 한 단계 밝은 바탕이라 줄 위에서 떠 보인다.
const MINI: React.CSSProperties = {
  flexShrink: 0, padding: "0.375rem 0.875rem", borderRadius: 999, border: "none",
  background: "var(--surface)", color: "var(--text-primary)",
  fontFamily: "var(--font-nunito)", fontSize: "0.8125rem", fontWeight: 600,
  whiteSpace: "nowrap", cursor: "pointer",
};
const SMALL: React.CSSProperties = {
  margin: 0, fontSize: "0.8125rem", color: "var(--text-secondary)", fontFamily: "var(--font-nunito)",
  wordBreak: "keep-all",
};
const ERROR: React.CSSProperties = {
  margin: 0, fontSize: "0.875rem", color: "var(--danger)", fontFamily: "var(--font-nunito)", lineHeight: 1.5,
  wordBreak: "keep-all",
};
const FOOT_BUTTON: React.CSSProperties = { padding: "0.7rem 1.6rem", fontSize: "0.9375rem" };

export function ProjectFormModal({ title, initialForm, onClose, onSubmit, submitLabel, userId }: {
  title: string;
  initialForm: ProjectForm;
  onClose: () => void;
  onSubmit: (form: ProjectForm) => void;
  submitLabel: string;
  userId: string;
}) {
  const { t } = useT();
  const uid = useId();
  // 교체 창의 주소/파일 선택. 업로드로 만든 작품의 demo_url은 내부 preview 경로라 파일 쪽으로
  // 열고, 주소 칸엔 그 경로를 채우지 않는다(openSwap — type=url 검증에도 걸린다).
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
  // 안전상 저장하지 않은 비밀 파일 요약(.env·.git/ 등). 조용히 버리면 "왜 내
  // 앱이 안 도나"가 되므로 업로드 결과 옆에 그대로 보여준다.
  const [droppedFiles, setDroppedFiles] = useState<string[]>([]);
  const [videoMode, setVideoMode] = useState<"file" | "url">("file");
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoError, setVideoError] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [editing, setEditing] = useState<MoreKey | null>(null);
  // 교체 창: 적은 주소와, 방금 다 올라가 폼에 들어간 업로드(창에 ✓ 이름으로 보여 준다).
  // 파일은 다 올라가는 순간 폼에 넣는다 — [바꾸기]를 한 번 더 눌러야 들어가게 했더니, ✓를 보고
  // [닫기]를 누르거나 올리는 중에 창을 닫으면 조용히 옛 파일로 저장됐다(10-01 검토). 올리는 중엔 창을 못 닫는다.
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapUrl, setSwapUrl] = useState("");
  const [staged, setStaged] = useState<{ demoUrl: string; name: string } | null>(null);
  const uploadingRef = useRef(false);
  useEffect(() => { uploadingRef.current = uploading; }, [uploading]);
  // 이번에 올린 파일 이름(작품 줄에 보여줄 것). 예전 업로드는 이름을 저장하지 않아 모른다.
  const [pickedName, setPickedName] = useState<string | null>(null);
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
    setStaged(null);
    setDroppedFiles([]);
    const rawFiles = Array.from(fileList);
    if (!rawFiles.length) return;
    const name = uploadName(rawFiles);

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
    const uploaded: string[] = [];
    let failed = 0;

    for (let i = 0; i < entries.length; i++) {
      const { relativePath, data } = entries[i];
      const storagePath = `${userId}/${projectId}/${relativePath}`;
      const { error } = await supabase.storage.from("project-files")
        .upload(storagePath, data, { upsert: true, contentType: getMimeType(relativePath) });

      if (error) {
        failed++;
      } else {
        uploaded.push(storagePath);
        if (relativePath === "index.html" || (relativePath.endsWith(".html") && !indexHtmlStoragePath)) {
          indexHtmlStoragePath = storagePath;
        }
      }
      setUploadProgress(Math.round(((i + 1) / entries.length) * 100));
    }

    // 파일 하나라도 못 올렸으면 "완료"로 넘기지 않는다 — index.html만 올라가고
    // JS·CSS가 빠진 반쯤 깨진 작품이 저장되던 것(R7). 이번에 올린 조각은 치운다
    // (새 무작위 폴더라 지금 작품이 쓰는 파일과 겹치지 않는다).
    if (failed > 0) {
      if (uploaded.length) {
        await supabase.storage.from("project-files").remove(uploaded).catch(() => {});
      }
      setUploading(false);
      setUploadError(t.projectForm.uploadPartialFailed(failed, entries.length));
      return;
    }

    if (indexHtmlStoragePath) {
      const next = { demoUrl: `/api/preview/${indexHtmlStoragePath}`, name };
      applyUpload(next);
      setStaged(next);
      setUploading(false);
    } else {
      // No HTML → demo_url stays empty and the trigger silently no-ops. Tell the
      // user instead of letting them wonder why nothing happened (input matrix #2).
      setUploading(false);
      setUploadError(t.projectForm.noHtml);
    }
  }

  function openSwap() {
    const uploadedNow = isUploadedProject(form.demo_url);
    setSwapUrl(uploadedNow ? "" : form.demo_url ?? "");
    if (!uploading) {
      setUploadMode(uploadedNow ? "files" : "url");
      setStaged(null);
      setUploadError("");
      setDroppedFiles([]);
    }
    setSwapOpen(true);
  }

  // Modal은 onClose가 바뀔 때마다 창에 포커스를 다시 준다 — 입력 중에 포커스를 뺏기지 않게 고정.
  // 올리는 중엔 닫지 않는다(Esc·바깥 누르기 포함) — 다 올라가야 폼에 들어간다.
  const closeSwap = useCallback(() => { if (!uploadingRef.current) setSwapOpen(false); }, []);

  // 다 올라간 파일을 폼에 넣는다. 옛 폴더를 찍은 자동 썸네일(thum.io)은 비운다 — 저장하면 옛 폴더가
  // 지워져서 그 썸네일이 옛 화면이나 빈 페이지를 보여준다. 비우면 저장 때 새로 찍힌다.
  function applyUpload(next: { demoUrl: string; name: string }) {
    setForm(prev => ({
      ...prev,
      demo_url: next.demoUrl,
      thumbnail: prev.thumbnail?.startsWith(screenshotUrl("")) && prev.thumbnail.includes("/api/preview/")
        ? "" : prev.thumbnail,
    }));
    setPickedName(next.name);
  }

  function applySwap(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (uploadMode === "files") {
      // 파일은 다 올라가는 순간 이미 폼에 들어갔다(applyUpload) — 여기선 창만 닫는다.
      if (uploading) return;
    } else {
      const url = swapUrl.trim();
      if (!url) return;
      setForm(prev => ({ ...prev, demo_url: url }));
      setPickedName(null);
    }
    setSwapOpen(false);
  }

  function toggleTool(id: string) {
    setSelectedTools(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  }

  function toggleEditing(key: MoreKey) {
    setEditing(prev => (prev === key ? null : key));
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

  // ── 줄에 보여줄 지금 값 ──
  const linkIsUpload = isUploadedProject(form.demo_url);
  const linkLabel = linkIsUpload
    ? `${t.projectForm.workLink} · ${t.projectForm.workUploaded}`
    : t.projectForm.workLink;
  const linkValue = linkIsUpload
    ? pickedName ?? uploadEntry(form.demo_url) ?? t.projectForm.uploadedFiles
    : shortUrl(form.demo_url ?? "");
  const typeName = form.content_type
    ? (t.contentTypes as Record<string, string>)[form.content_type]
      ?? CONTENT_TYPES.find(ct => ct.id === form.content_type)?.label
      ?? form.content_type
    : null;
  const hint = form.demo_user_hint?.trim() || "";
  const canApplySwap = uploadMode === "files" ? !!staged && !uploading : swapUrl.trim() !== "";
  // 파일 쪽은 올리면 바로 들어가서 [바꾸기]가 따로 없다 — 다 올라가면 [완료] 하나.
  const filesDone = uploadMode === "files" && !!staged && !uploading;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6"
      style={{ background: "var(--overlay-strong)", backdropFilter: "blur(16px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        className="relative flex flex-col overflow-hidden"
        style={{
          width: "min(34rem, calc(100vw - 2rem))",
          maxHeight: "92vh",
          background: "var(--surface)",
          borderRadius: 20,
          boxShadow: "var(--shadow-modal)",
        }}
      >
        <div className="flex items-center gap-3 px-6 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 id={`${uid}-title`} className="flex-1 vf-serif-display" style={{ fontSize: "1.2rem", fontWeight: 600, margin: 0 }}>
            {title}
          </h2>
          <CloseButton onClick={onClose} label={t.projectForm.closeAria} />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col gap-4">
            <div>
              <label htmlFor={`${uid}-name`} style={LABEL}>{t.projectForm.nameLabel}</label>
              <input id={`${uid}-name`} className="vf-input" name="title" placeholder="My Awesome Project"
                value={form.title} onChange={handleChange} required />
            </div>

            <div>
              <label htmlFor={`${uid}-desc`} style={LABEL}>{t.projectForm.descLabel}</label>
              <textarea id={`${uid}-desc`} className="vf-input" name="description" placeholder={t.projectForm.descPlaceholder}
                value={form.description} onChange={handleChange} rows={3}
                style={{ resize: "vertical", lineHeight: 1.6 }} />
            </div>

            <div>
              <label htmlFor={`${uid}-comment`} style={LABEL}>{t.projectForm.commentLabel}</label>
              <input id={`${uid}-comment`} className="vf-input" name="comment" placeholder={t.projectForm.commentPlaceholder}
                value={form.comment} onChange={handleChange} />
            </div>

            {/* 작품 주소 한 줄 — 교체는 [바꾸기] → 작은 창 */}
            <div className="flex items-center gap-3 rounded-2xl"
              style={{ background: "var(--surface-soft)", padding: "0.75rem 0.75rem 0.75rem 1rem" }}>
              <div className="flex-1 min-w-0">
                <p style={SMALL}>{linkLabel}</p>
                <p className="truncate" title={linkIsUpload ? undefined : form.demo_url}
                  style={{ margin: 0, fontSize: "0.9375rem", fontWeight: 600, fontFamily: "var(--font-nunito)", color: linkValue ? "var(--text-primary)" : "var(--text-muted)" }}>
                  {linkValue || t.projectForm.none}
                </p>
              </div>
              <button type="button" onClick={openSwap} style={MINI} className="transition-opacity hover:opacity-75">
                {t.projectForm.replace}
              </button>
            </div>

            <div>
              <FoldToggle open={moreOpen} onToggle={() => { setMoreOpen(v => !v); setEditing(null); }}>
                {moreOpen ? t.projectForm.less : t.projectForm.more}
              </FoldToggle>
            </div>

            {moreOpen && (
              <div className="rounded-2xl overflow-hidden" style={{ background: "var(--surface-soft)" }}>
                <MoreRow first label={t.projectForm.rowType}
                  value={typeName ?? t.projectForm.none} empty={!typeName}
                  action={t.projectForm.change} doneLabel={t.projectForm.done}
                  open={editing === "type"} onToggle={() => toggleEditing("type")}>
                  <div className="flex flex-wrap gap-1.5">
                    {CONTENT_TYPES.map(ct => {
                      const active = form.content_type === ct.id;
                      return (
                        <button key={ct.id} type="button"
                          onClick={() => setForm(prev => ({ ...prev, content_type: active ? null : ct.id }))}
                          data-active={active}
                          className="vf-selectable px-3 py-1 rounded-full"
                          style={{ fontSize: "0.8125rem" }}>
                          {active && "✓ "}{(t.contentTypes as Record<string, string>)[ct.id] ?? ct.label}
                        </button>
                      );
                    })}
                  </div>
                </MoreRow>

                <MoreRow label={t.projectForm.rowYear}
                  value={form.year || t.projectForm.none} empty={!form.year}
                  action={t.projectForm.change} doneLabel={t.projectForm.done}
                  open={editing === "year"} onToggle={() => toggleEditing("year")}>
                  <input className="vf-input" name="year" placeholder="2025" aria-label={t.projectForm.rowYear}
                    value={form.year} onChange={handleChange} style={{ maxWidth: 160 }} />
                </MoreRow>

                <MoreRow label={t.projectForm.rowTools}
                  value={selectedTools.length ? toolsSummary(selectedTools) : t.projectForm.none}
                  empty={!selectedTools.length}
                  action={t.projectForm.change} doneLabel={t.projectForm.done}
                  open={editing === "tools"} onToggle={() => toggleEditing("tools")}>
                  <div className="flex flex-wrap gap-1.5">
                    {visibleTools.map(tool => {
                      const active = selectedTools.includes(tool.id);
                      return (
                        <button key={tool.id} type="button" onClick={() => toggleTool(tool.id)}
                          data-active={active}
                          className="vf-selectable flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                          style={{ fontSize: "0.8125rem" }}>
                          {active && <span style={{ fontSize: "0.7em" }}>✓</span>}
                          <AiToolLogo id={tool.id} size={13} />
                          <span>{tool.id}</span>
                        </button>
                      );
                    })}
                    <button type="button"
                      onClick={() => setShowAllTools(v => !v)}
                      className="vf-soft-fill px-2.5 py-1 rounded-full"
                      style={{ fontSize: "0.8125rem", fontWeight: 500 }}>
                      {showAllTools
                        ? t.projectForm.less
                        : t.projectForm.showMore(AI_TOOLS.length - AI_TOOLS_INITIAL - hiddenSelectedCount)}
                    </button>
                  </div>
                </MoreRow>

                <MoreRow label={t.projectForm.thumbLabel}
                  value={form.thumbnail ? <ThumbPreview src={form.thumbnail} /> : t.projectForm.auto}
                  empty={!form.thumbnail}
                  action={form.thumbnail ? t.projectForm.change : t.projectForm.upload} doneLabel={t.projectForm.done}
                  open={editing === "thumb"} onToggle={() => toggleEditing("thumb")}>
                  <input ref={thumbnailInputRef} type="file" className="hidden" accept="image/*"
                    onChange={handleThumbnailUpload} />
                  <button type="button"
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
                    className="flex items-center justify-center w-full rounded-xl"
                    style={{ height: 48, background: "var(--surface-soft)", border: "none", cursor: "pointer" }}
                  >
                    {thumbnailUploading ? (
                      <span className="inline-block w-4 h-4 rounded-full border-2 animate-spin"
                        style={{ borderColor: "var(--text-primary)", borderTopColor: "transparent" }} />
                    ) : (
                      <span style={SMALL}>{t.projectForm.dropOrClick}</span>
                    )}
                  </button>
                  <div className="flex flex-wrap items-center gap-2.5 mt-3">
                    <span style={SMALL}>{t.projectForm.thumbTypeLabel}</span>
                    <div className="vf-seg-track">
                      {(["image", "video"] as const).map(mode => (
                        <button key={mode} type="button"
                          onClick={() => setForm(prev => ({ ...prev, type: mode }))}
                          data-active={form.type === mode}
                          className="vf-selectable px-3 py-1 rounded-md"
                          style={{ fontSize: "0.8125rem" }}>
                          {mode === "image" ? t.projectForm.typeImage : t.projectForm.typeVideo}
                        </button>
                      ))}
                    </div>
                    {form.thumbnail && (
                      <button type="button" className="vf-button-text ml-auto" style={{ fontSize: "0.8125rem" }}
                        onClick={() => setForm(prev => ({ ...prev, thumbnail: "" }))}>
                        {t.projectForm.remove}
                      </button>
                    )}
                  </div>
                </MoreRow>

                <MoreRow label={t.projectForm.videoLabel}
                  value={form.video_url ? t.projectForm.added : t.projectForm.none}
                  empty={!form.video_url}
                  action={form.video_url ? t.projectForm.change : t.projectForm.upload} doneLabel={t.projectForm.done}
                  open={editing === "video"} onToggle={() => toggleEditing("video")}>
                  <div className="flex flex-col items-center gap-3">
                    <div className="vf-seg-track">
                      {(["file", "url"] as const).map(m => (
                        <button key={m} type="button" onClick={() => setVideoMode(m)}
                          data-active={videoMode === m}
                          className="vf-selectable px-3 py-1 rounded-md"
                          style={{ fontSize: "0.8125rem" }}>
                          {m === "file" ? t.projectForm.modeFile : t.projectForm.modeUrl}
                        </button>
                      ))}
                    </div>
                    {videoMode === "url" ? (
                      <input className="vf-input" type="url" name="video_url" aria-label={t.projectForm.videoLabel}
                        placeholder={t.projectForm.videoUrlPlaceholder}
                        value={form.video_url} onChange={handleChange} />
                    ) : form.video_url ? (
                      <div className="flex items-center gap-3">
                        <p className="flex items-center gap-1.5"
                          style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
                          <CheckIcon />{t.projectForm.videoConnected}
                        </p>
                        <button type="button" className="vf-button-text" style={{ fontSize: "0.8125rem" }}
                          onClick={() => { setForm(prev => ({ ...prev, video_url: "" })); setVideoError(""); }}>
                          {t.projectForm.remove}
                        </button>
                      </div>
                    ) : (
                      <>
                        <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleVideoFile(f); }} />
                        <button type="button" disabled={videoUploading}
                          onClick={() => videoInputRef.current?.click()}
                          className="vf-file-pick"
                          data-disabled={videoUploading || undefined}>
                          {videoUploading ? t.projectForm.uploading : t.projectForm.videoPickInline}
                        </button>
                      </>
                    )}
                    {videoError && <p className="text-center" style={ERROR}>{videoError}</p>}
                  </div>
                </MoreRow>

                {/* 촬영 워커가 브리핑에 넣는 제작자 메모(demo_user_hint) — 살아 있는 칸 */}
                <MoreRow label={t.projectForm.hintLabel}
                  value={hint || t.projectForm.none} empty={!hint}
                  action={t.projectForm.change} doneLabel={t.projectForm.done}
                  open={editing === "hint"} onToggle={() => toggleEditing("hint")}>
                  <textarea className="vf-input" name="demo_user_hint" rows={3} aria-label={t.projectForm.hintLabel}
                    placeholder={t.projectForm.hintPlaceholder}
                    value={form.demo_user_hint ?? ""} onChange={handleChange}
                    maxLength={500}
                    style={{ resize: "vertical", lineHeight: 1.6 }} />
                </MoreRow>
              </div>
            )}
          </div>

          <div className="flex flex-col items-center gap-2.5 px-6 py-4" style={{ borderTop: "1px solid var(--border)" }}>
            {saveError && (
              <p role="alert" style={{ ...ERROR, fontWeight: 600, textAlign: "center" }}>{saveError}</p>
            )}
            <div className="flex justify-center gap-2.5">
              <button type="button" onClick={onClose} className="vf-button-ghost" style={FOOT_BUTTON}>
                {t.projectForm.close}
              </button>
              <button type="submit" disabled={saving || uploading} className="vf-button-primary" style={FOOT_BUTTON}>
                {saving ? t.projectForm.saving : submitLabel}
              </button>
            </div>
          </div>
        </form>
      </div>

      {swapOpen && (
        <Modal onClose={closeSwap} ariaLabel={t.projectForm.swapTitle} maxWidth="30rem" padding={0}>
          <form onSubmit={applySwap} className="flex flex-col" style={{ maxHeight: "85vh" }}>
            <div className="flex items-center gap-3 px-6 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
              <h3 className="flex-1 vf-serif-display" style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0 }}>
                {t.projectForm.swapTitle}
              </h3>
              <CloseButton onClick={closeSwap} label={t.projectForm.closeAria} />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 flex flex-col gap-4">
              <div className="vf-seg-track">
                {(["url", "files"] as const).map(mode => (
                  <button key={mode} type="button" onClick={() => setUploadMode(mode)}
                    data-active={uploadMode === mode}
                    className="vf-selectable flex-1 py-2 rounded-lg"
                    style={{ fontSize: "0.875rem" }}>
                    {mode === "url" ? t.projectForm.urlOptionTitle : t.projectForm.filesOptionTitle}
                  </button>
                ))}
              </div>

              {uploadMode === "url" ? (
                <input className="vf-input" type="url" aria-label={t.projectForm.urlOptionTitle}
                  placeholder="https://myproject.vercel.app"
                  value={swapUrl} onChange={e => setSwapUrl(e.target.value)} />
              ) : (
                <>
                  <input ref={fileInputRef} type="file" className="hidden" multiple
                    accept=".html,.css,.js,.ts,.jsx,.tsx,.json,.svg,.png,.jpg,.jpeg,.gif,.webp,.woff,.woff2,.ttf,.zip"
                    onChange={e => e.target.files && handleFilesUpload(e.target.files)} />
                  <input ref={folderInputRef} type="file" className="hidden"
                    {...{ webkitdirectory: "", multiple: true } as React.InputHTMLAttributes<HTMLInputElement>}
                    onChange={e => e.target.files && handleFilesUpload(e.target.files)} />
                  <div className="flex flex-col items-center gap-3 rounded-xl"
                    onDragOver={e => { e.preventDefault(); e.currentTarget.setAttribute("data-drag", "1"); }}
                    onDragLeave={e => e.currentTarget.removeAttribute("data-drag")}
                    onDrop={e => {
                      e.preventDefault();
                      e.currentTarget.removeAttribute("data-drag");
                      if (e.dataTransfer.files.length) handleFilesUpload(e.dataTransfer.files);
                    }}
                    style={{ padding: "1.5rem 1rem", background: "var(--surface-soft)" }}>
                    <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true" style={{ color: "var(--border-bright)" }}>
                      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2h9A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" fill="currentColor" />
                    </svg>
                    <p className="text-center" style={SMALL}>{t.projectForm.dropHelpEdit}</p>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <button type="button" className="vf-file-pick" onClick={() => fileInputRef.current?.click()}>
                        {t.projectForm.pickFiles}
                      </button>
                      <button type="button" className="vf-button-text" style={{ fontSize: "0.8125rem" }}
                        onClick={() => folderInputRef.current?.click()}>
                        {t.projectForm.pickFolder}
                      </button>
                    </div>
                  </div>
                  {uploading && (
                    <div className="flex flex-col gap-2">
                      <div className="flex justify-between" style={SMALL}>
                        <span>{t.projectForm.uploading}</span><span className="vf-mono">{uploadProgress}%</span>
                      </div>
                      <div className="vf-meter">
                        <div className="vf-meter-fill transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                      </div>
                    </div>
                  )}
                  {staged && !uploading && (
                    <p className="flex items-center justify-center gap-1.5 min-w-0"
                      style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
                      <CheckIcon /><span className="truncate">{staged.name}</span>
                    </p>
                  )}
                  {uploadError && <p className="text-center" style={ERROR}>{uploadError}</p>}
                  {droppedFiles.length > 0 && !uploading && (
                    <div
                      className="rounded-lg px-3 py-2.5"
                      style={{ ...SMALL, background: "var(--blue-tint)", lineHeight: 1.5 }}
                    >
                      <p style={{ margin: 0, color: "var(--text-primary)" }}>{t.projectForm.secretFilesSkipped}</p>
                      <ul className="mt-1 space-y-0.5">
                        {droppedFiles.map((line) => (
                          <li key={line}>· {line}</li>
                        ))}
                      </ul>
                      <p className="mt-1.5" style={{ marginBottom: 0 }}>{t.projectForm.secretFilesWhy}</p>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex justify-center gap-2.5 px-6 py-4" style={{ borderTop: "1px solid var(--border)" }}>
              {filesDone ? (
                <button type="submit" className="vf-button-primary" style={FOOT_BUTTON}>
                  {t.projectForm.done}
                </button>
              ) : (
                <>
                  <button type="button" onClick={closeSwap} disabled={uploading} className="vf-button-ghost" style={FOOT_BUTTON}>
                    {t.projectForm.close}
                  </button>
                  {uploadMode === "url" && (
                    <button type="submit" disabled={!canApplySwap} className="vf-button-primary" style={FOOT_BUTTON}>
                      {t.projectForm.replace}
                    </button>
                  )}
                </>
              )}
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// '더 보기' 목록의 한 줄: 이름 · 지금 값 · 작은 버튼. 버튼을 누르면 줄 아래에 편집 칸이 열린다.
function MoreRow({ label, value, empty, action, doneLabel, open, onToggle, first, children }: {
  label: string;
  value: React.ReactNode;
  empty?: boolean;
  action: string;
  doneLabel: string;
  open: boolean;
  onToggle: () => void;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={first ? undefined : { borderTop: "1px solid var(--surface)" }}>
      <div className="flex items-center gap-3" style={{ minHeight: 48, padding: "0.5rem 0.75rem 0.5rem 1rem" }}>
        <span style={{ ...SMALL, flexShrink: 0 }}>{label}</span>
        <span className="flex-1 min-w-0 truncate text-right"
          style={{ fontSize: "0.875rem", fontWeight: 600, fontFamily: "var(--font-nunito)", color: empty ? "var(--text-muted)" : "var(--text-primary)" }}>
          {value}
        </span>
        <button type="button" onClick={onToggle} aria-expanded={open} style={MINI} className="transition-opacity hover:opacity-75">
          {open ? doneLabel : action}
        </button>
      </div>
      {open && (
        <div style={{ margin: "0 0.5rem 0.5rem", padding: "0.875rem", borderRadius: 12, background: "var(--surface)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

function ThumbPreview({ src }: { src: string }) {
  return (
    <span className="relative inline-block overflow-hidden align-middle"
      style={{ width: 44, height: 28, borderRadius: 6, background: "var(--surface)" }}>
      <Image src={src} unoptimized alt="" fill className="object-cover" sizes="44px" />
    </span>
  );
}

function CloseButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className="vf-soft-fill flex items-center justify-center rounded-full"
      style={{ width: 32, height: 32, flexShrink: 0 }}
      aria-label={label}>
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M2.5 7l3 3 6-6.5" stroke="var(--text-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// 올린 것의 이름 — 파일 하나면 그 이름, 폴더면 폴더 이름, 여러 파일이면 첫 파일 +N.
function uploadName(files: File[]) {
  if (files.length === 1) return files[0].name;
  const folder = files[0].webkitRelativePath.split("/")[0];
  return folder || `${files[0].name} +${files.length - 1}`;
}

// /api/preview/{uid}/{projectId}/{entry} → entry(보통 index.html). 내부 경로 앞부분은 숨긴다.
function uploadEntry(demoUrl: string) {
  return demoUrl.split("/").slice(5).join("/") || null;
}

function shortUrl(url: string) {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function toolsSummary(tools: string[]) {
  return tools.length <= 2 ? tools.join(", ") : `${tools.slice(0, 2).join(", ")} +${tools.length - 2}`;
}
