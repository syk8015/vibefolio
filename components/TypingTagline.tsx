"use client";

import { useEffect, useRef, useState } from "react";
import { taglines, taglinesEn, taglineIntros, taglineIntrosEn, LIVE_COUNT_MIN } from "@/lib/taglines";
import type { Locale } from "@/lib/i18n/config";
import { applyOverridesToStrings, type LiveMemes, type LiveMeme } from "@/lib/memeLiveShape";

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
// live: 검토 화면에서 공개한 매일 밈 중 '모두에게' 줄(lib/memeLive.ts) — 첫 소개 문장 다음에 오늘 것부터.
// 최신화는 기존 문구를 갈아 끼운다. 답글이 있는 줄은 홈(로그인)과 같이 아래에 ↳로 친다 —
// 답글 줄은 제목 아래에 떠 있게 둬서 문구가 바뀌어도 화면이 위아래로 흔들리지 않는다.
export default function TypingTagline({ userCount, locale, live }: { userCount: number; locale: Locale; live?: LiveMemes }) {
  const [text, setText] = useState("");
  const [reply, setReply] = useState("");
  const [phase, setPhase] = useState<"text" | "reply">("text");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    // 첫 문장은 소개 풀에서 하나, 나머지(남은 소개 포함)는 섞는다.
    const overrides = live?.overrides ?? {};
    const intros = shuffle(applyOverridesToStrings(locale === "en" ? taglineIntrosEn : taglineIntros, overrides));
    const rest = applyOverridesToStrings(
      (locale === "en" ? taglinesEn : taglines).filter((line) => userCount >= LIVE_COUNT_MIN || !line.includes("{N}")),
      overrides,
    );
    const everyone = live?.everyone ?? [];
    const queue: LiveMeme[] = [intros[0], ...everyone.slice(0, 3), ...shuffle([...intros.slice(1), ...rest, ...everyone.slice(3)])];
    let idx = 0;
    let cancelled = false;

    const schedule = (fn: () => void, ms: number) => {
      const t = setTimeout(fn, ms);
      timers.current.push(t);
    };

    const runPhrase = () => {
      if (cancelled) return;
      const item = queue[idx % queue.length];
      const phrase = item.text.replace(/\{N\}/g, String(userCount));
      const replyText = item.reply ?? "";
      idx++;
      setReply("");
      setPhase("text");

      let i = 0;
      let j = 0;
      const typeChar = () => {
        if (cancelled) return;
        if (i <= phrase.length) {
          setText(phrase.slice(0, i));
          i++;
          schedule(typeChar, 90 + Math.random() * 60);
        } else if (replyText) {
          schedule(() => { if (!cancelled) { setPhase("reply"); typeReply(); } }, 650);
        } else {
          schedule(eraseChar, 1600);
        }
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
          schedule(eraseChar, 120);
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
  }, [userCount, locale, live]);

  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
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
      {phase === "text" && <span className="vf-cursor vf-cursor-inline" aria-hidden />}
    </h1>
    {(reply.length > 0 || phase === "reply") && (
      <p
        aria-hidden
        style={{
          position: "absolute",
          top: "100%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "max-content",
          maxWidth: "92vw",
          margin: "0.3em 0 0",
          fontFamily: "var(--font-serif), 'Noto Serif KR', serif",
          fontWeight: 400,
          fontStyle: "italic",
          fontSize: "clamp(0.95rem, 2.8vw, 2rem)",
          color: "var(--text-secondary)",
          lineHeight: 1.45,
          letterSpacing: "-0.01em",
          textAlign: "center",
          wordBreak: "keep-all",
          overflowWrap: "break-word",
        }}
      >
        <span style={{ marginRight: "0.35em", opacity: 0.7 }}>↳</span>
        {reply || "​"}
        {phase === "reply" && <span className="vf-cursor vf-cursor-inline" />}
      </p>
    )}
    </div>
  );
}
