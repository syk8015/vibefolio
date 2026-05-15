"use client";

import { useRef, useEffect, useState } from "react";

function useInView(threshold = 0.15): [React.RefObject<HTMLDivElement>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView];
}

function PersonIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 1.4)} viewBox="0 0 24 34" fill="var(--blue)">
      <circle cx="12" cy="7" r="5.5" />
      <path d="M3 34C3 22 21 22 21 34H3Z" />
    </svg>
  );
}

function PersonRow({ count, show, delay }: { count: number; show: boolean; delay: number }) {
  return (
    <div style={{
      opacity: show ? 1 : 0,
      transform: show ? "translateY(0)" : "translateY(8px)",
      transition: `opacity 0.4s ease ${delay}s, transform 0.4s ease ${delay}s`,
      display: "flex",
      gap: 8,
    }}>
      {Array.from({ length: count }).map((_, i) => (
        <PersonIcon key={i} size={22} />
      ))}
    </div>
  );
}

function HorizCard({
  num, title, sub, subColor, right,
}: {
  num: string;
  title: string;
  sub: string;
  subColor: string;
  right?: React.ReactNode;
}) {
  const [cardRef, inView] = useInView(0.15);
  return (
    <div
      ref={cardRef}
      style={{
        borderRadius: 18,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        padding: "1.5rem 2rem",
        display: "flex",
        alignItems: "center",
        gap: "1.5rem",
        minHeight: 220,
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(32px)",
        transition: "opacity 0.65s cubic-bezier(0.22,1,0.36,1), transform 0.65s cubic-bezier(0.22,1,0.36,1)",
      }}
    >
      <span style={{
        fontFamily: "var(--font-nunito)",
        fontSize: "0.7rem",
        fontWeight: 800,
        letterSpacing: "0.12em",
        color: "var(--border-bright)",
        flexShrink: 0,
        width: 24,
      }}>
        {num}
      </span>
      <div style={{ flex: 1 }}>
        <h3 style={{
          fontFamily: "var(--font-nunito)",
          fontWeight: 800,
          fontSize: "0.95rem",
          color: "var(--text-primary)",
          margin: "0 0 0.3rem",
        }}>
          {title}
        </h3>
        <p style={{
          fontFamily: "var(--font-nunito)",
          fontSize: "0.72rem",
          color: subColor,
          fontWeight: 600,
          margin: 0,
        }}>
          {sub}
        </p>
      </div>
      {right && (
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          {right}
        </div>
      )}
    </div>
  );
}

export default function HowItWorksSection() {
  const [titleRef, titleInView] = useInView(0.5);
  const [card1Ref, card1InView] = useInView(0.15);

  const titleChars = [..."How it works"];

  return (
    <div style={{
      padding: "6rem 2rem 5rem",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "2.5rem",
    }}>
      {/* Title — each char fades in left-to-right on section enter */}
      <h2
        ref={titleRef}
        style={{
          fontFamily: "var(--font-nunito)",
          fontWeight: 800,
          fontSize: "clamp(1.8rem, 3.5vw, 3rem)",
          letterSpacing: "-0.02em",
          lineHeight: 1,
          margin: 0,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {titleChars.map((ch, i) => (
          <span
            key={i}
            style={{
              whiteSpace: "pre",
              color: "var(--text-primary)",
              opacity: titleInView ? 1 : 0,
              transition: `opacity 0.18s ease ${i * 0.048}s`,
            }}
          >
            {ch}
          </span>
        ))}
      </h2>

      {/* Cards */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.875rem",
        width: "100%",
        maxWidth: 760,
      }}>
        {/* Card 1 — inline for person pyramid */}
        <div
          ref={card1Ref}
          style={{
            borderRadius: 18,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            padding: "1.5rem 2rem",
            display: "flex",
            alignItems: "center",
            gap: "1.5rem",
            minHeight: 220,
            opacity: card1InView ? 1 : 0,
            transform: card1InView ? "translateY(0)" : "translateY(32px)",
            transition: "opacity 0.65s cubic-bezier(0.22,1,0.36,1), transform 0.65s cubic-bezier(0.22,1,0.36,1)",
          }}
        >
          <span style={{
            fontFamily: "var(--font-nunito)",
            fontSize: "0.7rem",
            fontWeight: 800,
            letterSpacing: "0.12em",
            color: "var(--border-bright)",
            flexShrink: 0,
            width: 24,
          }}>
            01
          </span>
          <div style={{ flex: 1 }}>
            <h3 style={{
              fontFamily: "var(--font-nunito)",
              fontWeight: 800,
              fontSize: "0.95rem",
              color: "var(--text-primary)",
              margin: "0 0 0.3rem",
            }}>
              가입하고 사용자명 설정
            </h3>
            <p style={{
              fontFamily: "var(--font-nunito)",
              fontSize: "0.72rem",
              color: "var(--blue)",
              fontWeight: 600,
              margin: 0,
            }}>
              vibefolio.vercel.app/username
            </p>
          </div>
          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <PersonRow count={1} show={card1InView} delay={0.4} />
            <PersonRow count={2} show={card1InView} delay={0.65} />
            <PersonRow count={3} show={card1InView} delay={0.9} />
          </div>
        </div>

        {/* Card 2 */}
        <HorizCard
          num="02"
          title="프로젝트 추가"
          sub="배포된 사이트 주소 또는 결과물 파일"
          subColor="var(--text-secondary)"
        />

        {/* Card 3 */}
        <HorizCard
          num="03"
          title="링크 하나로 공유"
          sub="이력서 · SNS · 채용 지원"
          subColor="var(--text-secondary)"
        />
      </div>
    </div>
  );
}
