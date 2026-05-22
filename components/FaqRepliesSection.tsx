"use client";

import { useEffect, useRef, useState } from "react";

const FAQ = [
  { q: "깃허브 링크면 충분하지 않나요?", a: "깃허브는 코드를 두는 곳, 작품을 두는 곳은 아니다." },
  { q: "노션이나 링크트리로는 안 되나요?", a: "거기선 페이지 하나일 뿐, 여기선 한 사람의 집." },
  { q: "누가 쓰는 건가요?", a: "보여줄 게 있는 사람." },
  { q: "무엇을 올려야 하나요?", a: "자랑할 것 말고, 남겨두고 싶은 것." },
];

type Item = { q: string; a: string; qStart: number; aStart: number };

function buildOffsets(): { items: Item[]; total: number } {
  let offset = 0;
  const items = FAQ.map((item) => {
    const qStart = offset;
    offset += item.q.length;
    const aStart = offset;
    offset += item.a.length;
    return { ...item, qStart, aStart };
  });
  return { items, total: offset };
}

const { items: ITEMS, total: TOTAL_CHARS } = buildOffsets();

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function Typed({
  text, start, globalCount, instant,
}: {
  text: string;
  start: number;
  globalCount: number;
  instant: boolean;
}) {
  const n = instant ? text.length : clamp(globalCount - start, 0, text.length);
  return (
    <span style={{ display: "inline-grid", verticalAlign: "top" }}>
      <span style={{ gridArea: "1 / 1", visibility: "hidden" }} aria-hidden>{text}</span>
      <span style={{ gridArea: "1 / 1" }}>{text.slice(0, n)}</span>
    </span>
  );
}

export default function FaqRepliesSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const [globalCount, setGlobalCount] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    let pending = false;
    let highWater = 0;

    const update = () => {
      pending = false;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // progress=0 when section top is at 85% of viewport (just entering from below)
      // progress=1 when section top is at (15% of vh - section height), i.e. section bottom at 15% from top
      const startThreshold = vh * 0.85;
      const endThreshold = vh * 0.15 - rect.height;
      const range = startThreshold - endThreshold;
      if (range <= 0) return;
      const progress = clamp((startThreshold - rect.top) / range, 0, 1);
      const count = Math.floor(progress * TOTAL_CHARS);
      if (count > highWater) {
        highWater = count;
        setGlobalCount(count);
      }
    };

    const onScroll = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const effectiveCount = reduced ? TOTAL_CHARS : globalCount;

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
        {ITEMS.map((item, i) => (
          <div key={i}>
            <p style={qStyle}>
              <span style={prefixStyle}>Q.</span>
              <Typed text={item.q} start={item.qStart} globalCount={effectiveCount} instant={reduced} />
            </p>
            <p style={aStyle}>
              <span style={prefixStyle}>A.</span>
              <Typed text={item.a} start={item.aStart} globalCount={effectiveCount} instant={reduced} />
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

const prefixStyle: React.CSSProperties = {
  fontWeight: 700,
  marginRight: "0.45em",
  color: "var(--text-primary)",
};
