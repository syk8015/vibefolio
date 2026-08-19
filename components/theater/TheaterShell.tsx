"use client";

import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n/client";
import Image from "next/image";
import type { Project } from "@/lib/data";
import { buildIdentityLine } from "@/lib/identityLine";
import TheaterStage from "./TheaterStage";
import { MeishiBig, MeishiInline, type MeishiProfile } from "./Meishi";

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
          unoptimized /* user-supplied thumbnail URL — skip optimizer (any host, no SSRF) */
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
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--surface-soft)"; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
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
        <Image src={project.thumbnail} unoptimized alt={project.title} fill sizes="64px" style={{ objectFit: "cover" }} />
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
  profileUrl: string;
  projects: Project[];
  initialActiveIndex: number;
  socialLinks: string[];
  // Landing PiP showcase — render the card's own URL as plain text so there's
  // no way to navigate away from the embedded profile.
  showcase?: boolean;
}

export default function TheaterShell({ profile, profileUrl, projects, initialActiveIndex, socialLinks, showcase = false }: ShellProps) {
  const [activeIndex, setActiveIndex] = useState(
    Math.min(Math.max(initialActiveIndex, 0), Math.max(projects.length - 1, 0))
  );
  const { t, locale } = useT();

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
            {t.theater.emptyTitle}
          </p>
          <p
            className="text-sm"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontWeight: 400 }}
          >
            {t.theater.emptyBody}
          </p>
        </div>
      </section>
    );
  }

  const activeProject = projects[activeIndex];
  const total = projects.length;
  // 모바일 히어로 정체성 한 줄 — 기존 프로젝트 데이터에서 파생(새 DB 필드 없음).
  // 데스크탑 경로는 이 값을 사용하지 않으므로 영향 없음.
  const identity = useMemo(
    () => buildIdentityLine(projects, { name: profile.name, bio: profile.bio }, locale),
    [projects, profile.name, profile.bio, locale]
  );
  const goPrev = () => setActiveIndex((i) => (i - 1 + total) % total);
  const goNext = () => setActiveIndex((i) => (i + 1) % total);

  return (
    <>
      {/* ───────────────────── MOBILE ───────────────────── */}
      <div className="md:hidden">
        {/* Stage runs full-bleed under the nav — 풀블리드 앵비언트 히어로 + 자동 한 줄. */}
        <TheaterStage
          project={activeProject}
          index={activeIndex}
          variant="mobile"
          profile={profile}
          identity={identity}
        />

        {/* Reel — 작품이 하나뿐이면 히어로와 같은 것을 한 번 더 보여줄 뿐이라
            모바일에서는 통째로 뺀다(화면이 좁을수록 중복이 크게 느껴진다).
            데스크탑 Up Next는 사이드 칼럼이라 그대로 둔다. */}
        {total > 1 && (
          <>
            <div className="px-5 pt-7">
              <SectionHeader label={t.theater.screenings(total)} />
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
          </>
        )}

        {/* About — 정체성 한 줄은 이미 히어로에 있으므로 압축: 슬림 명함 카드 한 장
            (짧은 bio 2줄 말줄임 + 소셜 + QR). */}
        <div className="px-5 pt-10 pb-8">
          <SectionHeader label={t.theater.aboutLabel} />
          <div className="mt-5">
            <MeishiInline
              profile={profile}
              profileUrl={profileUrl}
              socialLinks={socialLinks}
              bio={profile.bio}
            />
          </div>
        </div>
      </div>

      {/* ───────────────────── DESKTOP ───────────────────── */}
      <div className="hidden md:block">
        <div className="max-w-[1440px] mx-auto px-7 pt-7 pb-14">
          <div
            className="grid gap-7"
            style={{ gridTemplateColumns: "minmax(0, 1.95fr) minmax(0, 1fr)" }}
          >
            {/* LEFT — Stage + tags + navigation */}
            <div>
              <TheaterStage project={activeProject} index={activeIndex} variant="desktop" />

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
                  aria-label={t.theater.prevWork}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-soft)"; e.currentTarget.style.borderColor = "var(--text-primary)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "var(--border-bright)"; }}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    border: "1px solid var(--border-bright)",
                    background: "transparent",
                    cursor: "pointer",
                    color: "var(--text-primary)",
                    fontFamily: "var(--font-mono)",
                    transition: "background-color 0.18s ease, border-color 0.18s ease",
                  }}
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  aria-label={t.theater.nextWork}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    border: "1px solid var(--text-primary)",
                    background: "var(--text-primary)",
                    color: "var(--bg)",
                    cursor: "pointer",
                    fontFamily: "var(--font-mono)",
                    transition: "opacity 0.18s ease",
                  }}
                >
                  →
                </button>
              </div>
            </div>

            {/* RIGHT — Identity card + bio + Up Next list */}
            <aside className="flex flex-col gap-4 min-w-0">
              <MeishiBig
                profile={profile}
                profileUrl={profileUrl}
                socialLinks={socialLinks}
                number={String(total).padStart(2, "0")}
                showcase={showcase}
              />

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

              <div className="mt-2">
                <SectionHeader label={t.theater.upNextLabel} />
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
