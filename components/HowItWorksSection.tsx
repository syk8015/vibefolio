"use client";

import { useRef, useEffect, useState } from "react";
import type { ReactNode } from "react";

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function PersonIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 1.4)} viewBox="0 0 24 34" fill="var(--blue)">
      <circle cx="12" cy="7" r="5.5" />
      <path d="M3 34C3 22 21 22 21 34H3Z" />
    </svg>
  );
}

function PersonRow({ count, opacity }: { count: number; opacity: number }) {
  return (
    <div style={{ opacity, transition: "opacity 0.55s ease", display: "flex", gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <PersonIcon key={i} size={34} />
      ))}
    </div>
  );
}

function TallCard({
  num, title, sub, subColor, opacity, children,
}: {
  num: string;
  title: string;
  sub: string;
  subColor: string;
  opacity: number;
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        borderRadius: 20,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        padding: "2rem 1.75rem",
        height: 420,
        opacity,
        transform: `translateY(${clamp((1 - Math.min(opacity * 2.5, 1)) * 28, 0, 28)}px)`,
        transition: "opacity 0.5s ease, transform 0.5s ease",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <span
        style={{
          fontSize: "0.7rem",
          fontWeight: 800,
          letterSpacing: "0.12em",
          color: "var(--border-bright)",
          fontFamily: "var(--font-nunito)",
        }}
      >
        {num}
      </span>
      <h3
        style={{
          fontFamily: "var(--font-nunito)",
          fontWeight: 800,
          fontSize: "1rem",
          color: "var(--text-primary)",
          margin: "0.75rem 0 0.35rem",
          lineHeight: 1.3,
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
      {children}
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

  const titleProg = clamp(progress / 0.22, 0, 1);
  const card1Prog = clamp((progress - 0.18) / 0.36, 0, 1);
  const card2Prog = clamp((progress - 0.56) / 0.22, 0, 1);
  const card3Prog = clamp((progress - 0.79) / 0.20, 0, 1);

  const row1 = clamp(card1Prog / 0.30, 0, 1);
  const row2 = clamp((card1Prog - 0.33) / 0.34, 0, 1);
  const row3 = clamp((card1Prog - 0.67) / 0.33, 0, 1);

  const titleChars = [..."How it works"];

  return (
    <div ref={wrapperRef} style={{ height: "280vh", position: "relative" }}>
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
          gap: "3rem",
        }}
      >
        {/* Title — plain large text, scroll-reveal per character */}
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

        {/* Three tall cards — 3 columns */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "1.25rem",
            width: "100%",
            maxWidth: 900,
          }}
        >
          {/* Card 1 — person pyramid */}
          <TallCard
            num="01"
            title="가입하고 사용자명 설정"
            sub="vibefolio.vercel.app/username"
            subColor="var(--blue)"
            opacity={card1Prog}
          >
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 12,
                paddingTop: "1.5rem",
                paddingBottom: 8,
              }}
            >
              <PersonRow count={1} opacity={row1} />
              <PersonRow count={2} opacity={row2} />
              <PersonRow count={3} opacity={row3} />
            </div>
          </TallCard>

          {/* Card 2 — placeholder */}
          <TallCard
            num="02"
            title="프로젝트 추가"
            sub="배포된 사이트 주소 또는 결과물 파일"
            subColor="var(--text-secondary)"
            opacity={0.1 + card2Prog * 0.9}
          />

          {/* Card 3 — placeholder */}
          <TallCard
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
