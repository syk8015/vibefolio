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
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const queue = shuffle(taglines);
    let idx = 0;
    let cancelled = false;

    const schedule = (fn: () => void, ms: number) => {
      const t = setTimeout(fn, ms);
      timers.current.push(t);
    };

    const runPhrase = () => {
      if (cancelled) return;
      const raw = queue[idx % queue.length];
      const phrase = raw.replace(/\{N\}/g, String(userCount));
      idx++;

      let i = 0;

      const typeChar = () => {
        if (cancelled) return;
        if (i <= phrase.length) {
          setText(phrase.slice(0, i));
          i++;
          // Deliberate, human typing — 90~150ms per char
          schedule(typeChar, 90 + Math.random() * 60);
        } else {
          // Hold the completed phrase
          schedule(eraseChar, 1600);
        }
      };

      const eraseChar = () => {
        if (cancelled) return;
        if (i > 0) {
          i--;
          setText(phrase.slice(0, i));
          // Backspace a touch faster than typing — 50~85ms per char
          schedule(eraseChar, 50 + Math.random() * 35);
        } else {
          // Brief pause on empty line before next phrase
          schedule(runPhrase, 420);
        }
      };

      typeChar();
    };

    runPhrase();

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
