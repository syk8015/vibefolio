"use client";

import { useState, useEffect, useRef, memo } from "react";
import Image from "next/image";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import ProjectCard from "@/components/ProjectCard";
import ShareKit from "@/components/dashboard/ShareKit";
import { RerecordRequestModal } from "@/components/dashboard/RerecordRequestModal";
import type { Project } from "@/lib/data";
import { detectDemoSource } from "@/lib/demoSource";
import { parseDemoFailure, DEMO_FAILURE_COPY } from "@/lib/demo-failure";
import { AnalyticsEvent, trackClientEvent } from "@/lib/analytics-client";
import { screenshotUrl } from "@/lib/thumbnail";
import {
  MAX_UPLOAD_BYTES,
  getMimeType,
  safeRelativePath,
} from "@/lib/upload-safety";

import { CONTENT_TYPES, AI_TOOLS, AI_TOOL_DOMAINS } from "@/lib/projectTaxonomy";

// Pure, primitive props + a fixed domain map. Memoized so it doesn't re-render
// (and re-issue the favicon request) on unrelated dashboard state changes.
const AiToolLogo = memo(function AiToolLogo({ id, size = 13 }: { id: string; size?: number }) {
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
});

const AI_TOOLS_INITIAL = 5;

type DemoBuildStatus =
  | "pending"
  | "building"
  | "recording"
  | "editing"
  | "done"
  | "failed"
  | "held";

// 촬영이 아직 진행 중인 상태들. 이 행이 하나라도 있는 동안만 폴백 폴링이 돌고,
// 전부 done/failed/held로 떨어지면 스스로 멈춘다.
const DEMO_IN_FLIGHT: ReadonlySet<DemoBuildStatus> = new Set([
  "pending",
  "building",
  "recording",
  "editing",
]);
const DEMO_POLL_MS = 10_000;
// 촬영이 이 시간을 넘기면 배지를 "예상보다 오래 걸려요"로 바꾼다. 실패 판정이
// 아니라 안심 문구 — 유저를 화면 앞에 붙잡아두지 않는 게 목적이다. 운영 경보는
// 별개 임계값(health 크론 STUCK_PENDING_MIN=15분)이라 서로 간섭하지 않는다.
const DEMO_SLOW_MS = 5 * 60_000;

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
  is_draft: boolean;
  video_url: string;
  demo_source_type: "github" | "live_url" | "zip" | null;
  demo_source_value: string | null;
  demo_build_status: DemoBuildStatus | null;
  demo_build_error: string | null;
  demo_video_url: string | null;
  demo_generated_at: string | null;
  // DB 트리거가 모든 상태 전이마다 찍는다 (migration_stuck_watchdog.sql).
  demo_status_changed_at: string | null;
  // 사용자 유도형 데모 변형①: 제작자가 쓴 "핵심 기능" 설명. 녹화 워커가 explore
  // 브리핑에 주입한다. 가드 트리거의 파이프라인 컬럼이 아니라 유저가 직접 수정 가능.
  demo_user_hint: string | null;
}

type ProjectForm = Omit<
  DBProject,
  | "id"
  | "sort_order"
  | "is_featured"
  | "is_draft"
  | "demo_source_type"
  | "demo_source_value"
  | "demo_build_status"
  | "demo_build_error"
  | "demo_video_url"
  | "demo_generated_at"
  | "demo_status_changed_at"
>;

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
  demo_user_hint: null,
};

function isUploadedProject(demoUrl: string) {
  return demoUrl?.startsWith("/api/preview/");
}

function isValidHttpUrl(s: string) {
  if (!s) return false;
  try {
    const u = new URL(s);
    return (u.protocol === "http:" || u.protocol === "https:") && !!u.hostname && u.hostname.includes(".");
  } catch {
    return false;
  }
}

// zip → 압축해제, 일반 파일 → 그대로. 결과는 {relativePath, blob} 배열.
// (zip-slip 가드 safeRelativePath는 서버 인제스트와 공유하려고 @/lib/upload-safety로 이전.)
// zip 안에 단일 최상위 폴더가 있으면 strip해서 index.html이 root에 오게 한다.
async function expandUploadEntries(
  rawFiles: File[],
): Promise<{ relativePath: string; data: Blob }[]> {
  const out: { relativePath: string; data: Blob }[] = [];
  for (const file of rawFiles) {
    if (/\.zip$/i.test(file.name)) {
      const { default: JSZip } = await import("jszip");
      const zip = await JSZip.loadAsync(file);
      const fileEntries = Object.values(zip.files).filter((e) => !e.dir);
      const topSegments = new Set(fileEntries.map((e) => e.name.split("/")[0]));
      const stripTop =
        topSegments.size === 1 && fileEntries.every((e) => e.name.includes("/"));
      for (const entry of fileEntries) {
        const parts = entry.name.split("/");
        if (stripTop) parts.shift();
        const relativePath = safeRelativePath(parts.join("/"));
        if (!relativePath) continue;
        const data = await entry.async("blob");
        out.push({ relativePath, data });
      }
    } else {
      let rawPath: string;
      if (file.webkitRelativePath) {
        const parts = file.webkitRelativePath.split("/");
        parts.shift();
        rawPath = parts.join("/");
      } else {
        rawPath = file.name;
      }
      const relativePath = safeRelativePath(rawPath);
      if (!relativePath) continue;
      out.push({ relativePath, data: file });
    }
  }
  return out;
}

// 수정 저장 후, 교체·제거된 이전 업로드 영상/썸네일 객체를 청소한다.
// DB 업데이트가 커밋된 뒤 old↔new를 비교하므로(업로드 시점 X) 저장 안 하고
// 닫는 footgun이 없다. thum.io·picsum 등 우리 객체가 아닌 값은 서버가 무시한다.
//
// 실제 삭제는 서버에서 — 여기서 storage.remove()를 직접 부르면 스토리지 RLS가
// 조용히 막아 파일이 그대로 쌓인다(삭제 라우트가 서버로 간 것과 같은 이유, 감사 #18).
async function deleteSwappedAssets(
  projectId: string,
  prev: Pick<DBProject, "video_url" | "thumbnail">,
  next: Pick<DBProject, "video_url" | "thumbnail">,
) {
  const prevVideoUrl = prev.video_url !== next.video_url ? prev.video_url : null;
  const prevThumbnail = prev.thumbnail !== next.thumbnail ? prev.thumbnail : null;
  if (!prevVideoUrl && !prevThumbnail) return;
  try {
    await fetch(`/api/projects/${projectId}/demo-assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prevVideoUrl, prevThumbnail }),
      keepalive: true,
    });
  } catch { /* 청소 실패가 저장 흐름을 막지는 않는다 — 서버 로그에 남는다 */ }
}

// username comes from DashboardClient's profiles row (the handle public links
// actually resolve) — deriving it here from auth metadata could hand ShareKit
// a stale handle when the two sources drift.
export default function ProjectsTab({ user, username, reviewProjectId }: { user: User; username: string; reviewProjectId?: string | null }) {
  const [projects, setProjects] = useState<DBProject[]>([]);
  const [drafts, setDrafts] = useState<DBProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editProject, setEditProject] = useState<DBProject | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [rerecordModal, setRerecordModal] = useState<{ id: string; title: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // 자동 시연이 일시정지면 큐는 그대로 쌓이므로, 스피너 대신 '점검 중'으로 알린다.
  const [demoPaused, setDemoPaused] = useState(false);
  // 경과 시간 판정용 시각. 렌더 중 Date.now()는 불순(재렌더 시점에 따라 결과가
  // 흔들림)이라 마운트 때 한 번 고정하고 이후 폴링 주기에 실어 갱신한다.
  const [nowMs, setNowMs] = useState(() => Date.now());

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

  // ?review=<id> 로 들어오면 그 초안 카드로 스크롤+하이라이트.
  useEffect(() => {
    if (!reviewProjectId) return;
    const el = document.getElementById(`draft-${reviewProjectId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [reviewProjectId, drafts]);

  // Live-update the build-status badge as the trigger.dev job progresses.
  // Requires realtime publication on the projects table; silent no-op otherwise.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`projects:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "projects",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as DBProject;
          const merge = (prev: DBProject[]) =>
            prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p));
          setProjects(merge);
          setDrafts(merge);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user.id]);

  // Realtime이 유일한 경로면 publication 누락·소켓 끊김·탭 절전에 배지가 영영 안 바뀐다
  // (영상은 다 나왔는데 화면은 계속 "촬영 중"). 촬영 중인 행이 있는 동안만 상태 컬럼을
  // 얕게 폴링해 위와 같은 머지로 흘려보내는 폴백. 중복 갱신은 무해(같은 값 덮어쓰기).
  const inFlightKey = [...projects, ...drafts]
    .filter((p) => p.demo_build_status && DEMO_IN_FLIGHT.has(p.demo_build_status))
    .map((p) => p.id)
    .sort()
    .join(",");

  useEffect(() => {
    if (!inFlightKey) return;
    const ids = inFlightKey.split(",");
    const supabase = createClient();
    let cancelled = false;

    // 일시정지는 프로젝트별이 아니라 전역 — system_status는 서비스롤 전용이라
    // 클라이언트가 직접 못 읽고, 라우트를 거친다. 실패하면 조용히 스피너 경로 유지.
    async function syncPaused() {
      try {
        const res = await fetch("/api/demo/status");
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (!cancelled) setDemoPaused(!!json?.paused);
      } catch {
        /* 네트워크 실패 → 기존 표시 유지 */
      }
    }

    async function sync() {
      syncPaused();
      setNowMs(Date.now());
      const { data } = await supabase
        .from("projects")
        // demo_status_changed_at을 같이 안 가져오면 pending→building 전이 후에도
        // 옛 타임스탬프가 남아 "오래 걸려요"가 너무 일찍 뜬다.
        .select("id, demo_build_status, demo_build_error, demo_video_url, demo_generated_at, demo_status_changed_at")
        .in("id", ids);
      if (cancelled || !data) return;
      const fresh = new Map<string, Partial<DBProject>>(
        (data as Partial<DBProject>[]).map((r) => [r.id as string, r]),
      );
      const merge = (prev: DBProject[]) =>
        prev.map((p) => {
          const next = fresh.get(p.id);
          return next ? { ...p, ...next } : p;
        });
      setProjects(merge);
      setDrafts(merge);
    }

    // 프로젝트 행은 방금 loadProjects가 실어왔으니 재조회가 불필요하지만, 일시정지
    // 여부는 아직 모른다 — 첫 10초를 스피너로 흘려보내지 않도록 지금 한 번.
    syncPaused();
    const timer = setInterval(sync, DEMO_POLL_MS);
    // 탭을 다시 열면 즉시 한 번 — 절전으로 인터벌이 통째로 밀린 구간을 메운다.
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [inFlightKey]);

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
      setNotice("순서 저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
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
    if (!confirm("이 프로젝트를 삭제할까요?")) return;

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
      setNotice("프로젝트 삭제에 실패했어요. 잠시 후 다시 시도해 주세요.");
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
      const source = detectDemoSource(form.demo_url);
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
            setNotice(body.message || "자동 시연 생성을 시작하지 못했어요. 프로젝트는 저장됐어요 — 카드에서 다시 시도할 수 있어요.");
          })
          .catch(() => {
            setProjects(prev => prev.map(p => p.id === inserted.id ? inserted : p));
            setNotice("자동 시연 요청이 전송되지 않았어요. 프로젝트는 저장됐어요 — 카드에서 다시 시도할 수 있어요.");
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
        setNotice(body.message ?? "관리자 승인 대기로 전환했어요.");
      }
    } catch (err) {
      // 트리거 자체 실패 시 failed로 표시 (잡이 안 돌았으니 catchError로 잡힐 일도 없음)
      const message = err instanceof Error ? err.message : "재촬영 요청 실패";
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
    const source = detectDemoSource(project.demo_url);
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
      setNotice("공개에 실패했어요. 잠시 후 다시 시도해 주세요.");
      return;
    }
    trackClientEvent(AnalyticsEvent.ProjectCreated, { projectId: project.id, demoSource: source?.type ?? null });
    if (source) {
      fetch(`/api/projects/${project.id}/trigger-demo`, { method: "POST" })
        .then(async (res) => {
          if (res.ok) return;
          const body = await res.json().catch(() => ({}));
          setProjects(prev => prev.map(p => p.id === project.id ? { ...published, demo_build_status: null } : p));
          setNotice(body.message || "공개됐지만 자동 시연 생성을 시작하지 못했어요 — 카드에서 다시 시도할 수 있어요.");
        })
        .catch(() => {
          setProjects(prev => prev.map(p => p.id === project.id ? { ...published, demo_build_status: null } : p));
          setNotice("공개됐지만 자동 시연 요청이 전송되지 않았어요 — 카드에서 다시 시도할 수 있어요.");
        });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 rounded-full border-2 animate-spin"
          style={{ borderColor: "var(--text-primary)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  // ── Add-mode: inline takeover of the ProjectsTab content area ──
  if (showAddModal) {
    return (
      <ProjectFormModal title="새 프로젝트 추가" initialForm={EMPTY_FORM}
        onClose={() => setShowAddModal(false)} onSubmit={handleAdd}
        submitLabel="추가하기" userId={user.id} wizard inline />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        {/* 초안도 세어서 보여준다 — "0 projects" 바로 밑에 초안 카드가 깔리면
            카운터가 거짓말이 된다. */}
        <p className="text-sm vf-mono" style={{ color: "var(--text-secondary)", letterSpacing: "0.02em" }}>
          {projects.length} project{projects.length === 1 ? "" : "s"}
          {drafts.length > 0 && ` · 검토 대기 ${drafts.length}`}
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

      {drafts.length > 0 && (
        <div className="mb-6">
          <p className="text-sm vf-mono mb-3" style={{ color: "var(--text-secondary)", letterSpacing: "0.02em" }}>
            검토 대기 · AI가 보낸 초안 {drafts.length}
          </p>
          <div className="flex flex-col gap-3">
            {drafts.map((d) => (
              <DraftReviewCard
                key={d.id}
                draft={d}
                highlight={d.id === reviewProjectId}
                onEdit={() => setEditProject(d)}
                onDelete={() => handleDelete(d.id)}
                onPublish={() => handlePublishDraft(d)}
              />
            ))}
          </div>
        </div>
      )}

      {(projects.length > 0 || drafts.length === 0) && (
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
            ))
          )}
        </div>
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
            demo_user_hint: editProject.demo_user_hint ?? null,
          }}
          onClose={() => setEditProject(null)}
          onSubmit={form => handleEdit(editProject.id, form)}
          submitLabel="저장하기" userId={user.id} />
      )}

      {rerecordModal && (
        <RerecordRequestModal
          projectId={rerecordModal.id}
          projectTitle={rerecordModal.title}
          onClose={() => setRerecordModal(null)}
          onSubmitted={() => {
            setRerecordModal(null);
            setNotice("재촬영 요청을 보냈어요. 관리자 승인 후 다시 촬영돼요.");
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

// 실패 코드별 카피는 lib/demo-failure.ts의 DEMO_FAILURE_COPY — 실패 알림 이메일과
// 공유하므로 여기서 따로 들지 않는다. raw 메시지는 팝오버의 "기술 정보" 토글 뒤로.

const DEMO_PHASE_LABEL: Record<Exclude<DemoBuildStatus, "done" | "failed" | "held">, string> = {
  pending: "촬영 대기",
  building: "앱 준비 중",
  recording: "촬영 중",
  editing: "편집 중",
};

function DemoBuildBadge({
  status,
  error,
  statusChangedAt,
  paused,
  nowMs,
  onRetry,
}: {
  status: DemoBuildStatus | null;
  error: string | null;
  statusChangedAt: string | null;
  paused: boolean;
  nowMs: number;
  onRetry?: () => void;
}) {
  // 팝오버는 fixed + 버튼 rect 앵커 — 리스트 카드(vf-card overflow-hidden)가
  // absolute 팝오버를 클리핑하는 것을 실측으로 확인(2026-07-13), fixed로 탈출.
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  if (!status || status === "done") return null;

  if (status === "failed") {
    const { code, message } = parseDemoFailure(error);
    const copy = DEMO_FAILURE_COPY[code ?? "error"];
    return (
      <div className="shrink-0" style={{ position: "relative", display: "inline-flex" }}>
        <button
          onClick={e => {
            const r = e.currentTarget.getBoundingClientRect();
            setAnchor(a => (a ? null : {
              top: r.bottom + 6,
              left: Math.max(8, Math.min(r.left, window.innerWidth - 264 - 8)),
            }));
          }}
          className="px-2 py-0.5 rounded-full text-xs"
          style={{
            background: "rgba(179, 71, 71, 0.12)",
            color: "#8e3535",
            fontFamily: "var(--font-nunito)",
            fontSize: "0.6rem",
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
          }}
        >
          시연 영상 실패
        </button>
        {anchor && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setAnchor(null)} />
            <div
              className="rounded-2xl"
              style={{
                position: "fixed",
                top: anchor.top,
                left: anchor.left,
                zIndex: 50,
                width: 264,
                maxHeight: `calc(100vh - ${anchor.top}px - 12px)`,
                overflowY: "auto",
                padding: "0.9rem 1rem",
                background: "var(--surface)",
                boxShadow: "0 12px 32px rgba(0, 0, 0, 0.16)",
                textAlign: "left",
              }}
            >
              <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-nunito)", margin: 0 }}>
                {copy.title}
              </p>
              <p style={{ fontSize: "0.7rem", color: "var(--text-secondary)", lineHeight: 1.6, fontFamily: "var(--font-nunito)", margin: "0.4rem 0 0" }}>
                {copy.body}
              </p>
              {onRetry && (
                <button
                  onClick={() => { setAnchor(null); onRetry(); }}
                  className="rounded-full"
                  style={{
                    marginTop: "0.7rem",
                    padding: "0.4rem 0.95rem",
                    background: "var(--text-primary)",
                    color: "var(--bg)",
                    border: "none",
                    fontSize: "0.68rem",
                    fontWeight: 600,
                    fontFamily: "var(--font-nunito)",
                    cursor: "pointer",
                  }}
                >
                  다시 시도
                </button>
              )}
              {message && (
                <details style={{ marginTop: "0.6rem" }}>
                  <summary style={{ fontSize: "0.6rem", color: "var(--text-muted)", cursor: "pointer", fontFamily: "var(--font-nunito)" }}>
                    기술 정보
                  </summary>
                  <pre
                    style={{
                      margin: "0.35rem 0 0",
                      padding: "0.5rem 0.6rem",
                      background: "var(--surface-soft)",
                      borderRadius: 10,
                      fontSize: "0.58rem",
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      color: "var(--text-secondary)",
                      maxHeight: 120,
                      overflowY: "auto",
                    }}
                  >
                    {message}
                  </pre>
                </details>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  if (status === "held") {
    // '[moderation]' 마커 = 게시 전 콘텐츠 검토 격리(모더레이션 파이프라인).
    // 마커 없는 held는 기존 쿼터/크레딧 보류 — 카피가 서로 다르다.
    const isModeration = !!error?.startsWith("[moderation]");
    return (
      <span
        className="px-2 py-0.5 rounded-full text-xs shrink-0"
        style={{
          background: "var(--surface-soft)",
          color: "var(--text-secondary)",
          fontFamily: "var(--font-nunito)",
          fontSize: "0.6rem",
          fontWeight: 600,
          cursor: "help",
        }}
        title={
          isModeration
            ? "게시 전에 확인이 필요하다고 표시돼 잠시 보류 중이에요. 검토가 끝나면 자동으로 게시되고, 보통 하루 안에 처리돼요."
            : "하루 자동 시연 한도를 넘어 승인 대기 중이에요. 보통 24시간 안에 처리되고, 그동안은 이미지로 표시돼요."
        }
      >
        {isModeration ? "게시 전 확인 중" : "승인 대기 · 이미지 표시"}
      </span>
    );
  }

  // pending | building | recording | editing — 단계 서사 + 기대 시간.
  //
  // 다만 스피너가 정직한 건 실제로 진행 중일 때뿐이다. 워커가 멈췄거나 일시정지면
  // 큐는 계속 접수되는데(요청 경로는 demo_paused를 보지 않는다) 이 배지만 영원히
  // 돌고, RerecordButton은 in-flight라 숨는다 → 유저가 할 수 있는 게 없는 데드엔드.
  // 그래서 두 경우엔 스피너를 걷어내고 지금 무슨 일인지 말해준다.
  // nowMs는 폴링이 실어주는 값(0 = 아직 모름). 렌더는 순수하게 유지된다.
  const isSlow =
    !!statusChangedAt && nowMs > 0 && nowMs - new Date(statusChangedAt).getTime() > DEMO_SLOW_MS;

  if (paused || isSlow) {
    return (
      <span
        className="px-2 py-0.5 rounded-full text-xs shrink-0"
        style={{
          background: "var(--surface-soft)",
          color: "var(--text-secondary)",
          fontFamily: "var(--font-nunito)",
          fontSize: "0.6rem",
          fontWeight: 600,
          cursor: "help",
        }}
        title={
          paused
            ? "자동 시연을 잠시 멈춰둔 상태예요. 재개되면 순서대로 처리해 드릴게요."
            : "창을 닫으셔도 돼요 — 촬영이 끝나면 메일로 알려드릴게요."
        }
      >
        {paused ? "자동 시연 점검 중" : "예상보다 오래 걸려요"}
      </span>
    );
  }

  return (
    <span
      className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs shrink-0"
      style={{
        background: "var(--surface-soft)",
        color: "var(--text-secondary)",
        fontFamily: "var(--font-nunito)",
        fontSize: "0.6rem",
        fontWeight: 600,
      }}
    >
      <span
        className="rounded-full border-2 animate-spin"
        style={{
          width: 8,
          height: 8,
          borderColor: "var(--text-secondary)",
          borderTopColor: "transparent",
        }}
      />
      {DEMO_PHASE_LABEL[status]} · 보통 1–3분
    </span>
  );
}

function RerecordButton({
  sourceValue,
  status,
  hasVideo,
  onRerecord,
}: {
  sourceValue: string | null;
  status: DemoBuildStatus | null;
  hasVideo: boolean;
  onRerecord: () => void;
}) {
  // 녹화할 소스가 없으면 버튼 자체를 숨김 (예: 파일 업로드 미완료 + URL도 없음)
  if (!sourceValue) return null;
  const inFlight = status === "pending" || status === "building" || status === "recording" || status === "editing";
  // 진행 중이거나 승인 대기(held)면 유저가 지금 할 수 있는 액션이 없음 → 버튼 숨김.
  if (inFlight || status === "held") return null;
  // 영상이 이미 있으면(done) 재촬영은 관리자 승인 요청, 실패면 재시도.
  const title =
    hasVideo || status === "done"
      ? "재촬영 요청 (관리자 승인 필요)"
      : status === "failed"
        ? "다시 시도"
        : "시연 영상 만들기";
  return (
    <button
      onClick={onRerecord}
      title={title}
      className="p-2 rounded-full transition-colors"
      style={{
        background: "var(--surface-soft)",
        border: "none",
        cursor: "pointer",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path
          d="M12 7a5 5 0 1 1-1.46-3.54M12 2v3h-3"
          stroke="var(--text-primary)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

// AI가 인제스트로 보낸 "초안" 검토 카드. 공개 전에 유저가 AI가 쓴 카피를 눈으로
// 보고, 수정/삭제하거나 "확인하고 공개"로 발행(=자동 시연 트리거)한다.
function DraftReviewCard({ draft, highlight, onEdit, onDelete, onPublish }: {
  draft: DBProject;
  highlight: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onPublish: () => void;
}) {
  const [publishing, setPublishing] = useState(false);
  const isUpload = draft.demo_url?.startsWith("/api/preview/");
  const ct = CONTENT_TYPES.find((c) => c.id === draft.content_type);
  return (
    <div
      id={`draft-${draft.id}`}
      className="vf-card p-5"
      style={{
        borderLeft: "3px solid var(--text-primary)",
        boxShadow: highlight ? "0 0 0 2px var(--text-primary)" : undefined,
        transition: "box-shadow 0.4s",
      }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="vf-chip" style={{ fontSize: "0.65rem", background: "var(--surface-soft)", color: "var(--text-secondary)" }}>
          AI 초안
        </span>
        {ct && (
          <span className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
            {ct.emoji} {ct.label}
          </span>
        )}
      </div>
      <p className="vf-serif-display" style={{ fontSize: "1.1rem", fontWeight: 500, margin: 0, marginBottom: "0.4rem" }}>
        {draft.title || "제목 없음"}
      </p>

      {draft.description && (
        <p className="text-sm mb-3" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", lineHeight: 1.6 }}>
          {draft.description}
        </p>
      )}

      {draft.demo_user_hint && (
        <div className="mb-3 p-3 rounded-lg" style={{ background: "var(--surface-soft)" }}>
          <p className="text-xs mb-1" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontWeight: 600 }}>
            🎬 시연 영상에서 보여줄 것
          </p>
          <p className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", lineHeight: 1.6 }}>
            {draft.demo_user_hint}
          </p>
        </div>
      )}

      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        <span className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace" }}>
          {isUpload ? "업로드된 사이트" : draft.demo_url || "링크 없음"}
        </span>
        {draft.tags?.map((t) => (
          <span key={t} className="vf-chip" style={{ fontSize: "0.65rem" }}>{t}</span>
        ))}
      </div>

      <div className="flex items-center gap-2 justify-end">
        <button onClick={onDelete} className="vf-button-ghost" style={{ fontSize: "0.8rem", padding: "0.45rem 0.8rem" }}>
          삭제
        </button>
        <button onClick={onEdit} className="vf-button-ghost" style={{ fontSize: "0.8rem", padding: "0.45rem 0.8rem" }}>
          수정
        </button>
        <button
          onClick={() => { setPublishing(true); onPublish(); }}
          disabled={publishing}
          className="vf-button-primary"
          style={{ fontSize: "0.8rem", padding: "0.45rem 0.9rem", opacity: publishing ? 0.6 : 1 }}
        >
          {publishing ? "공개 중…" : "확인하고 공개"}
        </button>
      </div>
    </div>
  );
}

function ProjectRow({ project, username, demoPaused, nowMs, onDelete, onEdit, onToggleFeatured, onRerecord, onMoveUp, onMoveDown, canMoveUp, canMoveDown, isDragging, isDragOver, isLast, onDragStart, onDragOver, onDrop, onDragEnd }: {
  project: DBProject;
  username: string;
  demoPaused: boolean;
  nowMs: number;
  onDelete: () => void;
  onEdit: () => void;
  onToggleFeatured: () => void;
  onRerecord: () => void;
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

        <div className="relative w-20 h-14 rounded-xl overflow-hidden shrink-0" style={{ background: "var(--surface-soft)" }}>
          <Image src={thumbnail} unoptimized alt={project.title} fill className="object-cover" sizes="80px" />
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
                style={{ background: "var(--surface-soft)", color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontSize: "0.6rem", fontWeight: 500 }}>
                {contentType.emoji} {contentType.label}
              </span>
            )}
            {isUploadedProject(project.demo_url) && (
              <span className="px-2 py-0.5 rounded-full text-xs shrink-0 vf-mono"
                style={{ background: "var(--text-primary)", color: "var(--bg)", fontSize: "0.58rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                upload
              </span>
            )}
            <DemoBuildBadge
              status={project.demo_build_status}
              error={project.demo_build_error}
              statusChangedAt={project.demo_status_changed_at}
              paused={demoPaused}
              nowMs={nowMs}
              onRetry={project.demo_source_value ? onRerecord : undefined}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(project.tags ?? []).map(tag => (
              <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                style={{
                  background: "var(--surface-soft)",
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
            background: "var(--surface-soft)",
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
            className="md:hidden p-2 rounded-full transition-colors hover:bg-[var(--surface-soft-hover)] disabled:opacity-30"
            style={{ background: "var(--surface-soft)", border: "none", cursor: canMoveUp ? "pointer" : "not-allowed" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 8l4-4 4 4" stroke="var(--text-secondary)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button onClick={onMoveDown} disabled={!canMoveDown} title="아래로"
            className="md:hidden p-2 rounded-full transition-colors hover:bg-[var(--surface-soft-hover)] disabled:opacity-30"
            style={{ background: "var(--surface-soft)", border: "none", cursor: canMoveDown ? "pointer" : "not-allowed" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 6l4 4 4-4" stroke="var(--text-secondary)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          <RerecordButton
            sourceValue={project.demo_source_value}
            status={project.demo_build_status}
            hasVideo={!!project.demo_video_url}
            onRerecord={onRerecord}
          />

          {project.demo_video_url && (
            <ShareKit
              username={username}
              projectId={project.id}
              demoVideoUrl={project.demo_video_url}
              projectTitle={project.title}
            />
          )}

          <button
            onClick={onToggleFeatured}
            title={project.is_featured ? "대표 작품 해제" : "대표 작품으로 설정"}
            className="p-2 rounded-full transition-colors"
            style={{
              background: project.is_featured ? "var(--text-primary)" : "var(--surface-soft)",
              border: "none",
              cursor: "pointer",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill={project.is_featured ? "var(--bg)" : "none"} stroke={project.is_featured ? "var(--bg)" : "var(--text-muted)"}>
              <path d="M7 1l1.8 4 4.2.4-3.2 2.9 1 4.2L7 10.4 3.2 12.5l1-4.2L1 5.4l4.2-.4L7 1z" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button onClick={onEdit} title="수정"
            className="p-2 rounded-full transition-colors"
            style={{ background: "var(--surface-soft)", border: "none", cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5zM8.5 3.5l2 2" stroke="var(--text-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button onClick={onDelete} title="삭제"
            className="p-2 rounded-full transition-colors"
            style={{ background: "var(--surface-soft)", border: "none", cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 3.5h10M5.5 3.5V2.5h3v1M5 5.5v5M9 5.5v5M3.5 3.5l.5 8h6l.5-8" stroke="#b34747" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectFormModal({ title, initialForm, onClose, onSubmit, submitLabel, userId, wizard = false, inline = false }: {
  title: string;
  initialForm: ProjectForm;
  onClose: () => void;
  onSubmit: (form: ProjectForm) => void;
  submitLabel: string;
  userId: string;
  wizard?: boolean;
  inline?: boolean;
}) {
  // 업로드로 만든 프로젝트의 demo_url은 내부 preview 경로다 — "url"로 시작하면
  // 수정 모달의 데모 URL 칸에 /api/preview/… 가 그대로 찍힌다(게다가 type=url
  // 검증에 걸려 저장도 안 된다). 파일 모드에서 시작해 연결 상태로 보여준다.
  const [uploadMode, setUploadMode] = useState<"url" | "files">(
    isUploadedProject(initialForm.demo_url) ? "files" : "url",
  );
  const [form, setForm] = useState({ ...initialForm });
  const [step, setStep] = useState(1);
  // null until the user actively picks on step 7 — prevents the final save
  // button from arming itself before a choice is made.
  const [thumbnailMode, setThumbnailMode] = useState<"auto" | "manual" | null>(null);
  // Wizard length: 7 steps for auto/unchosen thumbnail, 8 when manual upload is added
  const TOTAL_STEPS = thumbnailMode === "manual" ? 8 : 7;
  const [selectedTools, setSelectedTools] = useState<string[]>(initialForm.tags);
  const [showAllTools, setShowAllTools] = useState(false);
  // Edit modal never toggles the live-preview panel (that was wizard-only, now-removed
  // dead code), so it stays collapsed — keep the read-only flag the width ternaries use.
  const [showPreview] = useState(false);
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
  const inlineFormRef = useRef<HTMLFormElement>(null);

  // Inline mode: smoothly scroll the step canvas to viewport center on mount
  useEffect(() => {
    if (inline && inlineFormRef.current) {
      inlineFormRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [inline]);

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

  // 사용자 유도형 데모 변형①: 자동 시연이 "무엇을" 보여줘야 하는지 제작자에게 직접
  // 받는다 (explore는 캔버스·에디터류의 핵심 UX를 픽셀만 보고 못 잡음). step 2의
  // URL/파일 두 모드가 공유.
  const demoHintField = (
    <div className="flex flex-col gap-1.5 w-full" style={{ maxWidth: 680, margin: "18px auto 0" }}>
      <label className="text-sm" htmlFor="demo_user_hint"
        style={{ fontFamily: "var(--font-nunito)", fontWeight: 600 }}>
        핵심 기능 소개 <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}>(선택)</span>
      </label>
      <textarea className="vf-input" id="demo_user_hint" name="demo_user_hint" rows={2}
        placeholder="예: 캔버스에 마우스로 자유롭게 그림을 그릴 수 있어요. 상단에서 브러시 색과 굵기를 바꿔보세요."
        value={form.demo_user_hint ?? ""} onChange={handleChange}
        maxLength={500}
        style={{ resize: "none", fontSize: "0.9rem", lineHeight: 1.6 }} />
      <p className="text-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
        자동 시연 영상이 이 설명을 보고 핵심 기능부터 보여드려요.
      </p>
    </div>
  );

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
    const rawFiles = Array.from(fileList);
    if (!rawFiles.length) return;

    setUploading(true);
    setUploadProgress(0);

    // zip은 브라우저에서 풀어서 일반 파일처럼 취급.
    let entries: { relativePath: string; data: Blob }[];
    try {
      entries = await expandUploadEntries(rawFiles);
    } catch (err) {
      setUploadError(err instanceof Error ? `zip 압축해제 실패: ${err.message}` : "zip 파일을 읽을 수 없어요.");
      setUploading(false);
      return;
    }

    const totalSize = entries.reduce((acc, e) => acc + e.data.size, 0);
    if (totalSize > MAX_UPLOAD_BYTES) {
      setUploadError(`총 파일 크기가 25MB를 초과해요. (현재 ${(totalSize / 1024 / 1024).toFixed(1)}MB)`);
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
      setUploadError("웹페이지(HTML) 파일이 없어요. 자동 시연은 브라우저에 뜨는 화면을 촬영해요 — index.html이 포함됐는지 확인해 주세요.");
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
      setSaveError(err instanceof Error ? err.message : "저장 중 오류가 발생했어요.");
    }
    setSaving(false);
  }

  // ── Inline mode: in-place takeover of the ProjectsTab content area ──
  if (inline) {
    // Whether the current optional step (4·5·6) has something chosen.
    const hasStepSelection =
      step === 4 ? form.content_type !== null :
      step === 5 ? selectedTools.length > 0 :
      step === 6 ? !!form.video_url :
      false;

    // "다음" is blocked until the step's requirement is met. On the optional
    // steps that means: a selection must exist (otherwise the only way forward
    // is the 건너뛰기 button).
    const nextDisabled =
      (step === 2 && uploadMode === "url" && !isValidHttpUrl(form.demo_url)) ||
      (step === 2 && uploadMode === "files" && !uploadDone) ||
      (step === 3 && !form.title) ||
      ((step === 4 || step === 5 || step === 6) && !hasStepSelection) ||
      uploading;

    // "건너뛰기" is only offered when nothing is chosen; once the user picks
    // something they must use 다음 (the two are mutually exclusive).
    const skipDisabled = hasStepSelection;

    // The final save must wait for an explicit thumbnail-mode choice on step 7.
    const submitDisabled = saving || uploading || (step === 7 && thumbnailMode === null);

    // Block the form's implicit Enter-submit on every step but the last; on
    // intermediate steps a valid Enter advances instead of saving.
    function handleFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
      if (e.key !== "Enter") return;
      if ((e.target as HTMLElement).tagName === "TEXTAREA") return; // allow newlines
      if (step < TOTAL_STEPS) {
        e.preventDefault();
        if (!nextDisabled) setStep(s => s + 1);
      }
    }

    return (
      <div className="relative flex flex-col" style={{ minHeight: "calc(100vh - 220px)" }}>
        {/* Top progress bar — segmented hairline */}
        {wizard && (
          <div className="absolute top-0 left-0 right-0 z-20 flex gap-[3px]">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
              const idx = i + 1;
              const active = idx <= step;
              return (
                <div key={i} className="flex-1 rounded-full transition-colors"
                  style={{
                    height: 3,
                    background: active ? "var(--text-primary)" : "var(--surface-soft)",
                  }} />
              );
            })}
          </div>
        )}

        {/* Top-left: cancel back button */}
        <div className="flex items-center justify-between pt-6 pb-4">
          <button onClick={onClose}
            className="vf-soft-fill flex items-center gap-1.5 rounded-full"
            style={{ padding: "0.5rem 1rem", fontFamily: "var(--font-nunito)", fontSize: "0.85rem", fontWeight: 500, cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 2L3 7l6 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            취소
          </button>
          {wizard && (
            <span className="vf-mono text-xs" style={{ color: "var(--text-muted)", letterSpacing: "0.12em" }}>
              {String(step).padStart(2, "0")} / {String(TOTAL_STEPS).padStart(2, "0")}
            </span>
          )}
        </div>

        <form ref={inlineFormRef} onSubmit={handleSubmit} onKeyDown={handleFormKeyDown}
          className="flex-1 flex flex-col min-h-0 pb-6 pt-4 max-w-5xl mx-auto w-full">

          {/* Step canvas — re-keyed per step so each view fades + rises in */}
          <div key={step} className="vf-step-enter flex-1 flex flex-col min-h-0">
          {/* Step 1 — 형태 선택 (화면 2등분) */}
          {step === 1 && (
            <div className="flex-1 grid grid-cols-2 gap-3 min-h-0">
              {([
                { id: "url", emoji: "🔗", title: "URL 링크", desc: "이미 어딘가에 배포된 사이트가 있어요" },
                { id: "files", emoji: "📁", title: "파일 업로드", desc: "직접 만든 HTML·CSS·JS 파일을 올릴게요" },
              ] as const).map(opt => (
                <button key={opt.id} type="button"
                  onClick={() => { setUploadMode(opt.id); setStep(2); }}
                  className="vf-selectable rounded-2xl flex flex-col items-center justify-center gap-5"
                  style={{ cursor: "pointer" }}>
                  <span style={{ fontSize: "4.5rem", lineHeight: 1 }}>{opt.emoji}</span>
                  <span className="vf-serif-display" style={{ fontSize: "1.6rem", fontWeight: 500, color: "inherit" }}>
                    {opt.title}
                  </span>
                  <span style={{ fontSize: "0.9rem", color: "inherit", opacity: 0.62, fontFamily: "var(--font-nunito)", textAlign: "center", maxWidth: 260, lineHeight: 1.55 }}>
                    {opt.desc}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Step 2 — URL 입력 또는 파일 업로드 */}
          {step === 2 && (
            <div className="flex-1 flex flex-col min-h-0">
              {uploadMode === "url" ? (
                <div className="flex-1 flex flex-col items-center justify-center">
                  <div className="w-full" style={{ maxWidth: 680 }}>
                    <input className="vf-input" name="demo_url" type="url"
                      placeholder="https://myproject.vercel.app"
                      value={form.demo_url} onChange={handleChange}
                      autoFocus
                      style={{ fontSize: "1.4rem", padding: "1.4rem 1.6rem", textAlign: "center" }} />
                  </div>
                  {demoHintField}
                </div>
              ) : (
                <>
                  <input ref={fileInputRef} type="file" className="hidden" multiple
                    accept=".html,.css,.js,.ts,.jsx,.tsx,.json,.svg,.png,.jpg,.jpeg,.gif,.webp,.woff,.woff2,.ttf,.zip"
                    onChange={e => e.target.files && handleFilesUpload(e.target.files)} />
                  <input ref={folderInputRef} type="file" className="hidden"
                    {...{ webkitdirectory: "", multiple: true } as React.InputHTMLAttributes<HTMLInputElement>}
                    onChange={e => e.target.files && handleFilesUpload(e.target.files)} />
                  <div className="vf-soft-fill flex-1 flex flex-col items-center justify-center gap-5 rounded-2xl p-8"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); e.currentTarget.setAttribute("data-drag", "1"); }}
                    onDragLeave={e => e.currentTarget.removeAttribute("data-drag")}
                    onDrop={e => {
                      e.preventDefault();
                      e.currentTarget.removeAttribute("data-drag");
                      if (e.dataTransfer.files.length) handleFilesUpload(e.dataTransfer.files);
                    }}
                    style={{ cursor: "pointer" }}>
                    <div style={{ fontSize: "4rem", lineHeight: 1 }}>📂</div>
                    <div className="flex gap-2">
                      <button type="button" onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
                        className="vf-soft-fill rounded-full"
                        style={{ background: "var(--surface)", padding: "0.6rem 1.3rem", fontSize: "0.85rem", fontFamily: "var(--font-nunito)", fontWeight: 500, cursor: "pointer" }}>
                        파일 선택
                      </button>
                      <button type="button" onClick={e => { e.stopPropagation(); folderInputRef.current?.click(); }}
                        className="vf-soft-fill rounded-full"
                        style={{ background: "var(--surface)", padding: "0.6rem 1.3rem", fontSize: "0.85rem", fontFamily: "var(--font-nunito)", fontWeight: 500, cursor: "pointer" }}>
                        폴더 선택
                      </button>
                    </div>
                    <p className="text-xs text-center" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", maxWidth: 520, lineHeight: 1.65 }}>
                      React/Vue/Vite는 <code className="vf-mono" style={{ background: "var(--surface)", padding: "1px 5px", borderRadius: 4, fontSize: "0.7rem" }}>npm run build</code> 후 생성된 <code className="vf-mono" style={{ background: "var(--surface)", padding: "1px 5px", borderRadius: 4, fontSize: "0.7rem" }}>dist/</code> 폴더를 올려주세요. 순수 HTML/CSS/JS는 그대로, <code className="vf-mono" style={{ background: "var(--surface)", padding: "1px 5px", borderRadius: 4, fontSize: "0.7rem" }}>.zip</code>도 가능. 최대 25MB
                    </p>
                    {uploading && (
                      <div className="w-full max-w-md flex flex-col gap-2 mt-1">
                        <div className="flex justify-between text-xs vf-mono" style={{ color: "var(--text-secondary)" }}>
                          <span>업로드 중…</span><span>{uploadProgress}%</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full" style={{ background: "var(--surface)" }}>
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
                        업로드 완료
                      </p>
                    )}
                    {uploadError && (
                      <p className="text-sm" style={{ color: "#b34747", fontFamily: "var(--font-nunito)" }}>
                        {uploadError}
                      </p>
                    )}
                  </div>
                  {demoHintField}
                </>
              )}
            </div>
          )}

          {/* Step 3 — 프로젝트 이름 + 설명 */}
          {step === 3 && (
            <div className="flex-1 flex flex-col gap-4 min-h-0">
              <input className="vf-input" name="title" placeholder="프로젝트 이름"
                value={form.title} onChange={handleChange} required autoFocus
                style={{ fontSize: "1.4rem", padding: "1.3rem 1.5rem" }} />
              <textarea className="vf-input flex-1" name="description" placeholder="어떤 프로젝트인지 소개해주세요."
                value={form.description} onChange={handleChange}
                style={{ resize: "none", fontSize: "1rem", padding: "1.3rem 1.5rem", lineHeight: 1.7 }} />
            </div>
          )}

          {/* Step 4 — 콘텐츠 유형 (단독) */}
          {step === 4 && (
            <div className="flex-1 flex flex-col items-center justify-center gap-5 min-h-0">
              <label className="vf-label">콘텐츠 유형</label>
              <div className="flex flex-wrap gap-2 justify-center" style={{ maxWidth: 760 }}>
                {CONTENT_TYPES.map(ct => {
                  const active = form.content_type === ct.id;
                  return (
                    <button key={ct.id} type="button"
                      onClick={() => setForm(prev => ({ ...prev, content_type: active ? null : ct.id }))}
                      data-active={active}
                      className="vf-selectable px-5 py-2.5 rounded-full text-sm"
                      style={{ fontFamily: "var(--font-nunito)", cursor: "pointer" }}>
                      {active && <span style={{ fontSize: "0.75em", marginRight: 4 }}>✓</span>}{ct.emoji} {ct.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 5 — 개발 도구 (AI 도구 목록, UI는 추후 재논의) */}
          {step === 5 && (
            <div className="flex-1 flex flex-col items-center justify-center gap-5 min-h-0">
              <label className="vf-label">
                사용한 AI 도구{" "}
                <span style={{ color: "var(--text-muted)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(복수 선택)</span>
              </label>
              <div className="flex flex-wrap gap-2 justify-center" style={{ maxWidth: 880 }}>
                {visibleTools.map(tool => {
                  const active = selectedTools.includes(tool.id);
                  return (
                    <button key={tool.id} type="button" onClick={() => toggleTool(tool.id)}
                      data-active={active}
                      className="vf-selectable flex items-center gap-1.5 px-4 py-2 rounded-full text-sm"
                      style={{ fontFamily: "var(--font-nunito)", cursor: "pointer" }}>
                      {active && <span style={{ fontSize: "0.75em" }}>✓</span>}
                      <AiToolLogo id={tool.id} size={14} />
                      <span>{tool.id}</span>
                    </button>
                  );
                })}
                <button type="button"
                  onClick={() => setShowAllTools(v => !v)}
                  className="vf-soft-fill px-4 py-2 rounded-full text-sm"
                  style={{ fontFamily: "var(--font-nunito)", fontWeight: 500, cursor: "pointer" }}>
                  {showAllTools
                    ? "접기 ↑"
                    : `더보기 +${AI_TOOLS.length - AI_TOOLS_INITIAL - hiddenSelectedCount}`}
                </button>
              </div>
            </div>
          )}

          {/* Step 6 — 구동 영상 */}
          {step === 6 && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 min-h-0">
              <label className="vf-label">
                구동 영상{" "}
                <span style={{ color: "var(--text-muted)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(선택)</span>
              </label>
              <div className="w-full flex flex-col items-center gap-3" style={{ maxWidth: 640 }}>
                {form.video_url ? (
                  <div className="vf-soft-fill w-full flex flex-col items-center justify-center gap-3 rounded-2xl p-8">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                      style={{ background: "var(--surface)" }}>
                      <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
                        <polygon points="3,2 13,8 3,14" fill="var(--text-primary)" />
                      </svg>
                    </div>
                    <p className="text-sm" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontWeight: 600 }}>
                      영상 연결됨
                    </p>
                    <p className="text-xs truncate vf-mono w-full text-center" style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>
                      {form.video_url}
                    </p>
                    <button type="button"
                      onClick={() => { setForm(prev => ({ ...prev, video_url: "" })); setVideoError(""); }}
                      className="vf-soft-fill rounded-full"
                      style={{ background: "var(--surface)", padding: "0.45rem 1rem", fontSize: "0.75rem", color: "#b34747", fontFamily: "var(--font-nunito)", fontWeight: 500, cursor: "pointer" }}>
                      제거
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-1 p-1 rounded-lg"
                      style={{ background: "var(--surface-sunken)" }}>
                      {(["file", "url"] as const).map(m => {
                        const active = videoMode === m;
                        return (
                          <button key={m} type="button" onClick={() => setVideoMode(m)}
                            data-active={active}
                            className="vf-selectable px-4 py-1.5 rounded-md text-xs"
                            style={{ fontFamily: "var(--font-nunito)", cursor: "pointer" }}>
                            {m === "file" ? "파일 업로드" : "URL"}
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
                          className="vf-soft-fill w-full rounded-2xl flex flex-col items-center justify-center gap-2 py-10"
                          style={{ fontFamily: "var(--font-nunito)", fontWeight: 500, cursor: videoUploading ? "not-allowed" : "pointer" }}>
                          <span style={{ fontSize: "2.6rem" }}>🎬</span>
                          <span className="text-sm">{videoUploading ? "업로드 중…" : "영상 파일 선택"}</span>
                          <span className="text-xs" style={{ opacity: 0.6 }}>20MB · 30초 이하</span>
                        </button>
                      </>
                    ) : (
                      <input className="vf-input w-full" type="url" name="video_url"
                        placeholder="https://youtube.com/... 또는 https://vimeo.com/..."
                        value={form.video_url} onChange={handleChange}
                        style={{ fontSize: "1.05rem", padding: "1rem 1.2rem", textAlign: "center" }} />
                    )}
                    {videoError && (
                      <p className="text-xs" style={{ color: "#b34747", fontFamily: "var(--font-nunito)" }}>
                        {videoError}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Step 7 — 썸네일 자동/수동 선택 (2등분) */}
          {step === 7 && (
            <div className="flex-1 grid grid-cols-2 gap-3 min-h-0">
              {([
                { id: "auto" as const, emoji: "✨", title: "자동", desc: "OG 이미지나 업로드한 파일에서 자동으로 만들어드려요" },
                { id: "manual" as const, emoji: "🖼️", title: "수동 업로드", desc: "이미지 파일을 직접 올릴게요" },
              ]).map(opt => {
                const active = thumbnailMode === opt.id;
                return (
                  <button key={opt.id} type="button"
                    onClick={() => setThumbnailMode(opt.id)}
                    data-active={active}
                    className="vf-selectable rounded-2xl flex flex-col items-center justify-center gap-5"
                    style={{ cursor: "pointer" }}>
                    <span style={{ fontSize: "4.5rem", lineHeight: 1 }}>{opt.emoji}</span>
                    <span className="vf-serif-display" style={{ fontSize: "1.6rem", fontWeight: 500, color: "inherit" }}>
                      {opt.title}
                    </span>
                    <span style={{ fontSize: "0.9rem", color: "inherit", opacity: 0.62, fontFamily: "var(--font-nunito)", textAlign: "center", maxWidth: 260, lineHeight: 1.55 }}>
                      {opt.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Step 8 — 썸네일 사진 업로드 (수동 선택시만) */}
          {step === 8 && thumbnailMode === "manual" && (
            <div className="flex-1 flex flex-col items-center justify-center min-h-0">
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
                className="vf-soft-fill flex flex-col items-center justify-center gap-4 rounded-2xl"
                style={{ width: "100%", maxWidth: 720, minHeight: 380, cursor: "pointer" }}
              >
                {thumbnailUploading ? (
                  <div className="w-6 h-6 rounded-full border-2 animate-spin"
                    style={{ borderColor: "var(--text-primary)", borderTopColor: "transparent" }} />
                ) : form.thumbnail ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.thumbnail} alt="" style={{ maxWidth: "80%", maxHeight: "70%", borderRadius: 12, objectFit: "cover" }} />
                    <button type="button"
                      onClick={e => { e.stopPropagation(); setForm(prev => ({ ...prev, thumbnail: "" })); }}
                      className="vf-soft-fill rounded-full"
                      style={{ background: "var(--surface)", padding: "0.4rem 0.9rem", fontSize: "0.75rem", color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontWeight: 500, cursor: "pointer" }}>
                      제거하고 다시 올리기
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: "3.6rem", lineHeight: 1 }}>🖼️</span>
                    <span style={{ fontSize: "0.95rem", color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
                      클릭하거나 이미지를 드래그해서 업로드
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
          </div>{/* end step canvas */}

          {/* Save error */}
          {saveError && (
            <div className="px-4 py-3 rounded-xl text-xs mt-3"
              style={{ background: "rgba(179, 71, 71, 0.08)", color: "#8e3535", fontFamily: "var(--font-nunito)", lineHeight: 1.6 }}>
              ⚠ {saveError}
            </div>
          )}

          {/* Navigation — hidden on step 1 (click-to-advance cards) */}
          {step !== 1 && (
            <div className="flex gap-2 mt-5">
              {step > 1 && (
                <button type="button" onClick={() => setStep(s => s - 1)}
                  className="vf-soft-fill rounded-full"
                  style={{ padding: "0.7rem 1.3rem", fontFamily: "var(--font-nunito)", fontSize: "0.9rem", fontWeight: 500, cursor: "pointer" }}>
                  ← 이전
                </button>
              )}
              <div className="flex-1" />
              {/* 건너뛰기 — 콘텐츠 유형(4), 개발 도구(5), 영상(6)에서만.
                  무언가를 선택하면 비활성화되어 다음 버튼만 누를 수 있다. */}
              {(step === 4 || step === 5 || step === 6) && (
                <button type="button" onClick={() => setStep(s => s + 1)}
                  disabled={skipDisabled}
                  className="vf-soft-fill rounded-full"
                  style={{
                    padding: "0.7rem 1.3rem",
                    fontFamily: "var(--font-nunito)",
                    fontSize: "0.9rem",
                    fontWeight: 500,
                    opacity: skipDisabled ? 0.4 : 1,
                    cursor: skipDisabled ? "not-allowed" : "pointer",
                  }}>
                  건너뛰기
                </button>
              )}
              {step < TOTAL_STEPS ? (
                <button type="button"
                  onClick={() => setStep(s => s + 1)}
                  disabled={nextDisabled}
                  className="vf-soft-fill rounded-full"
                  style={{
                    padding: "0.7rem 1.6rem",
                    fontFamily: "var(--font-nunito)",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    opacity: nextDisabled ? 0.4 : 1,
                    cursor: nextDisabled ? "not-allowed" : "pointer",
                  }}>
                  다음 →
                </button>
              ) : (
                <button type="submit" disabled={submitDisabled}
                  className="vf-soft-fill rounded-full"
                  style={{
                    padding: "0.7rem 1.6rem",
                    fontFamily: "var(--font-nunito)",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    opacity: submitDisabled ? 0.4 : 1,
                    cursor: submitDisabled ? "not-allowed" : "pointer",
                  }}>
                  {saving ? "저장 중…" : submitLabel}
                </button>
              )}
            </div>
          )}
        </form>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6"
      style={{ background: "var(--overlay-strong)", backdropFilter: "blur(16px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Outer wrapper — immersive size (~70vw) */}
      <div
        className="relative flex overflow-hidden"
        style={{
          width: wizard
            ? (showPreview ? "min(calc(70vw + 100px), 1500px)" : "min(70vw, 1300px)")
            : (showPreview ? "min(calc(42rem + 361px), calc(100vw - 2rem))" : "min(42rem, calc(100vw - 2rem))"),
          height: wizard ? "min(80vh, 880px)" : undefined,
          maxHeight: wizard ? undefined : "92vh",
          transition: "width 0.32s cubic-bezier(0.4,0,0.2,1)",
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
            aria-label="닫기">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>


        {/* ── Left: form panel ── */}
        <div
          className="flex flex-col overflow-hidden"
          style={{ flex: 1, minWidth: 0 }}
        >

        {/* Non-wizard header (edit mode keeps the original title) */}
        {!wizard && (
          <div className="sticky top-0 z-10 flex items-center gap-3 px-6 py-4"
            style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
            <h2 className="flex-1 vf-serif-display" style={{ fontSize: "1.2rem", fontWeight: 500, margin: 0 }}>
              {title}
            </h2>
          </div>
        )}

        <form onSubmit={handleSubmit}
          className={wizard
            ? "flex-1 flex flex-col min-h-0 px-10 pt-12 pb-20"
            : "px-6 py-5 flex flex-col gap-5"}>


          {/* ── Non-wizard (edit) mode — flat layout ── */}
          {!wizard && (
            <div className="flex gap-1 p-1 rounded-xl"
              style={{ background: "var(--surface-sunken)" }}>
              {(["url", "files"] as const).map(mode => {
                const active = uploadMode === mode;
                return (
                  <button key={mode} type="button" onClick={() => setUploadMode(mode)}
                    data-active={active}
                    className="vf-soft-fill flex-1 py-2 rounded-lg text-sm"
                    style={{
                      fontFamily: "var(--font-nunito)",
                      cursor: "pointer",
                    }}>
                    {mode === "url" ? "🔗 URL 링크" : "📁 파일 업로드"}
                  </button>
                );
              })}
            </div>
          )}

          {/* File upload */}
          <div style={{ display: wizard ? "none" : undefined }}>
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
                    업로드된 사이트가 연결돼 있어요 — 새로 올리면 교체돼요.
                  </p>
                </div>
              )}
              {/* Guide notice */}
              <div className="flex gap-2.5 px-3.5 py-3 rounded-xl"
                style={{ background: "var(--surface-soft)" }}>
                <span style={{ fontSize: "0.85rem", flexShrink: 0, marginTop: "1px" }}>💡</span>
                <div style={{ fontFamily: "var(--font-nunito)", fontSize: "0.72rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
                  <span style={{ fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-serif), 'Noto Serif KR', serif" }}>React / Vue / Vite 프로젝트라면</span>{" "}
                  소스 폴더 대신 <code className="vf-mono" style={{ background: "var(--surface)", padding: "1px 5px", borderRadius: 4, fontSize: "0.68rem", color: "var(--text-primary)" }}>npm run build</code> 후 생성된{" "}
                  <code className="vf-mono" style={{ background: "var(--surface)", padding: "1px 5px", borderRadius: 4, fontSize: "0.68rem", color: "var(--text-primary)" }}>dist/</code> 폴더를 올려주세요.
                  순수 HTML/CSS/JS 파일은 그대로 올려도 돼요.
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
                  HTML, CSS, JS, 이미지 파일 지원 · 최대 25MB · 드래그해서 올려도 돼요
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="vf-soft-fill rounded-full"
                    style={{ padding: "0.5rem 1rem", fontSize: "0.8rem", fontFamily: "var(--font-nunito)", fontWeight: 500, cursor: "pointer" }}>
                    파일 선택
                  </button>
                  <button type="button" onClick={() => folderInputRef.current?.click()}
                    className="vf-soft-fill rounded-full"
                    style={{ padding: "0.5rem 1rem", fontSize: "0.8rem", fontFamily: "var(--font-nunito)", fontWeight: 500, cursor: "pointer" }}>
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

          {/* URL input — 내부 preview 경로는 여기 노출하지 않는다(파일 탭이 연결
              상태를 보여줌). 입력하면 그 외부 URL로 교체된다. */}
          {uploadMode === "url" && (
            <Field label="데모 URL">
              <input className="vf-input" name="demo_url" type="url"
                placeholder="https://myproject.vercel.app"
                value={isUploadedProject(form.demo_url) ? "" : form.demo_url}
                onChange={handleChange} />
            </Field>
          )}
          </div>{/* end step 2 wrapper */}

          {/* 핵심 기능 소개 — 위저드에만 있던 칸. 초안 카드가 이 값을 보여주며
              "수정" 버튼을 주는데 정작 모달에 칸이 없어 한 번 쓰면 못 고쳤다. */}
          <div style={{ display: wizard ? "none" : undefined }}>
            <Field label="핵심 기능 소개 (자동 시연용 · 선택)">
              <textarea className="vf-input" name="demo_user_hint" rows={2}
                placeholder="예: 캔버스에 마우스로 자유롭게 그림을 그릴 수 있어요. 상단에서 브러시 색과 굵기를 바꿔보세요."
                value={form.demo_user_hint ?? ""} onChange={handleChange}
                maxLength={500}
                style={{ resize: "vertical", lineHeight: 1.6 }} />
            </Field>
            <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
              자동 시연 영상이 이 설명을 보고 핵심 기능부터 보여드려요.
            </p>
          </div>

          {/* 구동 영상 (선택) — 대표 작품 hero에서 자동 재생 */}
          <div style={{ display: wizard ? "none" : undefined }}>
            <label className="vf-label">구동 영상 (선택)</label>
            <p className="text-xs mb-2" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
              대표 작품으로 설정하면 명함 상단에서 자동 재생돼요.
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
                  style={{ background: "var(--surface-sunken)" }}>
                  {(["file", "url"] as const).map(m => {
                    const active = videoMode === m;
                    return (
                      <button key={m} type="button" onClick={() => setVideoMode(m)}
                        data-active={active}
                        className="vf-soft-fill px-3 py-1 rounded-md text-xs"
                        style={{
                          fontFamily: "var(--font-nunito)",
                          cursor: "pointer",
                        }}>
                        {m === "file" ? "파일 업로드" : "URL"}
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

          <div style={{ display: wizard ? "none" : undefined }} className="flex flex-col gap-5">
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
          </div>{/* end step 3 wrapper */}

          {/* 콘텐츠 유형 — 풀 너비 */}
          <div style={{ display: wizard ? "none" : undefined }}>
            <label className="vf-label">콘텐츠 유형</label>
            <div className="flex flex-wrap gap-1.5">
              {CONTENT_TYPES.map(ct => {
                const active = form.content_type === ct.id;
                return (
                  <button key={ct.id} type="button"
                    onClick={() => setForm(prev => ({ ...prev, content_type: active ? null : ct.id }))}
                    data-active={active}
                    className="vf-soft-fill px-2.5 py-1 rounded-full text-xs"
                    style={{
                      fontFamily: "var(--font-nunito)",
                      cursor: "pointer",
                    }}>
                    {active && <span style={{ fontSize: "0.7em" }}>✓</span>} {ct.emoji} {ct.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 썸네일 업로드 */}
          <div style={{ display: wizard ? "none" : undefined }}>
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
          <div style={{ display: wizard ? "none" : undefined }}>
            <label className="vf-label">썸네일 유형</label>
            <div className="flex gap-2">
              {(["image", "video"] as const).map(t => {
                const active = form.type === t;
                return (
                  <button key={t} type="button"
                    onClick={() => setForm(prev => ({ ...prev, type: t }))}
                    data-active={active}
                    className="vf-soft-fill flex-1 py-2 rounded-xl text-sm"
                    style={{
                      fontFamily: "var(--font-nunito)",
                      cursor: "pointer",
                    }}>
                    {active && <span style={{ marginRight: 4 }}>✓</span>}{t === "image" ? "🖼️ 이미지" : "🎬 영상"}
                  </button>
                );
              })}
            </div>
          </div>

          {/* AI 도구 */}
          <div style={{ display: wizard ? "none" : undefined }}>
            <label className="vf-label">
              사용한 AI 도구{" "}
              <span style={{ color: "var(--text-muted)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(복수 선택)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {visibleTools.map(tool => {
                const active = selectedTools.includes(tool.id);
                return (
                  <button key={tool.id} type="button" onClick={() => toggleTool(tool.id)}
                    data-active={active}
                    className="vf-soft-fill flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
                    style={{
                      fontFamily: "var(--font-nunito)",
                      cursor: "pointer",
                    }}>
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
                  ? "접기 ↑"
                  : `더보기 +${AI_TOOLS.length - AI_TOOLS_INITIAL - hiddenSelectedCount}`}
              </button>
            </div>
          </div>

          {/* 한 마디 */}
          <div style={{ display: wizard ? "none" : undefined }}>
            <Field label="한 마디 (말풍선에 표시)">
              <input className="vf-input" name="comment" placeholder="제가 제일 아끼는 작업물이에요! ⭐"
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
          {!wizard && (
            <div className="flex gap-3 pt-1 pb-1">
              <button type="button" onClick={onClose}
                className="vf-soft-fill flex-1 rounded-full"
                style={{ padding: "0.65rem 1rem", fontFamily: "var(--font-nunito)", fontSize: "0.85rem", fontWeight: 500, cursor: "pointer" }}>
                취소
              </button>
              <button type="submit" disabled={saving || uploading}
                className="vf-soft-fill flex-1 rounded-full"
                style={{ padding: "0.65rem 1rem", fontFamily: "var(--font-nunito)", fontSize: "0.85rem", fontWeight: 600, cursor: (saving || uploading) ? "not-allowed" : "pointer" }}>
                {saving ? "저장 중…" : submitLabel}
              </button>
            </div>
          )}

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
              <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: "var(--surface-sunken)" }}>
                {(["grid", "list"] as const).map(l => {
                  const active = previewLayout === l;
                  return (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setPreviewLayout(l)}
                      data-active={active}
                      className="vf-soft-fill px-2 py-1 rounded-md text-xs"
                      style={{
                        fontFamily: "var(--font-nunito)",
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
