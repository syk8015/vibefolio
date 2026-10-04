"use client";

// 소개 영상 재생기 — 장면 대본을 이 자리에서 그린다(영상 파일 없이). 명함 무대·작품 페이지·검토 창·워커 렌더가 같이 쓴다.
// 2026-10-04: 그림은 영상 틀(lib/introFilm/genres — 영수증·터미널·LCD …)이 캔버스에 그린다. 틀은 render(g, t)만 알고,
// 시계는 이 컴포넌트가 돌린다. 화면 밖이거나 탭이 숨으면 멈추고, 줄임 모드(움직임 줄이기)면 대표 장면 한 장만 보여준다.
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { introFilmIssue, type IntroFilm } from "@/lib/introFilm/schema";
import { filmGenre, genreWork } from "@/lib/introFilm/genres";
import type { GenreFilm } from "@/lib/introFilm/genres/types";
import { W, H, hash } from "@/lib/introFilm/genres/kit";
import { genreFonts, loadGenreFonts } from "./fonts";

export type IntroFilmHandle = { seek: (t: number) => void; play: () => void; pause: () => void };

type Props = {
  film: IntroFilm;
  locale: "en" | "ko";
  title: string;
  /** 작품 id — 추천 틀과 작품마다 다른 배치의 씨앗. */
  projectId: string;
  /** 주인 아이디(@ 없이) — 끝 2초 nookframe.com/@handle. */
  handle: string;
  className?: string;
  /** 무대를 덮도록 잘라서(명함 16:10) 또는 다 보이게. */
  fit?: "cover" | "contain";
  /** 재생 위치가 바뀔 때(검토 창 장면 목록·재생 막대가 따라온다). */
  onTime?: (t: number, duration: number) => void;
  /** 영상을 새로 만들 때마다 장면 시작 시각·전체 길이(틀마다 다르다 — 검토 창 장면 목록이 이걸로 맞춘다). */
  onTimeline?: (starts: number[], duration: number) => void;
  /** 워커 렌더용 — 스스로 재생하지 않고 window.__introFilm.renderAt(t)로 프레임을 하나씩 그리게 한다. */
  capture?: boolean;
  ref?: Ref<IntroFilmHandle>;
};

export default function IntroFilmPlayer({ film, locale, title, projectId, handle, className, fit = "cover", onTime, onTimeline, capture = false, ref }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const filmRef = useRef<GenreFilm | null>(null);
  const clock = useRef({ t0: 0, pausedAt: null as number | null, visible: true, lastT: 0 });
  const onTimeRef = useRef(onTime);
  const onTimelineRef = useRef(onTimeline);
  const [ready, setReady] = useState(false);
  const valid = !introFilmIssue(film);

  useEffect(() => { onTimeRef.current = onTime; onTimelineRef.current = onTimeline; }, [onTime, onTimeline]);

  function draw(t: number) {
    const c = canvasRef.current, f = filmRef.current;
    if (!c || !f) return;
    const g = c.getContext("2d");
    if (!g) return;
    const s = c.width / W;
    g.setTransform(s, 0, 0, s, 0, 0);
    g.save();
    g.beginPath();
    g.rect(0, 0, W, H);
    g.clip();
    f.render(g, Math.max(0, Math.min(f.duration, t)));
    g.restore();
  }

  // 캔버스 픽셀 수 = 보이는 크기 × 화면 배율(워커는 1920×1080 그대로).
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const size = () => {
      const dpr = capture ? 1 : Math.min(2, window.devicePixelRatio || 1);
      const w = capture ? 1920 : Math.max(320, Math.round(c.clientWidth * dpr));
      if (c.width !== w) { c.width = w; c.height = Math.round((w * H) / W); draw(now()); }
    };
    size();
    if (capture) return;
    const ro = new ResizeObserver(size);
    ro.observe(c);
    return () => ro.disconnect();
  }, [capture]);

  // 대본·틀·언어가 바뀌면 다시 만든다(재생 위치는 이어서).
  const key = JSON.stringify([film, locale, projectId, handle]);
  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    (async () => {
      const genre = filmGenre(film, projectId);
      const text = JSON.stringify(film.scenes);
      await loadGenreFonts(genre.fonts, locale, text);
      if (cancelled) return;
      const keep = filmRef.current ? now() : 0;
      filmRef.current = genre.make(genreWork(film, locale, { id: projectId, title, handle }), {
        seed: hash(genre.id + "|" + projectId), fonts: genreFonts(genre.fonts, locale),
      });
      seek(keep);
      onTimelineRef.current?.(filmRef.current.starts, filmRef.current.duration);
      if (capture) {
        const f = filmRef.current;
        (window as unknown as { __introFilm?: unknown }).__introFilm = { duration: f.duration, renderAt: (t: number) => draw(t) };
      }
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
    draw(s);
  }
  useImperativeHandle(ref, () => ({
    seek,
    play: () => { const c = clock.current; if (c.pausedAt != null) { const s = c.pausedAt; c.pausedAt = null; seek(s); } },
    pause: () => { clock.current.pausedAt = now(); },
  }));

  // 재생 루프 — 보일 때만.
  useEffect(() => {
    if (!ready || capture) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { clock.current.pausedAt = Math.min(3.2, (filmRef.current?.duration ?? 4) - 0.1); }
    let raf = 0;
    const tick = () => {
      const f = filmRef.current;
      if (f && clock.current.visible && !document.hidden) {
        let t = now();
        if (t >= f.duration) { seek(0); t = 0; }
        draw(t);
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
    if (canvasRef.current) io.observe(canvasRef.current);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, capture]);

  if (!valid) return null;
  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={title}
      className={className}
      width={1600}
      height={900}
      style={{ display: "block", width: "100%", height: "100%", objectFit: fit, background: "#000" }}
    />
  );
}

