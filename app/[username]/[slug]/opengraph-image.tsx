import { ImageResponse } from "next/og";
import { getProfileByUsername, getProjectById, posterFromDemo } from "@/lib/portfolio";
import { safeFetch, readResponseCapped } from "@/lib/ssrf";

// og:image for the watch page — the poster frame with a play button + label, so a
// link preview reads unmistakably as "a video to press play on".
//
// Satori (next/og) is strict: no `inset` shorthand (use explicit edges), no
// CSS border-triangle trick (use an <svg>), and every multi-child element needs
// an explicit display. Keep those in mind when editing.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A demo on Nookframe";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CREAM = "#f4ede0";
const INK = "#1a1612";
const FILL = { top: 0, left: 0, right: 0, bottom: 0 } as const;

const MAX_POSTER_BYTES = 8 * 1024 * 1024; // posters are small; refuse to buffer more

// Fetch the poster ourselves and inline it as a data URI (more robust than letting
// next/og fetch a remote host mid-render). The poster/thumbnail URL can be user-set,
// so go through safeFetch (per-hop SSRF guard) + a timeout + a byte cap. Null → cream.
async function posterDataUri(url: string | undefined): Promise<string | null> {
  if (!url || url.length > 2048) return null;
  try {
    const r = await safeFetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    // Stream-capped read: a chunked response omits Content-Length, so the header
    // check alone let a huge body through arrayBuffer(). readResponseCapped aborts
    // the download at the cap. A body AT the cap is likely truncated → treat as
    // oversize and refuse rather than inline a broken image.
    const bytes = await readResponseCapped(r, MAX_POSTER_BYTES);
    if (bytes.byteLength >= MAX_POSTER_BYTES) return null;
    const ct = r.headers.get("content-type") || "image/jpeg";
    return `data:${ct};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    // blocked host (SSRF), timeout, or network error → cream fallback
    return null;
  }
}

export default async function Image({
  params,
}: {
  params: Promise<{ username: string; slug: string }>;
}) {
  const { username, slug } = await params;

  let handle = `@${username}`;
  let title = "";
  let poster: string | undefined;
  if (UUID_RE.test(slug)) {
    const profile = await getProfileByUsername(username);
    if (profile) {
      handle = `@${profile.username}`;
      const project = await getProjectById(profile.id, slug);
      if (project) {
        title = project.title;
        poster =
          posterFromDemo(project.demo_video_url, project.demo_generated_at) ||
          project.thumbnail ||
          undefined;
      }
    }
  }
  const posterData = await posterDataUri(poster);
  const shortTitle = title.length > 64 ? title.slice(0, 64) + "…" : title;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          position: "relative",
          width: "100%",
          height: "100%",
          background: posterData ? INK : CREAM,
        }}
      >
        {posterData ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={posterData} style={{ position: "absolute", ...FILL, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : null}

        {/* legibility scrim (only meaningful over a poster) */}
        {posterData ? (
          <div style={{ position: "absolute", ...FILL, background: "linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.6))" }} />
        ) : null}

        {/* play button, centered */}
        <div style={{ position: "absolute", ...FILL, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div
            style={{
              width: 128,
              height: 128,
              borderRadius: 64,
              background: "rgba(255,255,255,0.94)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="50" height="56" viewBox="0 0 50 56">
              <polygon points="6,4 46,28 6,52" fill={INK} />
            </svg>
          </div>
        </div>

        {/* bottom label */}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "32px 48px", display: "flex", flexDirection: "column" }}>
          {shortTitle ? (
            <div style={{ display: "flex", fontSize: 44, fontWeight: 700, color: posterData ? "#ffffff" : INK, letterSpacing: "-0.02em" }}>
              {shortTitle}
            </div>
          ) : null}
          <div style={{ display: "flex", marginTop: 8, fontSize: 24, fontFamily: "monospace", color: posterData ? "#ffffff" : "#6a5e4e", opacity: 0.9 }}>
            {`nookframe.com/${handle}`}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
