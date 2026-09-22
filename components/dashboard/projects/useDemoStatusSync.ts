import { useState, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { createClient } from "@/lib/supabase/client";
import { type DBProject, DEMO_IN_FLIGHT, DEMO_POLL_MS, DEMO_POLL_PAUSED_MS } from "./types";
import { hasPrivate, mayTouchPrivate, mergeRow } from "./ownerPrivate";

// 촬영 상태 배지 동기화 훅. ProjectsTab에서 이동(분해 4/N) — realtime 구독과
// 폴백 폴링이 한 쌍으로만 의미가 있어 함께 산다. 두 리스트(setProjects/setDrafts)
// 모두에 같은 머지를 흘려보내는 구조는 원본 그대로.
//
// 비공개 칸(촬영 에러 원문·촬영 소스·대본)은 사용자 키로 못 읽는다(2026-09-23,
// lib/projectColumns.ts). 여기 들어오는 갱신은 공개 칸뿐이라 기존 행 위에 얹기만 하고,
// 비공개 칸도 바뀌었을 만한 갱신(상태 전이·새 대본·초안)이면 refreshPrivate로 그 행만
// 서버에 다시 묻는다(ownerPrivate.ts mayTouchPrivate).
export function useDemoStatusSync(
  userId: string,
  projects: DBProject[],
  drafts: DBProject[],
  setProjects: Dispatch<SetStateAction<DBProject[]>>,
  setDrafts: Dispatch<SetStateAction<DBProject[]>>,
  refreshPrivate: (ids: string[]) => void,
  // 페이로드에 비공개 칸이 통째로 실려 왔을 때(SQL 적용 전) — 그 값이 최신이니 "받음"으로
  // 표시하고, 그 전에 출발한 비공개 칸 응답이 이 값을 덮지 않게 한다.
  notePrivateArrived: (ids: string[]) => void,
) {
  // 자동 시연이 일시정지면 큐는 그대로 쌓이므로, 스피너 대신 '촬영 대기 중'으로 알린다.
  const [demoPaused, setDemoPaused] = useState(false);
  // 경과 시간 판정용 시각. 렌더 중 Date.now()는 불순(재렌더 시점에 따라 결과가
  // 흔들림)이라 마운트 때 한 번 고정하고 이후 폴링 주기에 실어 갱신한다.
  const [nowMs, setNowMs] = useState(() => Date.now());
  // 구독·폴링은 한 번 걸어 두고 오래 산다 — "직전 값과 달라졌나"를 판정할 최신 행과
  // 최신 콜백은 ref로 본다(매 렌더마다 구독을 다시 걸지 않게).
  const latestRows = useRef<DBProject[]>([]);
  const refreshRef = useRef(refreshPrivate);
  const arrivedRef = useRef(notePrivateArrived);
  useEffect(() => {
    latestRows.current = [...projects, ...drafts];
    refreshRef.current = refreshPrivate;
    arrivedRef.current = notePrivateArrived;
  });

  // Live-update the build-status badge as the recording job progresses.
  // Requires realtime publication on the projects table; silent no-op otherwise.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`projects:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "projects",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          // SQL 적용 뒤엔 realtime이 주인도 못 읽는 칸을 빼고 보낸다 — 갈아 끼우지 말고 얹는다.
          const updated = payload.new as Partial<DBProject> & { id: string };
          const before = latestRows.current.find((p) => p.id === updated.id);
          const merge = (prev: DBProject[]) =>
            prev.map((p) => (p.id === updated.id ? mergeRow(p, updated) : p));
          setProjects(merge);
          setDrafts(merge);
          if (hasPrivate(updated)) arrivedRef.current([updated.id]);
          else if (before && mayTouchPrivate(before, updated)) refreshRef.current([updated.id]);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // setProjects/setDrafts는 useState 세터라 항등 — 의존성에서 제외해도 안전.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

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
    // 배치 모드(평소 일시정지)에선 대기가 하루 가까이 간다. 그동안 탭마다 10초에 한 번
    // 서버를 부르면 한 사람당 시간당 ~360번이라, 일시정지 + 전부 '대기'면 60초로 늦춘다
    // (2026-09-22 트래픽6). 배치가 돌기 시작하면 realtime이 먼저 알리고, 못 받아도 1분 안.
    // 탭이 숨어 있으면 부르지 않는다 — 돌아오면 visibilitychange가 바로 한 번 부른다.
    let pausedNow = false;
    let allPending = true;

    async function syncPaused() {
      try {
        const res = await fetch("/api/demo/status");
        if (!res.ok || cancelled) return;
        const json = await res.json();
        pausedNow = !!json?.paused;
        if (!cancelled) setDemoPaused(pausedNow);
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
        // demo_build_error는 비공개 칸이라 여기서 못 읽는다 — 상태가 바뀐 행만 아래에서
        // refreshPrivate로 받아 온다(실패 팝오버의 원인 문구가 그 칸에서 나온다).
        .select("id, demo_build_status, demo_video_url, demo_generated_at, demo_status_changed_at")
        .in("id", ids);
      if (cancelled || !data) return;
      // 찍는 중(building·recording·editing)인 행이 하나라도 있으면 빠른 주기 유지.
      allPending = !(data as Partial<DBProject>[]).some(
        (r) => !!r.demo_build_status && r.demo_build_status !== "pending" && DEMO_IN_FLIGHT.has(r.demo_build_status),
      );
      const fresh = new Map<string, Partial<DBProject>>(
        (data as Partial<DBProject>[]).map((r) => [r.id as string, r]),
      );
      const stale = latestRows.current
        .filter((p) => {
          const next = fresh.get(p.id);
          return !!next && mayTouchPrivate(p, next);
        })
        .map((p) => p.id);
      const merge = (prev: DBProject[]) =>
        prev.map((p) => {
          const next = fresh.get(p.id);
          return next ? mergeRow(p, next) : p;
        });
      setProjects(merge);
      setDrafts(merge);
      if (stale.length) refreshRef.current(stale);
    }

    // 프로젝트 행은 방금 loadProjects가 실어왔으니 재조회가 불필요하지만, 일시정지
    // 여부는 아직 모른다 — 첫 10초를 스피너로 흘려보내지 않도록 지금 한 번.
    syncPaused();
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(tick, pausedNow && allPending ? DEMO_POLL_PAUSED_MS : DEMO_POLL_MS);
    };
    const tick = async () => {
      if (document.visibilityState === "visible") await sync();
      if (!cancelled) schedule();
    };
    schedule();
    // 탭을 다시 열면 즉시 한 번 — 절전으로 인터벌이 통째로 밀린 구간을 메운다.
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inFlightKey]);

  return { demoPaused, nowMs };
}
