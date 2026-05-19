"use client";

import { useState } from "react";

interface Props {
  url: string;
  displayUsername: string;
}

const SCALE = 0.52;
const IFRAME_W = 1200;
const IFRAME_H = 860;

export default function PortfolioMockup({ url, displayUsername }: Props) {
  const [loaded, setLoaded] = useState(false);

  const displayW = Math.round(IFRAME_W * SCALE);
  const displayH = Math.round(IFRAME_H * SCALE);

  return (
    <div
      className="relative rounded-xl overflow-hidden"
      style={{
        width: displayW,
        boxShadow: "0 32px 80px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* Browser chrome */}
      <div
        className="flex items-center gap-3 px-4"
        style={{
          height: 40,
          background: "#1a1a24",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
        }}
      >
        {/* Traffic lights */}
        <div className="flex items-center gap-1.5">
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57" }} />
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#febc2e" }} />
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#28c840" }} />
        </div>

        {/* URL bar */}
        <div
          className="flex-1 flex items-center px-3 rounded-md text-xs"
          style={{
            height: 26,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.45)",
            fontFamily: "monospace",
            letterSpacing: "0.01em",
          }}
        >
          <span style={{ color: "rgba(255,255,255,0.25)", marginRight: 4 }}>🔒</span>
          vibefolio.com/
          <span style={{ color: "#e8c977" }}>{displayUsername}</span>
        </div>
      </div>

      {/* Viewport */}
      <div style={{ width: displayW, height: displayH, overflow: "hidden", position: "relative", background: "#0a0a0f" }}>
        {/* Loading skeleton */}
        {!loaded && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10"
            style={{ background: "#0a0a0f" }}
          >
            <div className="w-6 h-6 rounded-full border-2 animate-spin"
              style={{ borderColor: "rgba(255,255,255,0.15)", borderTopColor: "rgba(255,255,255,0.7)" }} />
          </div>
        )}

        {/* Scaled iframe */}
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
  );
}
