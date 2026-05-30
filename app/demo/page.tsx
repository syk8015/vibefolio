import Image from "next/image";
import ProjectsSection from "@/components/ProjectsSection";
import { profile, projects } from "@/lib/data";

export default function Home() {
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
        <div className="flex items-center gap-3">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: "var(--blue)", boxShadow: "0 0 8px var(--blue)" }}
          />
          <span
            className="text-sm tracking-[0.25em] uppercase font-medium"
            style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}
          >
            Nookframe
          </span>
        </div>
        <span
          className="text-xs tracking-widest uppercase"
          style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}
        >
          {projects.length} Projects
        </span>
      </nav>

      {/* Hero */}
      <section className="relative flex flex-col items-center pt-40 pb-24 px-6 z-10">

        {/* Glow behind avatar */}
        <div
          className="absolute top-32 w-64 h-64 rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(77,158,255,0.12) 0%, transparent 70%)",
            filter: "blur(24px)",
          }}
        />

        {/* Sphere avatar */}
        <div
          className="relative w-32 h-32 rounded-full overflow-hidden sphere-shadow mb-8 z-10"
          style={{ border: "1px solid rgba(77,158,255,0.25)" }}
        >
          <Image
            src={profile.avatar}
            alt={profile.name}
            fill
            className="object-cover"
            priority
          />
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
          {profile.name}
        </h1>

        {/* Subtitle / handle */}
        <p
          className="mb-8 text-sm tracking-[0.25em] uppercase"
          style={{ color: "var(--blue)", fontFamily: "var(--font-nunito)", fontWeight: 300 }}
        >
          Vibe Coder
        </p>

        {/* Blue divider */}
        <div className="w-24 h-px mb-8 blue-line" />

        {/* Bio */}
        <p
          className="max-w-lg text-center leading-8 whitespace-pre-line"
          style={{
            color: "var(--text-secondary)",
            fontFamily: "var(--font-nunito)",
            fontWeight: 300,
            fontSize: "0.925rem",
          }}
        >
          {profile.bio}
        </p>

        {/* Social */}
        <div className="flex items-center gap-5 mt-8">
          <a href={profile.social.twitter} target="_blank" rel="noopener noreferrer" className="social-link">
            Twitter
          </a>
          <span style={{ color: "var(--border-bright)", fontSize: "0.6rem" }}>●</span>
          <a href={profile.social.github} target="_blank" rel="noopener noreferrer" className="social-link">
            GitHub
          </a>
        </div>
      </section>

      {/* Projects section (includes Works header + grid + layout toggle) */}
      <section className="relative max-w-5xl mx-auto px-6 pb-28 z-10">
        <ProjectsSection projects={projects} />
      </section>

      {/* Footer */}
      <footer
        className="relative z-10 text-center py-10"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <p
          className="text-xs tracking-widest uppercase"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}
        >
          Nookframe · {new Date().getFullYear()}
        </p>
      </footer>
    </main>
  );
}
