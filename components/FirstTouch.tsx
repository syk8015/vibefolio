"use client";

import { useEffect } from "react";
import { captureFirstTouch, trackClientEvent, AnalyticsEvent } from "@/lib/analytics-client";

// Mounted once in the root layout: records the visitor's first-ever landing
// (referrer + UTM) into localStorage so signup can be attributed to a source.
// Renders nothing, fires once, never throws.
export default function FirstTouch() {
  useEffect(() => {
    // 가입 귀속용 first-touch는 그대로 — "이 사람을 처음 데려온 채널"이 기준이라
    // 최초 1회만 저장하는 게 맞다.
    captureFirstTouch();

    // 유입 카운트는 first-touch와 **분리**한다. 예전엔 captureFirstTouch()의
    // 반환값으로 셌는데, 그 함수는 이미 방문 기록이 있으면 null을 돌려준다 →
    // 사이트를 한 번이라도 본 사람이 홍보 링크로 다시 오면 유입이 0으로
    // 집계됐다(2026-08-19 발견). 홍보는 반복 노출이 핵심이라 구조적 누수였다.
    // 지금은 URL에 promo 캠페인이 있으면 매 방문 센다. 중복은 브라우저 세션당
    // 캠페인 1회로 막는다(새로고침·내부 이동으로 부풀지 않게).
    try {
      const params = new URLSearchParams(location.search);
      const campaign = params.get("utm_campaign");
      if (!campaign?.startsWith("promo-")) return;
      const key = `vf-promo-visit:${campaign}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      trackClientEvent(AnalyticsEvent.PromoLinkVisit, {
        utm_campaign: campaign,
        utm_source: params.get("utm_source"),
      });
    } catch {
      // 스토리지가 막힌 브라우저 — 집계만 포기하고 조용히 넘어간다.
    }
  }, []);
  return null;
}
