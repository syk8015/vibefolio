"use client";

import { useEffect, useRef, useState } from "react";
import ProjectCard from "./ProjectCard";
import ProjectModal from "./ProjectModal";
import type { Project } from "@/lib/data";

type Layout = "grid" | "list";
type Phase = "idle" | "exit" | "entering";

function CardWithBubble({
  project,
  index,
  layout,
  phase,
  onClick,
}: {
  project: Project;
  index: number;
  layout: Layout;
  phase: Phase;
  onClick: () => void;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const isLeft = layout === "grid" ? index % 2 === 0 : true;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !project.comment) return;
    const observer = new IntersectionObserver(
      ([entry]) => setActive(entry.isIntersecting),
      { rootMargin: "0px 0px -50% 0px", threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [project.comment]);

  const style: React.CSSProperties =
    phase === "exit"
      ? {
          opacity: 0,
          transform: "translateY(10px) scale(0.97)",
          transition: "opacity 0.18s ease, transform 0.18s ease",
          pointerEvents: "none",
        }
      : phase === "entering"
      ? {
          opacity: 1,
          transform: "translateY(0) scale(1)",
          transition: `opacity 0.22s ease ${index * 38}ms, transform 0.22s ease ${index * 38}ms`,
        }
      : {
          opacity: 1,
          transform: "translateY(0) scale(1)",
        };

  return (
    <div style={style} className="relative">
      <ProjectCard project={project} layout={layout} onClick={onClick} />
      <div ref={sentinelRef} className="absolute top-0 left-0 w-full h-px pointer-events-none" />
      {project.comment && (
        <div
          className={`speech-bubble ${isLeft ? "left" : "right"} ${
            active ? "visible-bubble" : "hidden-bubble"
          } hidden xl:block`}
        >
          {project.comment}
        </div>
      )}
    </div>
  );
}

function LayoutToggle({
  layout,
  onSwitch,
}: {
  layout: Layout;
  onSwitch: (l: Layout) => void;
}) {
  return (
    <div
      className="relative flex items-center gap-1 p-1 rounded-xl"
      style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
    >
      {/* Sliding pill */}
      <div
        className="absolute top-1 bottom-1 rounded-lg"
        style={{
          width: "calc(50% - 4px)",
          background: "var(--blue-tint)",
          border: "1px solid var(--border-bright)",
          left: layout === "grid" ? "4px" : "calc(50%)",
          transition: "left 0.28s cubic-bezier(0.34,1.4,0.64,1)",
        }}
      />
      <button
        onClick={() => onSwitch("grid")}
        title="그리드 보기"
        className="relative z-10 flex items-center justify-center w-8 h-8 rounded-lg"
        style={{ cursor: "pointer", background: "transparent", border: "none" }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="1" width="6" height="6" rx="1.5" fill={layout === "grid" ? "var(--blue)" : "var(--text-secondary)"} />
          <rect x="9" y="1" width="6" height="6" rx="1.5" fill={layout === "grid" ? "var(--blue)" : "var(--text-secondary)"} />
          <rect x="1" y="9" width="6" height="6" rx="1.5" fill={layout === "grid" ? "var(--blue)" : "var(--text-secondary)"} />
          <rect x="9" y="9" width="6" height="6" rx="1.5" fill={layout === "grid" ? "var(--blue)" : "var(--text-secondary)"} />
        </svg>
      </button>
      <button
        onClick={() => onSwitch("list")}
        title="리스트 보기"
        className="relative z-10 flex items-center justify-center w-8 h-8 rounded-lg"
        style={{ cursor: "pointer", background: "transparent", border: "none" }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="2" width="14" height="3.5" rx="1.5" fill={layout === "list" ? "var(--blue)" : "var(--text-secondary)"} />
          <rect x="1" y="6.5" width="14" height="3.5" rx="1.5" fill={layout === "list" ? "var(--blue)" : "var(--text-secondary)"} />
          <rect x="1" y="11" width="14" height="3.5" rx="1.5" fill={layout === "list" ? "var(--blue)" : "var(--text-secondary)"} />
        </svg>
      </button>
    </div>
  );
}

export default function ProjectsSection({ projects }: { projects: Project[] }) {
  const [layout, setLayout] = useState<Layout>("grid");       // controls toggle UI
  const [displayLayout, setDisplayLayout] = useState<Layout>("grid"); // controls actual grid
  const [phase, setPhase] = useState<Phase>("idle");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  function switchLayout(next: Layout) {
    if (next === layout) return;
    clearTimers();
    setLayout(next);       // toggle button updates immediately
    setPhase("exit");

    // After cards fade out, swap layout then trigger enter
    const t1 = setTimeout(() => {
      setDisplayLayout(next);
      // Double RAF: let React render the new layout while cards are invisible,
      // then start the enter animation
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setPhase("entering");
          const t2 = setTimeout(
            () => setPhase("idle"),
            projects.length * 38 + 250
          );
          timers.current.push(t2);
        });
      });
    }, 190);

    timers.current.push(t1);
  }

  useEffect(() => () => clearTimers(), []);

  return (
    <>
      {/* Works header */}
      <div className="mb-10">
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
          <div
            className="flex items-center gap-2 px-4 py-1.5 rounded-full"
            style={{ border: "1px solid var(--border-bright)", background: "var(--blue-tint)" }}
          >
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--blue)", boxShadow: "0 0 6px var(--blue)" }} />
            <span className="text-xs tracking-[0.3em] uppercase font-bold" style={{ color: "var(--blue-bright)", fontFamily: "var(--font-nunito)" }}>
              Works
            </span>
          </div>
          <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
          <LayoutToggle layout={layout} onSwitch={switchLayout} />
        </div>
      </div>

      {/* Cards */}
      <div
        className={
          displayLayout === "grid"
            ? "grid grid-cols-1 md:grid-cols-2 gap-10"
            : "flex flex-col gap-10"
        }
      >
        {projects.map((project, index) => (
          <CardWithBubble
            key={project.id}
            project={project}
            index={index}
            layout={displayLayout}
            phase={phase}
            onClick={() => setSelectedIndex(index)}
          />
        ))}
      </div>

      <ProjectModal
        projects={projects}
        currentIndex={selectedIndex}
        onClose={() => setSelectedIndex(null)}
        onNavigate={setSelectedIndex}
      />
    </>
  );
}
