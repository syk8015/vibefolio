"use client"; // 사전(useT)을 쓰기 위해 클라이언트로 — 서버 getT는 쿠키를 읽어 라우트를 동적으로 만든다

import Link from "next/link";
import { useEffect, useLayoutEffect, useState } from "react";
import Logo from "@/components/Logo";
import { useT } from "@/lib/i18n/client";
import { applyTheme, getInitialTheme } from "@/lib/theme";
import { isValidUsername } from "@/lib/username";

// Branded 404 — /@username is a share unit, so mistyped/deleted handles hit this
// often. Renders inside the root layout, so the paper/ink tokens are available.
// 빈 액자 그림 + 제목 + 한 줄 + [홈으로](10-01 덜어내기 라 + 업그레이드). 에러 화면들(app/error.tsx 등)이
// 쓰는 ErrorState는 그대로 두고 404만 따로 그린다.
const BUTTON: React.CSSProperties = { fontSize: "0.9375rem", padding: "0.75rem 1.75rem" };

export default function NotFound() {
  const { t } = useT();
  const myUsername = useMyUsername();
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
        <EmptyFrame />
        <h1 className="vf-serif-display" style={{ fontSize: "1.625rem", fontWeight: 500, lineHeight: 1.3, margin: "1.25rem 0 0" }}>
          {t.errorState.notFoundTitle}
        </h1>
        <p style={{ fontSize: "0.9375rem", lineHeight: 1.6, color: "var(--text-secondary)", margin: "0.375rem 0 0" }}>
          {t.errorState.notFoundBody}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2.5" style={{ marginTop: "1.5rem" }}>
          {myUsername && (
            <Link href={`/${myUsername}`} className="vf-button-ghost vf-step-enter" style={BUTTON}>
              {t.errorState.notFoundMyCard}
            </Link>
          )}
          <Link href="/" className="vf-button-primary" style={BUTTON}>
            {t.errorState.notFoundHome}
          </Link>
        </div>
      </div>
    </main>
  );
}

// [내 명함 보기]는 로그인한 사람(아이디가 있는)에게만, 값싸게 알 수 있을 때만 보인다.
// 세션 쿠키가 없는 방문자 — 404를 보는 사람 대부분 — 는 supabase 청크(전송 55KB, ViewTracker 참고)를
// 받지 않는다. 쿠키가 있을 때만 그 청크를 불러 쿠키 속 세션을 읽는다(getSession — 보통 네트워크 없음).
// 아이디는 metadata.username(온보딩·명함 탭이 함께 고치는 사본)이고 링크 주소로만 쓰니, 형식만 다시 본다
// (주소 모양이 아니면 버튼을 그리지 않는다 — '/'가 섞인 값이 바깥 주소가 되는 일도 막는다).
function useMyUsername(): string | null {
  const [username, setUsername] = useState<string | null>(null);
  useEffect(() => {
    if (!/(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=/.test(document.cookie)) return;
    let alive = true;
    import("@/lib/supabase/client")
      .then(({ createClient }) => createClient().auth.getSession())
      .then(({ data }) => {
        const value: unknown = data.session?.user.user_metadata?.username;
        if (alive && typeof value === "string" && isValidUsername(value)) setUsername(value);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return username;
}

// 못에 걸린 빈 액자(10-01 업그레이드) — 못(고정) 아래 끈과 액자가 못을 축으로 -5도 기운다.
// 끈 끝은 액자 뒤로 숨고, 기울며 오른쪽으로 밀린 만큼 전체를 5px 왼쪽으로 옮긴다.
// 액자는 잉크색이라 다크에선 종이색 액자가 된다(어두운 벽에 묻히지 않게). 움직이지 않는 그림이다.
function EmptyFrame() {
  return (
    <div aria-hidden className="relative shrink-0" style={{ left: -5, width: 240, height: 200 }}>
      <div className="absolute inset-0" style={{ transformOrigin: "120px 10px", transform: "rotate(-5deg)" }}>
        <svg width="240" height="80" viewBox="0 0 240 80" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"
          className="absolute left-0 top-0" style={{ color: "var(--text-muted)" }}>
          <path d="M120 10 66 66M120 10l54 56" />
        </svg>
        <div className="absolute"
          style={{
            left: 44, top: 56, width: 152, height: 124, borderRadius: 6, padding: 12,
            background: "linear-gradient(160deg, rgba(255,255,255,0.08), transparent 60%), var(--text-primary)",
            boxShadow: "var(--shadow-card-big)",
          }}>
          <div style={{ height: "100%", borderRadius: 2, padding: 13, background: "var(--bg)", boxShadow: "inset 0 2px 5px rgba(0,0,0,0.18)" }}>
            <div style={{ height: "100%", background: "var(--surface-soft)", boxShadow: "inset 0 0 0 1px var(--border), inset 0 1px 3px rgba(0,0,0,0.08)" }} />
          </div>
        </div>
      </div>
      <span className="absolute rounded-full"
        style={{
          left: 115, top: 5, width: 10, height: 10,
          background: "radial-gradient(circle at 35% 35%, var(--border-bright), var(--text-secondary))",
          boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
        }} />
    </div>
  );
}
