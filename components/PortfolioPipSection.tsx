"use client";

import { useRef, useEffect, useState } from "react";

// One real card, fully interactive. The iframe loads the profile in `showcase`
// mode — every exit point (nav, footer, home links) is stripped server-side, so
// visitors can browse this person's projects but can't wander off into the app.
// Desktop renders the 1200px desktop theater scaled down; mobile loads the card
// at a touch-sized width so the mobile theater layout shows at real scale.
const DESKTOP_W = 1200;
const DESKTOP_H = 860;
const DESKTOP_MAX_SCALE = 0.62;
const MOBILE_MAX_W = 430;
const MOBILE_H = 720;

interface Profile {
  username: string;
  name: string | null;
}

interface Props {
  profiles: Profile[];
}

export default function PortfolioPipSection({ profiles }: Props) {
  // Pick one card at random, once — random in the render body would re-roll on
  // every render and is impure during hydration.
  const [profile] = useState(() => profiles[Math.floor(Math.random() * profiles.length)]);

  const [loaded, setLoaded] = useState(false);
  const [winW, setWinW] = useState(1440);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const update = () => setWinW(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Keep the embedded card's theme in sync with the landing page.
  const syncTheme = (theme: string) => {
    try {
      iframeRef.current?.contentDocument?.documentElement.setAttribute("data-theme", theme);
    } catch {
      /* cross-origin guard */
    }
  };

  useEffect(() => {
    const onChange = (e: Event) =>
      syncTheme((e as CustomEvent<{ theme: string }>).detail.theme);
    document.addEventListener("vf-theme-change", onChange);
    return () => document.removeEventListener("vf-theme-change", onChange);
  }, []);

  const handleLoad = () => {
    setLoaded(true);
    syncTheme(document.documentElement.getAttribute("data-theme") || "dark");
  };

  if (!profile) return null;

  const isMobile = winW < 768;
  const iframeW = isMobile ? Math.min(winW - 24, MOBILE_MAX_W) : DESKTOP_W;
  const iframeH = isMobile ? MOBILE_H : DESKTOP_H;
  const scale = isMobile ? 1 : Math.min(DESKTOP_MAX_SCALE, (winW - 48) / DESKTOP_W);
  const displayW = Math.round(iframeW * scale);
  const displayH = Math.round(iframeH * scale);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "2.5rem",
        padding: "8rem 1.5rem 5rem",
      }}
    >
      {/* Section title — matches How it works typography */}
      <h2
        style={{
          fontFamily: "var(--font-nunito)",
          fontWeight: 800,
          fontSize: "clamp(1.8rem, 3.5vw, 3rem)",
          letterSpacing: "-0.02em",
          lineHeight: 1,
          margin: 0,
          color: "var(--text-primary)",
          textAlign: "center",
        }}
      >
        실제 바이브코더 명함
      </h2>

      {/* Browser mockup — interactive */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            position: "absolute",
            width: 700,
            height: 400,
            background: "radial-gradient(ellipse at center, rgba(0,0,0,0.08) 0%, transparent 70%)",
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
            boxShadow: "0 40px 100px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)",
          }}
        >
          {/* Chrome bar */}
          <div style={{ height: 40, background: "#1a1a24", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", gap: 12, padding: "0 16px" }}>
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#febc2e" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#28c840" }} />
            </div>
            <div style={{ flex: 1, height: 26, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, display: "flex", alignItems: "center", padding: "0 10px", fontSize: "0.7rem", fontFamily: "monospace", color: "rgba(255,255,255,0.45)" }}>
              <span style={{ color: "rgba(255,255,255,0.25)", marginRight: 4 }}>🔒</span>
              nookframe.com/<span style={{ color: "#e8c977" }}>{profile.username}</span>
            </div>
          </div>

          {/* Iframe viewport */}
          <div style={{ width: displayW, height: displayH, overflow: "hidden", position: "relative", background: "#0a0a0f" }}>
            {!loaded && (
              <div style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0f" }}>
                <div
                  className="animate-spin"
                  style={{ width: 24, height: 24, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.15)", borderTopColor: "rgba(255,255,255,0.7)" }}
                />
              </div>
            )}
            <div style={{ width: iframeW, height: iframeH, transform: `scale(${scale})`, transformOrigin: "top left" }}>
              <iframe
                key={profile.username}
                ref={iframeRef}
                src={`/${profile.username}?showcase=1`}
                width={iframeW}
                height={iframeH}
                style={{ border: "none", display: "block", opacity: loaded ? 1 : 0, transition: "opacity 0.4s ease" }}
                onLoad={handleLoad}
                sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
                title={`${profile.name || profile.username}의 명함`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Attribution + interactive hint */}
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", margin: 0 }}>
          👆 직접 작품을 눌러 둘러보세요
        </p>
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "var(--font-nunito)", margin: 0 }}>
          <a
            href={`/${profile.username}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 600 }}
          >
            @{profile.username}
          </a>
          &nbsp;의 바이브포트폴리오 · 새 탭에서 전체 보기 →
        </p>
      </div>
    </div>
  );
}
