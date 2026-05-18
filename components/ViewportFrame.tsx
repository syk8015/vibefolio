"use client";

import { useEffect, useRef, useState } from "react";

type ViewportMode = "desktop" | "mobile";

// iPhone 17 (6.3") logical viewport.
const MOBILE_W = 402;
const MOBILE_H = 874;

// Device shell geometry.
const BEZEL = 14;
const DEVICE_RADIUS = 56;
const SCREEN_RADIUS = 44;
const ISLAND_W = 120;
const ISLAND_H = 32;
const ISLAND_TOP = 12;

// Vertical chrome we need to leave room for around the device.
const NAV_OFFSET = 88;   // matches the page's fixed nav height + a touch of breathing room
const BOTTOM_GAP = 40;
const HORIZ_GAP = 64;

interface Props {
  username: string;
  enabled: boolean;
  children: React.ReactNode;
}

export default function ViewportFrame({ username, enabled, children }: Props) {
  const [mode, setMode] = useState<ViewportMode>("desktop");
  const [mounted, setMounted] = useState(false);
  const [scale, setScale] = useState(1);
  const deviceOuterW = MOBILE_W + BEZEL * 2;
  const deviceOuterH = MOBILE_H + BEZEL * 2;

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

  useEffect(() => {
    if (!enabled || mode !== "mobile") return;
    const compute = () => {
      const availH = window.innerHeight - NAV_OFFSET - BOTTOM_GAP;
      const availW = window.innerWidth - HORIZ_GAP;
      const sh = availH / deviceOuterH;
      const sw = availW / deviceOuterW;
      setScale(Math.min(1, sh, sw));
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [enabled, mode, deviceOuterH, deviceOuterW]);

  // When disabled, not yet mounted, or in desktop mode, render children inline
  // so the server-rendered HTML is preserved and SEO/initial paint is unaffected.
  if (!enabled || !mounted || mode === "desktop") return <>{children}</>;

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        paddingTop: `${NAV_OFFSET}px`,
        paddingBottom: `${BOTTOM_GAP}px`,
        minHeight: "100vh",
        background: "var(--bg)",
        overflow: "hidden",
      }}
    >
      {/* Soft ambient glow behind the device */}
      <div
        style={{
          position: "absolute",
          top: "30%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(77,158,255,0.10) 0%, transparent 70%)",
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />

      {/* Device — scaled to fit the available area while keeping the iframe at logical mobile size */}
      <div
        style={{
          position: "relative",
          width: deviceOuterW,
          height: deviceOuterH,
          transform: `scale(${scale})`,
          transformOrigin: "top center",
          marginBottom: `${(scale - 1) * deviceOuterH}px`, // collapse the gap created by scaling down
        }}
      >
        {/* Shell */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(135deg, #2a2a2e 0%, #0d0d10 60%, #1a1a1d 100%)",
            borderRadius: DEVICE_RADIUS,
            padding: BEZEL,
            boxShadow:
              "0 40px 100px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06), inset 0 0 0 1.5px rgba(255,255,255,0.04)",
          }}
        >
          {/* Screen */}
          <div
            style={{
              position: "relative",
              width: MOBILE_W,
              height: MOBILE_H,
              borderRadius: SCREEN_RADIUS,
              overflow: "hidden",
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

            {/* Dynamic Island */}
            <div
              style={{
                position: "absolute",
                top: ISLAND_TOP,
                left: "50%",
                transform: "translateX(-50%)",
                width: ISLAND_W,
                height: ISLAND_H,
                background: "#000",
                borderRadius: ISLAND_H / 2,
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)",
                zIndex: 5,
                pointerEvents: "none",
              }}
            />
          </div>
        </div>

        {/* Side buttons — left (action + volume up + volume down) */}
        <div style={sideBtn(110, 28, "left")} />
        <div style={sideBtn(158, 56, "left")} />
        <div style={sideBtn(228, 56, "left")} />
        {/* Side buttons — right (side button) */}
        <div style={sideBtn(160, 92, "right")} />
      </div>
    </div>
  );
}

function sideBtn(top: number, height: number, side: "left" | "right"): React.CSSProperties {
  return {
    position: "absolute",
    [side]: -2,
    top,
    width: 3,
    height,
    background: "linear-gradient(90deg, #050505 0%, #2a2a2e 50%, #050505 100%)",
    borderRadius: 1.5,
    boxShadow: "0 0 0 0.5px rgba(0,0,0,0.4)",
  };
}
