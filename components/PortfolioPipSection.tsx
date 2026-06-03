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
// ~7s, then dollies back to the full interactive card. The close-up runs to
// completion — no scroll-to-skip, so a tiny scroll can't cut it short.
const REVEAL_TRANSITION_MS = 1100; // length of the dolly-out animation
const CLOSEUP_MS = 7000;            // play the close-up this long once fully on screen
const CLOSEUP_TARGET_W = 900;      // preferred enlarged frame width during the close-up
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

// Section title rotates on every page load — a wry portrait of the kind of
// person whose card this is, instead of the flat "vibe coder" label.
const TITLE_VARIANTS = [
  "차 트렁크에 노트북 묶은 사람의 명함",
  "컨티뉴만 누르는 사람의 명함",
  "뭐든지 토큰으로 보이는 사람의 명함",
  "회사에서 몰래 작업하는 사람의 명함",
  "노트북 화면 못 닫는 사람의 명함",
];

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
  // Pick a title once per page load (lazy so it doesn't re-roll each render).
  const [title] = useState(() => TITLE_VARIANTS[Math.floor(Math.random() * TITLE_VARIANTS.length)]);

  const [loaded, setLoaded] = useState(false);
  const [shouldLoadIframe, setShouldLoadIframe] = useState(false);
  const [winW, setWinW] = useState(1440);
  const [winH, setWinH] = useState(900);
  const [isMobile, setIsMobile] = useState(false);
  const [phase, setPhase] = useState<"closeup" | "full">("full");
  const [stageRect, setStageRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const mockupRef = useRef<HTMLDivElement>(null);
  const isMobileRef = useRef(false);
  const inViewRef = useRef(false);
  const closeupReadyRef = useRef(false);
  const playedRef = useRef(false);
  const revealedRef = useRef(false);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    closeupReadyRef.current = true;
    return true;
  }, []);

  // Arm the dolly-out clock — a flat 7s from the moment it's armed. We can't key
  // off the demo <video>'s currentTime: it loops from page load, so by the time
  // the section is fully on screen the clip is at an arbitrary point and would
  // reveal early.
  const armReveal = useCallback(() => {
    if (revealedRef.current) return;
    revealTimerRef.current = setTimeout(triggerReveal, CLOSEUP_MS);
  }, [triggerReveal]);

  // Start the ~7s reveal countdown — once the card is zoomed and the section is
  // on screen. Desktop only, once per page load.
  const startReveal = useCallback(() => {
    if (playedRef.current || !closeupReadyRef.current) return;
    playedRef.current = true;
    armReveal();
  }, [armReveal]);

  const handleLoad = () => {
    setLoaded(true);
    syncTheme(document.documentElement.getAttribute("data-theme") || "dark");
    // Zoom into the demo stage immediately, while the section is still below the
    // fold, so it's already a close-up when the viewer scrolls down to it — no
    // visible zoom-in. The reveal clock waits until the section is on screen.
    if (!isMobileRef.current && setupCloseup() && inViewRef.current) startReveal();
  };

  // Defer loading the embedded profile (a full page plus its demo video) until
  // the section is within ~1.5 screens of the viewport. The card sits far below
  // the fold, so loading it at mount would compete with the landing hero's first
  // paint for no benefit. The generous rootMargin preserves the cinematic — the
  // iframe still loads, and the close-up is set up, before the viewer reaches it
  // on a normal scroll, so there's no visible zoom-in. If the section is already
  // near the viewport at mount the observer fires immediately (no regression).
  useEffect(() => {
    if (shouldLoadIframe) return;
    const el = mockupRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShouldLoadIframe(true);
          io.disconnect();
        }
      },
      { rootMargin: "1500px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shouldLoadIframe]);

  // Observe the mockup; the reveal clock starts only once the whole close-up
  // window is on screen. If the viewer leaves the section half-scrolled it stays
  // zoomed indefinitely. The close-up itself is already applied at load, so this
  // never causes a visible zoom — it only decides when to dolly back out.
  useEffect(() => {
    const el = mockupRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.99) {
            inViewRef.current = true;
            startReveal();
            io.disconnect();
            break;
          }
        }
      },
      { threshold: [0, 0.25, 0.5, 0.75, 0.9, 0.99, 1] }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [startReveal]);

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
        {title}
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
              {shouldLoadIframe && (
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
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Attribution + state-aware hint */}
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        {inCloseup ? (
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", margin: 0 }}>
            ▶ 자동 시연 재생 중…
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
