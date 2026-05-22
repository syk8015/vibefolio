"use client";

import { useEffect, useState } from "react";

const FADE_DISTANCE = 100;

export default function ScrollHint() {
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    let pending = false;

    const update = () => {
      pending = false;
      const y = window.scrollY;
      setOpacity(Math.max(0, 1 - y / FADE_DISTANCE));
    };

    const onScroll = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className="absolute bottom-10 flex flex-col items-center gap-2 animate-bounce"
      style={{
        opacity,
        pointerEvents: opacity < 0.05 ? "none" : "auto",
      }}
      aria-hidden={opacity < 0.05}
    >
      <p
        className="text-xs"
        style={{
          color: "var(--text-muted)",
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.1em",
        }}
      >
        scroll
      </p>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path
          d="M8 3v10M3 9l5 5 5-5"
          stroke="var(--text-muted)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
