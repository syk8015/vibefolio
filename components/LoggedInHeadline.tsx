"use client";

import { useEffect, useRef, useState } from "react";
import { loggedInTaglines, type LoggedInTagline } from "@/lib/loggedInTaglines";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const HEADLINE_FONT_SIZE = "clamp(1.1rem, 3.4vw, 2.5rem)";
const REPLY_FONT_SIZE = "clamp(0.95rem, 2.8vw, 2rem)";

export default function LoggedInHeadline() {
  const [text, setText] = useState("");
  const [reply, setReply] = useState("");
  const [phase, setPhase] = useState<"text" | "reply">("text");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const queue = shuffle(loggedInTaglines);
    let idx = 0;
    let cancelled = false;

    const schedule = (fn: () => void, ms: number) => {
      const t = setTimeout(fn, ms);
      timers.current.push(t);
    };

    const runPhrase = () => {
      if (cancelled) return;
      const item: LoggedInTagline = queue[idx % queue.length];
      idx++;

      const phrase = item.text;
      const replyText = item.reply ?? "";
      const hasReply = replyText.length > 0;

      setReply("");
      setPhase("text");

      let i = 0;
      const typeChar = () => {
        if (cancelled) return;
        if (i <= phrase.length) {
          setText(phrase.slice(0, i));
          i++;
          schedule(typeChar, 90 + Math.random() * 60);
        } else if (hasReply) {
          // pause before the reply appears (like a comment beat)
          schedule(startReply, 650);
        } else {
          schedule(eraseText, 1600);
        }
      };

      let j = 0;
      const startReply = () => {
        if (cancelled) return;
        setPhase("reply");
        typeReply();
      };
      const typeReply = () => {
        if (cancelled) return;
        if (j <= replyText.length) {
          setReply(replyText.slice(0, j));
          j++;
          schedule(typeReply, 90 + Math.random() * 60);
        } else {
          schedule(eraseReply, 1600);
        }
      };

      const eraseReply = () => {
        if (cancelled) return;
        if (j > 0) {
          j--;
          setReply(replyText.slice(0, j));
          schedule(eraseReply, 50 + Math.random() * 35);
        } else {
          setPhase("text");
          schedule(eraseText, 120);
        }
      };

      const eraseText = () => {
        if (cancelled) return;
        if (i > 0) {
          i--;
          setText(phrase.slice(0, i));
          schedule(eraseText, 50 + Math.random() * 35);
        } else {
          schedule(runPhrase, 420);
        }
      };

      typeChar();
    };

    // Pre-warm every glyph used in the pool so Hangul characters delivered
    // via Noto Serif KR's unicode-range subsets are already cached before
    // typing starts — otherwise a fresh syllable can flash in the system
    // serif for the first paint.
    const start = () => { if (!cancelled) runPhrase(); };
    if (typeof document !== "undefined" && document.fonts) {
      const sample = Array.from(
        new Set(loggedInTaglines.flatMap((t) => [...t.text, ...(t.reply ?? "")]))
      ).join("");
      const HEADLINE_SPEC = "500 2.5rem 'Noto Serif KR', serif";
      const REPLY_SPEC = "italic 400 2rem 'Noto Serif KR', serif";
      Promise.all([
        document.fonts.load(HEADLINE_SPEC, sample).catch(() => null),
        document.fonts.load(REPLY_SPEC, sample).catch(() => null),
        document.fonts.ready,
      ]).then(start);
    } else {
      start();
    }

    return () => {
      cancelled = true;
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []);

  return (
    <div
      aria-live="polite"
      className="vf-logged-in-headline"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.4em",
        maxWidth: "92vw",
        textAlign: "center",
        minHeight: "3.2em",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-serif), 'Noto Serif KR', serif",
          fontWeight: 500,
          fontSize: HEADLINE_FONT_SIZE,
          color: "var(--text-primary)",
          lineHeight: 1.45,
          letterSpacing: "-0.01em",
          margin: 0,
          wordBreak: "keep-all",
          overflowWrap: "break-word",
        }}
      >
        {text || "​"}
        {phase === "text" && <span className="vf-cursor vf-cursor-inline" aria-hidden />}
      </h1>

      {reply.length > 0 || phase === "reply" ? (
        <p
          style={{
            fontFamily: "var(--font-serif), 'Noto Serif KR', serif",
            fontWeight: 400,
            fontSize: REPLY_FONT_SIZE,
            color: "var(--text-secondary)",
            fontStyle: "italic",
            lineHeight: 1.45,
            letterSpacing: "-0.01em",
            margin: 0,
            paddingLeft: "1.4em",
            wordBreak: "keep-all",
            overflowWrap: "break-word",
          }}
        >
          <span aria-hidden style={{ marginRight: "0.35em", opacity: 0.7 }}>↳</span>
          {reply || "​"}
          {phase === "reply" && <span className="vf-cursor vf-cursor-inline" aria-hidden />}
        </p>
      ) : null}
    </div>
  );
}
