"use client";

import { useRef, useEffect, useState } from "react";

const SCALE = 0.52;
const IFRAME_W = 1200;
const IFRAME_H = 860;

interface Props {
  url: string;
  displayUsername: string;
}

export default function PortfolioPipSection({ url, displayUsername }: Props) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);

  // Use refs for values used in the wheel handler to avoid stale closures
  const scrollYRef = useRef(0);
  const maxScrollRef = useRef(0);

  // State only for UI rendering
  const [scrollY, setScrollY] = useState(0);
  const [maxScroll, setMaxScroll] = useState(0);

  const displayW = Math.round(IFRAME_W * SCALE);
  const displayH = Math.round(IFRAME_H * SCALE);

  const handleLoad = () => {
    setLoaded(true);
    try {
      const doc = iframeRef.current?.contentDocument?.documentElement;
      if (doc) {
        const scrollable = doc.scrollHeight - doc.clientHeight;
        if (scrollable > 0) {
          maxScrollRef.current = scrollable;
          setMaxScroll(scrollable);
        }
      }
    } catch { /* cross-origin guard */ }
  };

  useEffect(() => {
    const isPipActive = () => {
      const section = sectionRef.current;
      if (!section) return false;
      const rect = section.getBoundingClientRect();
      const centerY = rect.top + rect.height / 2;
      return centerY > 0 && centerY < window.innerHeight;
    };

    const onWheel = (e: WheelEvent) => {
      if (!isPipActive()) return;
      if (maxScrollRef.current === 0) return;

      const iframe = iframeRef.current;
      if (!iframe) return;

      let currentY = scrollYRef.current;
      try {
        currentY = iframe.contentWindow?.scrollY ?? currentY;
      } catch { return; }

      let delta = e.deltaY;
      if (e.deltaMode === 1) delta *= 20;
      if (e.deltaMode === 2) delta *= 300;

      if (delta > 0 && currentY < maxScrollRef.current) {
        e.preventDefault();
        const newY = Math.min(currentY + delta, maxScrollRef.current);
        try {
          iframe.contentWindow?.scrollTo({ top: newY, behavior: "instant" });
          scrollYRef.current = newY;
          setScrollY(newY);
        } catch { /* ignore */ }
        return;
      }

      if (delta < 0 && currentY > 0) {
        e.preventDefault();
        const newY = Math.max(currentY + delta, 0);
        try {
          iframe.contentWindow?.scrollTo({ top: newY, behavior: "instant" });
          scrollYRef.current = newY;
          setScrollY(newY);
        } catch { /* ignore */ }
        return;
      }
    };

    document.addEventListener("wheel", onWheel, { passive: false });
    return () => document.removeEventListener("wheel", onWheel);
  }, []);

  const progress = maxScroll > 0 ? Math.min(100, Math.round((scrollY / maxScroll) * 100)) : 0;

  return (
    <div
      ref={sectionRef}
      style={{
        borderTop: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.25rem",
        padding: "4rem 1.5rem 5rem",
      }}
    >
      {/* Label chip */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          borderRadius: 999,
          background: "var(--blue-tint)",
          border: "1px solid var(--border-bright)",
        }}
      >
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--blue)", boxShadow: "0 0 4px var(--blue)" }} />
        <span style={{ color: "var(--blue-bright)", fontFamily: "var(--font-nunito)", fontSize: "0.7rem", fontWeight: 700 }}>
          실제 바이브코더 명함
        </span>
      </div>

      {/* Floating browser mockup */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* Ambient glow */}
        <div
          style={{
            position: "absolute",
            width: 700,
            height: 400,
            background: "radial-gradient(ellipse at center, rgba(77,158,255,0.12) 0%, transparent 70%)",
            filter: "blur(40px)",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            position: "relative",
            width: displayW,
            borderRadius: 12,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 40px 100px rgba(0,0,0,0.65), 0 0 0 1px rgba(77,158,255,0.15)",
          }}
        >
          {/* Chrome bar */}
          <div
            style={{
              height: 40,
              background: "#1a1a24",
              borderBottom: "1px solid rgba(255,255,255,0.07)",
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "0 16px",
            }}
          >
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#febc2e" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#28c840" }} />
            </div>
            <div
              style={{
                flex: 1,
                height: 26,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                padding: "0 10px",
                fontSize: "0.7rem",
                fontFamily: "monospace",
                color: "rgba(255,255,255,0.45)",
              }}
            >
              <span style={{ color: "rgba(255,255,255,0.25)", marginRight: 4 }}>🔒</span>
              vibefolio.com/
              <span style={{ color: "#4d9eff" }}>{displayUsername}</span>
            </div>
          </div>

          {/* Iframe viewport */}
          <div
            style={{
              width: displayW,
              height: displayH,
              overflow: "hidden",
              position: "relative",
              background: "#0a0a0f",
            }}
          >
            {!loaded && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#0a0a0f",
                }}
              >
                <div
                  className="animate-spin"
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    border: "2px solid rgba(77,158,255,0.3)",
                    borderTopColor: "#4d9eff",
                  }}
                />
              </div>
            )}
            <div
              style={{
                width: IFRAME_W,
                height: IFRAME_H,
                transform: `scale(${SCALE})`,
                transformOrigin: "top left",
                pointerEvents: "none",
              }}
            >
              <iframe
                ref={iframeRef}
                src={url}
                width={IFRAME_W}
                height={IFRAME_H}
                style={{
                  border: "none",
                  opacity: loaded ? 1 : 0,
                  transition: "opacity 0.4s ease",
                }}
                onLoad={handleLoad}
                sandbox="allow-scripts allow-same-origin"
                title="포트폴리오 미리보기"
              />
            </div>
          </div>

          {/* Scroll progress bar — synced to actual iframe scroll height */}
          <div style={{ height: 2, background: "rgba(255,255,255,0.04)" }}>
            <div
              style={{
                height: "100%",
                width: `${progress}%`,
                background: "linear-gradient(90deg, var(--blue), var(--blue-bright))",
                transition: "width 0.1s linear",
              }}
            />
          </div>
        </div>
      </div>

      {/* Attribution + hint */}
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "var(--font-nunito)", marginBottom: 4 }}>
          <a
            href={`/${displayUsername}`}
            target="_blank"
            style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 600 }}
          >
            @{displayUsername}
          </a>
          &nbsp;의 바이브포트폴리오
        </p>
        <p style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontFamily: "var(--font-nunito)", opacity: 0.6 }}>
          {progress >= 100 ? "↓ 계속 스크롤하면 다음으로" : "↕ 스크롤하면 프로젝트가 보여요"}
        </p>
      </div>
    </div>
  );
}
