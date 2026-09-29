"use client";

import { useEffect, useState } from "react";
import { cueAt, type CaptionCue } from "@/lib/workLanguages";

// 영상 위에 얹는 자막(2026-09-29 작품 두 언어 — 영상에 박지 않는다). 앱 화면이 보는 사람
// 말을 못 보여줄 때 장면마다 한 줄. 시각은 촬영 로봇이 적은 장면 시작 시각(demo_captions).
//
// PC만 그린다(`hidden md:flex`) — 폰 화면은 폰 재설계 세션까지 손대지 않기로 했다(09-27).
// 글은 주인이 쓴 것이라 React가 이스케이프하는 텍스트로만 넣는다.
export default function CaptionOverlay({
  videoRef,
  captions,
  placement = "bottom",
  mediaKey,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  captions: readonly CaptionCue[];
  // 명함 무대는 아래쪽에 제목·소개가 겹쳐 있어 위에, 작품 페이지는 재생 막대 바로 위에.
  placement?: "top" | "bottom";
  // 영상 주소 — 작품을 바꾸면 <video>가 새로 붙는다(key=url). ref 상자는 그대로라 이 값으로 다시 건다.
  mediaKey?: string;
}) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    // 재생 중 이벤트로만 고친다(effect 안에서 바로 setState하면 렌더가 한 번 더 돈다) —
    // timeupdate는 초당 4번쯤이라 장면 경계에서 최대 0.25초 늦는다.
    const tick = () => setText(cueAt(captions, el.currentTime));
    el.addEventListener("timeupdate", tick);
    el.addEventListener("seeked", tick);
    el.addEventListener("loadedmetadata", tick);
    return () => {
      el.removeEventListener("timeupdate", tick);
      el.removeEventListener("seeked", tick);
      el.removeEventListener("loadedmetadata", tick);
    };
  }, [videoRef, captions, mediaKey]);

  return (
    <div
      className="vf-caption-overlay hidden md:flex"
      data-placement={placement}
      aria-live="off"
    >
      {text && <span className="vf-caption-line">{text}</span>}
    </div>
  );
}
