"use client"; // Error boundaries must be Client Components

import { useEffect, useState } from "react";
import { logger } from "@/lib/logger";
import { LOCALE_COOKIE, isLocale, type Locale } from "@/lib/i18n/config";

// LocaleProvider도 루트 레이아웃과 함께 날아간 상태라 useT를 못 쓴다 —
// 쿠키만 직접 읽어 ko/en을 고른다(항상 클라이언트 렌더라 document 접근 안전).
const COPY = {
  ko: {
    title: "문제가 발생했어요 — Nookframe",
    eyebrow: "문제가 발생했어요",
    heading: "페이지를 불러오지 못했어요",
    desc: "잠시 문제가 생겼어요. 다시 시도하거나 홈으로 돌아가 주세요.",
    retry: "다시 시도",
    home: "홈으로",
    digest: "오류 코드",
  },
  en: {
    title: "Something went wrong — Nookframe",
    eyebrow: "Something went wrong",
    heading: "We couldn't load this page",
    desc: "Something briefly went wrong. Try again or head back home.",
    retry: "Try again",
    home: "Go home",
    digest: "Error code",
  },
} satisfies Record<Locale, Record<string, string>>;

function detectLocale(): Locale {
  if (typeof document === "undefined") return "ko";
  const value = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]*)`)
  )?.[1];
  return isLocale(value) ? value : "ko";
}

// Root-level fallback. This REPLACES the root layout when a render error escapes
// every nested boundary (including the root layout itself), so it must ship its
// own <html>/<body> and cannot rely on globals.css being applied. All styling is
// inlined here, with a prefers-color-scheme fallback for dark mode (the theme
// script in the root layout will not have run at this point).
//
// metadata exports are not supported here; the document title is set with the
// React <title> element instead.

// Mirrors the paper/ink palette from globals.css so the crash screen still feels
// like Nookframe even with the stylesheet pipeline bypassed.
const STYLES = `
  .ge-root {
    --ge-bg: #fdfaf3;
    --ge-surface: #ffffff;
    --ge-text: #1a1612;
    --ge-secondary: #6a5e4e;
    --ge-muted: #a89b87;
    --ge-border: #ece4d2;
  }
  @media (prefers-color-scheme: dark) {
    .ge-root {
      --ge-bg: #1a1612;
      --ge-surface: #221d18;
      --ge-text: #f4ede0;
      --ge-secondary: #b8a98a;
      --ge-muted: #6a5e4e;
      --ge-border: #2e2620;
    }
  }
  .ge-root {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3rem 1.25rem;
    background: var(--ge-bg);
    color: var(--ge-text);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .ge-card {
    max-width: 460px;
    width: 100%;
    padding: 2.25rem 2rem;
    text-align: center;
    background: var(--ge-surface);
    border-radius: 14px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06), 0 12px 28px rgba(0, 0, 0, 0.08);
  }
  .ge-eyebrow {
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ge-muted);
    margin-bottom: 0.9rem;
    font-family: ui-monospace, "JetBrains Mono", "SFMono-Regular", monospace;
  }
  .ge-title {
    font-family: "Noto Serif KR", Georgia, serif;
    font-size: 1.5rem;
    line-height: 1.3;
    margin: 0 0 0.75rem;
    font-weight: 600;
  }
  .ge-desc {
    color: var(--ge-secondary);
    font-size: 0.92rem;
    line-height: 1.6;
    margin: 0 0 1.75rem;
  }
  .ge-actions {
    display: flex;
    gap: 0.6rem;
    justify-content: center;
    flex-wrap: wrap;
  }
  .ge-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.65rem 1.2rem;
    border-radius: 999px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
    font-family: inherit;
    transition: opacity 0.18s ease, background-color 0.18s ease;
  }
  .ge-btn-primary {
    background: var(--ge-text);
    color: var(--ge-bg);
    border-color: var(--ge-text);
  }
  .ge-btn-primary:hover { opacity: 0.85; }
  .ge-btn-ghost {
    background: transparent;
    color: var(--ge-text);
    border-color: var(--ge-border);
  }
  .ge-btn-ghost:hover { background: var(--ge-border); }
  .ge-digest {
    margin-top: 1.5rem;
    font-size: 0.68rem;
    color: var(--ge-muted);
    font-family: ui-monospace, "JetBrains Mono", "SFMono-Regular", monospace;
  }
`;

export default function GlobalError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  unstable_retry?: () => void;
}) {
  const [locale] = useState<Locale>(detectLocale);
  const t = COPY[locale];

  useEffect(() => {
    logger.error("Global (root) error", {
      error,
      digest: error.digest,
      scope: "global",
    });
  }, [error]);

  const retry = unstable_retry ?? reset;

  return (
    <html lang={locale}>
      <body className="ge-root">
        <title>{t.title}</title>
        <style>{STYLES}</style>
        <main className="ge-card">
          <div className="ge-eyebrow">{t.eyebrow}</div>
          <h1 className="ge-title">{t.heading}</h1>
          <p className="ge-desc">{t.desc}</p>
          <div className="ge-actions">
            {retry && (
              <button type="button" className="ge-btn ge-btn-primary" onClick={() => retry()}>
                {t.retry}
              </button>
            )}
            <button
              type="button"
              className="ge-btn ge-btn-ghost"
              onClick={() => {
                window.location.href = "/";
              }}
            >
              {t.home}
            </button>
          </div>
          {error.digest && <div className="ge-digest">{t.digest}: {error.digest}</div>}
        </main>
      </body>
    </html>
  );
}
