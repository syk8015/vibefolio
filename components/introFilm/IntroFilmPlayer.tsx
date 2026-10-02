"use client";

// 소개 영상 재생기 — 장면 대본을 이 자리에서 그린다(영상 파일 없이). 명함 무대·작품 페이지·검토 창이 같이 쓴다.
// 시간은 여기서만 흐른다: 엔진(lib/introFilm/render.ts)은 render(t)만 알고, 시계는 이 컴포넌트가 돌린다.
// 화면 밖이거나 탭이 숨으면 멈추고, 줄임 모드(움직임 줄이기)면 대표 장면 한 장만 보여준다.
import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from "react";
import { introFilmIssue, type IntroFilm } from "@/lib/introFilm/schema";
import { resolveStyle } from "@/lib/introFilm/styles";
import { createFilm, type Film } from "@/lib/introFilm/render";
import type { IntroSurface } from "@/lib/introFilm/safeZones";
import { INTRO_FONT_MAP, loadIntroFonts } from "./fonts";

export type IntroFilmHandle = { seek: (t: number) => void; play: () => void; pause: () => void };

type Props = {
  film: IntroFilm;
  locale: "en" | "ko";
  title: string;
  className?: string;
  /** 무대를 덮도록 잘라서(명함 16:10) 또는 다 보이게. */
  fit?: "cover" | "contain";
  showSafe?: IntroSurface | null;
  /** 재생 위치가 바뀔 때(검토 창 장면 목록·재생 막대가 따라온다). */
  onTime?: (t: number, duration: number) => void;
  ref?: Ref<IntroFilmHandle>;
};

export default function IntroFilmPlayer({ film, locale, title, className, fit = "cover", showSafe = null, onTime, ref }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const filmRef = useRef<Film | null>(null);
  const clock = useRef({ t0: 0, pausedAt: null as number | null, visible: true, lastT: 0 });
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const onTimeRef = useRef(onTime);
  const [ready, setReady] = useState(false);
  const valid = !introFilmIssue(film);

  useEffect(() => { onTimeRef.current = onTime; }, [onTime]);

  // 대본·스타일·언어가 바뀌면 다시 그린다(재생 위치는 이어서).
  const key = JSON.stringify([film, locale, showSafe]);
  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    (async () => {
      await loadIntroFonts(locale);
      if (cancelled || !svgRef.current) return;
      const keep = filmRef.current ? now() : 0;
      filmRef.current = createFilm(svgRef.current, film, resolveStyle(film.style), {
        locale, idPrefix: `nf${uid}`, fontMap: INTRO_FONT_MAP, showSafe,
      });
      seek(keep);
      setReady(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, valid]);

  function now() {
    const c = clock.current;
    return c.pausedAt != null ? c.pausedAt : (performance.now() - c.t0) / 1000;
  }
  function seek(t: number) {
    const f = filmRef.current, c = clock.current;
    const s = Math.max(0, Math.min((f?.duration ?? 1) - 0.01, t));
    if (c.pausedAt != null) c.pausedAt = s; else c.t0 = performance.now() - s * 1000;
    f?.render(s);
  }
  useImperativeHandle(ref, () => ({
    seek,
    play: () => { const c = clock.current; if (c.pausedAt != null) { const s = c.pausedAt; c.pausedAt = null; seek(s); } },
    pause: () => { clock.current.pausedAt = now(); },
  }));

  // 재생 루프 — 보일 때만.
  useEffect(() => {
    if (!ready) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { clock.current.pausedAt = Math.min(3.2, (filmRef.current?.duration ?? 4) - 0.1); }
    let raf = 0;
    const tick = () => {
      const f = filmRef.current;
      if (f && clock.current.visible && !document.hidden) {
        let t = now();
        if (t >= f.duration) { seek(0); t = 0; }
        f.render(t);
        onTimeRef.current?.(t, f.duration);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const io = new IntersectionObserver(([e]) => {
      const c = clock.current, was = c.visible;
      c.visible = e.isIntersecting;
      // 다시 보이면 멈췄던 자리에서 이어서(화면 밖에서 시간이 흐르지 않게).
      if (!was && c.visible && c.pausedAt == null) c.t0 = performance.now() - c.lastT * 1000;
      if (was && !c.visible) c.lastT = now();
    });
    if (svgRef.current) io.observe(svgRef.current);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [ready]);

  if (!valid) return null;
  return (
    <svg
      ref={svgRef}
      role="img"
      aria-label={title}
      className={className}
      viewBox="0 0 1600 900"
      preserveAspectRatio={fit === "cover" ? "xMidYMid slice" : "xMidYMid meet"}
      style={{ display: "block", width: "100%", height: "100%", background: "#0c0b0a" }}
    />
  );
}
