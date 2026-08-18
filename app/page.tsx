import Link from "next/link";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient, throwIfReadFailed } from "@/lib/supabase/public";
import HomeProfileMenu from "@/components/HomeProfileMenu";
import PortfolioPipSection from "@/components/PortfolioPipSection";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/LanguageToggle";
import LoggedInHeadline from "@/components/LoggedInHeadline";
import FaqRepliesSection from "@/components/FaqRepliesSection";
import TypingTagline from "@/components/TypingTagline";
import ScrollHint from "@/components/ScrollHint";
import Logo from "@/components/Logo";
import JsonLd from "@/components/JsonLd";
import { getT } from "@/lib/i18n/server";

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
      { count: userCount, error: countError },
      { data: featuredProfiles, error: profilesError },
      { data: projectOwners, error: ownersError },
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
    // 읽기 실패를 0/[]로 캐시하면 60초 동안 "0명이 사용 중"이 랜딩에 걸린다.
    throwIfReadFailed(countError, "landing:userCount");
    throwIfReadFailed(profilesError, "landing:featuredProfiles");
    throwIfReadFailed(ownersError, "landing:projectOwners");
    return {
      userCount: userCount ?? 0,
      featuredProfiles: (featuredProfiles as (FeaturedProfile & { id: string })[] | null) ?? [],
      projectOwners: (projectOwners as { user_id: string }[] | null) ?? [],
    };
  },
  ["landing-data"],
  { revalidate: 60, tags: ["portfolio"] }
);

// 사이트 정체성을 구글에 한 번만 선언한다. 다른 페이지의 구조화 데이터는
// @id로 이 두 노드를 참조만 하므로 중복 선언이 없다.
const SITE_JSONLD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://nookframe.com/#website",
      url: "https://nookframe.com",
      name: "Nookframe",
      inLanguage: "ko",
      publisher: { "@id": "https://nookframe.com/#org" },
    },
    {
      "@type": "Organization",
      "@id": "https://nookframe.com/#org",
      name: "Nookframe",
      url: "https://nookframe.com",
      logo: "https://nookframe.com/brand/oauth-logo-512.png",
      description:
        "바이브코더를 위한 라이브 포트폴리오. 프로젝트를 전시하고, 링크 하나로 나를 소개하세요.",
    },
  ],
};

export default async function LandingPage() {
  const supabase = await createClient();

  // Auth is per-request (cookies); the public reads are cached. Run both at once.
  // getT()도 쿠키를 읽지만 이 페이지는 auth 때문에 이미 매 요청 렌더 —
  // lib/i18n/server.ts의 "정적 페이지 금지" 경고와 충돌하지 않는다.
  const [
    { data: { user } },
    { userCount, featuredProfiles, projectOwners },
    { locale, t },
  ] = await Promise.all([
    supabase.auth.getUser(),
    getLandingData(),
    getT(),
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
            <LanguageToggle />
            <ThemeToggle />
            <HomeProfileMenu username={username} name={name} avatarUrl={avatarUrl} locale={locale} />
          </div>
        </nav>

        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-12">
          <p className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
            {t.landing.greetingBefore}<span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{name}</span>{t.landing.greetingAfter}
          </p>
          <LoggedInHeadline locale={locale} />
          <div className="flex flex-wrap justify-center items-center gap-3">
            <Link href={`/${username}`}
              className="px-7 py-3 rounded-full text-sm transition-opacity hover:opacity-80"
              style={{ background: "var(--blue)", color: "var(--bg)", fontFamily: "var(--font-nunito)", fontWeight: 600, textDecoration: "none" }}>
              {t.landing.viewMyFrame}
            </Link>
            <Link href="/dashboard"
              className="px-7 py-3 rounded-full text-sm transition-opacity hover:opacity-70"
              style={{ border: "1px solid var(--border-bright)", color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontWeight: 600, textDecoration: "none" }}>
              {t.landing.editFrame}
            </Link>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 py-6">
          <Link href="/terms" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem", textDecoration: "none" }}>{t.common.terms}</Link>
          <Link href="/privacy" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem", textDecoration: "none" }}>{t.common.privacy}</Link>
          <a href="mailto:vivestarter@gmail.com" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem", textDecoration: "none" }}>{t.common.contact}</a>
          <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem" }}>© {new Date().getFullYear()} Nookframe</span>
        </footer>
      </main>
    );
  }

  /* ─── Public landing ─── */
  return (
    <main className="flex flex-col" style={{ background: "var(--bg)", overflowX: "clip" }}>
      <JsonLd data={SITE_JSONLD} />

      {/* Hero — single rotating phrase, true viewport center.
          Nav floats absolutely so it doesn't offset the tagline. */}
      <section className="relative flex flex-col items-center justify-center text-center px-6" style={{ minHeight: "100vh" }}>
        {/* Nav — absolute over hero so layout center = viewport center */}
        <nav className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 md:px-8 py-4 md:py-5 z-10">
          <Logo />
          <div className="flex items-center gap-5">
            <LanguageToggle />
            <ThemeToggle />
            <Link href="/login"
              style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontSize: "0.875rem", fontWeight: 500, textDecoration: "none" }}>
              {t.landing.login}
            </Link>
            <Link href="/signup"
              style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontSize: "0.875rem", fontWeight: 600, textDecoration: "none" }}>
              {t.landing.getStarted}
            </Link>
          </div>
        </nav>

        <TypingTagline userCount={userCount ?? 0} locale={locale} />

        {/* Scroll hint — fades out as soon as the user scrolls.
            Not gated on `profiles`: the FAQ section below always renders, so
            there is always something under the fold to hint at. (It used to
            share the showcase's gate, which meant an empty showcase left a
            100vh hero with no affordance while ~800px of FAQ sat below it.) */}
        <ScrollHint />
      </section>

      {/* FAQ — ↳ replies, typed on first scroll-into-view */}
      <FaqRepliesSection locale={locale} />

      {/* PiP portfolio preview — scroll-synced, cycles through profiles */}
      {profiles.length > 0 && (
        <PortfolioPipSection profiles={profiles} locale={locale} />
      )}

      <footer className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 py-6 relative z-10" style={{ borderTop: "1px solid var(--border)" }}>
        <Link href="/terms" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem", textDecoration: "none" }}>{t.common.terms}</Link>
        <Link href="/privacy" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem", textDecoration: "none" }}>{t.common.privacy}</Link>
        <a href="mailto:vivestarter@gmail.com" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem", textDecoration: "none" }}>{t.common.contact}</a>
        <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem" }}>© {new Date().getFullYear()} Nookframe</span>
      </footer>
    </main>
  );
}

