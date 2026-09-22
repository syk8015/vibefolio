"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { RerecordRequestModal } from "@/components/dashboard/RerecordRequestModal";
import Modal from "@/components/Modal";
import { detectDemoSource } from "@/lib/demoSource";
import { AnalyticsEvent, trackClientEvent } from "@/lib/analytics-client";
import { PUBLIC_PROJECT_SELECT } from "@/lib/projectColumns";

import { useT } from "@/lib/i18n/client";
import { deleteSwappedAssets } from "./projects/helpers";
import { type DBProject, type ProjectForm } from "./projects/types";
import { DraftRow, ProjectRow } from "./projects/rows";
import { ProjectFormModal } from "./projects/ProjectFormModal";
import { AddProjectModal } from "./projects/AddProjectModal";
import { DraftReviewModal, type DraftPatch } from "./projects/DraftReviewModal";
import { useDemoStatusSync } from "./projects/useDemoStatusSync";
import { useDraftArrival } from "./projects/useDraftArrival";
import {
  applyPrivate,
  fetchOwnerPrivate,
  hasPrivate,
  mergeRow,
  type OwnerPrivate,
  type UserKeyRow,
} from "./projects/ownerPrivate";

// username comes from DashboardClient's profiles row (the handle public links
// actually resolve) — deriving it here from auth metadata could hand ShareKit
// a stale handle when the two sources drift.
// openAddRequested: 대시보드 환영 배너의 "첫 작품 추가하기"가 연결 창을 열어 달라는
// 신호. 연결 창 상태가 이 안에 있어 배너가 직접 못 연다(B2) — 열고 나면
// onAddRequestHandled로 신호를 끈다(탭을 오갈 때 다시 열리지 않게).
export default function ProjectsTab({
  user,
  username,
  reviewProjectId,
  openAddRequested = false,
  onAddRequestHandled,
}: {
  user: User;
  username: string;
  reviewProjectId?: string | null;
  openAddRequested?: boolean;
  onAddRequestHandled?: () => void;
}) {
  const { t } = useT();
  const router = useRouter();
  const [projects, setProjects] = useState<DBProject[]>([]);
  const [drafts, setDrafts] = useState<DBProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editProject, setEditProject] = useState<DBProject | null>(null);
  // 검토 창은 id만 들고 drafts에서 그린다 — 열린 순간의 사본을 들고 있으면
  // 뒤이은 UPDATE(파일 업로드 후 demo_url, AI가 고친 대본)가 창에 안 닿아,
  // 빈 주소로 공개돼 촬영이 빠지거나 옛 대본으로 덮어쓰게 된다.
  const [reviewDraftId, setReviewDraftId] = useState<string | null>(null);
  const reviewDraft = reviewDraftId ? drafts.find((d) => d.id === reviewDraftId) ?? null : null;
  // 수정 창을 **연 순간**의 로봇 메모와 "그 값을 서버에서 받아 봤나". 창은 열릴 때 폼을 한 번
  // 채우므로, 그 뒤에 비공개 칸이 도착해도 폼엔 빈 칸이 남는다 — 그때 저장하면 "모름"을 "지움"으로
  // 보내지 않게 연 순간 기준으로 가른다(창을 다시 띄우면 입력 중인 글이 날아가서 안 띄운다).
  const [editHint, setEditHint] = useState<{ value: string | null; known: boolean }>({ value: null, known: false });
  function openEdit(p: DBProject) {
    const live = [...projects, ...drafts].find((x) => x.id === p.id) ?? p;
    setEditHint({ value: live.demo_user_hint ?? null, known: privLoaded.has(p.id) });
    setEditProject(live);
  }
  // ?review 딥링크는 첫 매칭 때 한 번만 모달을 연다 — 닫은 뒤 drafts가 갱신될
  // 때마다 다시 열리면 안 되니까.
  const reviewLinkConsumed = useRef(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  // 재촬영 창은 id만 쥐고 목록의 최신 행을 본다 — 대기 대본(비공개 칸)이 창을 연 뒤에 도착할 수 있다.
  const [rerecordId, setRerecordId] = useState<string | null>(null);
  const rerecordModal = rerecordId ? projects.find((p) => p.id === rerecordId) ?? null : null;
  const [notice, setNotice] = useState<string | null>(null);
  // 삭제 확인은 브라우저 confirm 대신 모달 — 디자인이 끊기고, 인앱 브라우저에선
  // confirm 창 자체가 막히기도 한다(B19).
  const [deleteTarget, setDeleteTarget] = useState<DBProject | null>(null);

  // 비공개 칸(대본·로그인 답·로봇 메모·촬영 에러 원문·촬영 소스)은 사용자 키로 못 읽어
  // /api/projects/private에서 따로 받아 id로 합친다(2026-09-23, projects/ownerPrivate.ts).
  // privLoaded = 서버에서 비공개 칸을 실제로 받아 본 행. 못 받은 행(요청 실패)은 화면에
  // null로 보여도 DB엔 값이 있을 수 있다 — 수정 저장이 그 null로 로봇 메모를 지우지 않게,
  // 검토 창이 "대본 없음"이라고 거짓말하지 않게 가른다(렌더에서 봐야 해서 state).
  const [privLoaded, setPrivLoaded] = useState<ReadonlySet<string>>(() => new Set());
  const markPrivLoaded = (ids: Iterable<string>) =>
    setPrivLoaded((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next.size === prev.size ? prev : next;
    });
  // 목록 재조회 때 "화면에 있던 비공개 칸"을 지키려고 최신 두 목록을 본다.
  const rowsRef = useRef<DBProject[]>([]);
  const showAddModalRef = useRef(showAddModal);
  useEffect(() => {
    rowsRef.current = [...projects, ...drafts];
    showAddModalRef.current = showAddModal;
  });

  // 행별 세대 번호 — 비공개 칸 요청을 시작할 때와 이 화면이 그 칸을 직접 쓸 때 올린다.
  // 응답이 올 때 세대가 그대로인 행만 얹는다. 늦게 온 옛 응답(빠른 대본 수정 두 번 사이의
  // 요청 등)이 방금 쓴 새 값을 덮으면, 다음 수정이 그 옛 대본을 기준으로 DB까지 되돌린다.
  const privGen = useRef(new Map<string, number>());
  const bumpPrivGen = (id: string) => privGen.current.set(id, (privGen.current.get(id) ?? 0) + 1);

  async function landPrivate(pending: Promise<Map<string, OwnerPrivate> | null>, snap: Map<string, number>) {
    const priv = await pending;
    if (!priv?.size) return;
    const fresh = new Map([...priv].filter(([id]) => privGen.current.get(id) === snap.get(id)));
    if (!fresh.size) return;
    markPrivLoaded(fresh.keys());
    const apply = (prev: DBProject[]) => applyPrivate(prev, fresh);
    setProjects(apply);
    setDrafts(apply);
  }

  // 그 행들(없으면 전부)의 비공개 칸만 서버에서 받아 두 목록에 얹는다. 실패하면 조용히
  // 넘긴다 — 화면에 있던 값이 그대로 남고, 다음 갱신 때 다시 묻는다.
  function loadPrivate(ids?: string[]) {
    for (const id of ids ?? rowsRef.current.map((p) => p.id)) bumpPrivGen(id);
    return landPrivate(fetchOwnerPrivate(ids), new Map(privGen.current));
  }

  // realtime·폴링이 부르는 쪽 — 짧은 틈에 몰린 요청을 한 번으로 묶는다(대표 지정 한 번에
  // 행마다 이벤트가 와도 요청은 하나).
  const refreshQueue = useRef(new Set<string>());
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function refreshPrivate(ids: string[]) {
    for (const id of ids) refreshQueue.current.add(id);
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      const batch = [...refreshQueue.current];
      refreshQueue.current.clear();
      if (batch.length) void loadPrivate(batch);
    }, 250);
  }
  useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
  }, []);

  // 검토·수정 창을 여는데 그 행의 비공개 칸을 아직 못 받았으면(첫 요청 실패) 다시 묻는다.
  const openedId = reviewDraftId ?? editProject?.id ?? rerecordId ?? null;
  useEffect(() => {
    if (openedId && !privLoaded.has(openedId)) void loadPrivate([openedId]);
    // loadPrivate는 매 렌더 새 함수지만 ref만 만진다 — 창이 바뀔 때만 다시 묻는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedId]);

  // 촬영 상태 배지의 realtime 구독 + 폴백 폴링 (projects/useDemoStatusSync.ts).
  const { demoPaused, nowMs } = useDemoStatusSync(
    user.id, projects, drafts, setProjects, setDrafts, refreshPrivate,
    (ids) => {
      for (const id of ids) bumpPrivGen(id);
      markPrivLoaded(ids);
    },
  );

  // AI가 초안을 올리는 순간(INSERT) 목록에 바로 꽂는다. 연결 모달이 열려 있었다면
  // — 즉 사용자가 프롬프트를 복사하고 AI 응답을 기다리고 있었다면 — 모달을 닫고
  // 그 초안의 검토 화면으로 데려간다(2026-09-05 요청 6: 수동 이동 + 새로고침 제거).
  // arriving: 비공개 칸을 받는 사이 realtime과 폴링이 같은 초안을 또 넘겨도 한 번만.
  const arriving = useRef(new Set<string>());
  useDraftArrival(user.id, {
    active: showAddModal,
    onArrive: async (row) => {
      if (drafts.some((d) => d.id === row.id) || arriving.current.has(row.id)) return;
      arriving.current.add(row.id);
      // 목록엔 **먼저** 꽂는다 — 인제스트는 INSERT 직후 같은 요청에서 demo_url·썸네일을
      // UPDATE한다. 비공개 칸을 기다리는 동안 그 realtime UPDATE가 오면 합칠 행이 없어 버려진다.
      setDrafts((prev) => (prev.some((d) => d.id === row.id) ? prev : [mergeRow(undefined, row), ...prev]));
      // 검토 창이 보여 줄 대본·로그인 답·로봇 메모는 비공개 칸이라 도착 행에 없을 수
      // 있다 — 창은 그걸 받은 뒤에 연다(못 받으면 창이 "불러오는 중" 자리를 보여 준다).
      if (hasPrivate(row)) {
        bumpPrivGen(row.id);
        markPrivLoaded([row.id]);
      }
      else await loadPrivate([row.id]);
      // 기다리는 사이 사용자가 연결 창을 닫았을 수 있다 — 지금 상태로 가른다.
      if (showAddModalRef.current) {
        setShowAddModal(false);
        setReviewDraftId(row.id);
      } else {
        // 모달이 닫힌 채로 도착하면 화면을 가로채지 않고 토스트로만 알린다.
        setNotice(t.projects.draftArrived(row.title || t.projects.untitled));
      }
      router.refresh();
    },
  });

  // 공개 화면에 보이는 게 바뀐 뒤: 명함·작품 페이지 캐시(60초)를 비우고, 서버가
  // 센 탭 숫자·미니 명함 No.도 다시 받는다. 캐시 비우기 실패는 60초 뒤 저절로
  // 풀리니 조용히 넘긴다.
  function syncPublic() {
    fetch("/api/revalidate", { method: "POST" }).catch(() => {});
    router.refresh();
  }

  async function loadProjects() {
    const supabase = createClient();
    // 공개 칸은 사용자 키로, 비공개 칸은 서버 라우트로 — 같이 받아 id로 합친다.
    // 비공개 쪽이 실패해도 목록은 뜬다(그 칸만 화면에 있던 값, 처음이면 빈 값).
    // 비공개 쪽을 기다리느라 목록이 스피너에 묶이지 않게 공개 칸부터 그리고, 비공개 칸은
    // 도착하면 얹는다(같이 출발시켜 대기 시간은 겹친다).
    for (const p of rowsRef.current) bumpPrivGen(p.id);
    const snap = new Map(privGen.current);
    const priv = fetchOwnerPrivate();
    const { data } = await supabase
      .from("projects").select(PUBLIC_PROJECT_SELECT).eq("user_id", user.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    const known = new Map(rowsRef.current.map((p) => [p.id, p]));
    const all = ((data ?? []) as unknown as UserKeyRow[]).map((r) => mergeRow(known.get(r.id), r));
    // 초안은 별도 리스트 — 공개 프로젝트의 순서/드래그 인덱스와 섞이지 않게.
    setProjects(all.filter((p) => !p.is_draft));
    setDrafts(all.filter((p) => p.is_draft));
    setLoading(false);
    await landPrivate(priv, snap);
  }

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(t);
  }, [notice]);

  // 마운트 시 1회 데이터 로드(setState는 전부 응답 뒤라 캐스케이드 렌더가 없다).
  // 의존성도 의도적으로 마운트 1회.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        setReviewDraftId(match.id);
      }
    }
  }, [reviewProjectId, drafts]);

  useEffect(() => {
    if (!openAddRequested) return;
    // 배너 클릭 1회 소비 — 위 ?review 딥링크와 같은 단발 오픈.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowAddModal(true);
    onAddRequestHandled?.();
  }, [openAddRequested, onAddRequestHandled]);

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
    syncPublic();
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
      return;
    }
    syncPublic();
  }


  async function handleRerecord(id: string) {
    const project = projects.find(p => p.id === id);
    // A landed video is locked to one take — collect a change request for an admin
    // instead of silently re-shooting (and re-spending).
    if (project && (project.demo_video_url || project.demo_build_status === "done")) {
      setRerecordId(project.id);
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
          if (project) setRerecordId(project.id);
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

  async function handleEdit(id: string, form: ProjectForm, hintKnown: boolean) {
    const supabase = createClient();
    // 초안 수정도 이 경로로 온다 — projects에서만 찾으면 초안의 이전 값이 안
    // 잡혀 교체된 파일 청소가 건너뛰어지고, 갱신도 공개 리스트에만 반영됐다.
    const before = projects.find(p => p.id === id) ?? drafts.find(p => p.id === id);
    const hint = form.demo_user_hint?.trim() || null;
    const patch: Partial<ProjectForm> = { ...form, demo_user_hint: hint };
    // 비공개 칸을 못 받아 온 행이면 폼의 빈 로봇 메모는 "모름"이지 "지움"이 아니다 —
    // 그대로 보내면 DB의 메모를 null로 지운다. 새로 적은 게 없으면 그 칸은 안 보낸다.
    if (hint === null && !hintKnown) delete patch.demo_user_hint;
    // 돌려받는 건 공개 칸만 — 비공개 칸까지 달라고(select()) 하면 SQL 적용 뒤 거절된다.
    const { data, error } = await supabase
      .from("projects")
      .update(patch)
      .eq("id", id).select(PUBLIC_PROJECT_SELECT).single();
    if (error) {
      // DB 원문("new row violates …")을 화면에 그대로 띄우지 않는다(B16).
      console.error("project edit failed", error);
      throw new Error(t.projectForm.saveFailed);
    }
    if (data) {
      const updated = data as unknown as UserKeyRow;
      // 기존 행 위에 얹고, 방금 쓴 로봇 메모(비공개 칸)는 보낸 값에서 가져온다.
      const own = "demo_user_hint" in patch ? { demo_user_hint: hint } : {};
      // 이 화면이 방금 그 칸을 썼다 — 그 전에 출발한 비공개 칸 응답은 버리고, 아직 한 번도
      // 못 받은 행이면 다시 묻는다(버린 응답이 그 행의 첫 응답이었을 수 있다).
      if ("demo_user_hint" in patch) {
        bumpPrivGen(id);
        if (!privLoaded.has(id)) refreshPrivate([id]);
      }
      const apply = (prev: DBProject[]) =>
        prev.map(p => (p.id === id ? { ...mergeRow(p, updated), ...own } : p));
      if (updated.is_draft) setDrafts(apply);
      else setProjects(apply);
      if (before) await deleteSwappedAssets(id, before, updated);
      if (!updated.is_draft) syncPublic();
    }
    setEditProject(null);
  }

  // 초안 검토 모달의 "살짝 고치기"(제목·소개글·한마디·대본 순서). 초안은 아직
  // 촬영 전이라 이 값이 그대로 명함·필름이 된다. 실패는 모달이 받아서 표시한다.
  async function handleSaveDraft(id: string, patch: DraftPatch) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("projects").update(patch).eq("id", id).select(PUBLIC_PROJECT_SELECT).single();
    if (error) throw new Error(error.message);
    // 돌려받는 건 공개 칸뿐 — 방금 고친 대본(비공개 칸)은 보낸 patch에서 얹는다.
    const updated = data as unknown as UserKeyRow;
    // 방금 쓴 대본보다 먼저 출발한 비공개 칸 응답이 늦게 와서 되돌리지 않게 — 대본을 쓸 때만.
    // 버린 응답이 그 행의 첫 응답이었을 수 있으니, 아직 못 받은 행이면 다시 묻는다.
    if ("demo_script" in patch) {
      bumpPrivGen(id);
      if (!privLoaded.has(id)) refreshPrivate([id]);
    }
    setDrafts(prev => prev.map(p => (p.id === id ? { ...mergeRow(p, updated), ...patch } : p)));
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
    let failed = false;
    if (next) {
      const { error } = await supabase.from("projects")
        .update({ is_featured: false })
        .eq("user_id", user.id)
        // 이미 false인 행까지 다시 쓰면 행마다 realtime UPDATE가 간다 — 결과는 같으니 대표였던 행만.
        .eq("is_featured", true)
        .neq("id", id);
      failed = !!error;
    }
    if (!failed) {
      const { error } = await supabase.from("projects").update({ is_featured: next }).eq("id", id);
      failed = !!error;
    }
    // 실패하면 화면만 대표로 보이고 공개 명함엔 반영 안 된 채 남는다 — 서버 값으로
    // 되돌리고 알린다(B18).
    if (failed) {
      setNotice(t.projects.featuredFailed);
      loadProjects();
      return;
    }
    syncPublic();
  }

  async function handlePublishDraft(stale: DBProject) {
    // 초안 → 공개: is_draft=false로 내리고 published 리스트로 옮긴 뒤, 기존 추가
    // 플로우와 동일하게 자동 시연을 트리거한다(쿼터·모더레이션·held 전부 상속).
    const supabase = createClient();
    // 화면의 행은 realtime이 놓친 UPDATE(2단계 업로드의 demo_url 등)를 모를 수
    // 있다 — 촬영 판정은 DB의 지금 값으로 한다. 못 읽으면 화면 값으로 진행.
    // 촬영 판정은 공개 칸만 쓴다 — 비공개 칸(AI가 고친 대본 등)은 기다리지 않고 옮긴 뒤 얹는다.
    const { data: fresh } = await supabase
      .from("projects").select(PUBLIC_PROJECT_SELECT).eq("id", stale.id).maybeSingle();
    const project: DBProject = fresh ? mergeRow(stale, fresh as unknown as UserKeyRow) : stale;
    // 인제스트로 들어온 수동 시연 영상(video_url)이 있으면 자동 촬영 생략 — 위
    // handleAdd와 같은 이유(노출 순위상 촬영본이 보이지 않음).
    const source = project.video_url ? null : detectDemoSource(project.demo_url);
    // 방금 공개한 작품은 맨 앞에 — 인제스트는 sort_order를 "기존 행 수"로 넣어
    // 그대로 두면 명함 맨 뒤에 붙고, 첫 화면에서 안 보여 "올라간 게 맞나?"가 된다.
    const sortOrder = projects.reduce((min, p) => Math.min(min, p.sort_order ?? 0), 0) - 1;
    const base: DBProject = { ...project, is_draft: false, sort_order: sortOrder };
    const published: DBProject = source
      ? { ...base, demo_build_status: "pending", demo_source_type: source.type, demo_source_value: source.value }
      : base;
    setDrafts(prev => prev.filter(p => p.id !== project.id));
    setProjects(prev => [published, ...prev]);
    void loadPrivate([project.id]);

    const { error } = await supabase.from("projects").update({ is_draft: false, sort_order: sortOrder }).eq("id", project.id);
    if (error) {
      // 롤백 — 다시 초안으로.
      setProjects(prev => prev.filter(p => p.id !== project.id));
      setDrafts(prev => (prev.some(p => p.id === project.id) ? prev : [project, ...prev]));
      setNotice(t.projects.publishFailed);
      return;
    }
    syncPublic();
    trackClientEvent(AnalyticsEvent.ProjectCreated, { projectId: project.id, demoSource: source?.type ?? null });
    // 공개 직후 "다음에 무슨 일이 일어나는지"를 바로 말해준다(2026-09-04, 인터뷰 ⑤).
    // 전엔 실패할 때만 알림이 떴고, 성공하면 모달이 닫히며 행이 목록으로 옮겨질 뿐이었다.
    setNotice(!source
      ? t.projects.publishedNoticeNoDemo
      : demoPaused ? t.projects.publishedNoticePaused : t.projects.publishedNotice);
    if (source) {
      fetch(`/api/projects/${project.id}/trigger-demo`, { method: "POST" })
        .then(async (res) => {
          const body = await res.json().catch(() => ({}));
          if (res.ok) {
            // 하루 한도에 걸려 관리자 승인 대기로 빠졌으면 "촬영 시작" 알림을
            // 바로잡는다 — 재시도 경로(handleRerecord)와 같은 처리.
            if (body.held) {
              setProjects(prev => prev.map(p => p.id === project.id ? { ...p, demo_build_status: "held", demo_build_error: null } : p));
              setNotice(body.message ?? t.projects.heldNotice);
            }
            return;
          }
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
          {t.projects.projectsCount(projects.length)}
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
            <p
              className="text-xs mx-auto"
              style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", maxWidth: "26rem", lineHeight: 1.6 }}
            >
              {t.projects.emptyBody}
            </p>
            <button onClick={() => setShowAddModal(true)} className="vf-button-primary mt-5">
              {t.projects.emptyCta}
            </button>
          </div>
        ) : (
          <>
            {drafts.map((d, i) => (
              <DraftRow
                key={d.id}
                draft={d}
                highlight={d.id === reviewProjectId}
                isLast={projects.length === 0 && i === drafts.length - 1}
                onEdit={() => openEdit(d)}
                onDelete={() => setDeleteTarget(d)}
                onPublish={() => handlePublishDraft(d)}
                onReview={() => setReviewDraftId(d.id)}
              />
            ))}
            {projects.map((project, i) => (
              <ProjectRow
                key={project.id}
                project={project}
                username={username}
                demoPaused={demoPaused}
                nowMs={nowMs}
                onDelete={() => setDeleteTarget(project)}
                onEdit={() => openEdit(project)}
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

      {/* 추가 = AI 연결 모달 하나. 수동 위저드는 2026-08-25 폐기(새로 올리는 길은
          AI 경로로 통일 — 만든 AI가 촬영 대본까지 써 줘야 시연 영상이 제대로 나온다).
          여기서 프로젝트 행을 만들지 않으므로 삽입·촬영 트리거는 /api/ingest가 맡는다. */}
      {showAddModal && <AddProjectModal onClose={() => setShowAddModal(false)} />}

      {/* 초안 검토 — 행 클릭/메일 딥링크로 진입, AI가 쓴 전체 내용+미리보기 확인. */}
      {reviewDraft && (
        <DraftReviewModal
          // 초안마다 새 인스턴스 — 미리보기 임베드 판정이 초안별 초기값이라,
          // 인스턴스가 재사용되면 앞 초안의 판정이 잠깐 남는다.
          // 파일 업로드가 끝나 주소가 늦게 채워지면 미리보기 판정도 다시 한다.
          key={`${reviewDraft.id}:${reviewDraft.demo_url}`}
          draft={reviewDraft}
          privateReady={privLoaded.has(reviewDraft.id)}
          onClose={() => setReviewDraftId(null)}
          onPublish={() => { const d = reviewDraft; setReviewDraftId(null); handlePublishDraft(d); }}
          onEdit={() => { openEdit(reviewDraft); setReviewDraftId(null); }}
          onDelete={() => { setDeleteTarget(reviewDraft); setReviewDraftId(null); }}
          onSave={(patch) => handleSaveDraft(reviewDraft.id, patch)}
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
            demo_user_hint: editHint.value,
          }}
          onClose={() => setEditProject(null)}
          onSubmit={form => handleEdit(editProject.id, form, editHint.known)}
          submitLabel={t.projects.submitSave} userId={user.id} />
      )}

      {rerecordModal && (
        <RerecordRequestModal
          // 창은 처음 뜰 때 대기 대본 유무로 모드를 정한다 — 비공개 칸이 늦게 오면 그때 다시 띄운다.
          key={`${rerecordModal.id}:${privLoaded.has(rerecordModal.id) ? "p" : "-"}`}
          project={rerecordModal}
          onClose={() => setRerecordId(null)}
          onDone={(message) => {
            setRerecordId(null);
            setNotice(message);
            // 촬영이 시작되면 상태 배지·대기 대본이 바뀐다 — 서버 상태를 다시 읽는다.
            void loadProjects();
          }}
        />
      )}

      {deleteTarget && (
        <Modal onClose={() => setDeleteTarget(null)} ariaLabel={t.projects.deleteConfirm} maxWidth="24rem">
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)", margin: 0 }}>
            {t.projects.deleteConfirm}
          </h2>
          <p className="text-sm mt-1 vf-mono truncate" style={{ color: "var(--text-secondary)" }}>
            {deleteTarget.title || t.projects.untitled}
          </p>
          <p className="text-sm mt-3" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", lineHeight: 1.6 }}>
            {t.projects.deleteBody}
          </p>
          <div className="flex justify-end gap-2 mt-5">
            <button type="button" className="vf-button-ghost" onClick={() => setDeleteTarget(null)}>
              {t.projects.deleteCancel}
            </button>
            <button
              type="button"
              className="vf-button-primary"
              style={{ background: "var(--danger)" }}
              onClick={() => { const id = deleteTarget.id; setDeleteTarget(null); void handleDelete(id); }}
            >
              {t.projects.deleteCta}
            </button>
          </div>
        </Modal>
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
