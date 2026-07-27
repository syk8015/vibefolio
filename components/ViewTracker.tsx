"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// 같은 브라우저의 반복 새로고침을 한 번으로 눌러주는 창. 방문자 식별자를 새로
// 만들지 않고 localStorage 타임스탬프만 쓴다 — 완화가 목적이지 정밀 UV가 아니다.
const DEDUP_MS = 30 * 60_000;

export default function ViewTracker({ username, ownerId }: { username: string; ownerId?: string }) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 오너 본인 방문은 집계에서 제외 — 자기 명함을 여닫을 때마다 조회수가
      // 오르면 숫자를 믿을 수 없다. getSession은 로컬 캐시라 네트워크 비용 없음.
      if (ownerId) {
        try {
          const { data } = await createClient().auth.getSession();
          if (data.session?.user?.id === ownerId) return;
        } catch {
          /* 세션 확인 실패 → 익명 방문으로 간주하고 기록 */
        }
      }
      if (cancelled) return;

      try {
        const key = `vf-viewed:${username}`;
        const last = Number(localStorage.getItem(key) ?? 0);
        if (Date.now() - last < DEDUP_MS) return;
        localStorage.setItem(key, String(Date.now()));
      } catch {
        /* 프라이빗 모드 등 스토리지 불가 → 그냥 기록 */
      }

      fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, referrer: document.referrer }),
      }).catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, [username, ownerId]);

  return null;
}
