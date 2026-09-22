"use client";

import Link from "next/link";
import { useLayoutEffect } from "react";
import { useT } from "@/lib/i18n/client";
import { applyTheme, getInitialTheme } from "@/lib/theme";

// Branded fallback shown by the route-level error boundaries (app/error.tsx,
// app/dashboard/error.tsx, app/[username]/error.tsx). These render INSIDE the
// root layout, so the paper/ink design tokens and fonts from globals.css are
// available — we reuse the existing .vf-* utility classes to stay visually
// consistent with the rest of the app.
export default function ErrorState({
  title,
  description,
  eyebrow,
  onRetry,
  homeLabel,
  homeHref = "/",
  digest,
}: {
  title: string;
  description: string;
  eyebrow?: string;
  onRetry?: () => void;
  homeLabel?: string;
  homeHref?: string;
  digest?: string;
}) {
  const { t } = useT();
  // 404·에러 응답은 Next가 문서를 통째로 클라이언트에서 다시 그려서(<html
  // id="__next_error__">) layout 부트 스크립트가 붙인 data-theme이 사라진다 →
  // 다크 사용자에게 이 화면만 밝게 나왔다(2026-09-22 실측). 페인트 전에 되돌린다.
  useLayoutEffect(() => {
    if (!document.documentElement.getAttribute("data-theme")) applyTheme(getInitialTheme());
  }, []);
  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "3rem 1.25rem",
        position: "relative",
        zIndex: 1,
      }}
    >
      <div
        className="vf-card"
        style={{ maxWidth: 460, width: "100%", padding: "2.25rem 2rem", textAlign: "center" }}
      >
        <div
          className="vf-mono"
          style={{
            fontSize: "0.72rem",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
            marginBottom: "0.9rem",
          }}
        >
          {eyebrow ?? t.errorState.eyebrow}
        </div>

        <h1
          className="vf-serif-display"
          style={{ fontSize: "1.5rem", lineHeight: 1.3, marginBottom: "0.75rem", wordBreak: "keep-all" }}
        >
          {title}
        </h1>

        <p
          style={{
            color: "var(--text-secondary)",
            fontSize: "0.92rem",
            lineHeight: 1.6,
            // 한국어가 "…홈 / 으로"처럼 단어 중간에서 꺾이지 않게.
            wordBreak: "keep-all",
            overflowWrap: "break-word",
            marginBottom: "1.75rem",
          }}
        >
          {description}
        </p>

        <div style={{ display: "flex", gap: "0.6rem", justifyContent: "center", flexWrap: "wrap" }}>
          {onRetry && (
            <button type="button" className="vf-button-primary" onClick={onRetry}>
              {t.errorState.retry}
            </button>
          )}
          <Link href={homeHref} className="vf-button-ghost">
            {homeLabel ?? t.errorState.home}
          </Link>
        </div>

        {digest && (
          <div
            className="vf-mono"
            style={{ marginTop: "1.5rem", fontSize: "0.68rem", color: "var(--text-muted)" }}
          >
            {t.errorState.errorCode}: {digest}
          </div>
        )}
      </div>
    </div>
  );
}
