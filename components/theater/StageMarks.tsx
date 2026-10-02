"use client";

import { useEffect, useRef } from "react";

// 무대(작품 영상) 위의 작은 표시 두 가지(2026-10-02 덜어내기 2차 "업그레이드") —
// 프레임 페이지 무대(TheaterStage)와 작품 페이지 영상(WatchPlayer)이 같이 쓴다.
// 무대는 테마와 상관없이 늘 영상 위라, 영상 위 글자가 늘 그랬듯 어두운 바탕 + 밝은 글씨로 고정한다.

// 왼쪽 위 표시 — 지금 흐르는 영상이 무엇인지 쉬운 말로("▶ 자동 시연" / "▶ 시연 영상").
// 라이브 화면(iframe)·대표 이미지 위엔 두지 않는다 — 부르는 쪽이 영상일 때만 그린다.
export function StageChip({ label, inset }: { label: string; inset: number }) {
  return (
    <span
      style={{
        position: "absolute",
        left: inset,
        top: inset,
        zIndex: 4,
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "6px 13px 6px 11px",
        borderRadius: 999,
        background: "rgba(20,16,12,0.62)",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.16)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        color: "#f4ede0",
        fontFamily: "var(--font-nunito)",
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1.3,
        whiteSpace: "nowrap",
        pointerEvents: "none",
      }}
    >
      <span
        aria-hidden
        style={{
          flex: "none",
          width: 0,
          height: 0,
          borderLeft: "7px solid currentColor",
          borderTop: "4.5px solid transparent",
          borderBottom: "4.5px solid transparent",
        }}
      />
      {label}
    </span>
  );
}

// 아래 가장자리의 얇은 재생 막대 — 영상의 진짜 currentTime/duration이다(꾸민 애니메이션이 아니다).
// 프레임마다 React 렌더를 돌리지 않게 막대의 transform만 직접 고친다: 재생 중엔 매 프레임,
// 멈춰 있으면 시간 이벤트 때만. 움직임 줄이기 설정이면 막대를 아예 그리지 않는다(motion-reduce:hidden).
// mediaKey = 영상 주소 — 작품을 바꾸면 <video>가 새로 붙는다(key=url). ref 상자는 그대로라 이 값으로 다시 건다.
export function StageProgress({
  videoRef,
  mediaKey,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  mediaKey: string;
}) {
  const barRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    const bar = barRef.current;
    if (!el || !bar) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    const paint = () => {
      const d = el.duration;
      const p = Number.isFinite(d) && d > 0 ? Math.min(el.currentTime / d, 1) : 0;
      bar.style.transform = `scaleX(${p})`;
    };
    // 막대가 안 보이면(폰 폭에서 숨김 등) 매 프레임 돌지 않는다 — 시간 이벤트 때만 칠한다.
    const visible = () => bar.getClientRects().length > 0;
    const frame = () => {
      paint();
      raf = el.paused || reduce.matches || !visible() ? 0 : requestAnimationFrame(frame);
    };
    const start = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const timeEvents = ["timeupdate", "seeked", "loadedmetadata", "emptied"] as const;
    for (const e of timeEvents) el.addEventListener(e, paint);
    el.addEventListener("playing", start);
    paint();
    if (!el.paused) start();
    return () => {
      cancelAnimationFrame(raf);
      for (const e of timeEvents) el.removeEventListener(e, paint);
      el.removeEventListener("playing", start);
    };
  }, [videoRef, mediaKey]);

  return (
    // display는 인라인으로 주지 않는다 — motion-reduce:hidden(display:none)이 이겨야 한다.
    // 바닥 줄은 밝은 막 + 옅은 어둠을 겹친다: 어두운 영상에선 흐린 밝은 줄, 밝은 영상에서도 줄이 보인다.
    <span
      aria-hidden
      className="motion-reduce:hidden"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: 3,
        zIndex: 5,
        pointerEvents: "none",
        background: "linear-gradient(rgba(255,255,255,0.16), rgba(255,255,255,0.16)), rgba(0,0,0,0.28)",
      }}
    >
      <span
        ref={barRef}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          background: "#f4ede0",
          transform: "scaleX(0)",
          transformOrigin: "left center",
        }}
      />
    </span>
  );
}
