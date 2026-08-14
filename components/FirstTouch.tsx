"use client";

import { useEffect } from "react";
import { captureFirstTouch, trackClientEvent, AnalyticsEvent } from "@/lib/analytics-client";

// Mounted once in the root layout: records the visitor's first-ever landing
// (referrer + UTM) into localStorage so signup can be attributed to a source.
// Renders nothing, fires once, never throws.
export default function FirstTouch() {
  useEffect(() => {
    const ft = captureFirstTouch();
    // 홍보 클립 추적 링크(lib/promo.ts promoTrackingUrl)로 들어온 진짜 첫
    // 방문만 서버에 카운트한다. signup_completed 귀속은 기존 first-touch
    // 인프라로 이미 되지만, "방문 자체"는 지금까지 서버에 전혀 안 남았다 —
    // /admin/promo의 유입 수는 이 이벤트로 센다.
    if (ft?.utm_campaign?.startsWith("promo-")) {
      trackClientEvent(AnalyticsEvent.PromoLinkVisit, {
        utm_campaign: ft.utm_campaign,
        utm_source: ft.utm_source,
      });
    }
  }, []);
  return null;
}
