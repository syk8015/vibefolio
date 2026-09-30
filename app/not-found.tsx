"use client"; // 사전(useT)을 쓰기 위해 클라이언트로 — 서버 getT는 쿠키를 읽어 라우트를 동적으로 만든다

import Link from "next/link";
import { useLayoutEffect } from "react";
import Logo from "@/components/Logo";
import { useT } from "@/lib/i18n/client";
import { applyTheme, getInitialTheme } from "@/lib/theme";

// Branded 404 — /@username is a share unit, so mistyped/deleted handles hit this
// often. Renders inside the root layout, so the paper/ink tokens are available.
// 제목 한 줄 + [홈으로] 하나(10-01 덜어내기 라). 에러 화면들(app/error.tsx 등)이 쓰는
// ErrorState는 그대로 두고 404만 따로 그린다.
export default function NotFound() {
  const { t } = useT();
  // ErrorState와 같은 이유 — 404는 Next가 문서를 클라이언트에서 통째로 다시 그려
  // layout 부트 스크립트가 붙인 data-theme이 사라진다(2026-09-22 실측). 페인트 전에 되돌린다.
  useLayoutEffect(() => {
    if (!document.documentElement.getAttribute("data-theme")) applyTheme(getInitialTheme());
  }, []);
  // 다른 화면처럼 로고 머리줄을 둔다 — 없으면 어느 사이트인지부터 헷갈린다.
  return (
    <main className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="flex items-center px-4 md:px-8 py-4 md:py-5">
        <Logo />
      </header>
      <div className="flex flex-col items-center justify-center text-center"
        style={{ minHeight: "60vh", padding: "3rem 1.25rem", position: "relative", zIndex: 1 }}>
        <h1 className="vf-serif-display" style={{ fontSize: "1.625rem", fontWeight: 500, lineHeight: 1.3, margin: "0 0 1.5rem" }}>
          {t.errorState.notFoundTitle}
        </h1>
        <Link href="/" className="vf-button-primary" style={{ fontSize: "0.9375rem", padding: "0.75rem 1.75rem" }}>
          {t.errorState.notFoundHome}
        </Link>
      </div>
    </main>
  );
}
