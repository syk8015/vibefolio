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
      // 자동화 도구(Playwright·Selenium)가 켜 두는 표시 — 사람인지 가르는 단서 하나(lib/visitor.ts).
      webdriver: navigator.webdriver === true,
    });

    // 첫 스크롤·터치·클릭·키 입력 = 들어와서 실제로 움직였다. 보고 바로 나간 방문과 가른다.
    const kinds = ["scroll", "pointerdown", "touchstart", "keydown"] as const;
    const engaged = (e: Event) => {
      kinds.forEach((k) => window.removeEventListener(k, engaged));
      trackClientEvent(AnalyticsEvent.LandingEngaged, { first: e.type });
    };
    kinds.forEach((k) => window.addEventListener(k, engaged, { passive: true }));
    return () => kinds.forEach((k) => window.removeEventListener(k, engaged));
  }, []);

  return null;
}
