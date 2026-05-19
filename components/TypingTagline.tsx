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

const TAGLINE_FONT_SIZE = "clamp(1.35rem, 3.4vw, 2.5rem)";

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
          schedule(typeChar, 90 + Math.random() * 60);
        } else {
          schedule(eraseChar, 1600);
        }
      };

      const eraseChar = () => {
        if (cancelled) return;
        if (i > 0) {
          i--;
          setText(phrase.slice(0, i));
          schedule(eraseChar, 50 + Math.random() * 35);
        } else {
          schedule(runPhrase, 420);
        }
      };

      typeChar();
    };

    // Wait for fonts (notably Hahmlet) before typing so no character
    // ever flashes in the fallback font mid-keystroke.
    const start = () => { if (!cancelled) runPhrase(); };
    if (typeof document !== "undefined" && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(start);
    } else {
      start();
    }

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
        fontSize: TAGLINE_FONT_SIZE,
        color: "var(--text-primary)",
        lineHeight: 1.45,
        letterSpacing: "-0.01em",
        minHeight: "1.45em",
        margin: 0,
        textAlign: "center",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center" }}>
        <span>{text || "​"}</span>
        <span className="vf-cursor" aria-hidden />
      </span>
    </h1>
  );
}
