"use client";

import { useEffect, useRef } from "react";
import CaptionOverlay from "@/components/CaptionOverlay";
import type { CaptionCue } from "@/lib/workLanguages";

// 작품 페이지 영상. 서버 <video autoPlay muted>만으로는 React 19가 `muted`를
// HTML 속성으로 안 찍는 경우가 있어 크롬 자동재생 정책에 막힌다(포스터에서 멈춤).
// 명함(TheaterStage DirectVideo)과 같은 우회 — 마운트 직후 .muted=true + play().
// captions(2026-09-29 작품 두 언어): 보는 사람 언어 자막 — 재생 막대 바로 위에 얹는다(PC만).
export default function WatchPlayer({ src, poster, captions }: { src: string; poster?: string; captions?: CaptionCue[] | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = true;
    el.play().catch(() => { /* 사용자 조작 전 재생을 거부하는 브라우저 — 재생 단추가 남는다 */ });
  }, [src]);
  const video = (
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
  if (!captions?.length) return video;
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {video}
      <CaptionOverlay videoRef={ref} captions={captions} placement="bottom" mediaKey={src} />
    </div>
  );
}
