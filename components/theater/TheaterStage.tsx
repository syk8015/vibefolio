"use client";

import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n/client";
import Image from "next/image";
import type { Project } from "@/lib/data";
import { detectVideoKind, getYouTubeEmbedUrl, getVimeoEmbedUrl } from "@/lib/video";
import { toPreviewUrl } from "@/lib/previewOrigin";
import type { MeishiProfile } from "./Meishi";
import type { IdentityLine } from "@/lib/identityLine";

function isFileUpload(url: string | undefined): boolean {
  return !!url && url.startsWith("/api/preview/");
}

// Site-kind labels live in the i18n dictionary (t.contentTypes), mirroring
// CONTENT_TYPES ids in lib/projectTaxonomy.ts (the optional "무슨 사이트인지" field).

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
  const { t } = useT();
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
          {t.theater.makerNote}
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
  // Mobile hero only — identity overlay 데이터. Desktop은 무시(전달 안 됨).
  profile?: MeishiProfile;
  identity?: IdentityLine;
}

export default function TheaterStage({ project, index, variant, profile, identity }: StageProps) {
  const { t } = useT();
  // ── 모바일은 완전히 분리된 히어로로 분기. 데스크탑 코드 경로는 아래 그대로 보존(byte-identical) ──
  if (variant === "mobile") {
    return <MobileStage project={project} index={index} profile={profile} identity={identity} />;
  }

  const href = safeHref(project.demoUrl);
  const isFile = isFileUpload(project.demoUrl);
  const numberLabel = String(index + 1).padStart(2, "0");
  const isDesktop = variant === "desktop";

  // A project counts as "video" when it has a recognized manual video_url or an
  // auto-recorded demo mp4 — those carry a fixed source aspect ratio and get
  // vertically cropped by a portrait box. Live-site iframes and thumbnails don't.
  const videoKind = project.videoUrl ? detectVideoKind(project.videoUrl) : "unknown";
  const isVideo = (!!project.videoUrl && videoKind !== "unknown") || !!project.demoVideoUrl;

  // Mobile video stage: the demo is letterboxed inside a 1:1 box, so the chrome
  // moves OUT of the video and into the dark bars — meta on top, title + CTA on
  // one row at the bottom. No "Now playing", no "Live"; instead the optional
  // site-kind + AI-tool fields the user picked when adding the project.
  const isMobileVideo = !isDesktop && isVideo;
  const contentLabel = project.contentType ? (t.contentTypes as Record<string, string>)[project.contentType] : undefined;
  const aiTools = project.tags.length ? project.tags.join(" · ") : undefined;
  const metaParts = [contentLabel, aiTools, project.year].filter(Boolean) as string[];

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
        // Letterbox = the page colour, not hard black, so the bars don't clash
        // with the light page. The chrome over them is frosted for a soft feel.
        background: "var(--bg)",
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

      {isMobileVideo ? (
        <>
          {/* TOP letterbox bar — enriched meta. A faint gradient backs the text
              so it stays legible; on a 16:9 demo it lands on the dark bar and is
              invisible. No "Now playing" badge, no "Live" word. */}
          <div
            className="absolute top-0 left-0 right-0 pointer-events-none"
            style={{
              zIndex: 4,
              padding: "11px 18px",
              background: "color-mix(in srgb, var(--bg) 62%, transparent)",
              backdropFilter: "blur(16px) saturate(1.1)",
              WebkitBackdropFilter: "blur(16px) saturate(1.1)",
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8,
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--text-secondary)",
            }}
          >
            <span>NO. {numberLabel}</span>
            {metaParts.map((part, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 14, height: 1, background: "var(--border-bright)" }} />
                <span style={{ letterSpacing: i === metaParts.length - 1 ? "0.16em" : "0.04em" }}>{part}</span>
              </span>
            ))}
          </div>

          {/* BOTTOM letterbox bar — title + CTA on a single row, never over the
              demo. Title ellipsizes so the button always keeps its place. */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 4,
              padding: "12px 18px",
              background: "color-mix(in srgb, var(--bg) 62%, transparent)",
              backdropFilter: "blur(16px) saturate(1.1)",
              WebkitBackdropFilter: "blur(16px) saturate(1.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <h2
              className="vf-serif-display"
              style={{
                fontWeight: 700,
                fontSize: 22,
                color: "var(--text-primary)",
                lineHeight: 1.1,
                margin: 0,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {project.title}
            </h2>
            {href && (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  flex: "0 0 auto",
                  background: "var(--blue)",
                  color: "var(--bg)",
                  padding: "9px 16px",
                  borderRadius: 999,
                  border: "none",
                  fontFamily: "var(--font-nunito)",
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {isFile ? t.theater.ctaFullscreen : t.theater.ctaVisit}
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
        </>
      ) : (
      <>

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
              // 작품 위에 겹치는 글이라 길면 포스터를 덮어버린다 → 3줄에서 끊는다.
              // 전문은 상세 페이지(ClampText, 폰 8줄)에서 볼 수 있으니 여기선
              // 더보기 토글을 두지 않는다 — 첫 화면은 미끼지 본문이 아니다.
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 3,
              overflow: "hidden",
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
            {isFile ? t.theater.ctaFullscreen : t.theater.ctaVisit}
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
      </>
      )}

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

// ════════════════════════════════════════════════════════════════
// MOBILE HERO (< md) — 풀블리드 앵비언트 영상 + 정체성 오버레이
//
// 접속 즉시 대표작 영상이 원본 비율 그대로(크롭 0) 가운데 재생되고,
// 같은 소스를 cover+blur로 깔아 좌우/상하 여백을 채워 풀블리드가 된다.
// 위에는 [아바타 + 이름 + 자동 한 줄 + 주력 툴], 아래에는 [슬림 메타 +
// 작품 제목 + 체험 CTA]가 프로스티드 패널로 얹혀 라이트/다크 모두 가독성 확보.
// 색·글자색은 모두 CSS 변수(--bg/--text-*/--blue/--border*) 기반.
// ════════════════════════════════════════════════════════════════

// 마운트 직후 muted+play 강제(데스크탑 DirectVideo와 동일한 React 19 우회).
// prefers-reduced-motion이면 재생하지 않고 포스터에서 정지.
function MobileVideo({
  url,
  poster,
  layer,
}: {
  url: string;
  poster: string;
  layer: "sharp" | "ambient";
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = true;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      el.pause();
    } else {
      el.play().catch(() => { /* 사용자 인터랙션 전 거부 가능 */ });
    }
  }, [url]);
  return (
    <video
      key={`${layer}-${url}`}
      ref={ref}
      autoPlay
      loop
      muted
      playsInline
      poster={poster}
      preload="auto"
      className={layer === "ambient" ? "vf-mhero-ambient" : "vf-mhero-media"}
      aria-hidden={layer === "ambient" ? true : undefined}
    >
      <source src={url} />
    </video>
  );
}

// 앵비언트 블러 배경 + 선명한(크롭 0) 전경을 함께 렌더.
//  • 다이렉트 mp4(수동 video_url=direct / 자동 demo_video_url): 같은 영상을
//    blur cover로 깔고, 같은 영상을 contain으로 선명하게.
//  • YouTube/Vimeo/파일 업로드 iframe: 전경은 iframe(contain), 배경은
//    thumbnail blur cover(임베드 중복 재생 회피).
//  • 영상이 전혀 없으면 thumbnail을 contain 전경 + blur cover 배경으로 동일 처리.
function MobileHeroMedia({ project }: { project: Project }) {
  const videoKind = project.videoUrl ? detectVideoKind(project.videoUrl) : "unknown";
  const hasManualVideo = !!project.videoUrl && videoKind !== "unknown";
  const isFile = isFileUpload(project.demoUrl);

  // "같은 소스" 블러 배경이 가능한 다이렉트 mp4 URL (있으면)
  const directUrl =
    hasManualVideo && videoKind === "direct"
      ? project.videoUrl!
      : project.demoVideoUrl
      ? project.demoVideoUrl
      : null;

  // ── 배경(앵비언트) 레이어 ──
  const ambient = directUrl ? (
    <MobileVideo url={directUrl} poster={project.thumbnail} layer="ambient" />
  ) : (
    <Image
      src={project.thumbnail}
      unoptimized
      alt=""
      aria-hidden
      fill
      sizes="100vw"
      className="vf-mhero-ambient"
    />
  );

  // ── 전경(선명) 레이어 — 절대 크롭 금지 ──
  let sharp: React.ReactNode;
  if (hasManualVideo && videoKind === "youtube") {
    const embed = getYouTubeEmbedUrl(project.videoUrl!);
    sharp = embed ? (
      <iframe
        src={embed}
        title={project.title}
        className="vf-mhero-media pointer-events-none"
        style={{ border: "none" }}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    ) : null;
  } else if (hasManualVideo && videoKind === "vimeo") {
    const embed = getVimeoEmbedUrl(project.videoUrl!);
    sharp = embed ? (
      <iframe
        src={embed}
        title={project.title}
        className="vf-mhero-media pointer-events-none"
        style={{ border: "none" }}
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
      />
    ) : null;
  } else if (directUrl) {
    sharp = <MobileVideo url={directUrl} poster={project.thumbnail} layer="sharp" />;
  } else if (isFile && project.demoUrl) {
    sharp = (
      <iframe
        src={toPreviewUrl(project.demoUrl)}
        className="vf-mhero-media"
        style={{ border: "none" }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        title={project.title}
      />
    );
  } else {
    sharp = (
      <Image
        src={project.thumbnail}
        unoptimized
        alt={project.title}
        fill
        loading="eager"
        fetchPriority="high"
        sizes="100vw"
        className="vf-mhero-media"
      />
    );
  }

  return (
    <>
      {ambient}
      {/* 배경을 살짝 더 가라앉혀 전경 영상과 오버레이 텍스트를 분리 */}
      <div className="vf-mhero-veil" aria-hidden />
      {sharp}
    </>
  );
}

function HeroAvatar({ profile, size = 38 }: { profile?: MeishiProfile; size?: number }) {
  const name = profile?.name || profile?.username || "?";
  const letter = name.trim().charAt(0).toUpperCase();
  if (profile?.avatar_url) {
    return (
      <Image
        src={profile.avatar_url}
        alt={name}
        width={size}
        height={size}
        unoptimized
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          objectFit: "cover",
          flexShrink: 0,
          border: "1.5px solid var(--border-bright)",
        }}
      />
    );
  }
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: "var(--text-primary)",
        color: "var(--bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.44,
        fontWeight: 900,
        flexShrink: 0,
        fontFamily: "var(--font-nunito)",
      }}
    >
      {letter}
    </div>
  );
}

function MobileStage({
  project,
  index,
  profile,
  identity,
}: {
  project: Project;
  index: number;
  profile?: MeishiProfile;
  identity?: IdentityLine;
}) {
  const href = safeHref(project.demoUrl);
  const isFile = isFileUpload(project.demoUrl);
  const numberLabel = String(index + 1).padStart(2, "0");
  const displayName = profile?.name || profile?.username || "";
  const { t } = useT();
  const detailHref =
    profile?.username && project.watchId
      ? `/${profile.username}/${project.watchId}`
      : undefined;

  const contentLabel = project.contentType ? (t.contentTypes as Record<string, string>)[project.contentType] : undefined;
  const aiTools = project.tags.length ? project.tags.join(" · ") : undefined;
  const metaParts = [contentLabel, aiTools, project.year].filter(Boolean) as string[];

  const headline = identity?.headline;
  const tools = identity?.tools ?? [];

  return (
    <div className="vf-mhero">
      {/* 풀블리드 영상: 같은 소스 blur cover 배경 + 원본 비율 contain 전경 */}
      <MobileHeroMedia project={project} />

      {/* ── 상단 오버레이: 정체성 (아바타 · 이름 · 자동 한 줄 · 주력 툴) ── */}
      <div className="vf-mhero-top vf-mhero-scrim-top vf-mhero-fade">
        <div className="vf-mhero-id-row">
          <HeroAvatar profile={profile} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="vf-serif-display"
              style={{
                fontWeight: 700,
                fontSize: 19,
                lineHeight: 1.1,
                color: "var(--text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {displayName}
            </div>
            {profile?.username && (
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: "0.06em",
                  color: "var(--text-secondary)",
                  marginTop: 2,
                }}
              >
                @{profile.username}
              </div>
            )}
          </div>
        </div>

        {headline && (
          <p
            className="vf-serif-display"
            style={{
              margin: "12px 0 0",
              fontSize: 22,
              lineHeight: 1.3,
              fontWeight: 600,
              color: "var(--text-primary)",
              textWrap: "pretty",
            }}
          >
            {headline}
          </p>
        )}

        {tools.length > 0 && (
          <div
            style={{
              marginTop: 8,
              display: "flex",
              alignItems: "center",
              gap: 7,
              flexWrap: "wrap",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.04em",
              color: "var(--text-secondary)",
            }}
          >
            {tools.map((t, i) => (
              <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                {i > 0 && <span style={{ opacity: 0.5 }}>·</span>}
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── 하단 오버레이: 작품 (슬림 메타 · 제목 · CTA) ── */}
      <div className="vf-mhero-bottom vf-mhero-scrim-bottom vf-mhero-fade">
        <div className="vf-mhero-meta">
          <span>NO. {numberLabel}</span>
          {metaParts.map((part, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 12, height: 1, background: "var(--border-bright)" }} />
              <span>{part}</span>
            </span>
          ))}
        </div>
        <div className="vf-mhero-titlerow">
          <h2
            className="vf-serif-display"
            style={{
              flex: 1,
              fontWeight: 700,
              fontSize: 24,
              color: "var(--text-primary)",
              lineHeight: 1.1,
              margin: 0,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {project.title}
          </h2>
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: "0 0 auto",
                background: "var(--blue)",
                color: "var(--bg)",
                padding: "10px 16px",
                borderRadius: 999,
                border: "none",
                fontFamily: "var(--font-nunito)",
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: "0.02em",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              {isFile ? t.theater.ctaFullscreenShort : t.theater.ctaVisit}
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

        {/* 상세(watch) 페이지로 가는 유일한 화면 내부링크 — 모바일 전용.
            데스크탑 스테이지는 손대지 않는다([[project-theater-layout]] byte-identical).
            구글은 이미 명함 JSON-LD의 workExample으로 상세를 발견하므로 이건 사람용. */}
        {detailHref && (
          <a className="vf-mhero-detaillink" href={detailHref}>
            {t.theater.viewDetail}
            <span aria-hidden="true">→</span>
          </a>
        )}
      </div>
    </div>
  );
}
