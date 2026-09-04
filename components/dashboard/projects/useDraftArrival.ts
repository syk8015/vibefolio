import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { DBProject } from "./types";

// 새 초안 도착 감지 (2026-09-05 사용자 요청).
//
// AI가 /api/ingest로 밀어넣는 초안은 INSERT다. useDemoStatusSync의 realtime
// 구독은 UPDATE만 듣고(이미 화면에 있는 행의 촬영 상태 갱신용), 목록 자체는
// 마운트 때 한 번만 읽는다 — 그래서 작품이 올라와도 화면은 그대로였고, 연결
// 모달을 X로 닫아도 새로고침을 해야 새 작품이 보였다("은근 불편함").
//
// 두 겹으로 듣는다: realtime INSERT(즉시) + 연결 모달이 열려 있는 동안의 폴링
// (publication 누락·소켓 끊김·탭 절전 폴백). 둘 다 같은 콜백으로 흘러가고,
// 같은 초안이 두 번 와도 호출부가 id로 거른다.
const POLL_MS = 4000;

export function useDraftArrival(
  userId: string,
  { active, onArrive }: { active: boolean; onArrive: (draft: DBProject) => void },
) {
  // 콜백은 매 렌더 새로 만들어진다 — 그때마다 구독을 다시 걸지 않도록 ref로
  // 최신 함수만 본다(구독은 userId가 바뀔 때만 재생성).
  const onArriveRef = useRef(onArrive);
  useEffect(() => {
    onArriveRef.current = onArrive;
  });

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`draft-arrival:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "projects",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as DBProject;
          if (row?.is_draft) onArriveRef.current(row);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    if (!active) return;
    const supabase = createClient();
    // 이 시점 이후에 생긴 초안만 "도착"으로 친다 — 모달을 열 때 이미 쌓여 있던
    // 초안까지 검토 화면으로 튀어나오면 안 된다.
    const since = new Date().toISOString();
    let cancelled = false;

    async function tick() {
      const { data } = await supabase
        .from("projects")
        .select("*")
        .eq("user_id", userId)
        .eq("is_draft", true)
        .gt("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1);
      if (cancelled || !data?.length) return;
      onArriveRef.current(data[0] as DBProject);
    }

    const timer = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, userId]);
}
