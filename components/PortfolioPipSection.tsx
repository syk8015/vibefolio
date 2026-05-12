"use client";

import { useRef, useEffect, useState } from "react";

const SCALE = 0.52;
const IFRAME_W = 1200;
const IFRAME_H = 860;
// Extra page height that the user scrolls through, driving iframe scroll
const EXTRA_SCROLL = 1400;
// Max iframe y-scroll — enough to reveal the projects section
const IFRAME_MAX_SCROLL = 1100;

interface Props {
  url: string;
  displayUsername: string;
}

export default function PortfolioPipSection({ url, displayUsername }: Props) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);

  const displayW = Math.round(IFRAME_W * SCALE);
  const displayH = Math.round(IFRAME_H * SCALE);

  useEffect(() => {
    const onScroll = () => {
      const section = sectionRef.current;
      const iframe = iframeRef.current;
      if (!section || !iframe) return;

      const rect = section.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, -rect.top / EXTRA_SCROLL));
      const targetY = progress * IFRAME_MAX_SCROLL;

      try {
        iframe.contentWindow?.scrollTo({ top: targetY, behavior: "instant" });
      } catch {
        // guard against cross-origin edge cases
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      ref={sectionRef}
      style={{
        position: "relative",
        height: `calc(100dvh + ${EXTRA_SCROLL}px)`,
        borderTop: "1px solid var(--border)",
        overflow: "hidden",
      }}
    >
      {/* Sticky panel — stays centered in viewport while user scrolls through EXTRA_SCROLL */}
      <div
        style={{
          position: "sticky",
          top: 0,
          height: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.25rem",
          padding: "2rem 1.5rem",
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

        {/* Browser mockup */}
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
                  onLoad={() => setLoaded(true)}
                  sandbox="allow-scripts allow-same-origin"
                  title="포트폴리오 미리보기"
                />
              </div>
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
            ↓ 스크롤하면 프로젝트가 보여요
          </p>
        </div>
      </div>
    </div>
  );
}
