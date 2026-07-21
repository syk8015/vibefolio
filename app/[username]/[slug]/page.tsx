import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getProfileByUsername, getProjectById, posterFromDemo } from "@/lib/portfolio";
import WatchPing from "@/components/WatchPing";
import ReportButton from "@/components/ReportButton";
import Logo from "@/components/Logo";

// The public per-project watch page. Its whole job is to unfurl the demo mp4 as
// og:video (Discord/Slack/Telegram/iMessage inline-play it) and hand the viewer a
// door into the owner's Nookframe. English by design — it's a viral surface.
//
// slug = the project uuid (no separate slug column; approved id-as-slug). This
// route nests under the existing [username] theater page and never touches it, so
// the desktop byte-identical invariant there is untouched.

const SITE = "https://nookframe.com";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CAPTION = "No human recorded this — filmed straight from the live app";

type Params = { params: Promise<{ username: string; slug: string }> };

async function load(username: string, slug: string) {
  if (!UUID_RE.test(slug)) return null;
  const profile = await getProfileByUsername(username);
  if (!profile) return null;
  const project = await getProjectById(profile.id, slug);
  if (!project) return null;
  return { profile, project };
}

// Re-records overwrite storage keys are versioned, but keep the ?v= cache-bust for
// the Supabase fallback path (fixed key) where the URL is otherwise stable.
function versioned(url: string, at: string | null): string {
  return at ? `${url}?v=${encodeURIComponent(at)}` : url;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username, slug } = await params;
  const data = await load(username, slug);
  if (!data) return {};
  const { profile, project } = data;

  const handle = `@${profile.username}`;
  const title = `${project.title} · ${handle} on Nookframe`;
  const description =
    project.description || `${CAPTION}. Watch ${handle}'s demo on Nookframe.`;
  const watchUrl = `${SITE}/${profile.username}/${project.id}`;
  const video = project.demo_video_url
    ? versioned(project.demo_video_url, project.demo_generated_at)
    : undefined;

  // og:image / twitter:image come from the co-located opengraph-image.tsx (a
  // poster + play-button composite that always renders — cream card if the poster
  // is missing). We only add the video here; setting openGraph.images would
  // override that generated image with the bare frame (and 404 for old demos with
  // no poster yet).
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: watchUrl,
      siteName: "Nookframe",
      type: "video.other",
      // Discord/Slack/Telegram/iMessage inline-play this. (X ignores direct-mp4
      // og:video and shows the poster card — creators use the Share Kit's native
      // upload path for X.)
      videos: video
        ? [{ url: video, secureUrl: video, type: "video/mp4", width: 1280, height: 720 }]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function WatchPage({ params }: Params) {
  const { username, slug } = await params;
  const data = await load(username, slug);
  if (!data) notFound();
  const { profile, project } = data;

  const handle = `@${profile.username}`;
  const name = profile.name || profile.username;
  const initial = name.charAt(0).toUpperCase();
  const poster =
    posterFromDemo(project.demo_video_url, project.demo_generated_at) ||
    project.thumbnail ||
    undefined;
  const video = project.demo_video_url
    ? versioned(project.demo_video_url, project.demo_generated_at)
    : undefined;

  return (
    <main
      className="relative min-h-screen flex flex-col"
      style={{ background: "var(--bg)" }}
    >
      <WatchPing projectId={project.id} username={profile.username} />
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 md:px-8 py-4">
        <Logo />
        <Link
          href={`/${profile.username}`}
          className="text-xs font-bold px-3.5 py-1.5 rounded-full transition-opacity hover:opacity-80"
          style={{
            border: "1px solid var(--border-bright)",
            color: "var(--text-secondary)",
            background: "var(--surface)",
            fontFamily: "var(--font-nunito)",
            textDecoration: "none",
          }}
        >
          {handle}
        </Link>
      </header>

      <div className="flex-1 w-full max-w-[860px] mx-auto px-5 md:px-8 pb-16">
        {/* Player */}
        <div
          className="vf-card overflow-hidden"
          style={{ padding: 0, borderRadius: 18, aspectRatio: "16 / 9", background: "#0b0b0f" }}
        >
          {video ? (
            <video
              src={video}
              poster={poster}
              controls
              autoPlay
              muted
              loop
              playsInline
              style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
            />
          ) : (
            <div className="relative w-full h-full flex items-center justify-center">
              {poster && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={poster}
                  alt={project.title}
                  style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.55 }}
                />
              )}
              <span
                className="absolute vf-chip"
                style={{ fontFamily: "var(--font-nunito)", color: "var(--text-secondary)" }}
              >
                Demo is rendering…
              </span>
            </div>
          )}
        </div>

        {/* Caption — the source claim */}
        <p
          className="mt-4 text-center vf-mono"
          style={{ color: "var(--text-muted)", fontSize: "0.8rem", letterSpacing: "0.01em" }}
        >
          {CAPTION}
        </p>

        {/* Identity + title */}
        <div className="mt-9 flex items-center gap-3">
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar_url}
              alt={name}
              style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
            />
          ) : (
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                color: "var(--bg)",
                background: "linear-gradient(135deg, var(--blue), var(--blue-bright))",
              }}
            >
              {initial}
            </div>
          )}
          <div className="min-w-0">
            <div
              className="font-bold truncate"
              style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}
            >
              {name}
            </div>
            <div className="vf-mono truncate" style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
              {handle}
            </div>
          </div>
        </div>

        <h1
          className="vf-serif-display mt-5"
          style={{ color: "var(--text-primary)", fontSize: "clamp(1.7rem, 5vw, 2.6rem)", lineHeight: 1.15 }}
        >
          {project.title}
        </h1>

        {project.description && (
          <p
            className="mt-3"
            style={{
              color: "var(--text-secondary)",
              fontFamily: "var(--font-nunito)",
              fontSize: "1rem",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}
          >
            {project.description}
          </p>
        )}

        {/* Door into the owner's Nookframe */}
        <Link
          href={`/${profile.username}`}
          className="vf-button-primary inline-flex items-center gap-2 mt-8"
          style={{ textDecoration: "none" }}
        >
          View {name}&apos;s Nookframe
          <span aria-hidden>→</span>
        </Link>
      </div>

      <footer
        className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 py-7"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <Link href="/" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem", textDecoration: "none" }}>
          Made with Nookframe
        </Link>
        <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem" }}>
          © {new Date().getFullYear()} Nookframe
        </span>
        <ReportButton targetType="project" targetId={project.id} locale="en" />
      </footer>
    </main>
  );
}
