"use client";

import { useState } from "react";
import Image from "next/image";
import type { Project } from "@/lib/data";
import TheaterStage from "./TheaterStage";
import { MeishiBig, MeishiInline, type MeishiProfile } from "./Meishi";
import SocialBadge from "@/components/SocialBadge";

// A horizontal divider with a centered label — used to break the body
// into sections without resorting to heavy headers.
function SectionHeader({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      <span
        style={{
          fontFamily: "var(--font-nunito)",
          fontSize: 10,
          letterSpacing: "0.28em",
          textTransform: "uppercase",
          fontWeight: 800,
          color: "var(--text-primary)",
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );
}

// A small thumbnail tile that shows just enough of the project's
// visual identity to be recognizable in the reel. Active state lifts
// the project onto the stage and is signalled by a dark outline.
function ReelTile({
  project,
  index,
  active,
  onClick,
}: {
  project: Project;
  index: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: "0 0 auto",
        width: 138,
        padding: 0,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        opacity: active ? 1 : 0.7,
        transition: "opacity 0.2s",
        fontFamily: "var(--font-nunito)",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: 86,
          borderRadius: 8,
          overflow: "hidden",
          background: "#0a0a0a",
          outline: active ? "2px solid var(--text-primary)" : "1px solid var(--border)",
          outlineOffset: active ? 2 : 0,
        }}
      >
        <Image
          src={project.thumbnail}
          alt={project.title}
          fill
          sizes="138px"
          style={{ objectFit: "cover" }}
        />
        {active && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.4)",
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                background: "rgba(255,255,255,0.95)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: "8px solid #1a1612",
                  borderTop: "5px solid transparent",
                  borderBottom: "5px solid transparent",
                  marginLeft: 2,
                }}
              />
            </div>
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 7 }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.12em",
          }}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <span
          style={{
            fontWeight: 700,
            fontSize: 11,
            color: "var(--text-primary)",
            lineHeight: 1.15,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {project.title}
        </span>
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "0.12em",
          color: "var(--text-muted)",
          textTransform: "uppercase",
          marginTop: 1,
        }}
      >
        {project.year}
      </div>
    </button>
  );
}

// Desktop "Up Next" list row — same data as the mobile reel tile, but
// laid out horizontally so it reads as a playlist queue.
function UpNextRow({
  project,
  index,
  active,
  onClick,
}: {
  project: Project;
  index: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? "var(--surface-soft)" : "transparent",
        border: "none",
        cursor: "pointer",
        padding: "10px 12px",
        borderRadius: 10,
        display: "flex",
        alignItems: "center",
        gap: 12,
        textAlign: "left",
        fontFamily: "var(--font-nunito)",
        transition: "background-color 0.18s ease",
      }}
    >
      <div
        style={{
          width: 64,
          height: 40,
          borderRadius: 5,
          overflow: "hidden",
          background: "#0a0a0a",
          position: "relative",
          flexShrink: 0,
        }}
      >
        <Image src={project.thumbnail} alt={project.title} fill sizes="64px" style={{ objectFit: "cover" }} />
        {active && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span className="vf-live-dot" style={{ width: 6, height: 6 }} />
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--text-muted)",
              letterSpacing: "0.12em",
            }}
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          <span
            style={{
              fontWeight: 700,
              fontSize: 13,
              color: "var(--text-primary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {project.title}
          </span>
        </div>
        {project.description && (
          <div
            style={{
              fontSize: 11,
              color: "var(--text-secondary)",
              marginTop: 1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {project.description}
          </div>
        )}
      </div>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--text-muted)",
          letterSpacing: "0.1em",
        }}
      >
        {project.year}
      </span>
    </button>
  );
}

interface ShellProps {
  profile: MeishiProfile;
  projects: Project[];
  initialActiveIndex: number;
  socialLinks: string[];
}

export default function TheaterShell({ profile, projects, initialActiveIndex, socialLinks }: ShellProps) {
  const [activeIndex, setActiveIndex] = useState(
    Math.min(Math.max(initialActiveIndex, 0), Math.max(projects.length - 1, 0))
  );

  if (projects.length === 0) {
    // Empty state — kept inline rather than spinning up a separate
    // component since it only appears on brand-new profiles.
    return (
      <section className="relative max-w-5xl mx-auto px-6 py-24 z-10">
        <div className="flex flex-col items-center justify-center text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
            style={{ background: "var(--blue-tint)", border: "1px solid var(--border-bright)" }}
          >
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M6 8h16M6 14h10M6 20h7" stroke="var(--blue)" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="21" cy="20" r="5" stroke="var(--blue)" strokeWidth="1.8" />
              <path d="M24 23l2.5 2.5" stroke="var(--blue)" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-2xl font-black mb-1" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
            {profile.name || profile.username}
          </h1>
          <p
            className="text-xs tracking-[0.2em] uppercase mb-6"
            style={{ color: "var(--blue)", fontFamily: "var(--font-nunito)" }}
          >
            @{profile.username}
          </p>
          <p
            className="text-base font-black mb-2"
            style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}
          >
            아직 공개된 프로젝트가 없어요
          </p>
          <p
            className="text-sm"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontWeight: 400 }}
          >
            곧 새로운 작업물이 올라올 예정이에요.
          </p>
        </div>
      </section>
    );
  }

  const activeProject = projects[activeIndex];
  const total = projects.length;
  const goPrev = () => setActiveIndex((i) => (i - 1 + total) % total);
  const goNext = () => setActiveIndex((i) => (i + 1) % total);

  return (
    <>
      {/* ───────────────────── MOBILE ───────────────────── */}
      <div className="md:hidden">
        {/* Stage runs full-bleed under the nav. */}
        <TheaterStage project={activeProject} profile={profile} index={activeIndex} variant="mobile" />

        {/* Reel */}
        <div className="px-5 pt-7">
          <SectionHeader label={`상영 목록 · ${total} works`} />
        </div>
        <div
          className="flex gap-2.5 px-4 pt-4 pb-2 overflow-x-auto"
          style={{
            scrollbarWidth: "thin",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {projects.map((p, i) => (
            <ReelTile
              key={p.id}
              project={p}
              index={i}
              active={i === activeIndex}
              onClick={() => setActiveIndex(i)}
            />
          ))}
        </div>

        {/* About */}
        <div className="px-5 pt-10 pb-8">
          <SectionHeader label="명함 · About" />
          <div className="mt-5">
            <MeishiInline profile={profile} />
          </div>
          {profile.bio && (
            <p
              className="mt-5 whitespace-pre-line"
              style={{
                fontSize: 13,
                lineHeight: 1.7,
                color: "var(--text-secondary)",
                fontFamily: "var(--font-nunito)",
                fontWeight: 400,
              }}
            >
              {profile.bio}
            </p>
          )}
          {socialLinks.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-5">
              {socialLinks.map((url, i) => (
                <SocialBadge key={i} url={url} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ───────────────────── DESKTOP ───────────────────── */}
      <div className="hidden md:block">
        <div className="max-w-[1280px] mx-auto px-7 pt-7 pb-14">
          <div
            className="grid gap-7"
            style={{ gridTemplateColumns: "minmax(0, 1.55fr) minmax(0, 1fr)" }}
          >
            {/* LEFT — Stage + tags + navigation */}
            <div>
              <TheaterStage project={activeProject} profile={profile} index={activeIndex} variant="desktop" />

              <div className="flex items-center gap-3 mt-4">
                <div className="flex flex-wrap gap-1.5">
                  {activeProject.tags.map((t) => (
                    <span
                      key={t}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "3px 9px",
                        borderRadius: 999,
                        background: "var(--surface-soft)",
                        color: "var(--text-secondary)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        fontWeight: 700,
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={goPrev}
                  aria-label="이전 작품"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    border: "1px solid var(--border-bright)",
                    background: "transparent",
                    cursor: "pointer",
                    color: "var(--text-primary)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  aria-label="다음 작품"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    border: "1px solid var(--text-primary)",
                    background: "var(--text-primary)",
                    color: "var(--bg)",
                    cursor: "pointer",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  →
                </button>
              </div>
            </div>

            {/* RIGHT — Identity card + bio + Up Next list */}
            <aside className="flex flex-col gap-4 min-w-0">
              <MeishiBig profile={profile} number={String(total).padStart(2, "0")} />

              {profile.bio && (
                <p
                  className="whitespace-pre-line"
                  style={{
                    fontSize: 13,
                    lineHeight: 1.7,
                    color: "var(--text-secondary)",
                    margin: 0,
                    fontFamily: "var(--font-nunito)",
                    fontWeight: 400,
                  }}
                >
                  {profile.bio}
                </p>
              )}

              {socialLinks.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {socialLinks.map((url, i) => (
                    <SocialBadge key={i} url={url} />
                  ))}
                </div>
              )}

              <div className="mt-2">
                <SectionHeader label="상영 목록 · Up Next" />
              </div>
              <div className="flex flex-col gap-0">
                {projects.map((p, i) => (
                  <UpNextRow
                    key={p.id}
                    project={p}
                    index={i}
                    active={i === activeIndex}
                    onClick={() => setActiveIndex(i)}
                  />
                ))}
              </div>
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}
