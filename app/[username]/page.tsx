import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ProjectsSection from "@/components/ProjectsSection";
import SocialBadge from "@/components/SocialBadge";
import type { Project } from "@/lib/data";

interface Profile {
  id: string;
  username: string;
  name: string | null;
  bio: string | null;
  twitter: string | null;
  github: string | null;
  avatar_url: string | null;
  social_links: string[] | null;
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
  sort_order: number;
}

export default async function UserPortfolioPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const supabase = await createClient();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .single();

  if (error || !profile) {
    notFound();
  }

  const { data: dbProjects } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", (profile as Profile).id)
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
  }));

  const p = profile as Profile;

  return (
    <main className="relative min-h-screen" style={{ background: "var(--bg)" }}>

      {/* Nav */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-4"
        style={{
          background: "var(--nav-bg)",
          backdropFilter: "blur(16px)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <Link href="/" className="flex items-center gap-3" style={{ textDecoration: "none" }}>
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: "var(--blue)", boxShadow: "0 0 8px var(--blue)" }}
          />
          <span
            className="text-sm tracking-[0.25em] uppercase font-medium"
            style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}
          >
            Vibefolio
          </span>
        </Link>
        <span
          className="text-xs tracking-widest uppercase"
          style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}
        >
          {projects.length} Projects
        </span>
      </nav>

      {/* Hero */}
      <section className="relative flex flex-col items-center pt-40 pb-24 px-6 z-10">

        {/* Glow */}
        <div
          className="absolute top-32 w-64 h-64 rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(77,158,255,0.12) 0%, transparent 70%)",
            filter: "blur(24px)",
          }}
        />

        {/* Avatar */}
        <div
          className="relative w-32 h-32 rounded-full flex items-center justify-center text-5xl font-black sphere-shadow mb-8 z-10 overflow-hidden"
          style={{
            background: "linear-gradient(135deg, var(--blue), var(--blue-bright))",
            color: "#fff",
            fontFamily: "var(--font-nunito)",
            border: "1px solid rgba(77,158,255,0.25)",
          }}
        >
          {p.avatar_url
            ? <img src={p.avatar_url} alt={p.name || p.username} className="w-full h-full object-cover" />
            : (p.name || p.username).charAt(0).toUpperCase()}
        </div>

        {/* Name */}
        <h1
          className="text-5xl md:text-6xl mb-1 tracking-tight"
          style={{
            fontFamily: "var(--font-nunito)",
            color: "var(--text-primary)",
            fontWeight: 800,
          }}
        >
          {p.name || p.username}
        </h1>

        <p
          className="mb-8 text-sm tracking-[0.25em] uppercase"
          style={{ color: "var(--blue)", fontFamily: "var(--font-nunito)", fontWeight: 300 }}
        >
          @{p.username}
        </p>

        <div className="w-24 h-px mb-8 blue-line" />

        {p.bio && (
          <p
            className="max-w-lg text-center leading-8 whitespace-pre-line"
            style={{
              color: "var(--text-secondary)",
              fontFamily: "var(--font-nunito)",
              fontWeight: 300,
              fontSize: "0.925rem",
            }}
          >
            {p.bio}
          </p>
        )}

        {/* Social links */}
        {(() => {
          const links: string[] = p.social_links?.length
            ? p.social_links
            : [
                p.twitter ? `https://twitter.com/${p.twitter.replace("@", "")}` : "",
                p.github ? `https://github.com/${p.github}` : "",
              ].filter(Boolean);

          if (!links.length) return null;

          return (
            <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
              {links.map((url, i) => (
                <SocialBadge key={i} url={url} />
              ))}
            </div>
          );
        })()}
      </section>

      {/* Projects */}
      {projects.length > 0 ? (
        <section className="relative max-w-5xl mx-auto px-6 pb-28 z-10">
          <ProjectsSection projects={projects} />
        </section>
      ) : (
        <section className="relative max-w-5xl mx-auto px-6 pb-28 z-10 text-center">
          <p className="text-sm" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
            아직 등록된 프로젝트가 없어요.
          </p>
        </section>
      )}

      {/* Footer */}
      <footer
        className="relative z-10 text-center py-10"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <p
          className="text-xs tracking-widest uppercase"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}
        >
          Vibefolio · {new Date().getFullYear()}
        </p>
      </footer>
    </main>
  );
}
