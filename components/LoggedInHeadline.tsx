"use client";

import { useState, useEffect } from "react";

const HEADLINES = [
  { line1: "만든 것들을",      line2: "세상에 푸시하세요.",   mono: false },
  { line1: "나의 작업물을",    line2: "세상에 릴리즈하세요.", mono: false },
  { line1: "아이디어에서",     line2: "프로덕션까지.",        mono: false },
  { line1: "당신이 만든 것이", line2: "당신의 이력서입니다.", mono: false },
  { line1: "git push 하듯",   line2: "나를 공유하세요.",     mono: true  },
  { line1: "README보다",       line2: "멋진 자기소개.",       mono: false },
];

export default function LoggedInHeadline() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % HEADLINES.length);
        setVisible(true);
      }, 280);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const { line1, line2, mono } = HEADLINES[index];

  return (
    <h1
      className="font-black leading-tight"
      style={{
        fontFamily: "var(--font-nunito)",
        color: "var(--text-primary)",
        fontSize: "clamp(2rem, 5vw, 3.5rem)",
        letterSpacing: "-0.03em",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(10px)",
        transition: "opacity 0.28s ease, transform 0.28s ease",
      }}
    >
      <span style={mono ? { fontFamily: "'Courier New', Monaco, monospace", fontSize: "0.85em" } : undefined}>
        {line1}
      </span>
      <br />
      <span style={{ background: "linear-gradient(120deg, var(--blue) 0%, var(--blue-bright) 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
        {line2}
      </span>
    </h1>
  );
}
