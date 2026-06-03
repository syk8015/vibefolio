"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import type { Project } from "@/lib/data";
import { detectVideoKind, getYouTubeEmbedUrl, getVimeoEmbedUrl } from "@/lib/video";
import { toPreviewUrl } from "@/lib/previewOrigin";

function isFileUpload(url: string | undefined): boolean {
  return !!url && url.startsWith("/api/preview/");
}

function safeHref(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("https://") || url.startsWith("http://")) return url;
  // Uploaded previews open on the sandbox origin, never under the app origin.
  if (url.startsWith("/api/preview/")) return toPreviewUrl(url);
  return undefined;
}

// ────────────────────────────────────────────────────────────────
// LivePreview — the actual demo surface inside the stage.
// Priority: video > iframe(file upload) > static thumbnail.
// Mirrors FeaturedHero's decision tree so behavior stays consistent.
// ────────────────────────────────────────────────────────────────
function LivePreview({ project, variant }: { project: Project; variant: "mobile" | "desktop" }) {
  const videoKind = project.videoUrl ? detectVideoKind(project.videoUrl) : "unknown";
  const hasManualVideo = project.videoUrl && videoKind !== "unknown";
  const isFile = isFileUpload(project.demoUrl);
  // On mobile the stage is a 16:9 box (see TheaterStage); show videos in full
  // with `contain` so a landscape demo is never vertically cropped. Desktop's
  // 16:10 stage keeps `cover`.
  const videoFit = variant === "mobile" ? "contain" : "cover";

  // Priority: 수동 video_url > 자동 demo_video_url(mp4) > iframe(파일 업로드) > 썸네일
  if (hasManualVideo) {
    return <VideoBackground url={project.videoUrl!} kind={videoKind} poster={project.thumbnail} title={project.title} fit={videoFit} />;
  }
  if (project.demoVideoUrl) {
    return <VideoBackground url={project.demoVideoUrl} kind="direct" poster={project.thumbnail} title={project.title} fit={videoFit} />;
  }
  if (isFile && project.demoUrl) {
    return (
      <iframe
        src={toPreviewUrl(project.demoUrl)}
        className="absolute inset-0 w-full h-full"
        style={{ border: "none" }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        title={project.title}
      />
    );
  }
  return (
    <Image
      src={project.thumbnail}
      unoptimized /* user-supplied thumbnail URL — skip optimizer (any host, no SSRF) */
      alt={project.title}
      fill
      // Next 16 deprecated `priority`. This stage is the LCP, but it renders in
      // both the mobile and desktop variants (one is display:none), so per the
      // Next docs we use eager + high fetchPriority for a multi-candidate LCP
      // rather than a `preload` link that would be emitted twice.
      loading="eager"
      fetchPriority="high"
      sizes="(max-width: 768px) 100vw, 65vw"
      className="object-cover"
    />
  );
}

function VideoBackground({
  url,
  kind,
  poster,
  title,
  fit,
}: {
  url: string;
  kind: "youtube" | "vimeo" | "direct" | "unknown";
  poster: string;
  title: string;
  fit: "cover" | "contain";
}) {
  if (kind === "youtube") {
    const embed = getYouTubeEmbedUrl(url);
    if (!embed) return null;
    // Mobile "contain": the stage is already 16:9, so a plain full-bleed embed
    // fits exactly — nothing cropped. Desktop "cover": oversize + offset the
    // iframe to hide YouTube's chrome and fill the 16:10 stage.
    if (fit === "contain") {
      return (
        <iframe
          src={embed}
          title={title}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ border: "none" }}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      );
    }
    return (
      <iframe
        src={embed}
        title={title}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{
          border: "none",
          width: "calc(100% + 200px)",
          height: "calc(100% + 200px)",
          left: "-100px",
          top: "-100px",
        }}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    );
  }
  if (kind === "vimeo") {
    const embed = getVimeoEmbedUrl(url);
    if (!embed) return null;
    return (
      <iframe
        src={embed}
        title={title}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ border: "none" }}
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
      />
    );
  }
  return <DirectVideo url={url} poster={poster} fit={fit} />;
}

// React 19에서 `muted` JSX prop이 HTML 속성으로 안 렌더되는 케이스가 있음.
// Chrome 자동재생 정책상 muted 속성이 없으면 음소거 안 된 영상으로 간주되어
// autoplay 차단 → 포스터만 보이고 영상 멈춤. ref로 마운트 직후 강제로
// .muted = true + .play() 호출해서 우회.
function DirectVideo({ url, poster, fit }: { url: string; poster: string; fit: "cover" | "contain" }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = true;
    el.play().catch(() => { /* 일부 브라우저는 사용자 인터랙션 전엔 거부 */ });
  }, [url]);
  return (
    // key={url} forces a remount when the active project changes — a plain
    // <source src> swap does NOT reload an existing <video>, so without this
    // the element keeps playing the first project's video.
    <video
      key={url}
      ref={ref}
      autoPlay
      loop
      muted
      playsInline
      poster={poster}
      // Literal class strings (not `object-${fit}`) so Tailwind's JIT emits both.
      className={`absolute inset-0 w-full h-full ${fit === "contain" ? "object-contain" : "object-cover"}`}
      preload="auto"
    >
      <source src={url} />
    </video>
  );
}

// ────────────────────────────────────────────────────────────────
// Stage chrome — title plate, voice bubble, CTA, tags. These bits
// sit on top of LivePreview and are reused across mobile/desktop.
// ────────────────────────────────────────────────────────────────

function NowPlayingBadge() {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 11px",
        borderRadius: 999,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(8px)",
      }}
    >
      <span className="vf-live-dot" style={{ width: 5, height: 5 }} />
      <span
        style={{
          fontSize: 9,
          color: "#fff",
          fontWeight: 800,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          fontFamily: "var(--font-nunito)",
        }}
      >
        Now playing
      </span>
    </div>
  );
}

function StageVoiceBubble({ text }: { text: string }) {
  return (
    <div
      style={{
        position: "relative",
        maxWidth: 220,
        padding: "10px 13px",
        background: "var(--surface)",
        borderRadius: 10,
        boxShadow: "0 6px 24px rgba(0,0,0,0.25), 0 1.5px 4px rgba(0,0,0,0.15)",
        fontFamily: "var(--font-nunito)",
        fontSize: 12,
        lineHeight: 1.5,
        color: "var(--text-primary)",
        fontWeight: 600,
      }}
    >
      <span
        style={{
          position: "absolute",
          left: -5,
          bottom: 12,
          width: 10,
          height: 10,
          background: "var(--surface)",
          transform: "rotate(45deg)",
          boxShadow: "-1.5px 1.5px 3px rgba(0,0,0,0.06)",
        }}
      />
      <div style={{ position: "relative" }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
            display: "block",
            marginBottom: 3,
            fontWeight: 800,
          }}
        >
          만든이 메모
        </span>
        {text}
      </div>
    </div>
  );
}

interface StageProps {
  project: Project;
  index: number; // 0-based — displayed as NO. 01 etc.
  variant: "mobile" | "desktop";
}

export default function TheaterStage({ project, index, variant }: StageProps) {
  const href = safeHref(project.demoUrl);
  const isFile = isFileUpload(project.demoUrl);
  const numberLabel = String(index + 1).padStart(2, "0");
  const isDesktop = variant === "desktop";

  // A project counts as "video" when it has a recognized manual video_url or an
  // auto-recorded demo mp4 — those carry a fixed source aspect ratio and get
  // vertically cropped by a portrait box. Live-site iframes and thumbnails don't.
  const videoKind = project.videoUrl ? detectVideoKind(project.videoUrl) : "unknown";
  const isVideo = (!!project.videoUrl && videoKind !== "unknown") || !!project.demoVideoUrl;

  // Desktop: floating 16:10 card. Mobile: full-bleed. For video on mobile the
  // box is a tall ~square (1:1, ≈ half the viewport on a phone) and the demo is
  // letterboxed inside it via object-contain — the full landscape frame shows
  // with dark bars top/bottom, never cropped. Live previews / thumbnails keep
  // the shorter portrait box below.
  const containerStyle: React.CSSProperties = isDesktop
    ? {
        position: "relative",
        width: "100%",
        aspectRatio: "16 / 10",
        background: "#0a0a0a",
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "0 24px 56px rgba(0,0,0,0.24), 0 6px 16px rgba(0,0,0,0.14)",
      }
    : isVideo
    ? {
        position: "relative",
        width: "100%",
        aspectRatio: "1 / 1",
        background: "#0a0a0a",
        overflow: "hidden",
      }
    : {
        position: "relative",
        width: "100%",
        height: "min(510px, 78vh)",
        background: "#0a0a0a",
        overflow: "hidden",
      };

  return (
    // data-theater-stage marks the desktop stage so the landing-page PiP can
    // measure it and zoom into the demo video. Desktop-only: the mobile copy
    // is display:none at the iframe's 1200px width and would measure as 0×0.
    <div style={containerStyle} data-theater-stage={isDesktop ? "" : undefined}>
      <LivePreview project={project} variant={variant} />

      {/* Dark gradient — keeps title legible without crushing the demo.
          A whisper-light scrim at the very top seats the "Now playing" badge
          and gives a light demo an upper edge instead of bleeding into the page. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: isFile
            ? "linear-gradient(180deg, rgba(0,0,0,0.16) 0%, transparent 14%, transparent 50%, rgba(0,0,0,0.78) 100%)"
            : "linear-gradient(180deg, rgba(0,0,0,0.16) 0%, transparent 14%, transparent 48%, rgba(0,0,0,0.82) 100%)",
        }}
      />

      {/* Top-left: Now playing badge */}
      <div style={{ position: "absolute", top: isDesktop ? 18 : 14, left: isDesktop ? 18 : 14, zIndex: 4 }}>
        <NowPlayingBadge />
      </div>

      {/* Owner's note bubble — sits above the title block, doesn't collide
          with the CTA. Hidden if there's no comment to show. */}
      {project.comment && (
        <div
          style={{
            position: "absolute",
            right: isDesktop ? 24 : 16,
            bottom: isDesktop ? 130 : 110,
            zIndex: 4,
          }}
        >
          <StageVoiceBubble text={project.comment} />
        </div>
      )}

      {/* Bottom: title plate */}
      <div
        style={{
          position: "absolute",
          left: isDesktop ? 28 : 18,
          right: isDesktop ? 28 : 18,
          bottom: isDesktop ? 26 : 20,
          zIndex: 4,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: isDesktop ? 10 : 9,
              color: "rgba(255,255,255,0.65)",
              letterSpacing: "0.22em",
            }}
          >
            NO. {numberLabel}
          </span>
          <span style={{ width: 16, height: 1, background: "rgba(255,255,255,0.35)" }} />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: isDesktop ? 10 : 9,
              color: "rgba(255,255,255,0.65)",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            {project.type === "video" ? "Video" : "Live"} · {project.year}
          </span>
        </div>
        <h2
          className="vf-serif-display"
          style={{
            fontWeight: 700,
            fontSize: isDesktop ? 44 : 30,
            color: "#fff",
            lineHeight: 0.98,
            margin: 0,
            textShadow: "0 2px 16px rgba(0,0,0,0.55)",
          }}
        >
          {project.title}
        </h2>
        {project.description && (
          <p
            style={{
              fontSize: isDesktop ? 14 : 12,
              color: "rgba(255,255,255,0.82)",
              marginTop: 8,
              lineHeight: 1.55,
              maxWidth: isDesktop ? 440 : 280,
              fontFamily: "var(--font-nunito)",
              fontWeight: 400,
              textShadow: "0 1px 8px rgba(0,0,0,0.5)",
            }}
          >
            {project.description}
          </p>
        )}
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              marginTop: isDesktop ? 18 : 14,
              background: "#fff",
              color: "#1a1612",
              padding: isDesktop ? "11px 20px" : "9px 16px",
              borderRadius: 999,
              border: "none",
              fontFamily: "var(--font-nunito)",
              fontSize: isDesktop ? 13 : 11,
              fontWeight: 800,
              letterSpacing: "0.04em",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              textDecoration: "none",
            }}
          >
            {isFile ? "전체화면으로 체험" : "체험하러 가기"}
            <span
              style={{
                display: "inline-block",
                width: 0,
                height: 0,
                borderLeft: "6px solid currentColor",
                borderTop: "4px solid transparent",
                borderBottom: "4px solid transparent",
              }}
            />
          </a>
        )}
      </div>

      {/* Frame ring — a crisp hairline painted ABOVE the demo so the card edge
          stays defined even when the video is near-white. Must be its own
          top-most layer: a child can't reveal a parent's inset box-shadow.
          Desktop only — the mobile stage is full-bleed with no page beside it. */}
      {isDesktop && (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ borderRadius: 14, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.18)", zIndex: 6 }}
        />
      )}
    </div>
  );
}
