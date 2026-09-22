"use client"; // 사전(useT)을 쓰기 위해 클라이언트로 — 서버 getT는 쿠키를 읽어 라우트를 동적으로 만든다

import ErrorState from "@/components/ErrorState";
import Logo from "@/components/Logo";
import { useT } from "@/lib/i18n/client";

// Branded 404 — /@username is a share unit, so mistyped/deleted handles hit this
// often. Renders inside the root layout, so the paper/ink tokens are available.
export default function NotFound() {
  const { t } = useT();
  // 다른 화면처럼 로고 머리줄을 둔다 — 없으면 어느 사이트인지부터 헷갈린다.
  return (
    <main className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="flex items-center px-4 md:px-8 py-4 md:py-5">
        <Logo />
      </header>
      <ErrorState
        eyebrow={t.errorState.notFoundEyebrow}
        title={t.errorState.notFoundTitle}
        description={t.errorState.notFoundBody}
        homeHref="/"
      />
    </main>
  );
}
