"use client";

import { useEffect, useRef, useState } from "react";
import type { TargetDevice } from "@/lib/projectTaxonomy";

// 초안 검토 창의 미리보기 틀(2026-09-15). 폰=402×874(명함 페이지 ViewportFrame과 같은
// 논리 크기), PC=1280×800. 틀 안의 내용(iframe·영상·썸네일)은 그 논리 크기 그대로
// 그리고 칸에 맞춰 통째로 축소한다 — 작품이 자기 폭에서 보여주는 레이아웃이 보이도록.
// 어느 틀인지는 업로드한 AI가 답한 targetDevice로만 정한다(사람이 바꾸는 스위치 없음).
export const PHONE_VIEW = { w: 402, h: 874 } as const;
export const DESKTOP_VIEW = { w: 1280, h: 800 } as const;

const BEZEL = 7;
const DEVICE_RADIUS = 51;
const SCREEN_RADIUS = 44;
const STATUS_BAR_H = 44;
const ISLAND_W = 120;
const ISLAND_H = 32;
const DESKTOP_BAR_H = 44;

export function PreviewDevice({ device, address, children }: {
  device: TargetDevice;
  /** PC 틀 위 주소 표시줄에 쓰는 글자 */
  address: string;
  /** 화면 영역을 꽉 채우는 내용 — `absolute inset-0` 기준으로 그린다 */
  children: React.ReactNode;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  // 0 = 아직 칸 크기를 모른다(그리지 않음). ResizeObserver 콜백에서만 바뀐다.
  const [scale, setScale] = useState(0);
  const outerW = device === "mobile" ? PHONE_VIEW.w + BEZEL * 2 : DESKTOP_VIEW.w;
  const outerH = device === "mobile" ? PHONE_VIEW.h + BEZEL * 2 : DESKTOP_VIEW.h + DESKTOP_BAR_H;

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setScale(Math.min(width / outerW, height / outerH));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [outerW, outerH]);

  return (
    <div ref={areaRef} className="vf-review-stage">
      {scale > 0 && (
        <div style={{ position: "relative", flexShrink: 0, width: outerW * scale, height: outerH * scale }}>
          <div
            style={{
              position: "absolute", top: 0, left: 0, width: outerW, height: outerH,
              transform: `scale(${scale})`, transformOrigin: "0 0",
            }}
          >
            {device === "mobile"
              ? <PhoneShell>{children}</PhoneShell>
              : <DesktopShell address={address}>{children}</DesktopShell>}
          </div>
        </div>
      )}
    </div>
  );
}

function PhoneShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "absolute", inset: 0, padding: BEZEL, borderRadius: DEVICE_RADIUS,
        background: "linear-gradient(135deg, #2a2a2e 0%, #0d0d10 60%, #1a1a1d 100%)",
        boxShadow: "var(--shadow-device), 0 0 0 1px rgba(255,255,255,0.06), inset 0 0 0 1.5px rgba(255,255,255,0.04)",
      }}
    >
      <div
        style={{
          position: "relative", width: PHONE_VIEW.w, height: PHONE_VIEW.h,
          borderRadius: SCREEN_RADIUS, overflow: "hidden", background: "#000",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute", top: 0, left: 0, right: 0, height: STATUS_BAR_H, zIndex: 2,
            display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px",
            background: "#000", color: "#fff", fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em",
            fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, sans-serif", fontVariantNumeric: "tabular-nums",
          }}
        >
          <span>9:41</span>
          <span style={{ width: ISLAND_W }} />
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <svg width="17" height="11" viewBox="0 0 18 12" fill="#fff">
              <rect x="0" y="8" width="3" height="4" rx="0.6" /><rect x="5" y="6" width="3" height="6" rx="0.6" />
              <rect x="10" y="3" width="3" height="9" rx="0.6" /><rect x="15" y="0" width="3" height="12" rx="0.6" />
            </svg>
            <svg width="16" height="11" viewBox="0 0 16 12" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round">
              <path d="M1 4.2C2.9 2.5 5.3 1.5 8 1.5s5.1 1 7 2.7" /><path d="M3.4 6.7c1.3-1.1 2.9-1.7 4.6-1.7s3.3.6 4.6 1.7" />
              <path d="M5.8 9.1c.6-.5 1.4-.8 2.2-.8s1.6.3 2.2.8" />
            </svg>
            <svg width="27" height="13" viewBox="0 0 27 13" fill="none">
              <rect x="0.5" y="0.5" width="22" height="12" rx="3" stroke="rgba(255,255,255,0.55)" />
              <rect x="2.5" y="2.5" width="16" height="8" rx="1.5" fill="#fff" />
              <rect x="23.5" y="4" width="2" height="5" rx="0.8" fill="rgba(255,255,255,0.55)" />
            </svg>
          </span>
        </div>
        <div
          aria-hidden
          style={{
            position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)", zIndex: 3,
            width: ISLAND_W, height: ISLAND_H, borderRadius: ISLAND_H / 2, background: "#000",
          }}
        />
        <div
          style={{
            position: "absolute", top: STATUS_BAR_H, left: 0, right: 0, bottom: 0,
            overflow: "hidden", background: "var(--surface-soft)",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function DesktopShell({ address, children }: { address: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column", overflow: "hidden",
        borderRadius: 16, background: "var(--surface)", boxShadow: "var(--shadow-device)",
      }}
    >
      <div
        aria-hidden
        style={{
          flexShrink: 0, height: DESKTOP_BAR_H, display: "flex", alignItems: "center", justifyContent: "center",
          background: "var(--surface-soft)",
        }}
      >
        <span
          className="vf-mono"
          style={{
            maxWidth: 640, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            padding: "4px 18px", borderRadius: 10, background: "var(--surface)",
            color: "var(--text-secondary)", fontSize: 18,
          }}
        >
          {address}
        </span>
      </div>
      <div style={{ position: "relative", flex: 1, overflow: "hidden", background: "var(--surface-soft)" }}>
        {children}
      </div>
    </div>
  );
}
