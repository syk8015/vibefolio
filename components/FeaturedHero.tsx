import Image from "next/image";
import type { Project } from "@/lib/data";

function isFileUpload(url: string | undefined): boolean {
  return !!url && url.startsWith("/api/preview/");
}

function safeHref(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("https://") || url.startsWith("http://")) return url;
  if (url.startsWith("/api/preview/")) return url;
  return undefined;
}

interface Props {
  project: Project;
}

export default function FeaturedHero({ project }: Props) {
  const isFile = isFileUpload(project.demoUrl);
  const href = safeHref(project.demoUrl);

  return (
    <section
      className="relative w-full overflow-hidden"
      style={{ height: "85vh", background: "#0a0a0a" }}
    >
      {/* Background: live iframe (file) or large thumbnail (URL/none) */}
      {isFile && project.demoUrl ? (
        <iframe
          src={project.demoUrl}
          className="absolute inset-0 w-full h-full"
          style={{ border: "none" }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          title={project.title}
        />
      ) : (
        <Image
          src={project.thumbnail}
          alt={project.title}
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
      )}

      {/* Gradient overlay for text contrast (lighter for iframe so demo stays visible) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: isFile
            ? "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.0) 28%)"
            : "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.0) 100%)",
        }}
      />

      {/* Featured badge (top-left, always visible) */}
      <div
        className="absolute top-20 md:top-24 left-4 md:left-8 z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase"
        style={{
          background: "rgba(245,158,11,0.18)",
          border: "1px solid rgba(245,158,11,0.55)",
          color: "#fbbf24",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          fontFamily: "var(--font-nunito)",
          letterSpacing: "0.15em",
        }}
      >
        <svg width="11" height="11" viewBox="0 0 14 14" fill="#fbbf24">
          <path d="M7 1l1.8 4 4.2.4-3.2 2.9 1 4.2L7 10.4 3.2 12.5l1-4.2L1 5.4l4.2-.4L7 1z" />
        </svg>
        대표 작품
      </div>

      {/* Bottom content: title + description + CTA */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-6 md:p-12 flex flex-col gap-3 items-start max-w-3xl pointer-events-none">
        <h2
          className="text-3xl md:text-5xl lg:text-6xl tracking-tight"
          style={{
            color: "#fff",
            fontFamily: "var(--font-nunito)",
            fontWeight: 800,
            textShadow: "0 2px 16px rgba(0,0,0,0.6)",
            lineHeight: 1.1,
          }}
        >
          {project.title}
        </h2>

        {project.description && (
          <p
            className="text-sm md:text-base max-w-2xl"
            style={{
              color: "rgba(255,255,255,0.88)",
              fontFamily: "var(--font-nunito)",
              fontWeight: 400,
              textShadow: "0 1px 8px rgba(0,0,0,0.55)",
              lineHeight: 1.6,
            }}
          >
            {project.description}
          </p>
        )}

        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="pointer-events-auto mt-2 inline-flex items-center gap-2 px-5 py-3 rounded-full font-bold hover:opacity-85 transition-opacity"
            style={{
              background: "var(--blue)",
              color: "#fff",
              fontFamily: "var(--font-nunito)",
              fontSize: "0.875rem",
              textDecoration: "none",
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path
                d="M2 12L12 2M12 2H6M12 2V8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {isFile ? "전체화면으로 체험" : "새 탭에서 체험"}
          </a>
        )}
      </div>

      {/* Scroll hint */}
      <div
        className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1 animate-bounce pointer-events-none"
        style={{ color: "rgba(255,255,255,0.55)" }}
      >
        <span
          className="text-[0.6rem] tracking-[0.25em] uppercase"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          scroll
        </span>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 3v10M3 9l5 5 5-5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </section>
  );
}
