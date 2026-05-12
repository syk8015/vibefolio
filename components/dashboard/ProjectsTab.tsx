"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const MIME_TYPES: Record<string, string> = {
  html: "text/html", htm: "text/html", css: "text/css",
  js: "application/javascript", ts: "application/javascript",
  jsx: "application/javascript", tsx: "application/javascript",
  json: "application/json", svg: "image/svg+xml",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf",
  ico: "image/x-icon",
};

function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

const CONTENT_TYPES = [
  { id: "web-app",   label: "웹 앱",        emoji: "🌐" },
  { id: "saas",      label: "SaaS",         emoji: "☁️" },
  { id: "mobile",    label: "모바일 앱",     emoji: "📱" },
  { id: "game",      label: "게임",          emoji: "🎮" },
  { id: "extension", label: "크롬 익스텐션", emoji: "🧩" },
  { id: "ai-service",label: "AI 서비스",     emoji: "🤖" },
  { id: "media",     label: "미디어 컨텐츠", emoji: "🎨" },
  { id: "other",     label: "기타",          emoji: "📦" },
];

export const AI_TOOLS = [
  { id: "ChatGPT",        emoji: "💬" },
  { id: "Claude Code",    emoji: "🟠" },
  { id: "Cursor",         emoji: "🖱️" },
  { id: "GitHub Copilot", emoji: "🐙" },
  { id: "Gemini",         emoji: "✨" },
  { id: "v0",             emoji: "▲" },
  { id: "Bolt.new",       emoji: "⚡" },
  { id: "Windsurf",       emoji: "🏄" },
  { id: "Lovable",        emoji: "💜" },
  { id: "Replit AI",      emoji: "🔁" },
  { id: "Devin",          emoji: "🤖" },
  { id: "Aider",          emoji: "💻" },
  { id: "Continue.dev",   emoji: "🔗" },
  { id: "Codeium",        emoji: "🟢" },
  { id: "Amazon Q",       emoji: "🟡" },
  { id: "Perplexity",     emoji: "🔮" },
  { id: "Midjourney",     emoji: "🎨" },
  { id: "DALL-E",         emoji: "🖼️" },
  { id: "Stable Diffusion", emoji: "🌊" },
  { id: "Ideogram",       emoji: "🔤" },
  { id: "Flux",           emoji: "🌀" },
  { id: "Runway",         emoji: "🎬" },
  { id: "Kling",          emoji: "📹" },
  { id: "Pika",           emoji: "🎞️" },
  { id: "Suno",           emoji: "🎵" },
  { id: "ElevenLabs",     emoji: "🎙️" },
];

const AI_TOOLS_INITIAL = 5;

interface DBProject {
  id: string;
  title: string;
  description: string;
  type: "image" | "video";
  content_type: string | null;
  thumbnail: string;
  year: string;
  tags: string[];
  demo_url: string;
  comment: string;
  sort_order: number;
}

type ProjectForm = Omit<DBProject, "id" | "sort_order">;

const EMPTY_FORM: ProjectForm = {
  title: "",
  description: "",
  type: "image",
  content_type: null,
  thumbnail: "",
  year: new Date().getFullYear().toString(),
  tags: [],
  demo_url: "",
  comment: "",
};

function isUploadedProject(demoUrl: string) {
  return demoUrl?.startsWith("/api/preview/");
}

async function deleteProjectFiles(supabase: ReturnType<typeof createClient>, demoUrl: string) {
  if (!isUploadedProject(demoUrl)) return;
  try {
    const parts = demoUrl.replace("/api/preview/", "").split("/");
    const userId = parts[0];
    const projectId = parts[1];
    if (!userId || !projectId) return;
    const folderPath = `${userId}/${projectId}`;
    const { data: files } = await supabase.storage.from("project-files").list(folderPath, { limit: 1000 });
    if (!files?.length) return;
    await supabase.storage.from("project-files").remove(files.map(f => `${folderPath}/${f.name}`));
  } catch { /* ignore */ }
}

export default function ProjectsTab({ user }: { user: User }) {
  const [projects, setProjects] = useState<DBProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editProject, setEditProject] = useState<DBProject | null>(null);

  useEffect(() => { loadProjects(); }, []);

  async function loadProjects() {
    const supabase = createClient();
    const { data } = await supabase
      .from("projects").select("*").eq("user_id", user.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    setProjects((data as DBProject[]) ?? []);
    setLoading(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("이 프로젝트를 삭제할까요?")) return;
    const supabase = createClient();
    const project = projects.find(p => p.id === id);
    if (project?.demo_url) await deleteProjectFiles(supabase, project.demo_url);
    await supabase.from("projects").delete().eq("id", id);
    setProjects(prev => prev.filter(p => p.id !== id));
  }

  async function handleAdd(form: ProjectForm) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("projects")
      .insert({ ...form, user_id: user.id, sort_order: projects.length })
      .select().single();
    if (!error && data) setProjects(prev => [...prev, data as DBProject]);
    setShowAddModal(false);
  }

  async function handleEdit(id: string, form: ProjectForm) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("projects").update(form).eq("id", id).select().single();
    if (!error && data) {
      setProjects(prev => prev.map(p => p.id === id ? (data as DBProject) : p));
    }
    setEditProject(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 rounded-full border-2 animate-spin"
          style={{ borderColor: "var(--blue)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
          {projects.length}개의 프로젝트
        </p>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black transition-opacity hover:opacity-85"
          style={{ background: "var(--blue)", color: "#fff", fontFamily: "var(--font-nunito)", border: "none", cursor: "pointer", boxShadow: "0 0 16px var(--blue-glow)" }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          프로젝트 추가
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {projects.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>아직 프로젝트가 없어요</p>
            <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>위 버튼으로 첫 프로젝트를 추가해보세요!</p>
          </div>
        ) : (
          projects.map(project => (
            <ProjectRow key={project.id} project={project}
              onDelete={() => handleDelete(project.id)}
              onEdit={() => setEditProject(project)} />
          ))
        )}
      </div>

      {showAddModal && (
        <ProjectFormModal title="새 프로젝트 추가" initialForm={EMPTY_FORM}
          onClose={() => setShowAddModal(false)} onSubmit={handleAdd}
          submitLabel="추가하기" userId={user.id} />
      )}

      {editProject && (
        <ProjectFormModal title="프로젝트 수정"
          initialForm={{
            title: editProject.title, description: editProject.description,
            type: editProject.type, content_type: editProject.content_type,
            thumbnail: editProject.thumbnail, year: editProject.year,
            tags: editProject.tags, demo_url: editProject.demo_url,
            comment: editProject.comment,
          }}
          onClose={() => setEditProject(null)}
          onSubmit={form => handleEdit(editProject.id, form)}
          submitLabel="저장하기" userId={user.id} />
      )}
    </div>
  );
}

function ProjectRow({ project, onDelete, onEdit }: {
  project: DBProject; onDelete: () => void; onEdit: () => void;
}) {
  const thumbnail = project.thumbnail || `https://picsum.photos/seed/${project.id}/800/600`;
  const contentType = CONTENT_TYPES.find(c => c.id === project.content_type);

  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl"
      style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
      <div className="relative w-20 h-14 rounded-xl overflow-hidden shrink-0">
        <Image src={thumbnail} alt={project.title} fill className="object-cover" sizes="80px" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <h3 className="font-bold text-sm truncate" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>{project.title}</h3>
          <span className="text-xs shrink-0" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>{project.year}</span>
          {contentType && (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold shrink-0"
              style={{ background: "var(--blue-tint)", border: "1px solid var(--border-bright)", color: "var(--blue-bright)", fontFamily: "var(--font-nunito)", fontSize: "0.6rem" }}>
              {contentType.emoji} {contentType.label}
            </span>
          )}
          {isUploadedProject(project.demo_url) && (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold shrink-0"
              style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e", fontFamily: "var(--font-nunito)", fontSize: "0.6rem" }}>
              업로드
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(project.tags ?? []).map(tag => {
            const tool = AI_TOOLS.find(t => t.id === tag);
            return (
              <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                style={{
                  background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)",
                  color: "#f59e0b", fontSize: "0.62rem", fontWeight: 700, fontFamily: "var(--font-nunito)",
                }}>
                {tool ? `${tool.emoji} ${tag}` : tag}
              </span>
            );
          })}
        </div>
      </div>
      <span className="shrink-0 px-2.5 py-1 rounded-full text-xs font-bold"
        style={{
          background: project.type === "video" ? "rgba(168,85,247,0.1)" : "var(--blue-tint)",
          border: `1px solid ${project.type === "video" ? "rgba(168,85,247,0.35)" : "var(--border-bright)"}`,
          color: project.type === "video" ? "#a855f7" : "var(--blue-bright)",
          fontFamily: "var(--font-nunito)",
        }}>
        {project.type === "video" ? "영상" : "이미지"}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={onEdit} className="p-2 rounded-lg transition-opacity hover:opacity-70"
          style={{ background: "var(--blue-tint)", border: "1px solid var(--border-bright)", cursor: "pointer" }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5zM8.5 3.5l2 2" stroke="var(--blue)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button onClick={onDelete} className="p-2 rounded-lg transition-opacity hover:opacity-70"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", cursor: "pointer" }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 3.5h10M5.5 3.5V2.5h3v1M5 5.5v5M9 5.5v5M3.5 3.5l.5 8h6l.5-8" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

function ProjectFormModal({ title, initialForm, onClose, onSubmit, submitLabel, userId }: {
  title: string;
  initialForm: ProjectForm;
  onClose: () => void;
  onSubmit: (form: ProjectForm) => void;
  submitLabel: string;
  userId: string;
}) {
  const [uploadMode, setUploadMode] = useState<"url" | "files">("url");
  const [form, setForm] = useState({ ...initialForm });
  const [selectedTools, setSelectedTools] = useState<string[]>(initialForm.tags);
  const [showAllTools, setShowAllTools] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [uploadDone, setUploadDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

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

  async function handleFilesUpload(fileList: FileList) {
    setUploadError("");
    setUploadDone(false);
    const files = Array.from(fileList);
    if (!files.length) return;

    const totalSize = files.reduce((acc, f) => acc + f.size, 0);
    if (totalSize > MAX_UPLOAD_BYTES) {
      setUploadError(`총 파일 크기가 10MB를 초과해요. (현재 ${(totalSize / 1024 / 1024).toFixed(1)}MB)`);
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    const supabase = createClient();
    const projectId = crypto.randomUUID();
    let indexHtmlStoragePath: string | null = null;
    let thumbnailStoragePath: string | null = null;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      let relativePath: string;
      if (file.webkitRelativePath) {
        const parts = file.webkitRelativePath.split("/");
        parts.shift();
        relativePath = parts.join("/");
      } else {
        relativePath = file.name;
      }
      const storagePath = `${userId}/${projectId}/${relativePath}`;
      const { error } = await supabase.storage.from("project-files")
        .upload(storagePath, file, { upsert: true, contentType: getMimeType(file.name) });

      if (!error) {
        if (relativePath === "index.html" || (relativePath.endsWith(".html") && !indexHtmlStoragePath)) {
          indexHtmlStoragePath = storagePath;
        }
        if (!thumbnailStoragePath && /\.(jpe?g|png|gif|webp|svg)$/i.test(relativePath)) {
          thumbnailStoragePath = storagePath;
        }
      }
      setUploadProgress(Math.round(((i + 1) / files.length) * 100));
    }

    if (indexHtmlStoragePath) {
      setForm(prev => ({ ...prev, demo_url: `/api/preview/${indexHtmlStoragePath}` }));
    }
    if (thumbnailStoragePath && !form.thumbnail) {
      const { data } = supabase.storage.from("project-files").getPublicUrl(thumbnailStoragePath);
      setForm(prev => ({ ...prev, thumbnail: data.publicUrl }));
    }
    setUploading(false);
    setUploadDone(true);
  }

  function toggleTool(id: string) {
    setSelectedTools(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSubmit({ ...form, tags: selectedTools } as ProjectForm);
    setSaving(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(10px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-2xl rounded-2xl max-h-[92vh] overflow-y-auto"
        style={{ background: "var(--surface)", border: "1px solid var(--border-bright)" }}
      >
        {/* Modal header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4"
          style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
          <h2 className="text-lg font-black" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
            {title}
          </h2>
          <button onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-5">

          {/* Upload mode toggle */}
          <div className="flex gap-1 p-1 rounded-xl"
            style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
            {(["url", "files"] as const).map(mode => (
              <button key={mode} type="button" onClick={() => setUploadMode(mode)}
                className="flex-1 py-2 rounded-lg text-sm font-bold transition-all duration-150"
                style={{
                  background: uploadMode === mode ? "var(--blue)" : "transparent",
                  color: uploadMode === mode ? "#fff" : "var(--text-secondary)",
                  fontFamily: "var(--font-nunito)", border: "none", cursor: "pointer",
                }}>
                {mode === "url" ? "🔗 URL 링크" : "📁 파일 업로드"}
              </button>
            ))}
          </div>

          {/* File upload */}
          {uploadMode === "files" && (
            <div className="flex flex-col gap-3">
              <input ref={fileInputRef} type="file" className="hidden" multiple
                accept=".html,.css,.js,.ts,.jsx,.tsx,.json,.svg,.png,.jpg,.jpeg,.gif,.webp,.woff,.woff2,.ttf"
                onChange={e => e.target.files && handleFilesUpload(e.target.files)} />
              <input ref={folderInputRef} type="file" className="hidden"
                {...{ webkitdirectory: "", multiple: true } as React.InputHTMLAttributes<HTMLInputElement>}
                onChange={e => e.target.files && handleFilesUpload(e.target.files)} />
              <div className="flex flex-col items-center gap-3 p-6 rounded-xl"
                style={{ border: "2px dashed var(--border-bright)", background: "var(--bg)" }}>
                <div className="text-3xl">📂</div>
                <p className="text-xs text-center font-semibold" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
                  HTML, CSS, JS, 이미지 파일 지원 · 최대 10MB
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 rounded-xl text-sm font-bold transition-opacity hover:opacity-75"
                    style={{ border: "1px solid var(--border-bright)", color: "var(--text-primary)", background: "var(--surface)", fontFamily: "var(--font-nunito)", cursor: "pointer" }}>
                    파일 선택
                  </button>
                  <button type="button" onClick={() => folderInputRef.current?.click()}
                    className="px-4 py-2 rounded-xl text-sm font-bold transition-opacity hover:opacity-75"
                    style={{ border: "1px solid var(--border-bright)", color: "var(--text-primary)", background: "var(--surface)", fontFamily: "var(--font-nunito)", cursor: "pointer" }}>
                    폴더 선택
                  </button>
                </div>
              </div>
              {uploading && (
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between text-xs font-semibold"
                    style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
                    <span>업로드 중...</span><span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full" style={{ background: "var(--bg)" }}>
                    <div className="h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%`, background: "var(--blue)" }} />
                  </div>
                </div>
              )}
              {uploadDone && !uploading && (
                <p className="text-sm font-bold" style={{ color: "#22c55e", fontFamily: "var(--font-nunito)" }}>
                  ✓ 업로드 완료! 아래 정보를 입력하고 저장하세요.
                </p>
              )}
              {uploadError && (
                <p className="text-sm font-bold" style={{ color: "#ef4444", fontFamily: "var(--font-nunito)" }}>
                  {uploadError}
                </p>
              )}
            </div>
          )}

          {/* URL input */}
          {uploadMode === "url" && (
            <Field label="데모 URL">
              <input className="vf-input" name="demo_url" type="url"
                placeholder="https://myproject.vercel.app"
                value={form.demo_url} onChange={handleChange} />
            </Field>
          )}

          {/* 프로젝트 이름 + 연도 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="프로젝트 이름">
                <input className="vf-input" name="title" placeholder="My Awesome Project"
                  value={form.title} onChange={handleChange} required />
              </Field>
            </div>
            <Field label="제작 연도">
              <input className="vf-input" name="year" placeholder="2025"
                value={form.year} onChange={handleChange} />
            </Field>
          </div>

          {/* 설명 */}
          <Field label="설명">
            <textarea className="vf-input" name="description" placeholder="어떤 프로젝트인지 소개해주세요."
              value={form.description} onChange={handleChange} rows={2}
              style={{ resize: "vertical" }} />
          </Field>

          {/* 썸네일 유형 + 콘텐츠 유형 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-2"
                style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", letterSpacing: "0.05em" }}>
                썸네일 유형
              </label>
              <div className="flex gap-2">
                {(["image", "video"] as const).map(t => (
                  <button key={t} type="button"
                    onClick={() => setForm(prev => ({ ...prev, type: t }))}
                    className="flex-1 py-2 rounded-xl text-sm font-bold transition-all duration-150"
                    style={{
                      background: form.type === t ? (t === "video" ? "rgba(168,85,247,0.15)" : "var(--blue-tint)") : "var(--bg)",
                      border: `1px solid ${form.type === t ? (t === "video" ? "rgba(168,85,247,0.5)" : "var(--blue)") : "var(--border)"}`,
                      color: form.type === t ? (t === "video" ? "#a855f7" : "var(--blue)") : "var(--text-muted)",
                      fontFamily: "var(--font-nunito)", cursor: "pointer",
                    }}>
                    {t === "image" ? "🖼️ 이미지" : "🎬 영상"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold mb-2"
                style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", letterSpacing: "0.05em" }}>
                콘텐츠 유형
              </label>
              <div className="flex flex-wrap gap-1.5">
                {CONTENT_TYPES.map(ct => {
                  const active = form.content_type === ct.id;
                  return (
                    <button key={ct.id} type="button"
                      onClick={() => setForm(prev => ({ ...prev, content_type: active ? null : ct.id }))}
                      className="px-2.5 py-1 rounded-full text-xs font-bold transition-all duration-100"
                      style={{
                        background: active ? "var(--blue-tint)" : "var(--bg)",
                        border: `1px solid ${active ? "var(--blue)" : "var(--border)"}`,
                        color: active ? "var(--blue)" : "var(--text-muted)",
                        fontFamily: "var(--font-nunito)", cursor: "pointer",
                      }}>
                      {ct.emoji} {ct.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 썸네일 URL */}
          <Field label="썸네일 URL">
            <input className="vf-input" name="thumbnail" type="url"
              placeholder="https://..."
              value={form.thumbnail} onChange={handleChange} />
          </Field>

          {/* AI 도구 */}
          <div>
            <label className="block text-xs font-bold mb-2"
              style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", letterSpacing: "0.05em" }}>
              사용한 AI 도구{" "}
              <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(복수 선택)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {visibleTools.map(tool => {
                const active = selectedTools.includes(tool.id);
                return (
                  <button key={tool.id} type="button" onClick={() => toggleTool(tool.id)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold transition-all duration-100"
                    style={{
                      background: active ? "rgba(245,158,11,0.15)" : "var(--bg)",
                      border: `1px solid ${active ? "rgba(245,158,11,0.6)" : "var(--border)"}`,
                      color: active ? "#f59e0b" : "var(--text-muted)",
                      fontFamily: "var(--font-nunito)", cursor: "pointer",
                    }}>
                    <span>{tool.emoji}</span>
                    <span>{tool.id}</span>
                  </button>
                );
              })}
              <button type="button"
                onClick={() => setShowAllTools(v => !v)}
                className="px-2.5 py-1 rounded-full text-xs font-bold transition-all duration-100"
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-nunito)", cursor: "pointer",
                }}>
                {showAllTools
                  ? "접기 ↑"
                  : `더보기 +${AI_TOOLS.length - AI_TOOLS_INITIAL - hiddenSelectedCount}`}
              </button>
            </div>
          </div>

          {/* 한 마디 */}
          <Field label="한 마디 (말풍선에 표시)">
            <input className="vf-input" name="comment" placeholder="제가 제일 아끼는 작업물이에요! ⭐"
              value={form.comment} onChange={handleChange} />
          </Field>

          {/* Actions */}
          <div className="flex gap-3 pt-1 pb-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold"
              style={{ border: "1px solid var(--border-bright)", color: "var(--text-secondary)", background: "none", fontFamily: "var(--font-nunito)", cursor: "pointer" }}>
              취소
            </button>
            <button type="submit" disabled={saving || uploading}
              className="flex-1 py-2.5 rounded-xl text-sm font-black transition-opacity hover:opacity-85 disabled:opacity-50"
              style={{ background: "var(--blue)", color: "#fff", fontFamily: "var(--font-nunito)", border: "none", cursor: (saving || uploading) ? "not-allowed" : "pointer" }}>
              {saving ? "저장 중..." : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold mb-1.5"
        style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", letterSpacing: "0.05em" }}>
        {label}
      </label>
      {children}
    </div>
  );
}
