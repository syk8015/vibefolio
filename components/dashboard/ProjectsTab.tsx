"use client";

import { useState, useEffect, useRef } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { RerecordRequestModal } from "@/components/dashboard/RerecordRequestModal";
import { detectDemoSource } from "@/lib/demoSource";
import { AnalyticsEvent, trackClientEvent } from "@/lib/analytics-client";

import { useT } from "@/lib/i18n/client";
import { deleteSwappedAssets } from "./projects/helpers";
import { type DBProject, type ProjectForm } from "./projects/types";
import { DraftRow, ProjectRow } from "./projects/rows";
import { ProjectFormModal } from "./projects/ProjectFormModal";
import { AddProjectModal } from "./projects/AddProjectModal";
import { DraftReviewModal } from "./projects/DraftReviewModal";
import { useDemoStatusSync } from "./projects/useDemoStatusSync";

// username comes from DashboardClient's profiles row (the handle public links
// actually resolve) — deriving it here from auth metadata could hand ShareKit
// a stale handle when the two sources drift.
export default function ProjectsTab({ user, username, reviewProjectId }: { user: User; username: string; reviewProjectId?: string | null }) {
  const { t } = useT();
  const [projects, setProjects] = useState<DBProject[]>([]);
  const [drafts, setDrafts] = useState<DBProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editProject, setEditProject] = useState<DBProject | null>(null);
  const [reviewDraft, setReviewDraft] = useState<DBProject | null>(null);
  // ?review 딥링크는 첫 매칭 때 한 번만 모달을 연다 — 닫은 뒤 drafts가 갱신될
  // 때마다 다시 열리면 안 되니까.
  const reviewLinkConsumed = useRef(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [rerecordModal, setRerecordModal] = useState<{ id: string; title: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // 촬영 상태 배지의 realtime 구독 + 폴백 폴링 (projects/useDemoStatusSync.ts).
  const { demoPaused, nowMs } = useDemoStatusSync(user.id, projects, drafts, setProjects, setDrafts);

  async function loadProjects() {
    const supabase = createClient();
    const { data } = await supabase
      .from("projects").select("*").eq("user_id", user.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    const all = (data as DBProject[]) ?? [];
    // 초안은 별도 리스트 — 공개 프로젝트의 순서/드래그 인덱스와 섞이지 않게.
    setProjects(all.filter((p) => !p.is_draft));
    setDrafts(all.filter((p) => p.is_draft));
    setLoading(false);
  }

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(t);
  }, [notice]);

  // 마운트 시 1회 데이터 로드. 훅 규칙은 호출된 함수의 await 뒤 setState까지
  // "동기 setState"로 보수 판정하지만, 실제로는 비동기 응답 후 갱신이라
  // 캐스케이드 렌더가 없다. 의존성도 의도적으로 마운트 1회.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { loadProjects(); }, []);

  // ?review=<id> 로 들어오면 그 초안 카드로 스크롤+하이라이트하고, 검토 모달을
  // 바로 연다(메일 링크의 목적지가 곧 검토 화면).
  useEffect(() => {
    if (!reviewProjectId) return;
    const el = document.getElementById(`draft-${reviewProjectId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (!reviewLinkConsumed.current) {
      const match = drafts.find(d => d.id === reviewProjectId);
      if (match) {
        reviewLinkConsumed.current = true;
        // URL 딥링크 1회 소비 — 캐스케이드 없는 단발 오픈이라 보수 판정만 억제.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setReviewDraft(match);
      }
    }
  }, [reviewProjectId, drafts]);

  async function saveOrder(ordered: DBProject[]) {
    const supabase = createClient();
    const results = await Promise.all(
      ordered.map((p, i) =>
        supabase.from("projects").update({ sort_order: i }).eq("id", p.id)
      )
    );
    // 일부만 실패하면 화면과 DB가 조용히 어긋난 채 남는다 — 서버 순서를 다시
    // 실어와 화면을 진실에 맞추고, 실패했다는 사실을 알린다.
    if (results.some((r) => r.error)) {
      setNotice(t.projects.orderSaveFailed);
      loadProjects();
    }
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
    if (!confirm(t.projects.deleteConfirm)) return;

    // Optimistic: drop the row from the list immediately so the click feels instant.
    // The delete takes a few seconds (BFS storage listing + chunked removes + R2),
    // and awaiting it before updating state left the row frozen in place the whole
    // time — that was the perceived lag.
    const removed = projects.find(p => p.id === id) ?? drafts.find(p => p.id === id);
    const removedIndex = projects.findIndex(p => p.id === id);
    setProjects(prev => prev.filter(p => p.id !== id));
    setDrafts(prev => prev.filter(p => p.id !== id));

    // A single server call purges ALL of the project's storage (uploaded files +
    // demo/poster + video/thumbnail on Supabase, demo assets on R2) AND deletes the
    // row. keepalive lets it run to completion even if the user closes the tab right
    // after the row vanishes — otherwise a two-request client sequence could be cut
    // off between the purge and the row delete, leaving the project half-deleted.
    const res = await fetch(`/api/projects/${id}/demo-assets`, {
      method: "DELETE",
      keepalive: true,
    }).catch(() => null);

    if ((!res || !res.ok) && removed) {
      // Delete failed — restore the row and let the user retry.
      if (removed.is_draft) {
        setDrafts(prev => (prev.some(p => p.id === id) ? prev : [removed, ...prev]));
      } else {
        setProjects(prev => {
          if (prev.some(p => p.id === id)) return prev;
          const next = [...prev];
          next.splice(Math.min(removedIndex, next.length), 0, removed);
          return next;
        });
      }
      setNotice(t.projects.deleteFailed);
    }
  }

  async function handleAdd(form: ProjectForm) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("projects")
      .insert({
        ...form,
        demo_user_hint: form.demo_user_hint?.trim() || null,
        user_id: user.id,
        sort_order: projects.length,
      })
      .select().single();
    if (error) throw new Error(error.message);
    if (data) {
      const inserted = data as DBProject;
      // 수동 시연 영상이 있으면 자동 촬영 생략: 노출 순위에서 video_url이 항상
      // 이겨 촬영본이 보일 일이 없으므로 비용·워커 시간만 쓴다(Connect 요청1 합의).
      const source = form.video_url ? null : detectDemoSource(form.demo_url);
      // 자동 시연 영상이 가능한 소스(github URL · 파일 업로드 · 외부 URL)는 잡 트리거 + 옵티미스틱 pending 배지
      const optimistic: DBProject = source
        ? { ...inserted, demo_build_status: "pending", demo_source_type: source.type, demo_source_value: source.value }
        : inserted;
      setProjects(prev => [...prev, optimistic]);
      trackClientEvent(AnalyticsEvent.ProjectCreated, {
        projectId: inserted.id,
        demoSource: source?.type ?? null,
      });
      if (source) {
        // Fire-and-forget on the happy path (realtime moves pending→done). But a
        // trigger that fails emits no realtime row, so the optimistic "pending" badge
        // would spin forever. On any non-OK or network error, revert to the saved row
        // and tell them the project saved but the demo didn't start (retry from card).
        fetch(`/api/projects/${inserted.id}/trigger-demo`, { method: "POST" })
          .then(async (res) => {
            if (res.ok) return;
            const body = await res.json().catch(() => ({}));
            setProjects(prev => prev.map(p => p.id === inserted.id ? inserted : p));
            setNotice(body.message || t.projects.demoStartFailed);
          })
          .catch(() => {
            setProjects(prev => prev.map(p => p.id === inserted.id ? inserted : p));
            setNotice(t.projects.demoRequestFailed);
          });
      }
    }
    setShowAddModal(false);
  }

  async function handleRerecord(id: string) {
    const project = projects.find(p => p.id === id);
    // A landed video is locked to one take — collect a change request for an admin
    // instead of silently re-shooting (and re-spending).
    if (project && (project.demo_video_url || project.demo_build_status === "done")) {
      setRerecordModal({ id, title: project.title });
      return;
    }

    // Otherwise this is a retry of a never-run / failed take. Optimistic pending;
    // realtime overwrites it once the row actually moves.
    const prevStatus = project?.demo_build_status ?? null;
    setProjects(prev => prev.map(p => p.id === id
      ? { ...p, demo_build_status: "pending", demo_build_error: null }
      : p));
    try {
      const res = await fetch(`/api/projects/${id}/trigger-demo`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Retry budget spent / already has a video → escalate to an approval request.
        if (res.status === 409 && (body.code === "ALREADY_HAS_DEMO" || body.code === "ATTEMPT_LIMIT")) {
          setProjects(prev => prev.map(p => p.id === id
            ? { ...p, demo_build_status: prevStatus }
            : p));
          setRerecordModal({ id, title: project?.title ?? "" });
          return;
        }
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      // Held (daily cap) — reflect immediately; realtime confirms.
      if (body.held) {
        setProjects(prev => prev.map(p => p.id === id
          ? { ...p, demo_build_status: "held", demo_build_error: null }
          : p));
        setNotice(body.message ?? t.projects.heldNotice);
      }
    } catch (err) {
      // 트리거 자체 실패 시 failed로 표시 (잡이 안 돌았으니 catchError로 잡힐 일도 없음)
      const message = err instanceof Error ? err.message : t.projects.rerecordFailed;
      setProjects(prev => prev.map(p => p.id === id
        ? { ...p, demo_build_status: "failed", demo_build_error: message }
        : p));
    }
  }

  async function handleEdit(id: string, form: ProjectForm) {
    const supabase = createClient();
    // 초안 수정도 이 경로로 온다 — projects에서만 찾으면 초안의 이전 값이 안
    // 잡혀 교체된 파일 청소가 건너뛰어지고, 갱신도 공개 리스트에만 반영됐다.
    const before = projects.find(p => p.id === id) ?? drafts.find(p => p.id === id);
    const { data, error } = await supabase
      .from("projects")
      .update({ ...form, demo_user_hint: form.demo_user_hint?.trim() || null })
      .eq("id", id).select().single();
    if (error) throw new Error(error.message);
    if (data) {
      const updated = data as DBProject;
      const apply = (prev: DBProject[]) => prev.map(p => (p.id === id ? updated : p));
      if (updated.is_draft) setDrafts(apply);
      else setProjects(apply);
      if (before) await deleteSwappedAssets(id, before, updated);
    }
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

  async function handlePublishDraft(project: DBProject) {
    // 초안 → 공개: is_draft=false로 내리고 published 리스트로 옮긴 뒤, 기존 추가
    // 플로우와 동일하게 자동 시연을 트리거한다(쿼터·모더레이션·held 전부 상속).
    const supabase = createClient();
    // 인제스트로 들어온 수동 시연 영상(video_url)이 있으면 자동 촬영 생략 — 위
    // handleAdd와 같은 이유(노출 순위상 촬영본이 보이지 않음).
    const source = project.video_url ? null : detectDemoSource(project.demo_url);
    const published: DBProject = source
      ? { ...project, is_draft: false, demo_build_status: "pending", demo_source_type: source.type, demo_source_value: source.value }
      : { ...project, is_draft: false };
    setDrafts(prev => prev.filter(p => p.id !== project.id));
    setProjects(prev => [...prev, published]);

    const { error } = await supabase.from("projects").update({ is_draft: false }).eq("id", project.id);
    if (error) {
      // 롤백 — 다시 초안으로.
      setProjects(prev => prev.filter(p => p.id !== project.id));
      setDrafts(prev => (prev.some(p => p.id === project.id) ? prev : [project, ...prev]));
      setNotice(t.projects.publishFailed);
      return;
    }
    trackClientEvent(AnalyticsEvent.ProjectCreated, { projectId: project.id, demoSource: source?.type ?? null });
    if (source) {
      fetch(`/api/projects/${project.id}/trigger-demo`, { method: "POST" })
        .then(async (res) => {
          if (res.ok) return;
          const body = await res.json().catch(() => ({}));
          setProjects(prev => prev.map(p => p.id === project.id ? { ...published, demo_build_status: null } : p));
          setNotice(body.message || t.projects.publishedDemoStartFailed);
        })
        .catch(() => {
          setProjects(prev => prev.map(p => p.id === project.id ? { ...published, demo_build_status: null } : p));
          setNotice(t.projects.publishedDemoRequestFailed);
        });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="vf-spinner" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        {/* 초안도 세어서 보여준다 — "0 projects" 바로 밑에 초안 카드가 깔리면
            카운터가 거짓말이 된다. */}
        <p className="text-sm vf-mono" style={{ color: "var(--text-secondary)", letterSpacing: "0.02em" }}>
          {projects.length} project{projects.length === 1 ? "" : "s"}
          {drafts.length > 0 && ` · ${t.projects.pendingReview(drafts.length)}`}
        </p>
        <button
          onClick={() => setShowAddModal(true)}
          className="vf-button-primary"
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          {t.projects.addProject}
        </button>
      </div>

      {/* 초안과 공개를 한 리스트, 같은 행 언어로(시안 A) — 초안은 좌측 잉크
          바와 1차 버튼("확인하고 공개")만 다르다. 카운터가 이미 둘을 나눠 센다. */}
      <div className="vf-card overflow-hidden">
        {drafts.length === 0 && projects.length === 0 ? (
          <div className="text-center py-20 px-6">
            <p
              className="vf-serif-display mb-2"
              style={{ fontSize: "1.15rem", fontWeight: 500 }}
            >
              {t.projects.emptyTitle}
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
              {t.projects.emptyBody}
            </p>
          </div>
        ) : (
          <>
            {drafts.map((d, i) => (
              <DraftRow
                key={d.id}
                draft={d}
                highlight={d.id === reviewProjectId}
                isLast={projects.length === 0 && i === drafts.length - 1}
                onEdit={() => setEditProject(d)}
                onDelete={() => handleDelete(d.id)}
                onPublish={() => handlePublishDraft(d)}
                onReview={() => setReviewDraft(d)}
              />
            ))}
            {projects.map((project, i) => (
              <ProjectRow
                key={project.id}
                project={project}
                username={username}
                demoPaused={demoPaused}
                nowMs={nowMs}
                onDelete={() => handleDelete(project.id)}
                onEdit={() => setEditProject(project)}
                onToggleFeatured={() => handleToggleFeatured(project.id)}
                onRerecord={() => handleRerecord(project.id)}
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
            ))}
          </>
        )}
      </div>

      {/* 추가 = 오버레이 모달, 기본 화면은 AI 연결(수동 위저드는 우상단 버튼으로).
          옛 접이식 연결 카드(리디자인 결정 2)는 모달이 그 역할을 흡수하며 제거. */}
      {showAddModal && (
        <AddProjectModal
          userId={user.id}
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAdd}
        />
      )}

      {/* 초안 검토 — 행 클릭/메일 딥링크로 진입, AI가 쓴 전체 내용+미리보기 확인. */}
      {reviewDraft && (
        <DraftReviewModal
          draft={reviewDraft}
          onClose={() => setReviewDraft(null)}
          onPublish={() => { const d = reviewDraft; setReviewDraft(null); handlePublishDraft(d); }}
          onEdit={() => { setEditProject(reviewDraft); setReviewDraft(null); }}
          onDelete={() => { const d = reviewDraft; setReviewDraft(null); handleDelete(d.id); }}
        />
      )}

      {editProject && (
        <ProjectFormModal title={t.projects.editTitle}
          initialForm={{
            title: editProject.title, description: editProject.description,
            type: editProject.type, content_type: editProject.content_type,
            thumbnail: editProject.thumbnail, year: editProject.year,
            tags: editProject.tags, demo_url: editProject.demo_url,
            comment: editProject.comment,
            video_url: editProject.video_url ?? "",
            demo_user_hint: editProject.demo_user_hint ?? null,
          }}
          onClose={() => setEditProject(null)}
          onSubmit={form => handleEdit(editProject.id, form)}
          submitLabel={t.projects.submitSave} userId={user.id} />
      )}

      {rerecordModal && (
        <RerecordRequestModal
          projectId={rerecordModal.id}
          projectTitle={rerecordModal.title}
          onClose={() => setRerecordModal(null)}
          onSubmitted={() => {
            setRerecordModal(null);
            setNotice(t.projects.rerecordSent);
          }}
        />
      )}

      {notice && (
        <div
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full shadow-lg text-sm cursor-pointer"
          style={{ background: "var(--text-primary)", color: "var(--bg)", fontFamily: "var(--font-nunito)" }}
          onClick={() => setNotice(null)}
          role="status"
        >
          {notice}
        </div>
      )}
    </div>
  );
}
