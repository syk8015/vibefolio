"use client";

import { useRef, useEffect, useState } from "react";
import { motion, useScroll, useSpring, useTransform, useMotionValue, MotionValue } from "framer-motion";

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
 *  only ever plays once. Once the card has reached full opacity, scrolling
 *  back up cannot push the progress (and thus the opacity) back down.
 *  offset ["start end", "start start"]:
 *    0    → card top touches viewport bottom
 *    0.5  → card top reaches viewport center  (← target: 85% opacity)
 *    0.85 → card top reaches 15%-from-top     (← 100% opacity)
 *    1    → card top touches viewport top
 */
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

function PersonIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 1.4)} viewBox="0 0 24 34" fill="var(--blue)">
      <circle cx="12" cy="7" r="5.5" />
      <path d="M3 34C3 22 21 22 21 34H3Z" />
    </svg>
  );
}

function PersonRow({
  count,
  progress,
  range,
}: {
  count: number;
  progress: MotionValue<number>;
  range: [number, number];
}) {
  const opacity = useTransform(progress, range, [0, 1]);
  const y = useTransform(progress, range, [8, 0]);
  return (
    <motion.div style={{ opacity, y, display: "flex", gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <PersonIcon key={i} size={22} />
      ))}
    </motion.div>
  );
}

const cardBaseStyle: React.CSSProperties = {
  borderRadius: 18,
  background: "var(--surface)",
  border: "1px solid var(--border)",
  padding: "1.5rem 2rem",
  display: "flex",
  alignItems: "center",
  gap: "1.5rem",
  minHeight: 220,
};

function HorizCard({
  num, title, sub, subColor,
}: {
  num: string;
  title: string;
  sub: string;
  subColor: string;
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

function Card1() {
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
        <PersonRow count={1} progress={progress} range={[0.5, 0.62]} />
        <PersonRow count={2} progress={progress} range={[0.56, 0.68]} />
        <PersonRow count={3} progress={progress} range={[0.62, 0.74]} />
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
      {/* Title — char-by-char left-to-right fade-in */}
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

      {/* Cards — each card independently scroll-linked */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: "2.625rem",
        width: "100%",
        maxWidth: 760,
      }}>
        <Card1 />
        <HorizCard
          num="02"
          title="프로젝트 추가"
          sub="배포된 사이트 주소 또는 결과물 파일"
          subColor="var(--text-secondary)"
        />
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
