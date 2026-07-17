import Link from "next/link";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import HomeProfileMenu from "@/components/HomeProfileMenu";
import PortfolioPipSection from "@/components/PortfolioPipSection";
import ThemeToggle from "@/components/ThemeToggle";
import LoggedInHeadline from "@/components/LoggedInHeadline";
import FaqRepliesSection from "@/components/FaqRepliesSection";
import TypingTagline from "@/components/TypingTagline";
import ScrollHint from "@/components/ScrollHint";
import Logo from "@/components/Logo";

interface FeaturedProfile {
  username: string;
  name: string | null;
}

// The landing page's public reads — total user count, the recent-profiles pool,
// and the project-owner rows used to find who has enough work to showcase — are
// identical for every visitor, so we cache them through a cookie-free anon
// client (same pattern + `portfolio` tag as the profile pages). Auth stays
// per-request below. 60s keeps new signups showing up in the showcase quickly.
const getLandingData = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const [
      { count: userCount },
      { data: featuredProfiles },
      { data: projectOwners },
    ] = await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }),
      supabase.from("profiles")
        .select("id, username, name")
        .order("updated_at", { ascending: true })
        .limit(40),
      // Just the owner column — counted in JS to find who has enough work to
      // showcase, without leaning on an embedded-relationship name.
      supabase.from("projects").select("user_id"),
    ]);
    return {
      userCount: userCount ?? 0,
      featuredProfiles: (featuredProfiles as (FeaturedProfile & { id: string })[] | null) ?? [],
      projectOwners: (projectOwners as { user_id: string }[] | null) ?? [],
    };
  },
  ["landing-data"],
  { revalidate: 60, tags: ["portfolio"] }
);

export default async function LandingPage() {
  const supabase = await createClient();

  // Auth is per-request (cookies); the public reads are cached. Run both at once.
  const [
    { data: { user } },
    { userCount, featuredProfiles, projectOwners },
  ] = await Promise.all([
    supabase.auth.getUser(),
    getLandingData(),
  ]);

  const meta = user?.user_metadata || {};
  const username = meta.username || user?.email?.split("@")[0] || "";
  const name = meta.name || username;
  const avatarUrl = meta.avatar_url as string | undefined;

  // Only profiles with enough projects (≥3) make a convincing interactive
  // showcase, so the PiP section draws from that pool.
  const SHOWCASE_MIN_PROJECTS = 3;
  const projectCounts = new Map<string, number>();
  for (const row of (projectOwners as { user_id: string }[] | null) ?? []) {
    projectCounts.set(row.user_id, (projectCounts.get(row.user_id) ?? 0) + 1);
  }
  const allProfiles = (featuredProfiles as (FeaturedProfile & { id: string })[] | null) ?? [];
  const profiles: FeaturedProfile[] = allProfiles
    .filter((p) => (projectCounts.get(p.id) ?? 0) >= SHOWCASE_MIN_PROJECTS)
    .map(({ username, name }) => ({ username, name }));

  /* ─── Logged-in home ─── */
  if (user) {
    return (
      <main className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
        <nav className="flex items-center justify-between px-4 md:px-8 py-4 md:py-5">
          <Logo />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <HomeProfileMenu username={username} name={name} avatarUrl={avatarUrl} />
          </div>
        </nav>

        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-12">
          <p className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
            안녕하세요, <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{name}</span>님!
          </p>
          <LoggedInHeadline />
          <div className="flex flex-wrap justify-center items-center gap-3">
            <Link href={`/${username}`}
              className="px-7 py-3 rounded-full text-sm transition-opacity hover:opacity-80"
              style={{ background: "var(--blue)", color: "var(--bg)", fontFamily: "var(--font-nunito)", fontWeight: 600, textDecoration: "none" }}>
              내 명함 보기
            </Link>
            <Link href="/dashboard"
              className="px-7 py-3 rounded-full text-sm transition-opacity hover:opacity-70"
              style={{ border: "1px solid var(--border-bright)", color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontWeight: 600, textDecoration: "none" }}>
              명함 수정
            </Link>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 py-6">
          <Link href="/terms" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem", textDecoration: "none" }}>이용약관</Link>
          <Link href="/privacy" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem", textDecoration: "none" }}>개인정보처리방침</Link>
          <a href="mailto:vivestarter@gmail.com" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem", textDecoration: "none" }}>문의</a>
          <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem" }}>© {new Date().getFullYear()} Nookframe</span>
        </footer>
      </main>
    );
  }

  /* ─── Public landing ─── */
  return (
    <main className="flex flex-col" style={{ background: "var(--bg)", overflowX: "clip" }}>

      {/* Hero — single rotating phrase, true viewport center.
          Nav floats absolutely so it doesn't offset the tagline. */}
      <section className="relative flex flex-col items-center justify-center text-center px-6" style={{ minHeight: "100vh" }}>
        {/* Nav — absolute over hero so layout center = viewport center */}
        <nav className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 md:px-8 py-4 md:py-5 z-10">
          <Logo />
          <div className="flex items-center gap-5">
            <ThemeToggle />
            <Link href="/login"
              style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontSize: "0.875rem", fontWeight: 500, textDecoration: "none" }}>
              로그인
            </Link>
            <Link href="/signup"
              style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontSize: "0.875rem", fontWeight: 600, textDecoration: "none" }}>
              시작하기
            </Link>
          </div>
        </nav>

        <TypingTagline userCount={userCount ?? 0} />

        {/* Scroll hint — fades out as soon as the user scrolls */}
        {profiles.length > 0 && <ScrollHint />}
      </section>

      {/* FAQ — ↳ replies, typed on first scroll-into-view */}
      <FaqRepliesSection />

      {/* PiP portfolio preview — scroll-synced, cycles through profiles */}
      {profiles.length > 0 && (
        <PortfolioPipSection profiles={profiles} />
      )}

      <footer className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 py-6 relative z-10" style={{ borderTop: "1px solid var(--border)" }}>
        <Link href="/terms" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem", textDecoration: "none" }}>이용약관</Link>
        <Link href="/privacy" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem", textDecoration: "none" }}>개인정보처리방침</Link>
        <a href="mailto:vivestarter@gmail.com" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem", textDecoration: "none" }}>문의</a>
        <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem" }}>© {new Date().getFullYear()} Nookframe</span>
      </footer>
    </main>
  );
}

