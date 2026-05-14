"use client";

import { useState, useEffect, useRef } from "react";

const PHRASES = ["AI로 만든 결과물", "당신의 창작물"];
const CHARS = "!<>_\\/[]{}|=+*^?#$0123456789ABCDEFabcdef가나다라마";

const INTERVAL_MS = 5000;
const FRAME_MS = 45;
const TOTAL_FRAMES = 20; // 45ms × 20 = 900ms scramble

export default function GlitchHeadline() {
  const [text, setText] = useState(PHRASES[0]);
  const [glitching, setGlitching] = useState(false);
  const indexRef = useRef(0);

  useEffect(() => {
    const run = () => {
      const next = (indexRef.current + 1) % PHRASES.length;
      const target = PHRASES[next];
      setGlitching(true);

      let frame = 0;
      const id = setInterval(() => {
        frame++;
        if (frame >= TOTAL_FRAMES) {
          clearInterval(id);
          setText(target);
          setGlitching(false);
          indexRef.current = next;
          return;
        }
        // Quadratic easing: slow start, fast finish
        // At 50% frames → only 25% of chars settled
        const progress = Math.pow(frame / TOTAL_FRAMES, 2);
        const settled = Math.floor(target.length * progress);
        setText(
          target
            .split("")
            .map((ch, i) => {
              if (ch === " ") return " ";
              if (i < settled) return ch;
              return CHARS[Math.floor(Math.random() * CHARS.length)];
            })
            .join("")
        );
      }, FRAME_MS);
    };

    const timer = setInterval(run, INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <span
      className={glitching ? "glitch-active" : ""}
      style={{ display: "inline-block" }}
    >
      {text}
    </span>
  );
}
