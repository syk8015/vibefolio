"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import type { Project } from "@/lib/data";
import { detectVideoKind, getYouTubeEmbedUrl, getVimeoEmbedUrl } from "@/lib/video";

function isFileUpload(url: string | undefined): boolean {
  return !!url && url.startsWith("/api/preview/");
}

function safeHref(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("https://") || url.startsWith("http://")) return url;
  if (url.startsWith("/api/preview/")) return url;
  return undefined;
}

// ────────────────────────────────────────────────────────────────
// LivePreview — the actual demo surface inside the stage.
// Priority: video > iframe(file upload) > static thumbnail.
// Mirrors FeaturedHero's decision tree so behavior stays consistent.
// ────────────────────────────────────────────────────────────────
function LivePreview({ project }: { project: Project }) {
  const videoKind = project.videoUrl ? detectVideoKind(project.videoUrl) : "unknown";
  const hasManualVideo = project.videoUrl && videoKind !== "unknown";
  const isFile = isFileUpload(project.demoUrl);

  // Priority: 수동 video_url > 자동 demo_video_url(mp4) > iframe(파일 업로드) > 썸네일
  if (hasManualVideo) {
    return <VideoBackground url={project.videoUrl!} kind={videoKind} poster={project.thumbnail} title={project.title} />;
  }
  if (project.demoVideoUrl) {
    return <VideoBackground url={project.demoVideoUrl} kind="direct" poster={project.thumbnail} title={project.title} />;
  }
  if (isFile && project.demoUrl) {
    return (
      <iframe
        src={project.demoUrl}
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
      alt={project.title}
      fill
      priority
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
}: {
  url: string;
  kind: "youtube" | "vimeo" | "direct" | "unknown";
  poster: string;
  title: string;
}) {
  if (kind === "youtube") {
    const embed = getYouTubeEmbedUrl(url);
    if (!embed) return null;
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
  return <DirectVideo url={url} poster={poster} />;
}

// React 19에서 `muted` JSX prop이 HTML 속성으로 안 렌더되는 케이스가 있음.
// Chrome 자동재생 정책상 muted 속성이 없으면 음소거 안 된 영상으로 간주되어
// autoplay 차단 → 포스터만 보이고 영상 멈춤. ref로 마운트 직후 강제로
// .muted = true + .play() 호출해서 우회.
function DirectVideo({ url, poster }: { url: string; poster: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = true;
    el.play().catch(() => { /* 일부 브라우저는 사용자 인터랙션 전엔 거부 */ });
  }, [url]);
  return (
    <video
      ref={ref}
      autoPlay
      loop
      muted
      playsInline
      poster={poster}
      className="absolute inset-0 w-full h-full object-cover"
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

  // The stage is full-bleed on mobile (no rounded corners) and a floating
  // 16:10 card on desktop. Everything else (badges, sticker, copy) is
  // identical — only sizes shift.
  const containerStyle: React.CSSProperties = isDesktop
    ? {
        position: "relative",
        width: "100%",
        aspectRatio: "16 / 10",
        background: "#0a0a0a",
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "0 30px 60px rgba(0,0,0,0.18), 0 5px 14px rgba(0,0,0,0.10)",
      }
    : {
        position: "relative",
        width: "100%",
        height: "min(510px, 78vh)",
        background: "#0a0a0a",
        overflow: "hidden",
      };

  return (
    <div style={containerStyle}>
      <LivePreview project={project} />

      {/* Dark gradient — keeps title legible without crushing the demo. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: isFile
            ? "linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.78) 100%)"
            : "linear-gradient(180deg, transparent 48%, rgba(0,0,0,0.82) 100%)",
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
    </div>
  );
}
