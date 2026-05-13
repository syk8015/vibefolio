"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
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

  const [isMounted, setIsMounted] = useState(false);
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
    setVisible(false);
    window.history.back();
    setTimeout(onClose, 250);
  }, [onClose]);

  const handlePrev = useCallback(() => {
    if (currentIndex !== null && currentIndex > 0) onNavigate(currentIndex - 1);
  }, [currentIndex, onNavigate]);

  const handleNext = useCallback(() => {
    if (currentIndex !== null && currentIndex < projects.length - 1) onNavigate(currentIndex + 1);
  }, [currentIndex, projects.length, onNavigate]);

  useEffect(() => {
    if (project) {
      closingRef.current = false;
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

  useEffect(() => {
    if (project && prevProjectId.current !== project.id) {
      setIframeState("loading");
      prevProjectId.current = project.id;
    }
  }, [project]);

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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "ArrowRight") handleNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleClose, handlePrev, handleNext]);

  useEffect(() => { setIsMounted(true); }, []);

  useEffect(() => {
    document.body.style.overflow = project ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [project]);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (project?.demoUrl && iframeState === "loading") {
      timeoutRef.current = setTimeout(() => setIframeState("error"), 8000);
    }
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [project, iframeState]);

  if (!isMounted || !project) return null;

  return createPortal(
    /* Backdrop — hidden on mobile */
    <div
      className="hidden md:flex fixed inset-0 z-[100] items-center justify-center p-8"
      style={{
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(12px)",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.25s ease",
      }}
      onClick={handleClose}
    >
      {/* PiP window */}
      <div
        onClick={e => e.stopPropagation()}
        className="flex flex-col w-full h-full overflow-hidden"
        style={{
          maxWidth: 1200,
          maxHeight: 820,
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 48px 120px rgba(0,0,0,0.75), 0 0 0 1px rgba(77,158,255,0.12)",
          background: "var(--bg)",
          transform: visible ? "scale(1) translateY(0)" : "scale(0.96) translateY(12px)",
          transition: "transform 0.28s cubic-bezier(0.34,1.1,0.64,1)",
        }}
      >
        {/* Title bar */}
        <div
          className="shrink-0 flex items-center gap-3 px-4 py-3"
          style={{
            background: "var(--nav-bg)",
            backdropFilter: "blur(16px)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          {/* Close */}
          <button
            onClick={handleClose}
            className="flex items-center justify-center w-8 h-8 rounded-full shrink-0 transition-colors"
            style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", cursor: "pointer", color: "#ef4444" }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(239,68,68,0.3)")}
            onMouseLeave={e => (e.currentTarget.style.background = "rgba(239,68,68,0.15)")}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>

          {/* Prev / Next */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handlePrev} disabled={!hasPrev} title="이전 (←)"
              className="flex items-center justify-center w-7 h-7 rounded-lg transition-opacity"
              style={{ background: "transparent", border: "1px solid var(--border-bright)", color: "var(--text-secondary)", cursor: hasPrev ? "pointer" : "not-allowed", opacity: hasPrev ? 1 : 0.3 }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M6.5 2L3 5l3.5 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <span className="text-xs font-bold px-1.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", minWidth: "2.8rem", textAlign: "center" }}>
              {(currentIndex ?? 0) + 1} / {projects.length}
            </span>
            <button
              onClick={handleNext} disabled={!hasNext} title="다음 (→)"
              className="flex items-center justify-center w-7 h-7 rounded-lg transition-opacity"
              style={{ background: "transparent", border: "1px solid var(--border-bright)", color: "var(--text-secondary)", cursor: hasNext ? "pointer" : "not-allowed", opacity: hasNext ? 1 : 0.3 }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M3.5 2L7 5l-3.5 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          <div className="w-px h-4 shrink-0" style={{ background: "var(--border)" }} />

          {/* Address bar style title */}
          <div
            className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", minWidth: 0 }}
          >
            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--blue)", boxShadow: "0 0 4px var(--blue)" }} />
            <span className="text-xs font-bold truncate" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
              {project.title}
            </span>
            <span className="text-xs shrink-0" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
              {project.year}
            </span>
          </div>

          {/* Tags */}
          <div className="hidden lg:flex gap-1.5 flex-wrap shrink-0">
            {project.tags.slice(0, 3).map(tag => {
              const ai = AI_KEYWORDS.some(k => tag.toLowerCase().includes(k));
              return (
                <span key={tag} className="px-2 py-0.5 rounded-full" style={{
                  background: ai ? "rgba(234,179,8,0.1)" : "var(--blue-tint)",
                  border: `1px solid ${ai ? "rgba(234,179,8,0.35)" : "var(--border-bright)"}`,
                  color: ai ? "#eab308" : "var(--blue-bright)",
                  fontFamily: "var(--font-nunito)", fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.06em",
                }}>
                  {tag}
                </span>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setInfoOpen(v => !v)} title="프로젝트 정보"
              className="flex items-center justify-center w-7 h-7 rounded-full transition-all"
              style={{ background: infoOpen ? "var(--blue-tint)" : "transparent", border: `1px solid ${infoOpen ? "var(--blue)" : "var(--border-bright)"}`, color: infoOpen ? "var(--blue)" : "var(--text-secondary)", cursor: "pointer" }}
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M7 6.5V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="7" cy="4.5" r="0.75" fill="currentColor"/>
              </svg>
            </button>

            {project.demoUrl && (
              <a
                href={project.demoUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold hover:opacity-80 transition-opacity"
                style={{ background: "var(--blue)", color: "#fff", fontFamily: "var(--font-nunito)", fontSize: "0.72rem", textDecoration: "none" }}
              >
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M2 10L10 2M10 2H5M10 2V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                새 탭
              </a>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex overflow-hidden relative">

          {/* Iframe / demo */}
          <div className="flex-1 relative overflow-hidden">
            {project.demoUrl ? (
              <>
                {iframeState === "loading" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center z-10" style={{ background: "var(--bg)" }}>
                    <div className="relative w-10 h-10 mb-4">
                      <div className="absolute inset-0 rounded-full animate-spin" style={{ border: "2px solid var(--border-bright)", borderTopColor: "var(--blue)" }} />
                    </div>
                    <p style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontSize: "0.85rem", fontWeight: 600 }}>
                      로딩 중...
                    </p>
                  </div>
                )}

                {iframeState === "error" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center z-10" style={{ background: "var(--bg)" }}>
                    <ThumbnailBackground project={project} />
                    <div className="relative z-10 flex flex-col items-center text-center px-6">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5" style={{ background: "var(--surface)", border: "1px solid var(--border-bright)" }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                          <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="var(--blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <h3 className="text-lg font-bold mb-2" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
                        미리보기를 표시할 수 없어요
                      </h3>
                      <p className="mb-5 text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", lineHeight: 1.7 }}>
                        이 사이트는 iframe 표시를 차단하고 있어요.
                      </p>
                      <a
                        href={project.demoUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 px-5 py-2.5 rounded-full font-bold hover:opacity-80 transition-opacity"
                        style={{ background: "var(--blue)", color: "#fff", fontFamily: "var(--font-nunito)", fontSize: "0.875rem", textDecoration: "none" }}
                      >
                        <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
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
                  onLoad={() => { if (timeoutRef.current) clearTimeout(timeoutRef.current); setIframeState("loaded"); }}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  style={{ display: iframeState === "error" ? "none" : "block" }}
                  title={project.title}
                />
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <ThumbnailBackground project={project} />
                <div className="relative z-10 flex flex-col items-center text-center px-8 max-w-lg">
                  <div className="px-4 py-1.5 rounded-full mb-6 text-xs font-bold tracking-widest uppercase"
                    style={{ background: "var(--blue-tint)", border: "1px solid var(--blue)", color: "var(--blue-bright)", fontFamily: "var(--font-nunito)" }}>
                    ● Coming Soon
                  </div>
                  <h3 className="text-3xl font-black mb-4" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
                    {project.title}
                  </h3>
                  <p className="text-base leading-relaxed mb-6" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
                    {project.description}
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {project.tags.map(tag => (
                      <span key={tag} className="px-3 py-1 rounded-full text-xs font-bold uppercase"
                        style={{ background: "var(--blue-tint)", border: "1px solid var(--border-bright)", color: "var(--blue-bright)", fontFamily: "var(--font-nunito)" }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Info panel */}
          <div style={{ width: infoOpen ? "264px" : "0px", overflow: "hidden", transition: "width 0.28s cubic-bezier(0.4,0,0.2,1)", borderLeft: "1px solid var(--border)", background: "var(--surface)", flexShrink: 0 }}>
            <div className="w-[264px] p-5 flex flex-col gap-4 h-full overflow-y-auto">
              <div className="relative w-full aspect-video rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                <Image src={project.thumbnail} alt={project.title} fill className="object-cover" sizes="264px" />
              </div>

              <div>
                <p className="text-xs font-bold mb-1" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  {project.year}
                </p>
                <h3 className="text-sm font-black leading-snug" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
                  {project.title}
                </h3>
              </div>

              {project.description && (
                <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
                  {project.description}
                </p>
              )}

              {project.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {project.tags.map(tag => {
                    const ai = AI_KEYWORDS.some(k => tag.toLowerCase().includes(k));
                    return (
                      <span key={tag} className="px-2 py-0.5 rounded-full text-xs font-bold uppercase" style={{
                        background: ai ? "rgba(234,179,8,0.1)" : "var(--blue-tint)",
                        border: `1px solid ${ai ? "rgba(234,179,8,0.35)" : "var(--border-bright)"}`,
                        color: ai ? "#eab308" : "var(--blue-bright)",
                        fontFamily: "var(--font-nunito)", letterSpacing: "0.06em",
                      }}>
                        {tag}
                      </span>
                    );
                  })}
                </div>
              )}

              {project.comment && (
                <div className="p-3 rounded-xl text-xs leading-relaxed" style={{ background: "var(--blue-tint)", border: "1px solid var(--border-bright)", color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
                  💬 {project.comment}
                </div>
              )}

              <div className="flex gap-2 mt-auto pt-2">
                <button onClick={handlePrev} disabled={!hasPrev}
                  className="flex-1 py-2 rounded-xl text-xs font-bold"
                  style={{ border: "1px solid var(--border-bright)", color: "var(--text-secondary)", background: "transparent", fontFamily: "var(--font-nunito)", cursor: hasPrev ? "pointer" : "not-allowed", opacity: hasPrev ? 1 : 0.35 }}>
                  ← 이전
                </button>
                <button onClick={handleNext} disabled={!hasNext}
                  className="flex-1 py-2 rounded-xl text-xs font-bold"
                  style={{ border: "1px solid var(--border-bright)", color: "var(--text-secondary)", background: "transparent", fontFamily: "var(--font-nunito)", cursor: hasNext ? "pointer" : "not-allowed", opacity: hasNext ? 1 : 0.35 }}>
                  다음 →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ThumbnailBackground({ project }: { project: Project }) {
  return (
    <div className="absolute inset-0">
      <Image src={project.thumbnail} alt="" fill className="object-cover" style={{ filter: "blur(3px) brightness(0.2)" }} sizes="100vw" />
    </div>
  );
}
