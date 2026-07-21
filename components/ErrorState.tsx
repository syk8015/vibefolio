"use client";

import Link from "next/link";

// Branded fallback shown by the route-level error boundaries (app/error.tsx,
// app/dashboard/error.tsx, app/[username]/error.tsx). These render INSIDE the
// root layout, so the paper/ink design tokens and fonts from globals.css are
// available — we reuse the existing .vf-* utility classes to stay visually
// consistent with the rest of the app.
export default function ErrorState({
  title,
  description,
  eyebrow = "문제가 발생했어요",
  onRetry,
  homeLabel = "홈으로",
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
          {eyebrow}
        </div>

        <h1
          className="vf-serif-display"
          style={{ fontSize: "1.5rem", lineHeight: 1.3, marginBottom: "0.75rem" }}
        >
          {title}
        </h1>

        <p
          style={{
            color: "var(--text-secondary)",
            fontSize: "0.92rem",
            lineHeight: 1.6,
            marginBottom: "1.75rem",
          }}
        >
          {description}
        </p>

        <div style={{ display: "flex", gap: "0.6rem", justifyContent: "center", flexWrap: "wrap" }}>
          {onRetry && (
            <button type="button" className="vf-button-primary" onClick={onRetry}>
              다시 시도
            </button>
          )}
          <Link href={homeHref} className="vf-button-ghost">
            {homeLabel}
          </Link>
        </div>

        {digest && (
          <div
            className="vf-mono"
            style={{ marginTop: "1.5rem", fontSize: "0.68rem", color: "var(--text-muted)" }}
          >
            오류 코드: {digest}
          </div>
        )}
      </div>
    </div>
  );
}
