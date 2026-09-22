import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getProfileByUsername, getProjectById, posterFromDemo, watchVideo } from "@/lib/portfolio";
import WatchPing from "@/components/WatchPing";
import ReportButton from "@/components/ReportButton";
import Logo from "@/components/Logo";
import ClampText from "@/components/ClampText";
import { oneLine } from "@/lib/text";
import JsonLd from "@/components/JsonLd";

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
// 영상이 없는 작품은 둘로 갈린다: 지금 찍는 중(곧 생긴다)과 영상이 올 일이 없는
// 것(이미지형·실패·보류·요청 안 함). 앞의 것만 "rendering"이라 말할 수 있다 —
// 나머지에 그 문구를 띄우면 영원히 멈춘 화면이 되고, CAPTION은 없는 영상을
// "찍었다"고 단언하게 된다. pending은 빠진다 — 촬영은 로컬 맥 배치 워커가 사람이
// 돌릴 때만 집어가서, 대기열에서 며칠씩 머문다(2026-09-21 공개 작품 1개가 이 상태).
// 실제로 카메라가 도는 세 단계만 "rendering"이다(cron/health의 IN_FLIGHT와 같다).
const FILMING = ["building", "recording", "editing"];

type Params = { params: Promise<{ username: string; slug: string }> };

async function load(username: string, slug: string) {
  if (!UUID_RE.test(slug)) return null;
  const profile = await getProfileByUsername(username);
  if (!profile) return null;
  const project = await getProjectById(profile.id, slug);
  if (!project) return null;
  return { profile, project };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username, slug } = await params;
  const data = await load(username, slug);
  if (!data) return {};
  const { profile, project } = data;

  const handle = `@${profile.username}`;
  const title = `${project.title} · ${handle} on Nookframe`;
  // 설명은 3줄로 끊어 쓴 카피라 줄바꿈을 품는다 — 화면은 그대로 살리고,
  // meta·OG처럼 기계가 읽는 자리에서는 한 줄로 눕힌다(lib/text.ts).
  const clip = watchVideo(project);
  const video = clip?.url;
  const description = project.description
    ? oneLine(project.description)
    : clip
      ? clip.auto
        ? `${CAPTION}. Watch ${handle}'s demo on Nookframe.`
        : `Watch ${handle}'s demo on Nookframe.`
      : `${project.title} by ${handle} on Nookframe.`;
  const watchUrl = `${SITE}/${profile.username}/${project.id}`;

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
      // 영상이 없는데 video.other를 걸면 og:video 없는 영상 카드가 나간다.
      type: video ? "video.other" : "website",
      // Discord/Slack/Telegram/iMessage inline-play this. (X ignores direct-mp4
      // og:video and shows the poster card — creators use the Share Kit's native
      // upload path for X.)
      videos: video
        ? [{ url: video, secureUrl: video, type: clip?.type, width: 1280, height: 720 }]
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
  const clip = watchVideo(project);
  // 직접 올린 영상이면 자동 촬영 포스터는 다른 그림이다 → 대표 이미지로.
  const poster =
    (clip?.auto !== false ? posterFromDemo(project.demo_video_url, project.demo_generated_at) : undefined) ||
    project.thumbnail ||
    undefined;
  const video = clip?.url;
  const rendering = !video && FILMING.includes(project.demo_build_status ?? "");

  // 구조화 데이터. 영상이 실제로 있을 때만 VideoObject를 쓴다 — 구글이
  // VideoObject에 uploadDate를 요구하는데, 그건 촬영 시각(demo_generated_at)
  // 뿐이라 둘 중 하나라도 없으면 일반 CreativeWork로 떨어뜨린다.
  const watchUrl = `${SITE}/${profile.username}/${project.id}`;
  const profileUrl = `${SITE}/${profile.username}`;
  const creator = {
    "@type": "Person",
    "@id": `${profileUrl}#person`,
    name,
    url: profileUrl,
  };
  const jsonLd =
    clip?.auto && project.demo_generated_at
      ? {
          "@context": "https://schema.org",
          "@type": "VideoObject",
          "@id": `${watchUrl}#video`,
          url: watchUrl,
          name: project.title,
          description: project.description ? oneLine(project.description) : CAPTION,
          contentUrl: video,
          uploadDate: project.demo_generated_at,
          ...(poster ? { thumbnailUrl: [poster] } : {}),
          creator,
          isPartOf: { "@id": "https://nookframe.com/#website" },
        }
      : {
          "@context": "https://schema.org",
          "@type": "CreativeWork",
          "@id": watchUrl,
          url: watchUrl,
          name: project.title,
          ...(project.description ? { description: oneLine(project.description) } : {}),
          creator,
          isPartOf: { "@id": "https://nookframe.com/#website" },
        };

  return (
    <main
      className="relative min-h-screen flex flex-col"
      style={{ background: "var(--bg)" }}
    >
      <WatchPing projectId={project.id} username={profile.username} />
      <JsonLd data={jsonLd} />
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
        {/* Player — 영상이 없으면 찍는 중일 때만 "rendering", 아니면 대표 이미지만.
            둘 다 없으면 칸 자체를 그리지 않는다(빈 검은 상자보다 제목이 먼저 보이는 게 낫다). */}
        {(video || rendering || poster) && (
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
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: rendering ? "cover" : "contain",
                      opacity: rendering ? 0.55 : 1,
                    }}
                  />
                )}
                {rendering && (
                  <span
                    className="absolute vf-chip"
                    style={{ fontFamily: "var(--font-nunito)", color: "var(--text-secondary)" }}
                  >
                    Demo is rendering…
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Caption — the source claim. 자동 촬영 영상일 때만 참이다
            (직접 올린 영상은 사람이 찍은 것). */}
        {clip?.auto && (
          <p
            className="mt-4 text-center vf-mono"
            style={{ color: "var(--text-primary)", opacity: 0.5, fontSize: "0.8rem", letterSpacing: "0.01em" }}
          >
            {CAPTION}
          </p>
        )}

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
            <div className="vf-mono truncate" style={{ color: "var(--text-primary)", opacity: 0.5, fontSize: "0.8rem" }}>
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

        {/* 본문은 제목과 같은 잉크에 투명도만 한 단계 낮춘다 — 색이 두 갈래로
            갈리면(크림 제목 + 탄색 본문) 폰에서 특히 산만해 보인다.
            길면 폰에서만 8줄로 접는다(데스크탑은 전문 그대로). */}
        {project.description && (
          <ClampText
            text={project.description}
            lines={8}
            moreLabel="Show more"
            lessLabel="Show less"
            className="mt-3"
            style={{
              color: "var(--text-primary)",
              opacity: 0.82,
              fontFamily: "var(--font-nunito)",
              fontSize: "1rem",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}
          />
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
