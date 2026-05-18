"use client";

import { useEffect, useState } from "react";

type ViewportMode = "desktop" | "mobile";

// iPhone 17 (6.3") logical viewport
const MOBILE_W = 402;
const MOBILE_H = 874;

interface Props {
  username: string;
  enabled: boolean;
  children: React.ReactNode;
}

export default function ViewportFrame({ username, enabled, children }: Props) {
  const [mode, setMode] = useState<ViewportMode>("desktop");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    try {
      const stored = localStorage.getItem("vf-viewport-mode") as ViewportMode | null;
      if (stored === "mobile") setMode("mobile");
    } catch { /* SSR */ }
    setMounted(true);

    const onChange = (e: Event) => {
      const next = (e as CustomEvent<{ mode: ViewportMode }>).detail.mode;
      setMode(next);
    };
    document.addEventListener("vf-viewport-mode-change", onChange);
    return () => document.removeEventListener("vf-viewport-mode-change", onChange);
  }, [enabled]);

  // When disabled, not yet mounted, or in desktop mode, render children inline
  // so the server-rendered HTML is preserved and SEO/initial paint is unaffected.
  if (!enabled || !mounted || mode === "desktop") return <>{children}</>;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        paddingTop: "5.5rem",
        paddingBottom: "2.5rem",
        paddingLeft: "1rem",
        paddingRight: "1rem",
        minHeight: "100vh",
        background: "var(--bg)",
      }}
    >
      <div
        style={{
          width: MOBILE_W,
          height: MOBILE_H,
          maxWidth: "100%",
          borderRadius: 36,
          overflow: "hidden",
          border: "1px solid var(--border-bright)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.45), 0 0 0 8px rgba(0,0,0,0.35)",
          background: "var(--bg)",
        }}
      >
        <iframe
          src={`/${username}?embed=1`}
          title="모바일 미리보기"
          width={MOBILE_W}
          height={MOBILE_H}
          style={{ border: "none", display: "block", width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}
