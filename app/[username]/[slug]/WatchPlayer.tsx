"use client";

import { useEffect, useRef } from "react";

// 작품 페이지 영상. 서버 <video autoPlay muted>만으로는 React 19가 `muted`를
// HTML 속성으로 안 찍는 경우가 있어 크롬 자동재생 정책에 막힌다(포스터에서 멈춤).
// 명함(TheaterStage DirectVideo)과 같은 우회 — 마운트 직후 .muted=true + play().
export default function WatchPlayer({ src, poster }: { src: string; poster?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = true;
    el.play().catch(() => { /* 사용자 조작 전 재생을 거부하는 브라우저 — 재생 단추가 남는다 */ });
  }, [src]);
  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      controls
      autoPlay
      muted
      loop
      playsInline
      style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
    />
  );
}
