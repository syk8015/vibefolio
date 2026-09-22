"use client";

import { useEffect, useRef, useState } from "react";
import { taglines, taglinesEn, taglineIntros, taglineIntrosEn, LIVE_COUNT_MIN } from "@/lib/taglines";
import type { Locale } from "@/lib/i18n/config";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const TAGLINE_FONT_SIZE = "clamp(1.1rem, 3.4vw, 2.5rem)";

// locale은 서버(랜딩 페이지, auth 쿠키로 이미 동적)에서 내려받는다 —
// 루트 LocaleProvider는 마운트 후에야 언어를 알아서 useT를 쓰면 첫 문장이
// 한국어로 시작했다가 갈아타는 깜빡임이 생긴다.
export default function TypingTagline({ userCount, locale }: { userCount: number; locale: Locale }) {
  const [text, setText] = useState("");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    // 첫 문장은 소개 풀에서 하나, 나머지(남은 소개 포함)는 섞는다.
    const intros = shuffle(locale === "en" ? taglineIntrosEn : taglineIntros);
    const rest = (locale === "en" ? taglinesEn : taglines).filter(
      (line) => userCount >= LIVE_COUNT_MIN || !line.includes("{N}"),
    );
    const queue = [intros[0], ...shuffle([...intros.slice(1), ...rest])];
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
  }, [userCount, locale]);

  return (
    <h1
      className="vf-tagline md:whitespace-nowrap"
      style={{
        fontFamily: "var(--font-serif), 'Noto Serif KR', serif",
        fontWeight: 500,
        fontSize: TAGLINE_FONT_SIZE,
        color: "var(--text-primary)",
        lineHeight: 1.45,
        letterSpacing: "-0.01em",
        minHeight: "1.45em",
        margin: 0,
        maxWidth: "92vw",
        textAlign: "center",
        // Wrap on natural boundaries (spaces/punctuation) instead of
        // breaking mid-syllable. keep-all keeps Korean character runs
        // intact; overflowWrap as a safety net for unbroken runs.
        wordBreak: "keep-all",
        overflowWrap: "break-word",
      }}
    >
      {/* 제목의 뜻은 가려진 고정 한 줄이 맡는다 — 서버 HTML에 설명 문장이
          0개였고(검색·링크 미리보기), 한 글자씩 바뀌는 글을 화면 낭독기가
          매번 읽었다. 화면 모양은 그대로다. */}
      <span className="sr-only">{locale === "en" ? "The live portfolio for vibe coders" : "바이브코더를 위한 라이브 포트폴리오"}</span>
      <span aria-hidden>{text || "​"}</span>
      <span className="vf-cursor vf-cursor-inline" aria-hidden />
    </h1>
  );
}
