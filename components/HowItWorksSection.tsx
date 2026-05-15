"use client";

import { useRef, useEffect, useState } from "react";
import { motion, Variants } from "framer-motion";

function useInView(threshold = 0.5): [React.RefObject<HTMLDivElement | null>, boolean] {
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

const EASE = [0.22, 1, 0.36, 1] as const;

const containerVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.18, delayChildren: 0.05 },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 50 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: EASE },
  },
};

const card1Variants: Variants = {
  hidden: { opacity: 0, y: 50 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.65,
      ease: EASE,
      delayChildren: 0.35,
      staggerChildren: 0.22,
    },
  },
};

const personRowVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
};

function PersonIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 1.4)} viewBox="0 0 24 34" fill="var(--blue)">
      <circle cx="12" cy="7" r="5.5" />
      <path d="M3 34C3 22 21 22 21 34H3Z" />
    </svg>
  );
}

function PersonRow({ count }: { count: number }) {
  return (
    <motion.div
      variants={personRowVariants}
      style={{ display: "flex", gap: 8 }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <PersonIcon key={i} size={22} />
      ))}
    </motion.div>
  );
}

function HorizCard({
  num, title, sub, subColor,
}: {
  num: string;
  title: string;
  sub: string;
  subColor: string;
}) {
  return (
    <motion.div
      variants={cardVariants}
      style={{
        borderRadius: 18,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        padding: "1.5rem 2rem",
        display: "flex",
        alignItems: "center",
        gap: "1.5rem",
        minHeight: 220,
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
    </motion.div>
  );
}

export default function HowItWorksSection() {
  const [titleRef, titleInView] = useInView(0.5);

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

      {/* Cards — Framer Motion stagger with whileInView */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.3 }}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "2.625rem",
          width: "100%",
          maxWidth: 760,
        }}
      >
        {/* Card 1 — inline for person pyramid */}
        <motion.div
          variants={card1Variants}
          style={{
            borderRadius: 18,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            padding: "1.5rem 2rem",
            display: "flex",
            alignItems: "center",
            gap: "1.5rem",
            minHeight: 220,
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
            <PersonRow count={1} />
            <PersonRow count={2} />
            <PersonRow count={3} />
          </div>
        </motion.div>

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
      </motion.div>
    </div>
  );
}
