"use client";

import { useEffect, useState } from "react";

type ViewportMode = "desktop" | "mobile";

// iPhone 17 (6.3") logical viewport.
const MOBILE_W = 402;
const MOBILE_H = 874;

// Device shell geometry.
const BEZEL = 7;
const DEVICE_RADIUS = 51;
const SCREEN_RADIUS = 44;
const STATUS_BAR_H = 44;
const ISLAND_W = 120;
const ISLAND_H = 32;
const ISLAND_TOP = 6;

// Vertical chrome around the device when calculating fit.
const NAV_OFFSET = 88;
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
  const [time, setTime] = useState("9:41");
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

  // Live clock for the status bar.
  useEffect(() => {
    if (!enabled || mode !== "mobile") return;
    const update = () => {
      const d = new Date();
      setTime(`${d.getHours()}:${d.getMinutes().toString().padStart(2, "0")}`);
    };
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [enabled, mode]);

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

      <div
        style={{
          position: "relative",
          width: deviceOuterW,
          height: deviceOuterH,
          transform: `scale(${scale})`,
          transformOrigin: "top center",
          marginBottom: `${(scale - 1) * deviceOuterH}px`,
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
              background: "#000",
            }}
          >
            {/* Status bar (the "notch area") */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: STATUS_BAR_H,
                background: "#000",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 28px",
                zIndex: 5,
              }}
            >
              <span
                style={{
                  color: "#fff",
                  fontSize: 15,
                  fontWeight: 600,
                  fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, sans-serif",
                  letterSpacing: "-0.01em",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {time}
              </span>
              <div style={{ width: ISLAND_W }} aria-hidden />
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <CellularIcon />
                <WifiIcon />
                <BatteryIcon />
              </div>
            </div>

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
                zIndex: 6,
                pointerEvents: "none",
              }}
            />

            {/* Iframe — sits below the status bar */}
            <iframe
              src={`/${username}?embed=1`}
              title="모바일 미리보기"
              width={MOBILE_W}
              height={MOBILE_H - STATUS_BAR_H}
              style={{
                position: "absolute",
                top: STATUS_BAR_H,
                left: 0,
                border: "none",
                display: "block",
                width: MOBILE_W,
                height: MOBILE_H - STATUS_BAR_H,
              }}
            />
          </div>
        </div>

        {/* Side buttons */}
        <div style={sideBtn(110, 28, "left")} />
        <div style={sideBtn(158, 56, "left")} />
        <div style={sideBtn(228, 56, "left")} />
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

function CellularIcon() {
  return (
    <svg width="17" height="11" viewBox="0 0 18 12" fill="#fff" aria-hidden>
      <rect x="0" y="8" width="3" height="4" rx="0.6" />
      <rect x="5" y="6" width="3" height="6" rx="0.6" />
      <rect x="10" y="3" width="3" height="9" rx="0.6" />
      <rect x="15" y="0" width="3" height="12" rx="0.6" />
    </svg>
  );
}

function WifiIcon() {
  return (
    <svg width="16" height="11" viewBox="0 0 16 12" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
      <path d="M1 4.2C2.9 2.5 5.3 1.5 8 1.5s5.1 1 7 2.7" />
      <path d="M3.4 6.7c1.3-1.1 2.9-1.7 4.6-1.7s3.3.6 4.6 1.7" />
      <path d="M5.8 9.1c.6-.5 1.4-.8 2.2-.8s1.6.3 2.2.8" />
      <circle cx="8" cy="11" r="0.8" fill="#fff" stroke="none" />
    </svg>
  );
}

function BatteryIcon() {
  return (
    <svg width="27" height="13" viewBox="0 0 27 13" fill="none" aria-hidden>
      <rect x="0.5" y="0.5" width="22" height="12" rx="3" stroke="rgba(255,255,255,0.55)" />
      <rect x="2.5" y="2.5" width="16" height="8" rx="1.5" fill="#fff" />
      <rect x="23.5" y="4" width="2" height="5" rx="0.8" fill="rgba(255,255,255,0.55)" />
    </svg>
  );
}
