"use client";

import { useEffect } from "react";
import { AnalyticsEvent, trackClientEvent } from "@/lib/analytics-client";

// watch 페이지 조회 핑 (viral attribution). 서버 컴포넌트인 watch 페이지에서
// 렌더만 되고 아무것도 그리지 않는다. 세션당 프로젝트 1회로 디듑 — OG 스크레이퍼는
// JS를 안 돌리므로 여기 잡히는 건 실제 브라우저 조회뿐.
export default function WatchPing({
  projectId,
  username,
}: {
  projectId: string;
  username: string;
}) {
  useEffect(() => {
    try {
      const key = `nf_wv_${projectId}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // sessionStorage 막힘 — 디듑 없이 1회 전송
    }
    trackClientEvent(AnalyticsEvent.WatchView, {
      projectId,
      username,
      referrer: typeof document !== "undefined" ? document.referrer || null : null,
      // 공유 링크 출처 마커(?via=share|x) — 채널 분류(lib/traffic-source)의 마지막 층.
      via: new URLSearchParams(window.location.search).get("via"),
    });
  }, [projectId, username]);

  return null;
}
