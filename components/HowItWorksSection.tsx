"use client";

import { useRef, useEffect, useState, ReactNode } from "react";
import { motion, useScroll, useSpring, useTransform, useMotionValue } from "framer-motion";

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

/** Scroll progress relative to a card, latched at its maximum so the fade-in
 *  only ever plays once. */
function useCardProgress(ref: React.RefObject<HTMLDivElement | null>) {
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "start start"],
  });
  const smooth = useSpring(scrollYProgress, { stiffness: 120, damping: 28, mass: 0.4 });
  const maxProgress = useMotionValue(0);
  useEffect(() => {
    if (smooth.get() > maxProgress.get()) maxProgress.set(smooth.get());
    return smooth.on("change", (v) => {
      if (v > maxProgress.get()) maxProgress.set(v);
    });
  }, [smooth, maxProgress]);
  return maxProgress;
}

function PersonAtIcon({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 1.4)} viewBox="0 0 24 34" fill="var(--blue)" aria-hidden>
      <text
        x="12"
        y="7"
        fontSize="13"
        fontWeight="900"
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--blue)"
        fontFamily="var(--font-nunito), sans-serif"
      >
        @
      </text>
      <path d="M3 34C3 22 21 22 21 34H3Z" />
    </svg>
  );
}

function FolderIcon({ size = 100 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 0.72)} viewBox="0 0 100 72" fill="var(--blue)" aria-hidden>
      <path d="M8 20 L8 56 Q8 60 12 60 L88 60 Q92 60 92 56 L92 24 Q92 20 88 20 L44 20 L36 12 L12 12 Q8 12 8 16 Z" />
    </svg>
  );
}

function ShareDomainIcon({ size = 130 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 0.5)} viewBox="0 0 120 60" fill="none" aria-hidden>
      <rect x="4" y="18" width="60" height="24" rx="6" stroke="var(--blue)" strokeWidth="2.5" fill="none" />
      <text
        x="34"
        y="30"
        fontSize="13"
        fontWeight="900"
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--blue)"
        fontFamily="var(--font-nunito), sans-serif"
      >
        .com
      </text>
      <path
        d="M72 30 L112 30 M104 22 L112 30 L104 38"
        stroke="var(--blue)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const cardBaseStyle: React.CSSProperties = {
  borderRadius: 18,
  background: "var(--surface)",
  border: "1px solid var(--border)",
  padding: "clamp(1.25rem, 2.5vw, 1.75rem) clamp(1.25rem, 3vw, 2rem)",
  display: "flex",
  alignItems: "center",
  gap: "clamp(1rem, 2.5vw, 1.75rem)",
  minHeight: 240,
};

function HorizCard({
  num, title, sub, subColor, icon,
}: {
  num: string;
  title: string;
  sub: string;
  subColor: string;
  icon?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const progress = useCardProgress(ref);
  const opacity = useTransform(progress, [0, 0.5, 0.85], [0, 0.85, 1]);
  const y = useTransform(progress, [0, 0.5, 0.85], [60, 9, 0]);

  return (
    <motion.div ref={ref} style={{ ...cardBaseStyle, opacity, y }}>
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
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{
          fontFamily: "var(--font-nunito)",
          fontWeight: 800,
          fontSize: "clamp(1.2rem, 3.2vw, 1.9rem)",
          color: "var(--text-primary)",
          margin: "0 0 0.5rem",
          lineHeight: 1.15,
          letterSpacing: "-0.01em",
        }}>
          {title}
        </h3>
        <p style={{
          fontFamily: "var(--font-nunito)",
          fontSize: "clamp(0.9rem, 2.5vw, 1.44rem)",
          color: subColor,
          fontWeight: 600,
          margin: 0,
          lineHeight: 1.25,
          wordBreak: "break-word",
        }}>
          {sub}
        </p>
      </div>
      {icon && (
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {icon}
        </div>
      )}
    </motion.div>
  );
}

export default function HowItWorksSection() {
  const [titleRef, titleInView] = useInView(0.5);

  const titleChars = [..."How it works"];

  return (
    <div style={{
      padding: "6rem clamp(1rem, 3vw, 2rem) 10rem",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "2.5rem",
    }}>
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

      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: "2.625rem",
        width: "100%",
        maxWidth: 760,
      }}>
        <HorizCard
          num="01"
          title="가입하고 사용자명 설정"
          sub="vibefolio.vercel.app/username"
          subColor="var(--blue)"
          icon={<PersonAtIcon />}
        />
        <HorizCard
          num="02"
          title="프로젝트 추가"
          sub="배포된 사이트 주소 또는 결과물 파일"
          subColor="var(--text-secondary)"
          icon={<FolderIcon />}
        />
        <HorizCard
          num="03"
          title="링크 하나로 공유"
          sub="이력서 · SNS · 채용 지원"
          subColor="var(--text-secondary)"
          icon={<ShareDomainIcon />}
        />
      </div>
    </div>
  );
}
