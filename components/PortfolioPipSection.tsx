"use client";

import { useRef, useEffect, useState, useCallback } from "react";

// One real card, fully interactive. The iframe loads the profile in `showcase`
// mode — every exit point (nav, footer, home links) is stripped server-side, so
// visitors can browse this person's projects but can't wander off into the app.
// Desktop renders the 1200px desktop theater scaled down; mobile loads the card
// at a touch-sized width so the mobile theater layout shows at real scale.
const DESKTOP_W = 1200;
const DESKTOP_H = 860;
const DESKTOP_MAX_SCALE = 0.62;
const MOBILE_MAX_W = 430;
const MOBILE_H = 720;

// First-visit cinematic (desktop only, once per page load): when the section
// scrolls into view the card is already zoomed into its demo stage; it plays
// ~7s, then dollies back to the full interactive card. Scrolling down collapses
// it early, mirroring the old behaviour.
const REVEAL_TRANSITION_MS = 1100; // length of the dolly-out animation
const CLOSEUP_MAX_MS = 7000;       // auto-reveal after ~7s
const CLOSEUP_FALLBACK_MS = 7000;  // close-up length when there's no readable video
const REVEAL_LEAD_S = 1.0;         // reveal this many seconds before the video ends
const CLOSEUP_TARGET_W = 900;      // preferred enlarged frame width during the close-up
const SCROLL_REVEAL_GRACE_MS = 700; // ignore the scroll that brought us into view
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

interface Profile {
  username: string;
  name: string | null;
}

interface Props {
  profiles: Profile[];
}

export default function PortfolioPipSection({ profiles }: Props) {
  // Pick one card at random, once — random in the render body would re-roll on
  // every render and is impure during hydration.
  const [profile] = useState(() => profiles[Math.floor(Math.random() * profiles.length)]);

  const [loaded, setLoaded] = useState(false);
  const [winW, setWinW] = useState(1440);
  const [winH, setWinH] = useState(900);
  const [isMobile, setIsMobile] = useState(false);
  const [phase, setPhase] = useState<"closeup" | "full">("full");
  const [stageRect, setStageRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const mockupRef = useRef<HTMLDivElement>(null);
  const isMobileRef = useRef(false);
  const loadedRef = useRef(false);
  const inViewRef = useRef(false);
  const playedRef = useRef(false);
  const revealedRef = useRef(false);
  const inViewAtRef = useRef(0);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const update = () => {
      setWinW(window.innerWidth);
      setWinH(window.innerHeight);
      const m = window.innerWidth < 768;
      isMobileRef.current = m;
      setIsMobile(m);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Keep the embedded card's theme in sync with the landing page.
  const syncTheme = useCallback((theme: string) => {
    try {
      iframeRef.current?.contentDocument?.documentElement.setAttribute("data-theme", theme);
    } catch {
      /* cross-origin guard */
    }
  }, []);

  useEffect(() => {
    const onChange = (e: Event) =>
      syncTheme((e as CustomEvent<{ theme: string }>).detail.theme);
    document.addEventListener("vf-theme-change", onChange);
    return () => document.removeEventListener("vf-theme-change", onChange);
  }, [syncTheme]);

  const clearCinematicTimers = useCallback(() => {
    if (revealTimerRef.current) { clearTimeout(revealTimerRef.current); revealTimerRef.current = null; }
    if (videoCleanupRef.current) { videoCleanupRef.current(); videoCleanupRef.current = null; }
  }, []);

  // Dolly back to the full card. Idempotent — the video, the safety timer, and a
  // deliberate scroll can all race to call it.
  const triggerReveal = useCallback(() => {
    if (revealedRef.current) return;
    revealedRef.current = true;
    clearCinematicTimers();
    setPhase("full");
  }, [clearCinematicTimers]);

  // Pre-zoom the card onto its demo stage the moment the iframe is ready, so it
  // already reads as a close-up by the time the viewer scrolls down to it.
  // Same-origin iframe, so we can read the stage rect directly. Returns whether
  // a measurable stage was found.
  const setupCloseup = useCallback((): boolean => {
    const doc = iframeRef.current?.contentDocument;
    const stageEl = doc?.querySelector("[data-theater-stage]") as HTMLElement | null;
    const rect = stageEl?.getBoundingClientRect();
    if (!stageEl || !rect || rect.width < 1 || rect.height < 1) return false;
    setStageRect({ x: rect.left, y: rect.top, w: rect.width, h: rect.height });
    setPhase("closeup");
    return true;
  }, []);

  // Start the dolly-out clock once the section is actually on screen. Drive it
  // off the demo <video> when readable, falling back to a fixed duration.
  const armReveal = useCallback(() => {
    if (revealedRef.current) return;
    const stageEl = iframeRef.current?.contentDocument?.querySelector("[data-theater-stage]") as HTMLElement | null;
    const video = stageEl?.querySelector("video") as HTMLVideoElement | null;
    if (video) {
      const onTime = () => {
        const dur = video.duration;
        const target = Number.isFinite(dur) && dur > 0
          ? Math.min(dur - REVEAL_LEAD_S, CLOSEUP_MAX_MS / 1000)
          : CLOSEUP_MAX_MS / 1000;
        if (video.currentTime >= target) triggerReveal();
      };
      video.addEventListener("timeupdate", onTime);
      videoCleanupRef.current = () => video.removeEventListener("timeupdate", onTime);
      // Safety net: loop videos never fire "ended", and a stalled clip might
      // never cross the threshold.
      revealTimerRef.current = setTimeout(triggerReveal, CLOSEUP_MAX_MS);
    } else {
      revealTimerRef.current = setTimeout(triggerReveal, CLOSEUP_FALLBACK_MS);
    }
  }, [triggerReveal]);

  // Fire the cinematic only when the iframe is ready AND the section is visible.
  // Desktop only, once per page load.
  const maybeStart = useCallback(() => {
    if (isMobileRef.current || playedRef.current) return;
    if (!loadedRef.current || !inViewRef.current) return;
    playedRef.current = true;
    if (!setupCloseup()) return; // no measurable stage — stay interactive
    inViewAtRef.current = Date.now();
    armReveal();
  }, [setupCloseup, armReveal]);

  const handleLoad = () => {
    setLoaded(true);
    loadedRef.current = true;
    syncTheme(document.documentElement.getAttribute("data-theme") || "dark");
    maybeStart();
  };

  // Observe the mockup; the first time it's meaningfully in view, kick off the
  // cinematic (or arm it to start as soon as the iframe finishes loading).
  useEffect(() => {
    const el = mockupRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.55) {
            inViewRef.current = true;
            maybeStart();
            io.disconnect();
            break;
          }
        }
      },
      { threshold: [0, 0.55, 1] }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [maybeStart]);

  // While zoomed in, a deliberate downward scroll collapses back to the full
  // card — but only after a short grace, so the scroll that brought the section
  // into view doesn't instantly dismiss the cinematic.
  useEffect(() => {
    if (phase !== "closeup") return;
    const onWheel = (e: WheelEvent) => {
      if (revealedRef.current || e.deltaY <= 0) return;
      if (Date.now() - inViewAtRef.current < SCROLL_REVEAL_GRACE_MS) return;
      triggerReveal();
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => window.removeEventListener("wheel", onWheel);
  }, [phase, triggerReveal]);

  // Tear down any pending cinematic timers when the section unmounts.
  useEffect(() => clearCinematicTimers, [clearCinematicTimers]);

  if (!profile) return null;

  const baseIframeW = isMobile ? Math.min(winW - 24, MOBILE_MAX_W) : DESKTOP_W;
  const baseIframeH = isMobile ? MOBILE_H : DESKTOP_H;
  const baseScale = isMobile ? 1 : Math.min(DESKTOP_MAX_SCALE, (winW - 48) / DESKTOP_W);
  const displayW = Math.round(baseIframeW * baseScale);
  const displayH = Math.round(baseIframeH * baseScale);

  // Close-up grows the whole mockup to the stage's own aspect ratio so the demo
  // fills the frame with no side-cropping; the reveal animates frame + zoom back
  // to the normal full-card view.
  const inCloseup = !isMobile && phase === "closeup" && !!stageRect;
  const stageAspect = stageRect ? stageRect.w / stageRect.h : displayW / displayH;

  let frameW = displayW;
  let frameH = displayH;
  let scl = baseScale;
  let tx = 0;
  let ty = 0;
  if (inCloseup && stageRect) {
    frameW = Math.max(displayW, Math.min(CLOSEUP_TARGET_W, winW - 48, (winH - 220) * stageAspect));
    frameH = frameW / stageAspect;
    scl = frameW / stageRect.w; // contain: stage maps exactly onto frameW × frameH
    tx = -scl * stageRect.x;
    ty = -scl * stageRect.y;
  }
  const scalerTransform = `translate(${tx}px, ${ty}px) scale(${scl})`;
  const cineTransition = isMobile ? "none" : `${REVEAL_TRANSITION_MS}ms ${EASE}`;
  const interactive = !inCloseup;

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
      <h2
        style={{
          fontFamily: "var(--font-nunito)",
          fontWeight: 800,
          fontSize: "clamp(1.8rem, 3.5vw, 3rem)",
          letterSpacing: "-0.02em",
          lineHeight: 1,
          margin: 0,
          color: "var(--text-primary)",
          textAlign: "center",
        }}
      >
        실제 바이브코더 명함
      </h2>

      {/* Browser mockup — cinematic on arrival, interactive after the reveal */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            position: "absolute",
            width: 700,
            height: 400,
            background: "radial-gradient(ellipse at center, rgba(0,0,0,0.08) 0%, transparent 70%)",
            filter: "blur(40px)",
            pointerEvents: "none",
          }}
        />

        <div
          ref={mockupRef}
          style={{
            position: "relative",
            width: frameW,
            borderRadius: 12,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 40px 100px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)",
            transition: isMobile ? undefined : `width ${cineTransition}`,
            willChange: "width",
          }}
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
              nookframe.com/<span style={{ color: "#e8c977" }}>{profile.username}</span>
            </div>
          </div>

          {/* Iframe viewport */}
          <div style={{ width: frameW, height: frameH, overflow: "hidden", position: "relative", background: "#0a0a0f", transition: isMobile ? undefined : `width ${cineTransition}, height ${cineTransition}` }}>
            {!loaded && (
              <div style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0f" }}>
                <div
                  className="animate-spin"
                  style={{ width: 24, height: 24, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.15)", borderTopColor: "rgba(255,255,255,0.7)" }}
                />
              </div>
            )}
            <div
              style={{
                width: baseIframeW,
                height: baseIframeH,
                transform: scalerTransform,
                transformOrigin: "top left",
                transition: isMobile ? "none" : `transform ${cineTransition}`,
                pointerEvents: interactive ? "auto" : "none",
                willChange: "transform",
              }}
            >
              <iframe
                key={profile.username}
                ref={iframeRef}
                src={`/${profile.username}?showcase=1`}
                width={baseIframeW}
                height={baseIframeH}
                style={{ border: "none", display: "block", opacity: loaded ? 1 : 0, transition: "opacity 0.4s ease" }}
                onLoad={handleLoad}
                sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
                title={`${profile.name || profile.username}의 명함`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Attribution + state-aware hint */}
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        {inCloseup ? (
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", margin: 0 }}>
            ▶ 자동 시연 재생 중 · 스크롤하면 전체 명함으로
          </p>
        ) : (
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", margin: 0 }}>
            👆 직접 작품을 눌러 둘러보세요
          </p>
        )}
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "var(--font-nunito)", margin: 0 }}>
          <a
            href={`/${profile.username}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 600 }}
          >
            @{profile.username}
          </a>
          &nbsp;의 바이브포트폴리오 · 새 탭에서 전체 보기 →
        </p>
      </div>
    </div>
  );
}
