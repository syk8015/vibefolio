"use client";

import { useEffect } from "react";
import { useT } from "@/lib/i18n/client";

// 정적 페이지(로그인 등)의 탭 제목을 마운트 후 locale에 맞게 바꿔치기한다.
// metadata는 빌드 시점에 고정되어 쿠키를 못 읽는다 — 서버에서 cookies()를
// 읽으면 페이지가 동적으로 강등되므로(⑥ 메타데이터 절충안) 클라이언트에서만.
// SNS/검색 로봇은 JS를 안 돌리므로 OG·크롤러 노출 제목은 여전히 ko 원본이다.
export default function LocalizedTitle({ ko, en }: { ko: string; en: string }) {
  const { locale, ready } = useT();
  useEffect(() => {
    if (!ready) return;
    // ko 방향도 명시적으로 되돌린다 — 토글 후 router.refresh()는 같은 정적
    // 트리를 재사용해 metadata가 다시 적용된다는 보장이 없다.
    const desired = locale === "en" ? en : ko;
    document.title = desired;
    // React hydration이 이 effect보다 늦게 metadata <title>을 DOM 직접 조작으로
    // 되돌린다(실측: effect 35ms → 이후 덮어씀). 한 번 세팅으로는 못 이기므로
    // <head>를 감시해 외부 변경 시 재적용한다. 같은 값이면 재설정하지 않아
    // 루프는 없다.
    const observer = new MutationObserver(() => {
      if (document.title !== desired) document.title = desired;
    });
    observer.observe(document.head, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [ready, locale, ko, en]);
  return null;
}
