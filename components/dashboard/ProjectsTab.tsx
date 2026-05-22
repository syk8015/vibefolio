"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import ProjectCard from "@/components/ProjectCard";
import type { Project } from "@/lib/data";

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
  { id: "ChatGPT"          },
  { id: "Claude Code"      },
  { id: "Cursor"           },
  { id: "GitHub Copilot"   },
  { id: "Gemini"           },
  { id: "v0"               },
  { id: "Bolt.new"         },
  { id: "Windsurf"         },
  { id: "Lovable"          },
  { id: "Replit AI"        },
  { id: "Devin"            },
  { id: "Aider"            },
  { id: "Continue.dev"     },
  { id: "Codeium"          },
  { id: "Amazon Q"         },
  { id: "Perplexity"       },
  { id: "Midjourney"       },
  { id: "DALL-E"           },
  { id: "Stable Diffusion" },
  { id: "Ideogram"         },
  { id: "Flux"             },
  { id: "Runway"           },
  { id: "Kling"            },
  { id: "Pika"             },
  { id: "Suno"             },
  { id: "ElevenLabs"       },
];

const AI_TOOL_DOMAINS: Record<string, string> = {
  "ChatGPT":           "chatgpt.com",
  "Claude Code":       "claude.ai",
  "Cursor":            "cursor.com",
  "GitHub Copilot":    "github.com",
  "Gemini":            "gemini.google.com",
  "v0":                "v0.dev",
  "Bolt.new":          "bolt.new",
  "Windsurf":          "windsurf.com",
  "Lovable":           "lovable.dev",
  "Replit AI":         "replit.com",
  "Devin":             "cognition.ai",
  "Aider":             "aider.chat",
  "Continue.dev":      "continue.dev",
  "Codeium":           "codeium.com",
  "Amazon Q":          "aws.amazon.com",
  "Perplexity":        "perplexity.ai",
  "Midjourney":        "midjourney.com",
  "DALL-E":            "openai.com",
  "Stable Diffusion":  "stability.ai",
  "Ideogram":          "ideogram.ai",
  "Flux":              "blackforestlabs.ai",
  "Runway":            "runwayml.com",
  "Kling":             "klingai.com",
  "Pika":              "pika.art",
  "Suno":              "suno.com",
  "ElevenLabs":        "elevenlabs.io",
};

function AiToolLogo({ id, size = 13 }: { id: string; size?: number }) {
  const domain = AI_TOOL_DOMAINS[id];
  if (!domain) return null;
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
      alt={id}
      width={size}
      height={size}
      style={{ borderRadius: 3, display: "block", flexShrink: 0 }}
    />
  );
}

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
  is_featured: boolean;
  video_url: string;
}

type ProjectForm = Omit<DBProject, "id" | "sort_order" | "is_featured">;

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
  video_url: "",
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
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

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

  async function saveOrder(ordered: DBProject[]) {
    const supabase = createClient();
    await Promise.all(
      ordered.map((p, i) =>
        supabase.from("projects").update({ sort_order: i }).eq("id", p.id)
      )
    );
  }

  function handleDragStart(index: number) {
    setDragIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (index !== dragOverIndex) setDragOverIndex(index);
  }

  function handleDrop(toIndex: number) {
    if (dragIndex === null || dragIndex === toIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const next = [...projects];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(toIndex, 0, moved);
    setProjects(next);
    setDragIndex(null);
    setDragOverIndex(null);
    saveOrder(next);
  }

  function handleDragEnd() {
    setDragIndex(null);
    setDragOverIndex(null);
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
    if (error) throw new Error(error.message);
    if (data) setProjects(prev => [...prev, data as DBProject]);
    setShowAddModal(false);
  }

  async function handleEdit(id: string, form: ProjectForm) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("projects").update(form).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    if (data) setProjects(prev => prev.map(p => p.id === id ? (data as DBProject) : p));
    setEditProject(null);
  }

  function handleMoveUp(index: number) {
    if (index <= 0) return;
    const next = [...projects];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setProjects(next);
    saveOrder(next);
  }

  function handleMoveDown(index: number) {
    if (index >= projects.length - 1) return;
    const next = [...projects];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setProjects(next);
    saveOrder(next);
  }

  async function handleToggleFeatured(id: string) {
    const supabase = createClient();
    const target = projects.find(p => p.id === id);
    if (!target) return;
    const next = !target.is_featured;

    // Optimistic UI: exactly one featured (or zero) at a time
    setProjects(prev => prev.map(p => ({
      ...p,
      is_featured: p.id === id ? next : (next ? false : p.is_featured),
    })));

    // Persist: unset all other featured for this user first, then set target.
    // The partial unique index requires no two rows with is_featured=true.
    if (next) {
      await supabase.from("projects")
        .update({ is_featured: false })
        .eq("user_id", user.id)
        .neq("id", id);
    }
    await supabase.from("projects").update({ is_featured: next }).eq("id", id);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 rounded-full border-2 animate-spin"
          style={{ borderColor: "var(--text-primary)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm vf-mono" style={{ color: "var(--text-secondary)", letterSpacing: "0.02em" }}>
          {projects.length} project{projects.length === 1 ? "" : "s"}
        </p>
        <button
          onClick={() => setShowAddModal(true)}
          className="vf-button-primary"
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          프로젝트 추가
        </button>
      </div>

      <div className="vf-card overflow-hidden">
        {projects.length === 0 ? (
          <div className="text-center py-20 px-6">
            <p
              className="vf-serif-display mb-2"
              style={{ fontSize: "1.15rem", fontWeight: 500 }}
            >
              아직 프로젝트가 없어요
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
              위 버튼으로 첫 프로젝트를 추가해보세요
            </p>
          </div>
        ) : (
          projects.map((project, i) => (
            <ProjectRow
              key={project.id}
              project={project}
              onDelete={() => handleDelete(project.id)}
              onEdit={() => setEditProject(project)}
              onToggleFeatured={() => handleToggleFeatured(project.id)}
              onMoveUp={() => handleMoveUp(i)}
              onMoveDown={() => handleMoveDown(i)}
              canMoveUp={i > 0}
              canMoveDown={i < projects.length - 1}
              isDragging={dragIndex === i}
              isDragOver={dragOverIndex === i && dragIndex !== i}
              isLast={i === projects.length - 1}
              onDragStart={() => handleDragStart(i)}
              onDragOver={e => handleDragOver(e, i)}
              onDrop={() => handleDrop(i)}
              onDragEnd={handleDragEnd}
            />
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
            video_url: editProject.video_url ?? "",
          }}
          onClose={() => setEditProject(null)}
          onSubmit={form => handleEdit(editProject.id, form)}
          submitLabel="저장하기" userId={user.id} />
      )}
    </div>
  );
}

function ProjectRow({ project, onDelete, onEdit, onToggleFeatured, onMoveUp, onMoveDown, canMoveUp, canMoveDown, isDragging, isDragOver, isLast, onDragStart, onDragOver, onDrop, onDragEnd }: {
  project: DBProject;
  onDelete: () => void;
  onEdit: () => void;
  onToggleFeatured: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  isLast: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const thumbnail = project.thumbnail || `https://picsum.photos/seed/${project.id}/800/600`;
  const contentType = CONTENT_TYPES.find(c => c.id === project.content_type);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 p-3 md:p-4 transition-all duration-150"
      style={{
        background: isDragOver ? "var(--blue-tint)" : (project.is_featured ? "var(--blue-tint)" : "var(--surface)"),
        opacity: isDragging ? 0.4 : 1,
        borderBottom: isLast ? "none" : "1px solid var(--border)",
        borderTop: isDragOver ? "2px solid var(--text-primary)" : undefined,
        borderLeft: project.is_featured ? "3px solid var(--text-primary)" : "3px solid transparent",
      }}
    >
      {/* Top section: drag handle (desktop) + thumbnail + info — stays in row even on mobile */}
      <div className="flex items-start md:items-center gap-3 md:gap-4 flex-1 min-w-0">
        {/* Drag handle — desktop only (mobile uses ↑↓ buttons) */}
        <div className="hidden md:flex items-center shrink-0" style={{ color: "var(--text-muted)", cursor: "grab", padding: "4px 2px" }}>
          <svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor">
            <circle cx="3" cy="3" r="1.5"/><circle cx="9" cy="3" r="1.5"/>
            <circle cx="3" cy="9" r="1.5"/><circle cx="9" cy="9" r="1.5"/>
            <circle cx="3" cy="15" r="1.5"/><circle cx="9" cy="15" r="1.5"/>
          </svg>
        </div>

        <div className="relative w-20 h-14 rounded-xl overflow-hidden shrink-0" style={{ border: "1px solid var(--border)" }}>
          <Image src={thumbnail} alt={project.title} fill className="object-cover" sizes="80px" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3
              className="vf-serif-display truncate"
              style={{ fontSize: "1rem", fontWeight: 500, lineHeight: 1.35, margin: 0 }}
            >
              {project.title}
            </h3>
            <span className="text-xs shrink-0 vf-mono" style={{ color: "var(--text-muted)" }}>{project.year}</span>
            {contentType && (
              <span className="px-2 py-0.5 rounded-full text-xs shrink-0"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontSize: "0.6rem", fontWeight: 500 }}>
                {contentType.emoji} {contentType.label}
              </span>
            )}
            {isUploadedProject(project.demo_url) && (
              <span className="px-2 py-0.5 rounded-full text-xs shrink-0 vf-mono"
                style={{ background: "var(--blue-tint)", border: "1px solid var(--border-bright)", color: "var(--text-primary)", fontSize: "0.58rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                upload
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(project.tags ?? []).map(tag => (
              <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                style={{
                  background: "var(--surface)", border: "1px solid var(--border)",
                  color: "var(--text-secondary)", fontSize: "0.62rem", fontWeight: 500, fontFamily: "var(--font-nunito)",
                }}>
                <AiToolLogo id={tag} size={11} />
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom section: type badge + actions. Full-width row on mobile, inline on desktop */}
      <div className="flex items-center gap-2 justify-between md:justify-start shrink-0" onDragStart={e => e.stopPropagation()}>
        <span className="px-2.5 py-1 rounded-full text-xs shrink-0 vf-mono"
          style={{
            background: "transparent",
            border: "1px solid var(--border-bright)",
            color: "var(--text-secondary)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontSize: "0.58rem",
          }}>
          {project.type === "video" ? "video" : "image"}
        </span>

        <div className="flex items-center gap-1.5 md:gap-2">
          {/* Move up/down — mobile only (drag handle on desktop) */}
          <button onClick={onMoveUp} disabled={!canMoveUp} title="위로"
            className="md:hidden p-2 rounded-full transition-opacity hover:opacity-70 disabled:opacity-30"
            style={{ background: "transparent", border: "1px solid var(--border-bright)", cursor: canMoveUp ? "pointer" : "not-allowed" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 8l4-4 4 4" stroke="var(--text-secondary)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button onClick={onMoveDown} disabled={!canMoveDown} title="아래로"
            className="md:hidden p-2 rounded-full transition-opacity hover:opacity-70 disabled:opacity-30"
            style={{ background: "transparent", border: "1px solid var(--border-bright)", cursor: canMoveDown ? "pointer" : "not-allowed" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 6l4 4 4-4" stroke="var(--text-secondary)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          <button
            onClick={onToggleFeatured}
            title={project.is_featured ? "대표 작품 해제" : "대표 작품으로 설정"}
            className="p-2 rounded-full transition-colors"
            style={{
              background: "transparent",
              border: `1px solid ${project.is_featured ? "var(--text-primary)" : "var(--border-bright)"}`,
              cursor: "pointer",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill={project.is_featured ? "var(--text-primary)" : "none"} stroke={project.is_featured ? "var(--text-primary)" : "var(--text-muted)"}>
              <path d="M7 1l1.8 4 4.2.4-3.2 2.9 1 4.2L7 10.4 3.2 12.5l1-4.2L1 5.4l4.2-.4L7 1z" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button onClick={onEdit} title="수정"
            className="p-2 rounded-full transition-colors"
            style={{ background: "transparent", border: "1px solid var(--border-bright)", cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5zM8.5 3.5l2 2" stroke="var(--text-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button onClick={onDelete} title="삭제"
            className="p-2 rounded-full transition-colors"
            style={{ background: "transparent", border: "1px solid var(--border)", cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 3.5h10M5.5 3.5V2.5h3v1M5 5.5v5M9 5.5v5M3.5 3.5l.5 8h6l.5-8" stroke="#b34747" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
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
  const [showPreview, setShowPreview] = useState(false);
  const [previewLayout, setPreviewLayout] = useState<"grid" | "list">("grid");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [thumbnailUploading, setThumbnailUploading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [uploadDone, setUploadDone] = useState(false);
  const [videoMode, setVideoMode] = useState<"file" | "url">("file");
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoError, setVideoError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const previewProject: Project = {
    id: 0,
    title: form.title || "프로젝트 이름",
    description: form.description || "프로젝트 설명이 여기에 표시됩니다.",
    type: form.type,
    contentType: form.content_type,
    thumbnail: form.thumbnail || `https://picsum.photos/seed/preview/800/600`,
    year: form.year || new Date().getFullYear().toString(),
    tags: selectedTools,
    demoUrl: form.demo_url || undefined,
    comment: form.comment || undefined,
  };

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
      setVideoError(`영상은 20MB 이하만 업로드할 수 있어요. (현재 ${(file.size / 1024 / 1024).toFixed(1)}MB)`);
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
      setVideoError("영상 파일을 읽을 수 없어요.");
      return;
    }
    if (duration > 30) {
      setVideoError(`영상은 30초 이하만 업로드할 수 있어요. (현재 ${duration.toFixed(1)}초)`);
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
      setVideoError(`업로드 실패: ${upErr.message}`);
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
      // Auto-fetch OG thumbnail only for external URLs (not uploaded files)
      const isUpload = finalForm.demo_url?.startsWith("/api/preview/");
      if (!finalForm.thumbnail && finalForm.demo_url && !isUpload) {
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
      await onSubmit(finalForm);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "저장 중 오류가 발생했어요.");
    }
    setSaving(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6"
      style={{ background: "var(--overlay-strong)", backdropFilter: "blur(16px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Outer wrapper — width drives centering animation */}
      <div
        className="flex overflow-hidden"
        style={{
          maxHeight: "92vh",
          width: showPreview ? "min(calc(42rem + 361px), calc(100vw - 2rem))" : "min(42rem, calc(100vw - 2rem))",
          transition: "width 0.32s cubic-bezier(0.4,0,0.2,1)",
          background: "var(--surface)",
          border: "1px solid var(--border-bright)",
          borderRadius: 16,
          boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
        }}
      >
        {/* ── Left: form panel — fills container on mobile, 42rem on desktop ── */}
        <div
          className="flex flex-col overflow-y-auto"
          style={{ flex: 1, minWidth: 0 }}
        >

        {/* Modal header */}
        <div className="sticky top-0 z-10 flex items-center gap-3 px-6 py-4"
          style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
          <h2
            className="flex-1 vf-serif-display"
            style={{ fontSize: "1.2rem", fontWeight: 500, margin: 0 }}
          >
            {title}
          </h2>

          {/* Preview toggle — hidden on mobile (preview panel would overflow) */}
          <button
            type="button"
            onClick={() => setShowPreview(v => !v)}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-colors"
            style={{
              background: "transparent",
              border: `1px solid ${showPreview ? "var(--text-primary)" : "var(--border-bright)"}`,
              color: showPreview ? "var(--text-primary)" : "var(--text-secondary)",
              fontFamily: "var(--font-nunito)",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <ellipse cx="6.5" cy="6.5" rx="5.5" ry="3.5" stroke="currentColor" strokeWidth="1.4"/>
              <circle cx="6.5" cy="6.5" r="1.5" fill="currentColor"/>
            </svg>
            카드 미리보기
          </button>

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
                className="flex-1 py-2 rounded-lg text-sm transition-colors"
                style={{
                  background: uploadMode === mode ? "var(--text-primary)" : "transparent",
                  color: uploadMode === mode ? "var(--bg)" : "var(--text-secondary)",
                  fontFamily: "var(--font-nunito)",
                  fontWeight: uploadMode === mode ? 600 : 500,
                  border: "none",
                  cursor: "pointer",
                }}>
                {mode === "url" ? "🔗 URL 링크" : "📁 파일 업로드"}
              </button>
            ))}
          </div>

          {/* File upload */}
          {uploadMode === "files" && (
            <div className="flex flex-col gap-3">
              {/* Guide notice */}
              <div className="flex gap-2.5 px-3.5 py-3 rounded-xl"
                style={{ background: "var(--blue-tint)", border: "1px solid var(--border-bright)" }}>
                <span style={{ fontSize: "0.85rem", flexShrink: 0, marginTop: "1px" }}>💡</span>
                <div style={{ fontFamily: "var(--font-nunito)", fontSize: "0.72rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
                  <span style={{ fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-serif), 'Noto Serif KR', serif" }}>React / Vue / Vite 프로젝트라면</span>{" "}
                  소스 폴더 대신 <code className="vf-mono" style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: "1px 5px", borderRadius: 4, fontSize: "0.68rem", color: "var(--text-primary)" }}>npm run build</code> 후 생성된{" "}
                  <code className="vf-mono" style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: "1px 5px", borderRadius: 4, fontSize: "0.68rem", color: "var(--text-primary)" }}>dist/</code> 폴더를 올려주세요.
                  순수 HTML/CSS/JS 파일은 그대로 올려도 돼요.
                </div>
              </div>

              <input ref={fileInputRef} type="file" className="hidden" multiple
                accept=".html,.css,.js,.ts,.jsx,.tsx,.json,.svg,.png,.jpg,.jpeg,.gif,.webp,.woff,.woff2,.ttf"
                onChange={e => e.target.files && handleFilesUpload(e.target.files)} />
              <input ref={folderInputRef} type="file" className="hidden"
                {...{ webkitdirectory: "", multiple: true } as React.InputHTMLAttributes<HTMLInputElement>}
                onChange={e => e.target.files && handleFilesUpload(e.target.files)} />
              <div className="flex flex-col items-center gap-3 p-6 rounded-xl"
                style={{ border: "1.5px dashed var(--border-bright)", background: "var(--bg)" }}>
                <div className="text-3xl">📂</div>
                <p className="text-xs text-center" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
                  HTML, CSS, JS, 이미지 파일 지원 · 최대 10MB
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="vf-button-ghost" style={{ padding: "0.5rem 1rem", fontSize: "0.8rem" }}>
                    파일 선택
                  </button>
                  <button type="button" onClick={() => folderInputRef.current?.click()} className="vf-button-ghost" style={{ padding: "0.5rem 1rem", fontSize: "0.8rem" }}>
                    폴더 선택
                  </button>
                </div>
              </div>
              {uploading && (
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between text-xs vf-mono"
                    style={{ color: "var(--text-secondary)" }}>
                    <span>업로드 중…</span><span>{uploadProgress}%</span>
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
                  업로드 완료. 아래 정보를 입력하고 저장하세요.
                </p>
              )}
              {uploadError && (
                <p className="text-sm" style={{ color: "#b34747", fontFamily: "var(--font-nunito)" }}>
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

          {/* 구동 영상 (선택) — 대표 작품 hero에서 자동 재생 */}
          <div>
            <label className="vf-label">구동 영상 (선택)</label>
            <p className="text-xs mb-2" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
              대표 작품으로 설정하면 명함 상단에서 자동 재생돼요.
            </p>

            {form.video_url ? (
              <div className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: "var(--blue-tint)", border: "1px solid var(--border-bright)" }}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <polygon points="3,2 13,8 3,14" fill="var(--text-primary)" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs mb-0.5" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontWeight: 600 }}>
                    영상 연결됨
                  </p>
                  <p className="text-xs truncate vf-mono" style={{ color: "var(--text-muted)", fontSize: "0.65rem" }}>
                    {form.video_url}
                  </p>
                </div>
                <button type="button"
                  onClick={() => { setForm(prev => ({ ...prev, video_url: "" })); setVideoError(""); }}
                  className="vf-button-danger"
                  style={{ padding: "0.4rem 0.7rem", fontSize: "0.72rem" }}>
                  제거
                </button>
              </div>
            ) : (
              <>
                {/* Mode toggle */}
                <div className="flex gap-1 mb-2 p-1 rounded-lg w-fit"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  {(["file", "url"] as const).map(m => (
                    <button key={m} type="button" onClick={() => setVideoMode(m)}
                      className="px-3 py-1 rounded-md text-xs transition-colors"
                      style={{
                        background: videoMode === m ? "var(--text-primary)" : "transparent",
                        color: videoMode === m ? "var(--bg)" : "var(--text-muted)",
                        fontWeight: videoMode === m ? 600 : 500,
                        border: "none", cursor: "pointer", fontFamily: "var(--font-nunito)",
                      }}>
                      {m === "file" ? "파일 업로드" : "URL"}
                    </button>
                  ))}
                </div>

                {videoMode === "file" ? (
                  <>
                    <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleVideoFile(f); }} />
                    <button type="button" disabled={videoUploading}
                      onClick={() => videoInputRef.current?.click()}
                      className="w-full py-2.5 rounded-xl text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
                      style={{ background: "var(--bg)", border: "1.5px dashed var(--border-bright)", color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontWeight: 500, cursor: videoUploading ? "not-allowed" : "pointer" }}>
                      {videoUploading ? "업로드 중…" : "+ 영상 파일 선택 (20MB · 30초 이하)"}
                    </button>
                  </>
                ) : (
                  <input className="vf-input" type="url" name="video_url"
                    placeholder="https://youtube.com/watch?v=... 또는 https://vimeo.com/..."
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

          {/* 콘텐츠 유형 — 풀 너비 */}
          <div>
            <label className="vf-label">콘텐츠 유형</label>
            <div className="flex flex-wrap gap-1.5">
              {CONTENT_TYPES.map(ct => {
                const active = form.content_type === ct.id;
                return (
                  <button key={ct.id} type="button"
                    onClick={() => setForm(prev => ({ ...prev, content_type: active ? null : ct.id }))}
                    className="px-2.5 py-1 rounded-full text-xs transition-colors"
                    style={{
                      background: "transparent",
                      border: `1px solid ${active ? "var(--text-primary)" : "var(--border)"}`,
                      color: active ? "var(--text-primary)" : "var(--text-muted)",
                      fontFamily: "var(--font-nunito)",
                      fontWeight: active ? 600 : 500,
                      cursor: "pointer",
                    }}>
                    {ct.emoji} {ct.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 썸네일 업로드 */}
          <div>
            <label className="vf-label">
              썸네일
              <span className="ml-1.5" style={{ color: "var(--text-muted)", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
                (없으면 저장 시 자동 생성)
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
                background: "var(--bg)",
                border: "1.5px dashed var(--border-bright)",
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
                    업로드 완료
                  </span>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setForm(prev => ({ ...prev, thumbnail: "" })); }}
                    style={{ fontSize: "0.7rem", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-nunito)", padding: 0 }}
                  >
                    제거
                  </button>
                </>
              ) : (
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
                  클릭하거나 이미지를 드래그해서 업로드
                </span>
              )}
            </div>
          </div>

          {/* 썸네일 유형 */}
          <div>
            <label className="vf-label">썸네일 유형</label>
            <div className="flex gap-2">
              {(["image", "video"] as const).map(t => {
                const active = form.type === t;
                return (
                  <button key={t} type="button"
                    onClick={() => setForm(prev => ({ ...prev, type: t }))}
                    className="flex-1 py-2 rounded-xl text-sm transition-colors"
                    style={{
                      background: "transparent",
                      border: `1px solid ${active ? "var(--text-primary)" : "var(--border)"}`,
                      color: active ? "var(--text-primary)" : "var(--text-muted)",
                      fontFamily: "var(--font-nunito)",
                      fontWeight: active ? 600 : 500,
                      cursor: "pointer",
                    }}>
                    {t === "image" ? "🖼️ 이미지" : "🎬 영상"}
                  </button>
                );
              })}
            </div>
          </div>

          {/* AI 도구 */}
          <div>
            <label className="vf-label">
              사용한 AI 도구{" "}
              <span style={{ color: "var(--text-muted)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(복수 선택)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {visibleTools.map(tool => {
                const active = selectedTools.includes(tool.id);
                return (
                  <button key={tool.id} type="button" onClick={() => toggleTool(tool.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors"
                    style={{
                      background: "transparent",
                      border: `1px solid ${active ? "var(--text-primary)" : "var(--border)"}`,
                      color: active ? "var(--text-primary)" : "var(--text-muted)",
                      fontFamily: "var(--font-nunito)",
                      fontWeight: active ? 600 : 500,
                      cursor: "pointer",
                    }}>
                    <AiToolLogo id={tool.id} size={13} />
                    <span>{tool.id}</span>
                  </button>
                );
              })}
              <button type="button"
                onClick={() => setShowAllTools(v => !v)}
                className="px-2.5 py-1 rounded-full text-xs transition-colors"
                style={{
                  background: "transparent",
                  border: "1px dashed var(--border-bright)",
                  color: "var(--text-secondary)",
                  fontFamily: "var(--font-nunito)",
                  fontWeight: 500,
                  cursor: "pointer",
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

          {/* Save error */}
          {saveError && (
            <div className="px-4 py-3 rounded-xl text-xs"
              style={{ background: "var(--surface)", border: "1px solid #b34747", color: "#b34747", fontFamily: "var(--font-nunito)", lineHeight: 1.6 }}>
              ⚠ {saveError}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1 pb-1">
            <button type="button" onClick={onClose}
              className="vf-button-ghost flex-1"
              style={{ padding: "0.65rem 1rem" }}>
              취소
            </button>
            <button type="submit" disabled={saving || uploading}
              className="vf-button-primary flex-1"
              style={{ padding: "0.65rem 1rem", cursor: (saving || uploading) ? "not-allowed" : "pointer" }}>
              {saving ? "저장 중…" : submitLabel}
            </button>
          </div>
        </form>
        </div>{/* end left panel */}

        {/* ── Right: live preview panel — width animates, inner content is fixed 360px ── */}
        <div
          style={{
            width: showPreview ? "360px" : "0px",
            flexShrink: 0,
            overflow: "hidden",
            transition: "width 0.32s cubic-bezier(0.4,0,0.2,1)",
          }}
        >
          {/* Inner wrapper: fixed 360px so content never squishes during animation */}
          <div
            className="flex flex-col h-full overflow-y-auto"
            style={{
              width: "360px",
              borderLeft: "1px solid var(--border)",
              background: "var(--bg)",
            }}
          >
            {/* Preview header */}
            <div
              className="sticky top-0 z-10 flex items-center justify-between px-5 py-4"
              style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}
            >
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--text-primary)" }} />
                <span className="text-xs vf-mono" style={{ color: "var(--text-secondary)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  실시간 미리보기
                </span>
              </div>
              {/* Grid / List toggle */}
              <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                {(["grid", "list"] as const).map(l => {
                  const active = previewLayout === l;
                  return (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setPreviewLayout(l)}
                      className="px-2 py-1 rounded-md text-xs transition-colors"
                      style={{
                        background: active ? "var(--text-primary)" : "transparent",
                        color: active ? "var(--bg)" : "var(--text-muted)",
                        border: "none",
                        fontFamily: "var(--font-nunito)",
                        fontWeight: active ? 600 : 500,
                        cursor: "pointer",
                      }}
                    >
                      {l === "grid" ? "그리드" : "리스트"}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Card preview */}
            <div className="p-5">
              <ProjectCard project={previewProject} layout={previewLayout} />
              <p className="text-xs text-center mt-4" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
                명함 페이지에서 실제로 보이는 모습이에요
              </p>
            </div>
          </div>
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
