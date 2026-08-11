import { useState, useEffect, type Dispatch, type SetStateAction } from "react";
import { createClient } from "@/lib/supabase/client";
import { type DBProject, DEMO_IN_FLIGHT, DEMO_POLL_MS } from "./types";

// 촬영 상태 배지 동기화 훅. ProjectsTab에서 이동(분해 4/N) — realtime 구독과
// 폴백 폴링이 한 쌍으로만 의미가 있어 함께 산다. 두 리스트(setProjects/setDrafts)
// 모두에 같은 머지를 흘려보내는 구조는 원본 그대로.
export function useDemoStatusSync(
  userId: string,
  projects: DBProject[],
  drafts: DBProject[],
  setProjects: Dispatch<SetStateAction<DBProject[]>>,
  setDrafts: Dispatch<SetStateAction<DBProject[]>>,
) {
  // 자동 시연이 일시정지면 큐는 그대로 쌓이므로, 스피너 대신 '촬영 대기 중'으로 알린다.
  const [demoPaused, setDemoPaused] = useState(false);
  // 경과 시간 판정용 시각. 렌더 중 Date.now()는 불순(재렌더 시점에 따라 결과가
  // 흔들림)이라 마운트 때 한 번 고정하고 이후 폴링 주기에 실어 갱신한다.
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Live-update the build-status badge as the trigger.dev job progresses.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inFlightKey]);

  return { demoPaused, nowMs };
}
