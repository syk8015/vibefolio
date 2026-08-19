"use client";

import { useEffect, useRef, useState } from "react";
import { loggedInTaglines, loggedInTaglinesEn, type LoggedInTagline } from "@/lib/loggedInTaglines";
import type { Locale } from "@/lib/i18n/config";

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

// locale은 서버(랜딩 페이지)에서 내려받는다 — TypingTagline과 같은 이유.
//
// forceText/forceReply/promoNotFound(app/page.tsx의 ?promo= 배선, 홍보 클립
// 촬영 전용 — lib/promo.ts): 지정되면 셔플 큐 대신 그 문구 1개만 반복 재생한다.
// 일반 방문자는 이 세 props를 절대 안 받으므로(promo 쿼리가 있을 때만 채워짐)
// 기존 동작과 완전히 동일하게 유지된다.
export default function LoggedInHeadline({
  locale,
  forceText,
  forceReply,
  promoNotFound,
}: {
  locale: Locale;
  forceText?: string;
  forceReply?: string;
  promoNotFound?: boolean;
}) {
  const [text, setText] = useState("");
  const [reply, setReply] = useState("");
  const [phase, setPhase] = useState<"text" | "reply">("text");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pool = locale === "en" ? loggedInTaglinesEn : loggedInTaglines;
    // forceText가 있으면 큐를 그 문구 1개로 고정 — runPhrase 이하 상태기계는
    // 손대지 않고 그대로 재사용된다(길이 1 큐를 계속 랩어라운드 재생할 뿐).
    const queue = forceText ? [{ text: forceText, reply: forceReply }] : shuffle(pool);
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
    // via Hahmlet's unicode-range subsets are already cached before typing
    // starts — otherwise a fresh syllable can flash in the system serif for
    // the first paint.
    // 프로모 촬영 전용 프리롤: 외부 화면 녹화기가 ffmpeg 캡처를 먼저 롤링할
    // 여유를 준다. 일반 방문자(forceText 없음)는 지금과 동일하게 즉시 시작.
    const start = () => {
      if (cancelled) return;
      if (forceText) schedule(runPhrase, 800);
      else runPhrase();
    };
    if (typeof document !== "undefined" && document.fonts) {
      // forced 재생은 그 문구 글자만 프리워밍하면 충분(더 빨리 준비됨).
      const glyphSource = forceText ? [{ text: forceText, reply: forceReply ?? "" }] : pool;
      const sample = Array.from(
        new Set(glyphSource.flatMap((t) => [...t.text, ...(t.reply ?? "")]))
      ).join("");
      // 프리워밍 대상은 **실제로 한글을 그리는 폰트**여야 한다. 한글은
      // Hahmlet(--font-serif, 스택 1순위)이 덮는다 — 그 서브셋을 안 데우면
      // 타이핑 도중 fallback → Hahmlet으로 글꼴이 한 번 휙 바뀐다
      // (2026-08-18 홍보 클립에서 육안 접수). next/font가 만드는 패밀리명은
      // 해시가 붙어 하드코딩할 수 없으므로 CSS 변수에서 읽어 온다.
      // 'Noto Serif KR'은 데우지 않는다: 원격 CSS를 걷어내 등록된 face가
      // 없고, 실측상 한 글자도 이 폰트로 그려지지 않았다 (2026-08-19).
      const serifVar = getComputedStyle(document.documentElement)
        .getPropertyValue("--font-serif")
        .trim();
      const families = [serifVar].filter(Boolean);
      const specs = families.flatMap((f) => [`500 2.5rem ${f}, serif`, `italic 400 2rem ${f}, serif`]);
      Promise.all([
        ...specs.map((spec) => document.fonts.load(spec, sample).catch(() => null)),
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
  }, [locale, forceText, forceReply]);

  if (promoNotFound) {
    // 홍보 클립 촬영 워커(local-runner/promo-record.ts)가 이 마커를 폴링해
    // 즉시 실패 처리한다 — 조용히 셔플로 폴백하면 엉뚱한 문구가 찍힌 영상이
    // 만들어질 수 있으므로 명시적 에러로 렌더링한다.
    return (
      <div
        data-promo-tagline-status="not-found"
        style={{ color: "red", fontFamily: "monospace", padding: "1em", textAlign: "center" }}
      >
        PROMO TAGLINE NOT FOUND — lib/loggedInTaglines.ts 확인
      </div>
    );
  }

  return (
    <div
      aria-live="polite"
      className="vf-logged-in-headline"
      data-promo-tagline-status={forceText ? "ok" : undefined}
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
