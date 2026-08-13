"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";

type ViewportMode = "desktop" | "mobile";

const STORAGE_KEY = "vf-viewport-mode";
const EVENT = "vf-viewport-mode-change";

export default function ViewportModeToggle() {
  const [mode, setMode] = useState<ViewportMode>("desktop");
  const [mounted, setMounted] = useState(false);
  const { t } = useT();

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as ViewportMode | null;
      if (stored === "mobile" || stored === "desktop") setMode(stored);
    } catch { /* SSR */ }
    setMounted(true);

    const onChange = (e: Event) => {
      const next = (e as CustomEvent<{ mode: ViewportMode }>).detail.mode;
      setMode(next);
    };
    document.addEventListener(EVENT, onChange);
    return () => document.removeEventListener(EVENT, onChange);
  }, []);

  const toggle = () => {
    const next: ViewportMode = mode === "desktop" ? "mobile" : "desktop";
    setMode(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
    document.dispatchEvent(new CustomEvent(EVENT, { detail: { mode: next } }));
  };

  if (!mounted) return <div style={{ width: 34, height: 34 }} />;

  return (
    <button
      onClick={toggle}
      aria-label={mode === "desktop" ? t.theater.viewMobile : t.theater.viewDesktop}
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
      {mode === "desktop" ? <SmartphoneIcon /> : <MonitorIcon />}
    </button>
  );
}

function MonitorIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function SmartphoneIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  );
}
