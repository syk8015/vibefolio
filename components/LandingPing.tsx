"use client";

import { useEffect } from "react";
import { AnalyticsEvent, trackClientEvent } from "@/lib/analytics-client";

// 랜딩(/) 방문 핑. 비로그인 랜딩에만 렌더된다(로그인 홈은 서버가 안 그린다 — 주인장
// 본인 방문이 섞이지 않게). 브라우저 세션당 1회 — 새로고침·뒤로가기로 부풀지 않는다.
// OG 스크레이퍼·검색 로봇은 JS를 안 돌려 여기 안 잡힌다 = 사람 방문만 센다.
// 채널(카톡·스레드…)은 /api/analytics가 UA·referrer로 서버에서 찍는다(watch_view와 같다).
export default function LandingPing() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem("nf_lv")) return;
      sessionStorage.setItem("nf_lv", "1");
    } catch {
      // sessionStorage 막힘 — 디듑 없이 1회 전송
    }
    const params = new URLSearchParams(window.location.search);
    trackClientEvent(AnalyticsEvent.LandingView, {
      referrer: document.referrer || null,
      utm_source: params.get("utm_source"),
      utm_campaign: params.get("utm_campaign"),
      via: params.get("via"),
    });
  }, []);

  return null;
}
