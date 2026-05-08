"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { Project } from "@/lib/data";

interface Props {
  project: Project | null;
  onClose: () => void;
}

export default function ProjectModal({ project, onClose }: Props) {
  const [iframeState, setIframeState] = useState<"loading" | "loaded" | "error">("loading");
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closingRef = useRef(false);

  // Push history state when modal opens so browser back button works
  useEffect(() => {
    if (project) {
      closingRef.current = false;
      setIframeState("loading");
      window.history.pushState({ vibefolio: "modal" }, "");
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [project]);

  // Handle browser back button
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

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = project ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [project]);

  // Iframe load failure timeout
  useEffect(() => {
    if (project?.demoUrl && iframeState === "loading") {
      timeoutRef.current = setTimeout(() => setIframeState("error"), 8000);
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [project, iframeState]);

  function handleClose() {
    if (closingRef.current) return;
    closingRef.current = true;
    // Go back in history (triggers popstate which handles onClose)
    window.history.back();
  }

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
        {/* Home button */}
        <button
          onClick={handleClose}
          className="flex items-center gap-2 px-4 py-2 rounded-full font-bold transition-all duration-150"
          style={{
            border: "1px solid var(--border-bright)",
            color: "var(--text-secondary)",
            fontFamily: "var(--font-nunito)",
            fontSize: "0.8rem",
            background: "transparent",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--blue)";
            e.currentTarget.style.color = "var(--blue)";
            e.currentTarget.style.background = "var(--blue-tint)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border-bright)";
            e.currentTarget.style.color = "var(--text-secondary)";
            e.currentTarget.style.background = "transparent";
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          홈으로
        </button>

        <div className="w-px h-5 shrink-0" style={{ background: "var(--border)" }} />

        {/* Title */}
        <h2
          className="text-sm font-bold truncate"
          style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}
        >
          {project.title}
        </h2>

        {/* Tags */}
        <div className="hidden md:flex gap-2 flex-wrap">
          {project.tags.map((tag) => {
            const ai = ["claude", "gpt", "gemini", "ai", "llm"].some((k) =>
              tag.toLowerCase().includes(k)
            );
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

        <div className="ml-auto flex items-center gap-3 shrink-0">
          <span
            className="text-xs font-semibold"
            style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}
          >
            {project.year}
          </span>

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
              새 탭에서 열기
            </a>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 relative overflow-hidden">
        {project.demoUrl ? (
          <>
            {iframeState === "loading" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center z-10" style={{ background: "var(--bg)" }}>
                <div className="relative w-12 h-12 mb-5">
                  <div
                    className="absolute inset-0 rounded-full animate-spin"
                    style={{ border: "2px solid var(--border-bright)", borderTopColor: "var(--blue)" }}
                  />
                </div>
                <p style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontSize: "0.875rem", fontWeight: 600 }}>
                  데모 로딩 중...
                </p>
                <p style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.7rem", marginTop: "0.4rem" }}>
                  {project.demoUrl}
                </p>
              </div>
            )}

            {iframeState === "error" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center z-10" style={{ background: "var(--bg)" }}>
                <ThumbnailBackground project={project} />
                <div className="relative z-10 flex flex-col items-center text-center px-6">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6"
                    style={{ background: "var(--surface)", border: "1px solid var(--border-bright)" }}
                  >
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
                {project.tags.map((tag) => (
                  <span key={tag} className="px-3 py-1 rounded-full text-xs font-bold uppercase" style={{ background: "var(--blue-tint)", border: "1px solid var(--border-bright)", color: "var(--blue-bright)", fontFamily: "var(--font-nunito)" }}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ThumbnailBackground({ project }: { project: Project }) {
  return (
    <div className="absolute inset-0">
      <Image
        src={project.thumbnail}
        alt=""
        fill
        className="object-cover"
        style={{ filter: "blur(3px) brightness(0.2)" }}
        sizes="100vw"
      />
    </div>
  );
}
