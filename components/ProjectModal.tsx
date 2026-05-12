"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";
import type { Project } from "@/lib/data";

interface Props {
  projects: Project[];
  currentIndex: number | null;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

const AI_KEYWORDS = ["claude", "gpt", "gemini", "llm", "ai"];

export default function ProjectModal({ projects, currentIndex, onClose, onNavigate }: Props) {
  const project = currentIndex !== null ? projects[currentIndex] : null;

  const [iframeState, setIframeState] = useState<"loading" | "loaded" | "error">("loading");
  const [visible, setVisible] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closingRef = useRef(false);
  const prevProjectId = useRef<number | null>(null);

  const hasPrev = currentIndex !== null && currentIndex > 0;
  const hasNext = currentIndex !== null && currentIndex < projects.length - 1;

  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    window.history.back();
  }, []);

  const handlePrev = useCallback(() => {
    if (currentIndex !== null && currentIndex > 0) onNavigate(currentIndex - 1);
  }, [currentIndex, onNavigate]);

  const handleNext = useCallback(() => {
    if (currentIndex !== null && currentIndex < projects.length - 1) onNavigate(currentIndex + 1);
  }, [currentIndex, projects.length, onNavigate]);

  // Open / close animation
  useEffect(() => {
    if (project) {
      closingRef.current = false;
      // Only reset iframe state if project actually changed
      if (prevProjectId.current !== project.id) {
        setIframeState("loading");
        prevProjectId.current = project.id;
      }
      window.history.pushState({ vibefolio: "modal" }, "");
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
      setInfoOpen(false);
    }
  }, [project]);

  // Reset iframe on project change
  useEffect(() => {
    if (project && prevProjectId.current !== project.id) {
      setIframeState("loading");
      prevProjectId.current = project.id;
    }
  }, [project]);

  // Browser back button
  useEffect(() => {
    const handler = () => {
      if (project && !closingRef.current) {
        closingRef.current = true;
        setVisible(false);
        setTimeout(onClose, 250);
      }
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [project, onClose]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "ArrowRight") handleNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleClose, handlePrev, handleNext]);

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = project ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [project]);

  // Iframe failure timeout
  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (project?.demoUrl && iframeState === "loading") {
      timeoutRef.current = setTimeout(() => setIframeState("error"), 8000);
    }
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [project, iframeState]);

  if (!project) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      style={{
        background: "var(--bg)",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(16px)",
        transition: "opacity 0.25s ease, transform 0.25s ease",
      }}
    >
      {/* Top bar */}
      <div
        className="shrink-0 flex items-center gap-3 px-5 py-3"
        style={{
          background: "var(--nav-bg)",
          backdropFilter: "blur(16px)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {/* Back */}
        <button
          onClick={handleClose}
          className="flex items-center gap-2 px-4 py-2 rounded-full font-bold transition-all duration-150 shrink-0"
          style={{
            border: "1px solid var(--border-bright)",
            color: "var(--text-secondary)",
            fontFamily: "var(--font-nunito)",
            fontSize: "0.8rem",
            background: "transparent",
            cursor: "pointer",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--blue)"; e.currentTarget.style.color = "var(--blue)"; e.currentTarget.style.background = "var(--blue-tint)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-bright)"; e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.background = "transparent"; }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          홈으로
        </button>

        <div className="w-px h-5 shrink-0" style={{ background: "var(--border)" }} />

        {/* Prev / Next */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handlePrev}
            disabled={!hasPrev}
            title="이전 프로젝트 (←)"
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-150"
            style={{
              background: "transparent",
              border: "1px solid var(--border-bright)",
              color: hasPrev ? "var(--text-secondary)" : "var(--text-muted)",
              cursor: hasPrev ? "pointer" : "not-allowed",
              opacity: hasPrev ? 1 : 0.35,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M7.5 2L3.5 6L7.5 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <span className="text-xs font-bold px-2" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", minWidth: "3.5rem", textAlign: "center" }}>
            {(currentIndex ?? 0) + 1} / {projects.length}
          </span>
          <button
            onClick={handleNext}
            disabled={!hasNext}
            title="다음 프로젝트 (→)"
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-150"
            style={{
              background: "transparent",
              border: "1px solid var(--border-bright)",
              color: hasNext ? "var(--text-secondary)" : "var(--text-muted)",
              cursor: hasNext ? "pointer" : "not-allowed",
              opacity: hasNext ? 1 : 0.35,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M4.5 2L8.5 6L4.5 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        <div className="w-px h-5 shrink-0" style={{ background: "var(--border)" }} />

        {/* Title */}
        <h2
          className="text-sm font-bold truncate"
          style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}
        >
          {project.title}
        </h2>

        {/* Tags — hidden on small screens */}
        <div className="hidden md:flex gap-2 flex-wrap">
          {project.tags.map((tag) => {
            const ai = AI_KEYWORDS.some(k => tag.toLowerCase().includes(k));
            return (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-full"
                style={{
                  background: ai ? "rgba(234,179,8,0.1)" : "var(--blue-tint)",
                  border: `1px solid ${ai ? "rgba(234,179,8,0.35)" : "var(--border-bright)"}`,
                  color: ai ? "#eab308" : "var(--blue-bright)",
                  fontFamily: "var(--font-nunito)",
                  fontSize: "0.6rem",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                {tag}
              </span>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <span className="text-xs font-semibold hidden sm:block" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
            {project.year}
          </span>

          {/* Info toggle */}
          <button
            onClick={() => setInfoOpen(v => !v)}
            title="프로젝트 정보"
            className="flex items-center justify-center w-8 h-8 rounded-full transition-all duration-150"
            style={{
              background: infoOpen ? "var(--blue-tint)" : "transparent",
              border: `1px solid ${infoOpen ? "var(--blue)" : "var(--border-bright)"}`,
              color: infoOpen ? "var(--blue)" : "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M7 6.5V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="7" cy="4.5" r="0.75" fill="currentColor"/>
            </svg>
          </button>

          {project.demoUrl && (
            <a
              href={project.demoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold transition-opacity hover:opacity-80"
              style={{
                background: "var(--blue)",
                color: "#fff",
                fontFamily: "var(--font-nunito)",
                fontSize: "0.75rem",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 10L10 2M10 2H5M10 2V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="hidden sm:inline">새 탭에서 열기</span>
            </a>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* Iframe / demo area */}
        <div className="flex-1 relative overflow-hidden">
          {project.demoUrl ? (
            <>
              {iframeState === "loading" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-10" style={{ background: "var(--bg)" }}>
                  <div className="relative w-12 h-12 mb-5">
                    <div className="absolute inset-0 rounded-full animate-spin" style={{ border: "2px solid var(--border-bright)", borderTopColor: "var(--blue)" }} />
                  </div>
                  <p style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontSize: "0.875rem", fontWeight: 600 }}>
                    데모 로딩 중...
                  </p>
                </div>
              )}

              {iframeState === "error" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-10" style={{ background: "var(--bg)" }}>
                  <ThumbnailBackground project={project} />
                  <div className="relative z-10 flex flex-col items-center text-center px-6">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6" style={{ background: "var(--surface)", border: "1px solid var(--border-bright)" }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="var(--blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold mb-3" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
                      미리보기를 표시할 수 없어요
                    </h3>
                    <p className="mb-6 max-w-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontSize: "0.9rem", lineHeight: 1.7 }}>
                      이 사이트는 외부 iframe 표시를 차단하고 있어요.<br />새 탭에서 직접 체험해보세요!
                    </p>
                    <a
                      href={project.demoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-6 py-3 rounded-full font-bold hover:opacity-80 transition-opacity"
                      style={{ background: "var(--blue)", color: "#fff", fontFamily: "var(--font-nunito)", fontSize: "0.9rem", textDecoration: "none" }}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2 12L12 2M12 2H6M12 2V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      새 탭에서 열기
                    </a>
                  </div>
                </div>
              )}

              <iframe
                key={project.id}
                src={project.demoUrl}
                className="w-full h-full border-0"
                onLoad={() => {
                  if (timeoutRef.current) clearTimeout(timeoutRef.current);
                  setIframeState("loaded");
                }}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                style={{ display: iframeState === "error" ? "none" : "block" }}
                title={project.title}
              />
            </>
          ) : (
            /* No demo URL — show thumbnail + info */
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <ThumbnailBackground project={project} />
              <div className="relative z-10 flex flex-col items-center text-center px-8 max-w-lg">
                <div
                  className="px-4 py-1.5 rounded-full mb-8 text-xs font-bold tracking-widest uppercase"
                  style={{ background: "var(--blue-tint)", border: "1px solid var(--blue)", color: "var(--blue-bright)", fontFamily: "var(--font-nunito)" }}
                >
                  ● Coming Soon
                </div>
                <h3 className="text-3xl font-black mb-4" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
                  {project.title}
                </h3>
                <p className="text-base leading-relaxed mb-8" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
                  {project.description}
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {project.tags.map(tag => (
                    <span key={tag} className="px-3 py-1 rounded-full text-xs font-bold uppercase" style={{ background: "var(--blue-tint)", border: "1px solid var(--border-bright)", color: "var(--blue-bright)", fontFamily: "var(--font-nunito)" }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Info panel (slides in from right) */}
        <div
          style={{
            width: infoOpen ? "280px" : "0px",
            overflow: "hidden",
            transition: "width 0.28s cubic-bezier(0.4,0,0.2,1)",
            borderLeft: "1px solid var(--border)",
            background: "var(--surface)",
            flexShrink: 0,
          }}
        >
          <div className="w-[280px] p-6 flex flex-col gap-5 h-full overflow-y-auto">
            {/* Thumbnail */}
            <div className="relative w-full aspect-video rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
              <Image src={project.thumbnail} alt={project.title} fill className="object-cover" sizes="280px" />
            </div>

            <div>
              <p className="text-xs font-bold mb-1" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                {project.year}
              </p>
              <h3 className="text-base font-black leading-snug" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
                {project.title}
              </h3>
            </div>

            {project.description && (
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
                {project.description}
              </p>
            )}

            {project.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {project.tags.map(tag => {
                  const ai = AI_KEYWORDS.some(k => tag.toLowerCase().includes(k));
                  return (
                    <span
                      key={tag}
                      className="px-2.5 py-1 rounded-full text-xs font-bold uppercase"
                      style={{
                        background: ai ? "rgba(234,179,8,0.1)" : "var(--blue-tint)",
                        border: `1px solid ${ai ? "rgba(234,179,8,0.35)" : "var(--border-bright)"}`,
                        color: ai ? "#eab308" : "var(--blue-bright)",
                        fontFamily: "var(--font-nunito)",
                        letterSpacing: "0.08em",
                      }}
                    >
                      {tag}
                    </span>
                  );
                })}
              </div>
            )}

            {project.comment && (
              <div
                className="p-3 rounded-xl text-sm leading-relaxed"
                style={{ background: "var(--blue-tint)", border: "1px solid var(--border-bright)", color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}
              >
                💬 {project.comment}
              </div>
            )}

            {/* Nav buttons inside panel */}
            <div className="flex gap-2 mt-auto pt-2">
              <button
                onClick={handlePrev}
                disabled={!hasPrev}
                className="flex-1 py-2 rounded-xl text-sm font-bold transition-opacity"
                style={{
                  border: "1px solid var(--border-bright)",
                  color: "var(--text-secondary)",
                  background: "transparent",
                  fontFamily: "var(--font-nunito)",
                  cursor: hasPrev ? "pointer" : "not-allowed",
                  opacity: hasPrev ? 1 : 0.35,
                }}
              >
                ← 이전
              </button>
              <button
                onClick={handleNext}
                disabled={!hasNext}
                className="flex-1 py-2 rounded-xl text-sm font-bold transition-opacity"
                style={{
                  border: "1px solid var(--border-bright)",
                  color: "var(--text-secondary)",
                  background: "transparent",
                  fontFamily: "var(--font-nunito)",
                  cursor: hasNext ? "pointer" : "not-allowed",
                  opacity: hasNext ? 1 : 0.35,
                }}
              >
                다음 →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThumbnailBackground({ project }: { project: Project }) {
  return (
    <div className="absolute inset-0">
      <Image src={project.thumbnail} alt="" fill className="object-cover" style={{ filter: "blur(3px) brightness(0.2)" }} sizes="100vw" />
    </div>
  );
}
