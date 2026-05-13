"use client";

import { useState, useEffect, useRef } from "react";

const PHRASES = ["AI로 만든 결과물", "당신의 창작물"];
const CHARS = "!<>_\\/[]{}|=+*^?#$0123456789ABCDEFabcdef가나다라마";

const INTERVAL_MS = 10000;
const FRAME_MS = 45;
const TOTAL_FRAMES = 18; // 45ms × 18 = 810ms scramble

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
        // Left-to-right settling: earlier chars lock in first
        const settled = Math.floor(target.length * (frame / TOTAL_FRAMES));
        setText(
          target
            .split("")
            .map((ch, i) => {
              if (ch === " ") return " "; // non-breaking space
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
      style={{
        display: "inline-block",
        background: "linear-gradient(120deg, var(--blue) 0%, var(--blue-bright) 100%)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      }}
    >
      {text}
    </span>
  );
}
