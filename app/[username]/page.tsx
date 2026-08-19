import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { unstable_cache } from "next/cache";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient, throwIfReadFailed } from "@/lib/supabase/public";
import CopyLinkButton from "@/components/CopyLinkButton";
import type { Project } from "@/lib/data";
import { placeholderThumbnail } from "@/lib/placeholder";
import ViewTracker from "@/components/ViewTracker";
import ThemeToggle from "@/components/ThemeToggle";
import ViewportModeToggle from "@/components/ViewportModeToggle";
import ViewportFrame from "@/components/ViewportFrame";
import EmbedLoginButton from "@/components/EmbedLoginButton";
import TheaterShell from "@/components/theater/TheaterShell";
import ReportButton from "@/components/ReportButton";
import Logo from "@/components/Logo";
import JsonLd from "@/components/JsonLd";
import LanguageToggle from "@/components/LanguageToggle";
import MobileNavMenu from "@/components/MobileNavMenu";
import { getT } from "@/lib/i18n/server";

// Public portfolio data is identical for every visitor, so we cache the two
// Supabase reads instead of hitting the DB on every pageview. A 60s window
// keeps owner edits visibly fresh — writes happen client-side in the dashboard
// (no server action to revalidate from), so the cache simply expires quickly.
const getProfile = unstable_cache(
  async (username: string) => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("username", username)
      .single();
    throwIfReadFailed(error, "theater:profile");
    return (data as Profile) ?? null;
  },
  ["portfolio-profile"],
  { revalidate: 60, tags: ["portfolio"] }
);

const getProjects = unstable_cache(
  async (userId: string) => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    throwIfReadFailed(error, "theater:projects");
    return (data as DBProject[]) ?? [];
  },
  ["portfolio-projects"],
  { revalidate: 60, tags: ["portfolio"] }
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const profile = await getProfile(username);
  if (!profile) return {};

  const name = profile.name || username;
  const description = profile.bio || `${name}의 Nookframe — 바이브코더의 라이브 포트폴리오`;
  const url = `https://nookframe.com/${username}`;

  return {
    title: `${name} | Nookframe`,
    description,
    openGraph: {
      title: `${name} | Nookframe`,
      description,
      url,
      type: "profile",
      siteName: "Nookframe",
    },
    twitter: {
      card: "summary_large_image",
      title: `${name} | Nookframe`,
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
  demo_generated_at: string | null;
}

export default async function UserPortfolioPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ embed?: string; showcase?: string }>;
}) {
  const { username } = await params;
  const { embed, showcase } = await searchParams;
  const isEmbed = embed === "1";
  // Showcase mode powers the landing PiP: a fully interactive card with every
  // exit point (nav, footer, mode toggles, home links) stripped so visitors can
  // only browse this person's projects.
  const isShowcase = showcase === "1";

  // The auth read (cookies → Supabase) is independent of the cached profile and
  // project reads, so kick it off up front and let it overlap them instead of
  // trailing serially after. .catch keeps a transient auth failure from
  // rejecting the whole render — an anonymous view is the correct fallback.
  const authPromise = createClient()
    .then((c) => c.auth.getUser())
    .catch(() => null);
  // 이 라우트는 위 auth 읽기(쿠키) 때문에 이미 매 요청 렌더 — getT를 써도
  // 캐시를 새로 깨뜨리지 않는다. 60s 캐시는 unstable_cache DB 읽기에만 걸려 있다.
  const { t } = await getT();

  const profile = await getProfile(username);
  if (!profile) notFound();

  const [dbProjects, authResult] = await Promise.all([
    getProjects(profile.id),
    authPromise,
  ]);

  const projects: Project[] = dbProjects.map((p, i) => ({
    id: i + 1,
    watchId: p.id,
    title: p.title,
    description: p.description ?? "",
    type: p.type,
    thumbnail: p.thumbnail || placeholderThumbnail(p.id),
    year: p.year ?? new Date().getFullYear().toString(),
    tags: p.tags ?? [],
    demoUrl: p.demo_url ?? undefined,
    comment: p.comment ?? undefined,
    contentType: p.content_type ?? null,
    isFeatured: p.is_featured ?? false,
    videoUrl: p.video_url ?? undefined,
    // Re-records overwrite the same storage path (upsert), so the URL is
    // stable and browsers serve a stale cached copy. Version the URL by the
    // generation time so every re-record is a fresh fetch.
    demoVideoUrl: p.demo_video_url
      ? p.demo_generated_at
        ? `${p.demo_video_url}?v=${encodeURIComponent(p.demo_generated_at)}`
        : p.demo_video_url
      : undefined,
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
  // Auth stays dynamic & per-request (reads cookies) — only the public profile
  // and project reads above are cached. The read was started before the project
  // fetch above so the two overlap rather than running back to back.
  const rawUser = authResult?.data.user ?? null;
  // In embed (mobile-preview iframe) and showcase (landing PiP) modes, render
  // as if the visitor is not logged in so no owner-only chrome leaks in.
  const currentUser = (isEmbed || isShowcase) ? null : rawUser;
  const isOwner = currentUser?.id === p.id;

  // 구조화 데이터: 이 페이지는 한 사람의 프로필이고, 그 사람의 작품 목록은
  // 이것들이다 — 라고 구글에 알려준다. workExample의 URL이 곧 상세 페이지라,
  // 화면에 링크를 새로 달지 않고도 구글이 상세 페이지를 발견할 수 있다.
  // (테아터 레이아웃은 손대지 않는다.)
  const sameAs = socialLinks
    .map((u) => u.trim())
    .filter(Boolean)
    .map((u) => (u.startsWith("http://") || u.startsWith("https://") ? u : `https://${u}`));
  const profileUrl = `https://nookframe.com/${p.username}`;
  const profileJsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "@id": `${profileUrl}#profile`,
    url: profileUrl,
    isPartOf: { "@id": "https://nookframe.com/#website" },
    mainEntity: {
      "@type": "Person",
      "@id": `${profileUrl}#person`,
      name: p.name || p.username,
      alternateName: `@${p.username}`,
      url: profileUrl,
      ...(p.bio ? { description: p.bio } : {}),
      ...(p.avatar_url ? { image: p.avatar_url } : {}),
      // sameAs는 스킴이 붙은 절대 URL이어야 한다. 유저가 "instagram.com/id"
      // 처럼 저장한 값이 그대로 나가면 구글이 무시한다 — 화면 렌더(getSocialMeta)와
      // 같은 규칙으로 https://를 붙여준다.
      ...(sameAs.length ? { sameAs } : {}),
      // 프로필 하나에 작품이 아주 많아도 문서가 비대해지지 않게 상한을 둔다.
      ...(dbProjects.length
        ? {
            workExample: dbProjects.slice(0, 50).map((dp) => ({
              "@type": "CreativeWork",
              "@id": `${profileUrl}/${dp.id}`,
              url: `${profileUrl}/${dp.id}`,
              name: dp.title,
              ...(dp.description ? { description: dp.description } : {}),
            })),
          }
        : {}),
    },
  };

  return (
    <main className="relative min-h-screen" style={{ background: "var(--bg)" }}>
      {/* embed=1은 오너 대시보드의 모바일 프리뷰 iframe — 미리볼 때마다 자기
          조회수가 오르면 안 되므로 showcase(랜딩 PiP)와 함께 집계에서 뺀다.
          ownerId는 로그인한 오너 본인의 일반 방문을 클라이언트에서 거른다. */}
      {!isShowcase && !isEmbed && <ViewTracker username={p.username} ownerId={p.id} />}
      {!isShowcase && !isEmbed && <JsonLd data={profileJsonLd} />}

      {/* Nav */}
      {!isShowcase && (
      <nav
        className="vf-nav-hairline fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-8 py-3 md:py-4"
        style={{
          background: "var(--nav-bg)",
          backdropFilter: "blur(16px)",
        }}
      >
        <Logo href={isEmbed ? null : "/"} />
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
          {/* 모바일에서는 이 부수 컨트롤들이 점 세 개 메뉴 안으로 들어간다
              (아래 MobileNavMenu). 폰 첫 화면에 버튼이 다섯 개 늘어서면
              작품보다 크롬이 먼저 읽힌다. 데스크탑 줄은 그대로. */}
          <div className="hidden md:flex items-center gap-3">
            <ThemeToggle />
            <LanguageToggle />
            <CopyLinkButton username={p.username} />
          </div>

          {/* Auth pill */}
          {isOwner ? (
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-opacity hover:opacity-80"
              style={{
                background: "var(--blue)",
                color: "var(--bg)",
                fontFamily: "var(--font-nunito)",
                textDecoration: "none",
                boxShadow: "0 0 12px var(--blue-glow)",
              }}
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path d="M7.5 1.5l3 3L4 11H1V8L7.5 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {t.theater.editFrame}
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
                <Image
                  src={currentUser.user_metadata.avatar_url as string}
                  alt=""
                  width={16}
                  height={16}
                  unoptimized
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
              {t.theater.myFrame}
            </Link>
          ) : isEmbed ? (
            <EmbedLoginButton />
          ) : (
            <Link
              href="/login"
              className="hidden md:inline-block px-3.5 py-1.5 rounded-full text-xs font-bold transition-opacity hover:opacity-80"
              style={{
                border: "1px solid var(--border-bright)",
                color: "var(--text-secondary)",
                fontFamily: "var(--font-nunito)",
                textDecoration: "none",
              }}
            >
              {t.theater.login}
            </Link>
          )}

          {/* 모바일 전용 — 위 컨트롤들을 접어 담는다. embed(오너 대시보드의
              모바일 프리뷰)는 자체 로그인 안내 버튼이 따로 있으므로 제외. */}
          <div className="md:hidden">
            <MobileNavMenu username={p.username} showLogin={!currentUser && !isEmbed} />
          </div>
        </div>
      </nav>
      )}

      <ViewportFrame username={p.username} enabled={isOwner && !isEmbed}>

      {/* Body: Theater layout — stage drives identity, reel drives navigation.
          min-h-screen guarantees the body fills the viewport so the footer
          sits below the fold on profiles with few projects. */}
      <div className={`${isShowcase ? "" : "pt-[57px] md:pt-[68px]"} min-h-screen`}>
        <TheaterShell
          profile={{
            username: p.username,
            name: p.name,
            avatar_url: p.avatar_url,
            bio: p.bio,
          }}
          profileUrl={`https://nookframe.com/${p.username}`}
          projects={projects}
          initialActiveIndex={initialActiveIndex}
          socialLinks={socialLinks}
          showcase={isShowcase}
        />
      </div>

      {/* Footer */}
      {!isShowcase && (
      <footer
        className="relative z-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 py-8"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <Link href="/terms" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem", textDecoration: "none" }}>{t.common.terms}</Link>
        <Link href="/privacy" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem", textDecoration: "none" }}>{t.common.privacy}</Link>
        <a href="mailto:vivestarter@gmail.com" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem", textDecoration: "none" }}>{t.common.contact}</a>
        {!isOwner && <ReportButton targetType="profile" targetId={p.id} />}
        <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem" }}>© {new Date().getFullYear()} Nookframe</span>
      </footer>
      )}

      </ViewportFrame>
    </main>
  );
}
