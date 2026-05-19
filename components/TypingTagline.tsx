"use client";

import { useEffect, useRef, useState } from "react";
import { taglines } from "@/lib/taglines";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function TypingTagline({ userCount }: { userCount: number }) {
  const [text, setText] = useState("");
  const [visible, setVisible] = useState(true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const queue = shuffle(taglines);
    let idx = 0;
    let cancelled = false;

    const schedule = (fn: () => void, ms: number) => {
      const t = setTimeout(fn, ms);
      timers.current.push(t);
    };

    const next = () => {
      if (cancelled) return;
      const raw = queue[idx % queue.length];
      const phrase = raw.replace(/\{N\}/g, String(userCount));
      idx++;

      setVisible(true);
      setText("");

      let i = 0;
      const typeChar = () => {
        if (cancelled) return;
        if (i <= phrase.length) {
          setText(phrase.slice(0, i));
          i++;
          schedule(typeChar, 35 + Math.random() * 28);
        } else {
          schedule(() => {
            if (cancelled) return;
            setVisible(false);
            schedule(next, 480);
          }, 1100);
        }
      };
      typeChar();
    };

    next();

    return () => {
      cancelled = true;
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [userCount]);

  return (
    <h1
      aria-live="polite"
      style={{
        fontFamily: "var(--font-serif), 'Noto Serif KR', serif",
        fontWeight: 500,
        fontSize: "clamp(1.6rem, 3.6vw, 3rem)",
        color: "var(--text-primary)",
        lineHeight: 1.45,
        letterSpacing: "-0.01em",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.45s ease",
        minHeight: "1.45em",
        maxWidth: "min(92vw, 900px)",
        margin: 0,
        textAlign: "center",
        wordBreak: "keep-all",
      }}
    >
      {text}
      <span className="vf-cursor" aria-hidden>│</span>
    </h1>
  );
}
