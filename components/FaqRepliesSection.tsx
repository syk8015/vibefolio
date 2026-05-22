"use client";

import { useEffect, useRef, useState } from "react";

const FAQ = [
  { q: "깃허브 링크면 충분하지 않나요?", a: "깃허브엔 코드, 이곳엔 손끝으로 닿는 작품" },
  { q: "노션이나 링크트리로는 안 되나요?", a: "거기엔 링크 한 줄, 여기엔 작품이 사는 집" },
  { q: "누가 쓰는 건가요?", a: "설명보다 작동으로 보여주는 사람" },
  { q: "무엇을 올려야 하나요?", a: "주말의 스케치부터, 미완의 데모까지" },
];

const CHAR_MS = 8;
const Q_TO_A_PAUSE = 90;
const PAIR_PAUSE = 200;

type Item = { q: string; a: string; qDelay: number; aDelay: number };

function buildTimeline(): Item[] {
  let t = 0;
  return FAQ.map((item) => {
    const qDelay = t;
    t += item.q.length * CHAR_MS + Q_TO_A_PAUSE;
    const aDelay = t;
    t += item.a.length * CHAR_MS + PAIR_PAUSE;
    return { ...item, qDelay, aDelay };
  });
}

const TIMELINE = buildTimeline();

function Typed({
  text, startDelay, enabled, instant,
}: {
  text: string;
  startDelay: number;
  enabled: boolean;
  instant: boolean;
}) {
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    if (instant) { setN(text.length); return; }

    let intervalId: ReturnType<typeof setInterval> | undefined;
    const startId = setTimeout(() => {
      let c = 0;
      intervalId = setInterval(() => {
        c += 1;
        setN(c);
        if (c >= text.length && intervalId) {
          clearInterval(intervalId);
          intervalId = undefined;
        }
      }, CHAR_MS);
    }, startDelay);

    return () => {
      clearTimeout(startId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [text, startDelay, enabled, instant]);

  return (
    <span style={{ display: "inline-grid", verticalAlign: "top" }}>
      <span style={{ gridArea: "1 / 1", visibility: "hidden" }} aria-hidden>{text}</span>
      <span style={{ gridArea: "1 / 1" }}>{text.slice(0, n)}</span>
    </span>
  );
}

export default function FaqRepliesSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect(); } },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      style={{
        padding: "6rem clamp(1rem, 3vw, 2rem) 10rem",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 640,
          display: "flex",
          flexDirection: "column",
          gap: "4.25rem",
        }}
      >
        {TIMELINE.map((item, i) => (
          <div key={i}>
            <p style={qStyle}>
              <Typed text={item.q} startDelay={item.qDelay} enabled={inView} instant={reduced} />
            </p>
            <p style={aStyle}>
              <Typed text={item.a} startDelay={item.aDelay} enabled={inView} instant={reduced} />
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

const qStyle: React.CSSProperties = {
  fontFamily: "var(--font-serif), 'Noto Serif KR', serif",
  fontWeight: 500,
  fontSize: "clamp(1.2rem, 2.2vw, 1.6rem)",
  color: "var(--text-primary)",
  lineHeight: 1.45,
  letterSpacing: "-0.01em",
  margin: "0 0 0.65rem",
  wordBreak: "keep-all",
  overflowWrap: "break-word",
};

const aStyle: React.CSSProperties = {
  fontFamily: "var(--font-serif), 'Noto Serif KR', serif",
  fontWeight: 500,
  fontSize: "clamp(0.9rem, 1.55vw, 1.15rem)",
  color: "var(--text-secondary)",
  lineHeight: 1.5,
  letterSpacing: "-0.01em",
  margin: 0,
  textAlign: "right",
  wordBreak: "keep-all",
  overflowWrap: "break-word",
};
