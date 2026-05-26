import { notFound } from "next/navigation";
import Link from "next/link";
import { cache } from "react";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import CopyLinkButton from "@/components/CopyLinkButton";
import PortfolioModeToggle from "@/components/PortfolioModeToggle";
import type { Project } from "@/lib/data";
import ViewTracker from "@/components/ViewTracker";
import ThemeToggle from "@/components/ThemeToggle";
import ViewportModeToggle from "@/components/ViewportModeToggle";
import ViewportFrame from "@/components/ViewportFrame";
import EmbedLoginButton from "@/components/EmbedLoginButton";
import TheaterShell from "@/components/theater/TheaterShell";

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
  demo_video_url: string | null;
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
    demoVideoUrl: p.demo_video_url ?? undefined,
  }));

  // Theater starts on the explicitly-featured project, falling back to
  // the first one when no flag is set.
  const explicitFeaturedIndex = projects.findIndex(pr => pr.isFeatured);
  const initialActiveIndex = explicitFeaturedIndex >= 0 ? explicitFeaturedIndex : 0;

  const p = profile;
  const socialLinks: string[] = p.social_links?.length
    ? p.social_links
    : [
        p.twitter ? `https://twitter.com/${p.twitter.replace("@", "")}` : "",
        p.github ? `https://github.com/${p.github}` : "",
      ].filter(Boolean);
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

      {/* Body: Theater layout — stage drives identity, reel drives navigation.
          min-h-screen guarantees the body fills the viewport so the footer
          sits below the fold on profiles with few projects. */}
      <div className="pt-[57px] md:pt-[68px] min-h-screen">
        <TheaterShell
          profile={{
            username: p.username,
            name: p.name,
            avatar_url: p.avatar_url,
            bio: p.bio,
          }}
          profileUrl={`https://vibefolio.vercel.app/${p.username}`}
          projects={projects}
          initialActiveIndex={initialActiveIndex}
          socialLinks={socialLinks}
        />
      </div>

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
