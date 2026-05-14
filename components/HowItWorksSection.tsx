"use client";

import { useRef, useEffect, useState } from "react";

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function PersonIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 1.4)} viewBox="0 0 24 34" fill="var(--blue)">
      <circle cx="12" cy="7" r="5.5" />
      <path d="M3 34C3 22 21 22 21 34H3Z" />
    </svg>
  );
}

function PersonRow({ count, opacity }: { count: number; opacity: number }) {
  return (
    <div style={{ opacity, transition: "opacity 0.5s ease", display: "flex", gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <PersonIcon key={i} size={22} />
      ))}
    </div>
  );
}

function HorizCard({
  num, title, sub, subColor, opacity, right,
}: {
  num: string;
  title: string;
  sub: string;
  subColor: string;
  opacity: number;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        borderRadius: 18,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        padding: "1.5rem 2rem",
        display: "flex",
        alignItems: "center",
        gap: "1.5rem",
        opacity,
        transform: `translateY(${clamp((1 - Math.min(opacity * 2.5, 1)) * 20, 0, 20)}px)`,
        transition: "opacity 0.45s ease, transform 0.45s ease",
        minHeight: 220,
      }}
    >
      {/* Number */}
      <span
        style={{
          fontFamily: "var(--font-nunito)",
          fontSize: "0.7rem",
          fontWeight: 800,
          letterSpacing: "0.12em",
          color: "var(--border-bright)",
          flexShrink: 0,
          width: 24,
        }}
      >
        {num}
      </span>

      {/* Text */}
      <div style={{ flex: 1 }}>
        <h3
          style={{
            fontFamily: "var(--font-nunito)",
            fontWeight: 800,
            fontSize: "0.95rem",
            color: "var(--text-primary)",
            margin: "0 0 0.3rem",
          }}
        >
          {title}
        </h3>
        <p
          style={{
            fontFamily: "var(--font-nunito)",
            fontSize: "0.72rem",
            color: subColor,
            fontWeight: 600,
            margin: 0,
          }}
        >
          {sub}
        </p>
      </div>

      {/* Right slot (animation) */}
      {right && (
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          {right}
        </div>
      )}
    </div>
  );
}

export default function HowItWorksSection() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const update = () => {
      const el = wrapperRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const scrollable = el.offsetHeight - window.innerHeight;
      if (scrollable <= 0) return;
      setProgress(clamp(-rect.top / scrollable, 0, 1));
    };
    window.addEventListener("scroll", update, { passive: true });
    update();
    return () => window.removeEventListener("scroll", update);
  }, []);

  // Tighter phases — total 180vh (80vh of scroll)
  const titleProg = clamp(progress / 0.20, 0, 1);
  const card1Prog = clamp((progress - 0.16) / 0.30, 0, 1);
  const card2Prog = clamp((progress - 0.46) / 0.28, 0, 1);
  const card3Prog = clamp((progress - 0.72) / 0.28, 0, 1);

  const row1 = clamp(card1Prog / 0.30, 0, 1);
  const row2 = clamp((card1Prog - 0.33) / 0.34, 0, 1);
  const row3 = clamp((card1Prog - 0.67) / 0.33, 0, 1);

  const titleChars = [..."How it works"];

  return (
    <div ref={wrapperRef} style={{ height: "180vh", position: "relative" }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 2rem",
          gap: "2.5rem",
        }}
      >
        {/* Heading — scroll-reveal per character */}
        <h2
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
          {titleChars.map((ch, i, arr) => (
            <span
              key={i}
              style={{
                whiteSpace: "pre",
                color: titleProg >= i / arr.length ? "var(--text-primary)" : "transparent",
                transition: "color 0.12s ease",
              }}
            >
              {ch}
            </span>
          ))}
        </h2>

        {/* 3 rows of horizontal cards */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.875rem",
            width: "100%",
            maxWidth: 760,
          }}
        >
          {/* Card 1 */}
          <HorizCard
            num="01"
            title="가입하고 사용자명 설정"
            sub="vibefolio.vercel.app/username"
            subColor="var(--blue)"
            opacity={card1Prog}
            right={
              <>
                <PersonRow count={1} opacity={row1} />
                <PersonRow count={2} opacity={row2} />
                <PersonRow count={3} opacity={row3} />
              </>
            }
          />

          {/* Card 2 */}
          <HorizCard
            num="02"
            title="프로젝트 추가"
            sub="배포된 사이트 주소 또는 결과물 파일"
            subColor="var(--text-secondary)"
            opacity={0.1 + card2Prog * 0.9}
          />

          {/* Card 3 */}
          <HorizCard
            num="03"
            title="링크 하나로 공유"
            sub="이력서 · SNS · 채용 지원"
            subColor="var(--text-secondary)"
            opacity={0.1 + card3Prog * 0.9}
          />
        </div>
      </div>
    </div>
  );
}
