"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import {
  applyTheme,
  getInitialTheme,
  onThemeChange,
  setStoredTheme,
  THEME_STORAGE_KEY,
  type Theme,
} from "@/lib/theme";

export default function ThemeToggle() {
  const { t } = useT();
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = getInitialTheme();
    setTheme(t);
    applyTheme(t);
    setMounted(true);

    // Follow system changes when no explicit preference is stored
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const handleSystemChange = (e: MediaQueryListEvent) => {
      const next: Theme = e.matches ? "light" : "dark";
      localStorage.removeItem(THEME_STORAGE_KEY); // system override clears manual preference
      setTheme(next);
      applyTheme(next);
    };
    mq.addEventListener("change", handleSystemChange);
    // 모바일 nav 메뉴에도 같은 토글이 있다 — 거기서 바꾸면 여기 아이콘도 따라온다.
    const unsubscribe = onThemeChange(setTheme);
    return () => {
      mq.removeEventListener("change", handleSystemChange);
      unsubscribe();
    };
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setStoredTheme(next);
  };

  if (!mounted) return <div style={{ width: 34, height: 34 }} />;

  return (
    <button
      onClick={toggle}
      aria-label={theme === "dark" ? t.common.switchToLight : t.common.switchToDark}
      style={{
        width: 34,
        height: 34,
        borderRadius: "50%",
        border: "1px solid var(--border-bright)",
        background: "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        color: "var(--text-secondary)",
        transition: "border-color 0.2s, color 0.2s, background 0.2s",
        flexShrink: 0,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--blue)";
        (e.currentTarget as HTMLButtonElement).style.color = "var(--blue)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-bright)";
        (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)";
      }}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
