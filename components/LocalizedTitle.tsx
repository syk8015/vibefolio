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
    // ko 방향도 명시적으로 되돌린다 — 토글 후 router.refresh()는 같은 정적
    // 트리를 재사용해 metadata가 다시 적용된다는 보장이 없다.
    if (ready) document.title = locale === "en" ? en : ko;
  }, [ready, locale, ko, en]);
  return null;
}
