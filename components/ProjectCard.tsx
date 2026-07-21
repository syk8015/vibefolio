"use client";

import { useState, memo } from "react";
import Image from "next/image";
import type { Project } from "@/lib/data";

type Layout = "grid" | "list";

const AI_KEYWORDS = ["claude", "gpt", "gemini", "llm", "ai"];

const CONTENT_TYPE_MAP: Record<string, { label: string; emoji: string }> = {
  "web-app":    { label: "웹 앱",        emoji: "🌐" },
  "saas":       { label: "SaaS",         emoji: "☁️" },
  "mobile":     { label: "모바일 앱",     emoji: "📱" },
  "game":       { label: "게임",          emoji: "🎮" },
  "extension":  { label: "크롬 익스텐션", emoji: "🧩" },
  "ai-service": { label: "AI 서비스",     emoji: "🤖" },
  "media":      { label: "미디어 콘텐츠", emoji: "🎨" },
  "other":      { label: "기타",          emoji: "📦" },
};

function isAiTag(tag: string) {
  return AI_KEYWORDS.some((k) => tag.toLowerCase().includes(k));
}

// Pure, string-only prop. Memoized so a card's hover state flip (which re-renders
// the card) doesn't needlessly re-render every tag badge inside it.
const TagBadge = memo(function TagBadge({ tag }: { tag: string }) {
  const ai = isAiTag(tag);
  return (
    <span
      className="px-2.5 py-0.5 rounded-full"
      style={{
        background: ai ? "rgba(234,179,8,0.1)" : "var(--blue-tint)",
        border: `1px solid ${ai ? "rgba(234,179,8,0.35)" : "var(--border-bright)"}`,
        color: ai ? "#eab308" : "var(--blue-bright)",
        fontFamily: "var(--font-nunito)",
        fontSize: "0.65rem",
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase" as const,
      }}
    >
      {tag}
    </span>
  );
});

export default function ProjectCard({
  project,
  layout = "grid",
  onClick,
}: {
  project: Project;
  layout?: Layout;
  onClick?: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  if (layout === "list") {
    return (
      <div
        className="group relative overflow-hidden rounded-2xl card-hover-glow cursor-pointer flex flex-col sm:flex-row"
        style={{ background: "var(--surface)", minHeight: "220px" }}
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Image — left side in list mode */}
        <div className="relative sm:w-2/5 w-full" style={{ minHeight: "220px" }}>
          <Image
            src={project.thumbnail}
            unoptimized /* user-supplied thumbnail URL — skip optimizer (any host, no SSRF) */
            alt={project.title}
            fill
            className="object-cover transition-transform duration-700 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, 40vw"
          />
          <div
            className="absolute inset-0"
            style={{
              background: hovered
                ? "linear-gradient(to right, var(--overlay-mid) 0%, transparent 100%)"
                : "linear-gradient(to right, var(--overlay-strong) 0%, transparent 80%)",
              transition: "background 0.3s",
            }}
          />
          {/* Year */}
          <div className="absolute bottom-4 left-4">
            <span style={{ color: "var(--blue-bright)", fontSize: "0.75rem", fontFamily: "var(--font-nunito)", fontWeight: 600 }}>
              {project.year}
            </span>
          </div>
          {/* Video badge */}
          {project.type === "video" && (
            <div className="absolute top-4 left-4">
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                style={{ background: "var(--badge-bg)", border: "1px solid var(--border-bright)", backdropFilter: "blur(8px)" }}
              >
                <svg width="7" height="8" viewBox="0 0 7 8" fill="none">
                  <polygon points="0,0 7,4 0,8" fill="var(--text-secondary)" />
                </svg>
                <span style={{ color: "var(--text-secondary)", fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "var(--font-nunito)", fontWeight: 700 }}>
                  Video
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Info — right side */}
        <div
          className="flex flex-col justify-center flex-1 p-8"
          style={{ borderLeft: "1px solid var(--border)" }}
        >
          <div className="flex items-start gap-2 mb-3">
            <h3
              className="text-2xl leading-tight flex-1"
              style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontWeight: 800 }}
            >
              {project.title}
            </h3>
            {project.contentType && CONTENT_TYPE_MAP[project.contentType] && (
              <span
                className="shrink-0 mt-1 px-2 py-0.5 rounded-full text-xs font-bold"
                style={{
                  background: "var(--blue-tint)",
                  border: "1px solid var(--border-bright)",
                  color: "var(--blue-bright)",
                  fontFamily: "var(--font-nunito)",
                  fontSize: "0.6rem",
                  letterSpacing: "0.04em",
                }}
              >
                {CONTENT_TYPE_MAP[project.contentType].emoji} {CONTENT_TYPE_MAP[project.contentType].label}
              </span>
            )}
          </div>
          <p
            className="text-sm leading-relaxed mb-6"
            style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontWeight: 400, fontSize: "0.95rem" }}
          >
            {project.description}
          </p>
          <div className="flex flex-wrap gap-2">
            {project.tags.map((tag) => <TagBadge key={tag} tag={tag} />)}
          </div>

          {/* Try button */}
          <div className="mt-6">
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full font-bold transition-all duration-200"
              style={{
                background: hovered ? "var(--blue)" : "var(--blue-tint)",
                border: "1px solid var(--blue)",
                color: hovered ? "#fff" : "var(--blue-bright)",
                fontFamily: "var(--font-nunito)",
                fontSize: "0.8rem",
                transition: "background 0.2s, color 0.2s",
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <polygon points="1,1 9,5 1,9" fill="currentColor" />
              </svg>
              체험하기
            </div>
          </div>
        </div>

        {/* Blue top border on hover */}
        <div
          className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl transition-opacity duration-300"
          style={{
            background: "linear-gradient(90deg, transparent, var(--blue), var(--blue-bright), var(--blue), transparent)",
            opacity: hovered ? 1 : 0,
          }}
        />
      </div>
    );
  }

  // Grid layout (default)
  return (
    <div
      className="group relative overflow-hidden rounded-2xl card-hover-glow cursor-pointer"
      style={{ background: "var(--surface)" }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="relative w-full aspect-video overflow-hidden">
        <Image
          src={project.thumbnail}
          unoptimized /* user-supplied thumbnail URL — skip optimizer (any host, no SSRF) */
          alt={project.title}
          fill
          className="object-cover transition-transform duration-700 group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, 50vw"
        />
        <div
          className="absolute inset-0 transition-opacity duration-300"
          style={{
            background: hovered
              ? `linear-gradient(to top, var(--overlay-strong) 0%, var(--overlay-mid) 50%, transparent 100%)`
              : `linear-gradient(to top, var(--overlay-mid) 0%, transparent 60%)`,
          }}
        />

        {project.type === "video" && hovered && (
          <>
            <div className="absolute inset-0 video-scan" />
            <div
              className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full"
              style={{ background: "var(--badge-bg)", border: "1px solid var(--blue)", backdropFilter: "blur(8px)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full blink" style={{ background: "var(--blue)" }} />
              <span style={{ color: "var(--blue-bright)", fontSize: "0.6rem", letterSpacing: "0.15em", textTransform: "uppercase", fontFamily: "var(--font-nunito)", fontWeight: 700 }}>Live</span>
            </div>
          </>
        )}

        {project.type === "video" && !hovered && (
          <div className="absolute top-3 right-3">
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
              style={{ background: "var(--badge-bg)", border: "1px solid var(--border-bright)", backdropFilter: "blur(8px)" }}
            >
              <svg width="7" height="8" viewBox="0 0 7 8" fill="none">
                <polygon points="0,0 7,4 0,8" fill="var(--text-secondary)" />
              </svg>
              <span style={{ color: "var(--text-secondary)", fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "var(--font-nunito)", fontWeight: 700 }}>Video</span>
            </div>
          </div>
        )}

        <div className="absolute bottom-3 left-3">
          <span style={{ color: "var(--blue-bright)", fontSize: "0.7rem", letterSpacing: "0.1em", fontFamily: "var(--font-nunito)", fontWeight: 600 }}>
            {project.year}
          </span>
        </div>

        <div
          className="absolute bottom-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full"
          style={{
            background: "var(--blue)",
            opacity: hovered ? 1 : 0,
            transform: hovered ? "translateY(0)" : "translateY(4px)",
            transition: "opacity 0.2s, transform 0.2s",
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <polygon points="1,1 9,5 1,9" fill="white" />
          </svg>
          <span style={{ color: "#fff", fontSize: "0.6rem", fontFamily: "var(--font-nunito)", fontWeight: 700, letterSpacing: "0.08em" }}>체험하기</span>
        </div>
      </div>

      <div className="p-5" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-base flex-1 truncate" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontWeight: 700 }}>
            {project.title}
          </h3>
          {project.contentType && CONTENT_TYPE_MAP[project.contentType] && (
            <span
              className="shrink-0 px-2 py-0.5 rounded-full text-xs font-bold"
              style={{
                background: "var(--blue-tint)",
                border: "1px solid var(--border-bright)",
                color: "var(--blue-bright)",
                fontFamily: "var(--font-nunito)",
                fontSize: "0.6rem",
                letterSpacing: "0.04em",
              }}
            >
              {CONTENT_TYPE_MAP[project.contentType].emoji} {CONTENT_TYPE_MAP[project.contentType].label}
            </span>
          )}
        </div>
        <p className="text-sm leading-relaxed mb-4 line-clamp-2" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontWeight: 400 }}>
          {project.description}
        </p>
        <div className="flex flex-wrap gap-2">
          {project.tags.map((tag) => <TagBadge key={tag} tag={tag} />)}
        </div>
      </div>

      <div
        className="absolute top-0 left-0 right-0 h-0.5 transition-opacity duration-300 rounded-t-2xl"
        style={{
          background: "linear-gradient(90deg, transparent, var(--blue), var(--blue-bright), var(--blue), transparent)",
          opacity: hovered ? 1 : 0,
        }}
      />
    </div>
  );
}
