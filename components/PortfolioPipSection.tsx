"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const IFRAME_W = 1200;
const IFRAME_H = 860;
const DEFAULT_SCALE = 0.52;
const NEXT_THRESHOLD = 600; // accumulated wheel delta to trigger next profile
const MAX_HISTORY = 10;
const POP_VIEWPORT_RATIO = 0.75;

interface Profile {
  username: string;
  name: string | null;
}

interface Props {
  profiles: Profile[];
}

export default function PortfolioPipSection({ profiles }: Props) {
  const initial = profiles[Math.floor(Math.random() * profiles.length)]?.username ?? "";

  const [currentUsername, setCurrentUsername] = useState(initial);
  const [loaded, setLoaded] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [maxScroll, setMaxScroll] = useState(0);
  const [overscroll, setOverscroll] = useState(0);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [, setSwitchCount] = useState(0);
  const [isPopped, setIsPopped] = useState(false);
  const [popTransform, setPopTransform] = useState({ x: 0, y: 0, scale: 1 });

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const mockupRef = useRef<HTMLDivElement>(null);
  const scrollYRef = useRef(0);
  const maxScrollRef = useRef(0);
  const overscrollRef = useRef(0);
  const transitioningRef = useRef(false);
  const currentUsernameRef = useRef(initial);
  const historyRef = useRef<string[]>([initial]);
  const isPoppedRef = useRef(false);

  useEffect(() => { currentUsernameRef.current = currentUsername; }, [currentUsername]);
  useEffect(() => { isPoppedRef.current = isPopped; }, [isPopped]);

  useEffect(() => {
    const update = () => {
      const maxW = window.innerWidth - 32;
      setScale(Math.min(DEFAULT_SCALE, maxW / IFRAME_W));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const displayW = Math.round(IFRAME_W * scale);
  const displayH = Math.round(IFRAME_H * scale);

  const pickNext = useCallback((): string | null => {
    const history = historyRef.current;
    const cur = currentUsernameRef.current;
    const available = profiles.filter(p => !history.includes(p.username));
    const pool = available.length > 0
      ? available
      : profiles.filter(p => p.username !== cur);
    if (pool.length === 0) return profiles[0]?.username ?? null;
    return pool[Math.floor(Math.random() * pool.length)].username;
  }, [profiles]);

  const enterPop = useCallback(() => {
    if (isPoppedRef.current) return;
    const el = mockupRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const currentW = rect.width;
    const currentH = rect.height;
    if (currentW === 0 || currentH === 0) return;
    const targetW = window.innerWidth * POP_VIEWPORT_RATIO;
    const targetH = window.innerHeight * POP_VIEWPORT_RATIO;
    const popScale = Math.min(targetW / currentW, targetH / currentH);
    const currentCx = rect.left + currentW / 2;
    const currentCy = rect.top + currentH / 2;
    const dx = window.innerWidth / 2 - currentCx;
    const dy = window.innerHeight / 2 - currentCy;
    setPopTransform({ x: dx, y: dy, scale: popScale });
    setIsPopped(true);
  }, []);

  const exitPop = useCallback(() => {
    setIsPopped(false);
    setPopTransform({ x: 0, y: 0, scale: 1 });
  }, []);

  const switchToNext = useCallback(() => {
    if (transitioningRef.current) return;
    const next = pickNext();
    if (!next) return;

    transitioningRef.current = true;
    historyRef.current = [...historyRef.current, next].slice(-MAX_HISTORY);

    enterPop();
    setCurrentUsername(next);
    setSwitchCount((c) => c + 1);
    setLoaded(false);
    scrollYRef.current = 0;
    maxScrollRef.current = 0;
    overscrollRef.current = 0;
    setScrollY(0);
    setMaxScroll(0);
    setOverscroll(0);
  }, [pickNext, enterPop]);

  // Lock page scroll while popped, and reserve the scrollbar gutter so the
  // page width doesn't shift when overflow toggles.
  useEffect(() => {
    if (!isPopped) return;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [isPopped]);

  const handleLoad = () => {
    setLoaded(true);
    transitioningRef.current = false;
    try {
      const doc = iframeRef.current?.contentDocument?.documentElement;
      if (doc) {
        const theme = document.documentElement.getAttribute("data-theme") || "dark";
        doc.setAttribute("data-theme", theme);
        const scrollable = doc.scrollHeight - doc.clientHeight;
        if (scrollable > 0) {
          maxScrollRef.current = scrollable;
          setMaxScroll(scrollable);
        }
      }
    } catch { /* cross-origin guard */ }
  };

  useEffect(() => {
    const onChange = (e: Event) => {
      const theme = (e as CustomEvent<{ theme: string }>).detail.theme;
      try { iframeRef.current?.contentDocument?.documentElement.setAttribute("data-theme", theme); }
      catch { /* ignore */ }
    };
    document.addEventListener("vf-theme-change", onChange);
    return () => document.removeEventListener("vf-theme-change", onChange);
  }, []);

  useEffect(() => {
    const atPageBottom = () =>
      window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 10;

    const onWheel = (e: WheelEvent) => {
      if (!atPageBottom()) return;
      if (transitioningRef.current) { e.preventDefault(); return; }

      const iframe = iframeRef.current;
      if (!iframe) return;

      let currentY = scrollYRef.current;
      try { currentY = iframe.contentWindow?.scrollY ?? currentY; } catch { return; }

      let delta = e.deltaY;
      if (e.deltaMode === 1) delta *= 20;
      if (e.deltaMode === 2) delta *= 300;

      if (delta < 0) {
        // Scrolling up: drain overscroll gauge first, then scroll iframe
        if (overscrollRef.current > 0) {
          e.preventDefault();
          overscrollRef.current = 0;
          setOverscroll(0);
          return;
        }
        if (currentY > 0) {
          e.preventDefault();
          const newY = Math.max(currentY + delta, 0);
          try { iframe.contentWindow?.scrollTo({ top: newY, behavior: "instant" }); } catch {}
          scrollYRef.current = newY;
          setScrollY(newY);
        }
        return;
      }

      // Scrolling down: scroll iframe if not at bottom
      if (currentY < maxScrollRef.current) {
        e.preventDefault();
        const newY = Math.min(currentY + delta, maxScrollRef.current);
        try { iframe.contentWindow?.scrollTo({ top: newY, behavior: "instant" }); } catch {}
        scrollYRef.current = newY;
        setScrollY(newY);
        return;
      }

      // Iframe at bottom: accumulate gauge
      e.preventDefault();
      const newOver = Math.min(overscrollRef.current + delta, NEXT_THRESHOLD);
      overscrollRef.current = newOver;
      setOverscroll(newOver);
      if (newOver >= NEXT_THRESHOLD) switchToNext();
    };

    document.addEventListener("wheel", onWheel, { passive: false });
    return () => document.removeEventListener("wheel", onWheel);
  }, [switchToNext]);

  const iframeProgress = maxScroll > 0 ? Math.min(100, Math.round((scrollY / maxScroll) * 100)) : 0;
  const atBottom = loaded && (maxScroll === 0 || iframeProgress >= 100);
  const gaugeProgress = Math.round((overscroll / NEXT_THRESHOLD) * 100);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "2.5rem",
        padding: "8rem 1.5rem 5rem",
      }}
    >
      {/* Section title — matches How it works typography */}
      <h2 style={{
        fontFamily: "var(--font-nunito)",
        fontWeight: 800,
        fontSize: "clamp(1.8rem, 3.5vw, 3rem)",
        letterSpacing: "-0.02em",
        lineHeight: 1,
        margin: 0,
        color: "var(--text-primary)",
        textAlign: "center",
      }}>
        실제 바이브코더 명함
      </h2>

      {/* Browser mockup */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", width: 700, height: 400, background: "radial-gradient(ellipse at center, rgba(77,158,255,0.12) 0%, transparent 70%)", filter: "blur(40px)", pointerEvents: "none" }} />

        <AnimatePresence>
          {isPopped && (
            <motion.div
              key="pip-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              onClick={exitPop}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.55)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                zIndex: 90,
                cursor: "zoom-out",
                willChange: "opacity",
              }}
            />
          )}
        </AnimatePresence>

        <motion.div
          ref={mockupRef}
          onClick={enterPop}
          animate={{ scale: popTransform.scale, x: popTransform.x, y: popTransform.y }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          style={{ position: "relative", width: displayW, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 40px 100px rgba(0,0,0,0.65), 0 0 0 1px rgba(77,158,255,0.15)", transformOrigin: "center center", zIndex: 100, cursor: isPopped ? "default" : "zoom-in", willChange: "transform" }}
        >
          {/* Chrome bar */}
          <div style={{ height: 40, background: "#1a1a24", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", gap: 12, padding: "0 16px" }}>
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#febc2e" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#28c840" }} />
            </div>
            <div style={{ flex: 1, height: 26, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, display: "flex", alignItems: "center", padding: "0 10px", fontSize: "0.7rem", fontFamily: "monospace", color: "rgba(255,255,255,0.45)" }}>
              <span style={{ color: "rgba(255,255,255,0.25)", marginRight: 4 }}>🔒</span>
              vibefolio.vercel.app/<span style={{ color: "#4d9eff" }}>{currentUsername}</span>
            </div>
          </div>

          {/* Iframe viewport */}
          <div style={{ width: displayW, height: displayH, overflow: "hidden", position: "relative", background: "#0a0a0f" }}>
            {!loaded && (
              <div style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0f" }}>
                <div
                  className="animate-spin"
                  style={{ width: 24, height: 24, borderRadius: "50%", border: "2px solid rgba(77,158,255,0.3)", borderTopColor: "#4d9eff" }}
                />
              </div>
            )}
            <div style={{ width: IFRAME_W, height: IFRAME_H, transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none" }}>
              <iframe
                key={currentUsername}
                ref={iframeRef}
                src={`/${currentUsername}`}
                width={IFRAME_W}
                height={IFRAME_H}
                style={{ border: "none", opacity: loaded ? 1 : 0, transition: "opacity 0.4s ease" }}
                onLoad={handleLoad}
                sandbox="allow-scripts allow-same-origin"
                title="포트폴리오 미리보기"
              />
            </div>
          </div>

          {/* Iframe scroll progress bar */}
          <div style={{ height: 2, background: "rgba(255,255,255,0.04)" }}>
            <div style={{ height: "100%", width: `${iframeProgress}%`, background: "linear-gradient(90deg, var(--blue), var(--blue-bright))", transition: "width 0.1s linear" }} />
          </div>
        </motion.div>
      </div>

      {/* Attribution + hint / gauge */}
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "var(--font-nunito)", marginBottom: 8 }}>
          <a href={`/${currentUsername}`} target="_blank" style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 600 }}>
            @{currentUsername}
          </a>
          &nbsp;의 바이브포트폴리오
        </p>

        {atBottom ? (
          <p style={{ fontSize: "0.85rem", fontFamily: "var(--font-nunito)", letterSpacing: "0.01em" }}>
            {[..."↓ 계속 스크롤하여 다음 명함으로"].map((char, i, arr) => {
              const threshold = (i / arr.length) * 100;
              const isLit = gaugeProgress >= threshold;
              return (
                <span
                  key={i}
                  style={{
                    color: isLit ? "#38bdf8" : "var(--text-secondary)",
                    transition: "color 0.12s ease",
                  }}
                >
                  {char}
                </span>
              );
            })}
          </p>
        ) : (
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
            ↕ 스크롤하면 프로젝트가 보여요
          </p>
        )}
      </div>
    </div>
  );
}
