"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

interface DBProject {
  id: string;
  title: string;
  description: string;
  type: "image" | "video";
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
  thumbnail: "",
  year: new Date().getFullYear().toString(),
  tags: [],
  demo_url: "",
  comment: "",
};

export default function ProjectsTab({ user }: { user: User }) {
  const [projects, setProjects] = useState<DBProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editProject, setEditProject] = useState<DBProject | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    const supabase = createClient();
    const { data } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    setProjects((data as DBProject[]) ?? []);
    setLoading(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("이 프로젝트를 삭제할까요?")) return;
    const supabase = createClient();
    await supabase.from("projects").delete().eq("id", id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleAdd(form: ProjectForm) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("projects")
      .insert({ ...form, user_id: user.id, sort_order: projects.length })
      .select()
      .single();
    if (!error && data) {
      setProjects((prev) => [...prev, data as DBProject]);
    }
    setShowAddModal(false);
  }

  async function handleEdit(id: string, form: ProjectForm) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("projects")
      .update(form)
      .eq("id", id)
      .select()
      .single();
    if (!error && data) {
      setProjects((prev) => prev.map((p) => (p.id === id ? (data as DBProject) : p)));
    }
    setEditProject(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "var(--blue)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
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

      {/* Project list */}
      <div className="flex flex-col gap-3">
        {projects.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
              아직 프로젝트가 없어요
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
              위 버튼으로 첫 프로젝트를 추가해보세요!
            </p>
          </div>
        ) : (
          projects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              onDelete={() => handleDelete(project.id)}
              onEdit={() => setEditProject(project)}
            />
          ))
        )}
      </div>

      {/* Add modal */}
      {showAddModal && (
        <ProjectModal
          title="새 프로젝트 추가"
          initialForm={EMPTY_FORM}
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAdd}
          submitLabel="추가하기"
        />
      )}

      {/* Edit modal */}
      {editProject && (
        <ProjectModal
          title="프로젝트 수정"
          initialForm={{
            title: editProject.title,
            description: editProject.description,
            type: editProject.type,
            thumbnail: editProject.thumbnail,
            year: editProject.year,
            tags: editProject.tags,
            demo_url: editProject.demo_url,
            comment: editProject.comment,
          }}
          onClose={() => setEditProject(null)}
          onSubmit={(form) => handleEdit(editProject.id, form)}
          submitLabel="저장하기"
        />
      )}
    </div>
  );
}

const AI_KEYWORDS = ["claude", "gpt", "gemini", "llm", "ai"];

function ProjectRow({
  project,
  onDelete,
  onEdit,
}: {
  project: DBProject;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const thumbnail = project.thumbnail || `https://picsum.photos/seed/${project.id}/800/600`;

  return (
    <div
      className="flex items-center gap-4 p-4 rounded-2xl"
      style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
    >
      {/* Thumbnail */}
      <div className="relative w-20 h-14 rounded-xl overflow-hidden shrink-0">
        <Image src={thumbnail} alt={project.title} fill className="object-cover" sizes="80px" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-bold text-sm truncate" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
            {project.title}
          </h3>
          <span className="text-xs shrink-0" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
            {project.year}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(project.tags ?? []).map((tag) => {
            const ai = AI_KEYWORDS.some((k) => tag.toLowerCase().includes(k));
            return (
              <span key={tag} className="px-2 py-0.5 rounded-full"
                style={{
                  background: ai ? "rgba(234,179,8,0.1)" : "var(--blue-tint)",
                  border: `1px solid ${ai ? "rgba(234,179,8,0.35)" : "var(--border-bright)"}`,
                  color: ai ? "#eab308" : "var(--blue-bright)",
                  fontSize: "0.6rem", fontWeight: 700, fontFamily: "var(--font-nunito)",
                  letterSpacing: "0.08em", textTransform: "uppercase",
                }}>
                {tag}
              </span>
            );
          })}
        </div>
      </div>

      {/* Type badge */}
      <span className="shrink-0 px-2.5 py-1 rounded-full text-xs font-bold"
        style={{
          background: project.type === "video" ? "rgba(168,85,247,0.1)" : "var(--blue-tint)",
          border: `1px solid ${project.type === "video" ? "rgba(168,85,247,0.35)" : "var(--border-bright)"}`,
          color: project.type === "video" ? "#a855f7" : "var(--blue-bright)",
          fontFamily: "var(--font-nunito)",
        }}>
        {project.type === "video" ? "영상" : "이미지"}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onEdit}
          className="p-2 rounded-lg transition-opacity hover:opacity-70"
          style={{ background: "var(--blue-tint)", border: "1px solid var(--border-bright)", cursor: "pointer" }}
          title="수정"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5zM8.5 3.5l2 2" stroke="var(--blue)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button
          onClick={onDelete}
          className="p-2 rounded-lg transition-opacity hover:opacity-70"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", cursor: "pointer" }}
          title="삭제"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 3.5h10M5.5 3.5V2.5h3v1M5 5.5v5M9 5.5v5M3.5 3.5l.5 8h6l.5-8" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

function ProjectModal({
  title,
  initialForm,
  onClose,
  onSubmit,
  submitLabel,
}: {
  title: string;
  initialForm: ProjectForm;
  onClose: () => void;
  onSubmit: (form: ProjectForm) => void;
  submitLabel: string;
}) {
  const [form, setForm] = useState({ ...initialForm, tags: initialForm.tags.join(", ") });
  const [saving, setSaving] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSubmit({
      ...form,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
    } as ProjectForm);
    setSaving(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--surface)", border: "1px solid var(--border-bright)" }}
      >
        <div className="flex items-center justify-between mb-6">
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

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <ModalField label="프로젝트 이름">
            <input className="vf-input" name="title" placeholder="My Awesome Project"
              value={form.title} onChange={handleChange} required />
          </ModalField>

          <ModalField label="설명">
            <textarea className="vf-input" name="description" placeholder="어떤 프로젝트인지 소개해주세요."
              value={form.description} onChange={handleChange} rows={2} style={{ resize: "vertical" }} />
          </ModalField>

          <ModalField label="유형">
            <select className="vf-input" name="type" value={form.type} onChange={handleChange}
              style={{ cursor: "pointer" }}>
              <option value="image">이미지</option>
              <option value="video">영상</option>
            </select>
          </ModalField>

          <ModalField label="태그 (쉼표로 구분)">
            <input className="vf-input" name="tags" placeholder="React, Claude API, Tailwind"
              value={form.tags} onChange={handleChange} />
          </ModalField>

          <ModalField label="썸네일 URL">
            <input className="vf-input" name="thumbnail" type="url"
              placeholder="https://picsum.photos/seed/myproject/800/600"
              value={form.thumbnail} onChange={handleChange} />
          </ModalField>

          <ModalField label="데모 URL">
            <input className="vf-input" name="demo_url" type="url"
              placeholder="https://myproject.vercel.app"
              value={form.demo_url} onChange={handleChange} />
          </ModalField>

          <ModalField label="제작 연도">
            <input className="vf-input" name="year" placeholder="2025"
              value={form.year} onChange={handleChange} />
          </ModalField>

          <ModalField label="한 마디 (말풍선에 표시)">
            <input className="vf-input" name="comment" placeholder="제가 제일 아끼는 작업물이에요! ⭐"
              value={form.comment} onChange={handleChange} />
          </ModalField>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold"
              style={{ border: "1px solid var(--border-bright)", color: "var(--text-secondary)", background: "none", fontFamily: "var(--font-nunito)", cursor: "pointer" }}>
              취소
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-black transition-opacity hover:opacity-85 disabled:opacity-50"
              style={{ background: "var(--blue)", color: "#fff", fontFamily: "var(--font-nunito)", border: "none", cursor: saving ? "not-allowed" : "pointer" }}>
              {saving ? "저장 중..." : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
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
