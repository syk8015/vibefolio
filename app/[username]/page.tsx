import { notFound } from "next/navigation";
import Link from "next/link";
import { cache } from "react";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import ProjectsSection from "@/components/ProjectsSection";
import SocialBadge from "@/components/SocialBadge";
import CopyLinkButton from "@/components/CopyLinkButton";
import PortfolioModeToggle from "@/components/PortfolioModeToggle";
import type { Project } from "@/lib/data";
import ViewTracker from "@/components/ViewTracker";
import ThemeToggle from "@/components/ThemeToggle";
import ViewportModeToggle from "@/components/ViewportModeToggle";
import ViewportFrame from "@/components/ViewportFrame";
import EmbedLoginButton from "@/components/EmbedLoginButton";
import FeaturedHero from "@/components/FeaturedHero";

const getProfile = cache(async (username: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .single();
  if (error || !data) return null;
  return data as Profile;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const profile = await getProfile(username);
  if (!profile) return {};

  const name = profile.name || username;
  const description = profile.bio || `${name}의 Vibefolio — 바이브코더 포트폴리오`;
  const url = `https://vibefolio.vercel.app/${username}`;

  return {
    title: `${name} | Vibefolio`,
    description,
    openGraph: {
      title: `${name} | Vibefolio`,
      description,
      url,
      type: "profile",
      siteName: "Vibefolio",
    },
    twitter: {
      card: "summary_large_image",
      title: `${name} | Vibefolio`,
      description,
    },
  };
}

interface Profile {
  id: string;
  username: string;
  name: string | null;
  bio: string | null;
  twitter: string | null;
  github: string | null;
  avatar_url: string | null;
  social_links: string[] | null;
  custom_mode: boolean | null;
  custom_css: string | null;
}


interface DBProject {
  id: string;
  title: string;
  description: string | null;
  type: "image" | "video";
  thumbnail: string | null;
  year: string | null;
  tags: string[];
  demo_url: string | null;
  comment: string | null;
  content_type: string | null;
  sort_order: number;
  is_featured: boolean | null;
  video_url: string | null;
}

export default async function UserPortfolioPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ embed?: string }>;
}) {
  const { username } = await params;
  const { embed } = await searchParams;
  const isEmbed = embed === "1";
  const supabase = await createClient();

  const profile = await getProfile(username);
  if (!profile) notFound();

  const { data: dbProjects } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", profile.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  const projects: Project[] = (dbProjects as DBProject[] ?? []).map((p, i) => ({
    id: i + 1,
    title: p.title,
    description: p.description ?? "",
    type: p.type,
    thumbnail: p.thumbnail || `https://picsum.photos/seed/${p.id}/800/600`,
    year: p.year ?? new Date().getFullYear().toString(),
    tags: p.tags ?? [],
    demoUrl: p.demo_url ?? undefined,
    comment: p.comment ?? undefined,
    contentType: p.content_type ?? null,
    isFeatured: p.is_featured ?? false,
    videoUrl: p.video_url ?? undefined,
  }));

  // Pick featured: explicit flag wins, otherwise default to the first project.
  const featuredIndex = projects.findIndex(pr => pr.isFeatured);
  const featured: Project | null =
    featuredIndex >= 0 ? projects[featuredIndex] : (projects[0] ?? null);
  const otherProjects: Project[] = featured
    ? projects.filter(pr => pr.id !== featured.id)
    : projects;

  const p = profile;
  const { data: { user: rawUser } } = await supabase.auth.getUser();
  // In embed (mobile-preview iframe) mode, render as if the visitor is not
  // logged in so the owner can see what an anonymous visitor would see.
  const currentUser = isEmbed ? null : rawUser;
  const isOwner = currentUser?.id === p.id;

  return (
    <main className="relative min-h-screen" style={{ background: "var(--bg)" }}>
      <ViewTracker username={p.username} />

      {/* Nav */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-8 py-3 md:py-4"
        style={{
          background: "var(--nav-bg)",
          backdropFilter: "blur(16px)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {isEmbed ? (
          <div className="flex items-center gap-3" style={{ cursor: "default" }}>
            <div
              className="w-2 h-2 rounded-full"
              style={{ background: "var(--blue)", boxShadow: "0 0 8px var(--blue)" }}
            />
            <span
              className="font-black text-base"
              style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}
            >
              Vibefolio
            </span>
          </div>
        ) : (
          <Link href="/" className="flex items-center gap-3" style={{ textDecoration: "none" }}>
            <div
              className="w-2 h-2 rounded-full"
              style={{ background: "var(--blue)", boxShadow: "0 0 8px var(--blue)" }}
            />
            <span
              className="font-black text-base"
              style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}
            >
              Vibefolio
            </span>
          </Link>
        )}
        <div className="flex items-center gap-3">
          <span
            className="hidden sm:inline text-xs tracking-widest uppercase"
            style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}
          >
            {projects.length} Projects
          </span>
          {isOwner && !isEmbed && (
            <div className="hidden md:block">
              <ViewportModeToggle />
            </div>
          )}
          <ThemeToggle />
          <CopyLinkButton username={p.username} />

          {/* Auth pill */}
          {isOwner ? (
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-opacity hover:opacity-80"
              style={{
                background: "var(--blue)",
                color: "#fff",
                fontFamily: "var(--font-nunito)",
                textDecoration: "none",
                boxShadow: "0 0 12px var(--blue-glow)",
              }}
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path d="M7.5 1.5l3 3L4 11H1V8L7.5 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              명함 수정
            </Link>
          ) : currentUser ? (
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold transition-opacity hover:opacity-75"
              style={{
                border: "1px solid var(--border-bright)",
                color: "var(--text-secondary)",
                fontFamily: "var(--font-nunito)",
                textDecoration: "none",
                background: "var(--surface)",
              }}
            >
              {currentUser.user_metadata?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentUser.user_metadata.avatar_url as string}
                  alt=""
                  width={16}
                  height={16}
                  style={{ borderRadius: "50%", display: "block", flexShrink: 0 }}
                />
              ) : (
                <div style={{
                  width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                  background: "linear-gradient(135deg, var(--blue), var(--blue-bright))",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.55rem", fontWeight: 900, color: "#fff",
                }}>
                  {(currentUser.user_metadata?.name as string || currentUser.email || "?").charAt(0).toUpperCase()}
                </div>
              )}
              내 명함
            </Link>
          ) : isEmbed ? (
            <EmbedLoginButton />
          ) : (
            <Link
              href="/login"
              className="px-3.5 py-1.5 rounded-full text-xs font-bold transition-opacity hover:opacity-80"
              style={{
                border: "1px solid var(--border-bright)",
                color: "var(--text-secondary)",
                fontFamily: "var(--font-nunito)",
                textDecoration: "none",
              }}
            >
              로그인
            </Link>
          )}
        </div>
      </nav>

      <ViewportFrame username={p.username} enabled={isOwner && !isEmbed}>

      {/* Featured Hero — full-bleed 85vh, project front-and-center */}
      {featured && <FeaturedHero project={featured} />}

      {/* Body: profile (left/top) + other projects (right/bottom) */}
      {projects.length > 0 ? (
        <section className="relative z-10 max-w-7xl mx-auto px-5 md:px-8 py-12 md:py-20">
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,30%)_minmax(0,1fr)] gap-10 md:gap-12">
            {/* Profile (sticky on desktop) */}
            <aside className="md:sticky md:top-24 md:self-start flex flex-col gap-5">
              <div className="vf-anim-avatar relative">
                <div
                  className="vf-ring-spin absolute rounded-full pointer-events-none"
                  style={{
                    inset: "-4px",
                    background: "conic-gradient(from 0deg, var(--blue) 0%, var(--blue-bright) 35%, transparent 55%, transparent 80%, var(--blue) 100%)",
                    opacity: 0.55,
                  }}
                />
                <div
                  className="vf-avatar relative w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center text-3xl md:text-4xl font-black sphere-shadow overflow-hidden z-10"
                  style={{
                    background: "linear-gradient(135deg, var(--blue), var(--blue-bright))",
                    color: "#fff",
                    fontFamily: "var(--font-nunito)",
                    border: "2px solid var(--bg)",
                  }}
                >
                  {p.avatar_url
                    ? <img src={p.avatar_url} alt={p.name || p.username} className="w-full h-full object-cover" />
                    : (p.name || p.username).charAt(0).toUpperCase()}
                </div>
              </div>

              <div>
                <h1
                  className="vf-anim-1 text-2xl md:text-3xl tracking-tight mb-1"
                  style={{ fontFamily: "var(--font-nunito)", color: "var(--text-primary)", fontWeight: 800 }}
                >
                  {p.name || p.username}
                </h1>
                <p
                  className="vf-anim-1 text-xs tracking-[0.2em] uppercase"
                  style={{ color: "var(--blue)", fontFamily: "var(--font-nunito)", fontWeight: 400 }}
                >
                  @{p.username}
                </p>
              </div>

              {p.bio && (
                <p
                  className="vf-anim-2 leading-7 whitespace-pre-line"
                  style={{
                    color: "var(--text-secondary)",
                    fontFamily: "var(--font-nunito)",
                    fontWeight: 400,
                    fontSize: "0.9rem",
                  }}
                >
                  {p.bio}
                </p>
              )}

              {(() => {
                const links: string[] = p.social_links?.length
                  ? p.social_links
                  : [
                      p.twitter ? `https://twitter.com/${p.twitter.replace("@", "")}` : "",
                      p.github ? `https://github.com/${p.github}` : "",
                    ].filter(Boolean);

                if (!links.length) return null;

                return (
                  <div className="vf-anim-3 flex flex-wrap items-center gap-2">
                    {links.map((url, i) => (
                      <SocialBadge key={i} url={url} />
                    ))}
                  </div>
                );
              })()}
            </aside>

            {/* Other projects */}
            <div className="min-w-0">
              {otherProjects.length > 0 ? (
                <ProjectsSection projects={otherProjects} />
              ) : (
                <div
                  className="flex flex-col items-center justify-center py-16 text-center rounded-2xl"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                >
                  <p className="text-sm font-bold mb-1" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
                    다른 작품은 곧 추가될 예정이에요
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
                    위 대표 작품을 먼저 확인해보세요.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      ) : (
        <section className="relative max-w-5xl mx-auto px-6 py-24 z-10">
          <div className="flex flex-col items-center justify-center text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: "var(--blue-tint)", border: "1px solid var(--border-bright)" }}
            >
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path d="M6 8h16M6 14h10M6 20h7" stroke="var(--blue)" strokeWidth="1.8" strokeLinecap="round"/>
                <circle cx="21" cy="20" r="5" stroke="var(--blue)" strokeWidth="1.8"/>
                <path d="M24 23l2.5 2.5" stroke="var(--blue)" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </div>
            <h1
              className="text-2xl font-black mb-1"
              style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}
            >
              {p.name || p.username}
            </h1>
            <p className="text-xs tracking-[0.2em] uppercase mb-6" style={{ color: "var(--blue)", fontFamily: "var(--font-nunito)" }}>
              @{p.username}
            </p>
            <p className="text-base font-black mb-2" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
              아직 공개된 프로젝트가 없어요
            </p>
            <p className="text-sm" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontWeight: 400 }}>
              곧 새로운 작업물이 올라올 예정이에요.
            </p>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer
        className="relative z-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 py-8"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <Link href="/terms" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem", textDecoration: "none" }}>이용약관</Link>
        <Link href="/privacy" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem", textDecoration: "none" }}>개인정보처리방침</Link>
        <a href="mailto:vivestarter@gmail.com" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem", textDecoration: "none" }}>문의</a>
        <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem" }}>© {new Date().getFullYear()} Vibefolio</span>
      </footer>

      {/* Mode toggle — visible to all visitors when custom CSS exists */}
      {p.custom_mode && p.custom_css && (
        <PortfolioModeToggle customCss={p.custom_css} />
      )}
      </ViewportFrame>
    </main>
  );
}
