"use client";

import { useState, useEffect, useRef } from "react";

const PHRASES = ["AI로 만든 결과물", "당신의 창작물"];

const INTERVAL_MS = 5000;
const GLITCH_MS = 420;   // total glitch duration
const SWITCH_MS = 180;   // swap text halfway through

export default function GlitchHeadline() {
  const [text, setText] = useState(PHRASES[0]);
  const [glitching, setGlitching] = useState(false);
  const indexRef = useRef(0);

  useEffect(() => {
    const run = () => {
      const next = (indexRef.current + 1) % PHRASES.length;
      setGlitching(true);

      // Swap text mid-glitch so it feels like the distortion causes the change
      const swapTimer = setTimeout(() => {
        setText(PHRASES[next]);
        indexRef.current = next;
      }, SWITCH_MS);

      const endTimer = setTimeout(() => {
        setGlitching(false);
      }, GLITCH_MS);

      return () => { clearTimeout(swapTimer); clearTimeout(endTimer); };
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
