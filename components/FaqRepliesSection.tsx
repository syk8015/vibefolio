"use client";

import { useEffect, useRef, useState } from "react";

const FAQ = [
  { q: "깃허브 링크면 충분하지 않나요?", a: "깃허브는 코드를, 여기는 작품을" },
  { q: "무엇을 올려야 하나요?", a: "주말의 스케치부터 배포한 url까지" },
  { q: "완성된 것을 올려야 하나요?", a: "당신의 미완성도, 누군가에게 완성." },
  { q: "누가 쓰는 건가요?", a: "@everyone" },
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

// The inline-grid "ghost text underneath, typed text on top" trick reserves the
// final layout so lines never reflow while typing. max-width:100% lets the ghost
// (and the visible copy over it) wrap within its container on narrow screens
// instead of overflowing — the trick is otherwise untouched.
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
    <span style={{ display: "inline-grid", verticalAlign: "top", maxWidth: "100%" }}>
      <span style={{ gridArea: "1 / 1", visibility: "hidden" }} aria-hidden>{text}</span>
      <span style={{ gridArea: "1 / 1" }}>{text.slice(0, n)}</span>
    </span>
  );
}

// Direction C — "선언 (Dialogue)": emphasis is inverted. The question is a quiet
// mono-tagged prompt; the answer becomes the hero — large serif on a soft-fill
// band. Reads like a manifesto of short replies.
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
      <div style={listStyle}>
        {TIMELINE.map((item, i) => (
          <div key={i}>
            <p className="vf-faq-q" style={qStyle}>
              <span style={tagStyle}>Q{String(i + 1).padStart(2, "0")}</span>
              <Typed text={item.q} startDelay={item.qDelay} enabled={inView} instant={reduced} />
            </p>
            <div style={bandStyle}>
              <span style={arrowStyle} aria-hidden>→</span>
              <p className="vf-faq-a" style={aStyle}>
                <Typed text={item.a} startDelay={item.aDelay} enabled={inView} instant={reduced} />
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// Inner content column. Establishes a query container so the section's clamp()
// sizes track its OWN width (cqi) — on the full-width page cqi ≈ vw.
const listStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 640,
  containerType: "inline-size",
  display: "flex",
  flexDirection: "column",
  gap: "clamp(2rem, 4.5cqi, 3rem)",
};

const qStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: "0.7rem",
  fontFamily: "var(--font-serif), 'Noto Serif KR', serif",
  fontWeight: 400,
  fontSize: "clamp(0.92rem, 1.7cqi, 1.12rem)",
  color: "var(--text-secondary)",
  lineHeight: 1.5,
  letterSpacing: "-0.005em",
  margin: "0 0 clamp(0.7rem, 1.8cqi, 1rem)",
  wordBreak: "keep-all",
  overflowWrap: "break-word",
};

const tagStyle: React.CSSProperties = {
  flex: "0 0 auto",
  whiteSpace: "nowrap",
  fontFamily: "var(--font-mono), monospace",
  fontSize: "0.68rem",
  fontWeight: 500,
  letterSpacing: "0.08em",
  color: "var(--text-muted)",
  transform: "translateY(-0.08em)",
};

const bandStyle: React.CSSProperties = {
  background: "var(--surface-soft)",
  borderRadius: 16,
  padding: "clamp(1.3rem, 3.2cqi, 1.9rem) clamp(1.4rem, 3.5cqi, 2.1rem)",
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  gap: "clamp(0.7rem, 2cqi, 1.1rem)",
  alignItems: "start",
};

const arrowStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono), monospace",
  fontSize: "clamp(1.2rem, 2.4cqi, 1.5rem)",
  lineHeight: 1.25,
  color: "var(--text-muted)",
  flex: "0 0 auto",
};

const aStyle: React.CSSProperties = {
  margin: 0,
  minWidth: 0,
  fontFamily: "var(--font-serif), 'Noto Serif KR', serif",
  fontWeight: 600,
  fontSize: "clamp(1.35rem, 3cqi, 1.95rem)",
  color: "var(--text-primary)",
  lineHeight: 1.35,
  letterSpacing: "-0.015em",
  wordBreak: "keep-all",
  overflowWrap: "break-word",
};
