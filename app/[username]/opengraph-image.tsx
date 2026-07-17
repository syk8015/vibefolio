import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, bio, avatar_url")
    .eq("username", username)
    .single();

  const name = profile?.name || username;
  const bio = profile?.bio
    ? profile.bio.length > 80
      ? profile.bio.slice(0, 80) + "…"
      : profile.bio
    : null;
  const initial = name.charAt(0).toUpperCase();

  const CREAM = "#f4ede0";
  const INK = "#1a1612";
  const MUTED = "#6a5e4e";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: CREAM,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Avatar — ink-filled circle */}
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: "50%",
            background: INK,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 52,
            fontWeight: 600,
            color: CREAM,
            marginBottom: 28,
          }}
        >
          {initial}
        </div>

        {/* Name */}
        <div
          style={{
            fontSize: 64,
            fontWeight: 500,
            color: INK,
            marginBottom: 12,
            letterSpacing: "-0.02em",
          }}
        >
          {name}
        </div>

        {/* @username */}
        <div
          style={{
            fontSize: 22,
            fontFamily: "monospace",
            color: MUTED,
            marginBottom: bio ? 22 : 0,
            letterSpacing: "0.08em",
          }}
        >
          {/* satori: `@{username}` would be TWO child nodes ("@" + value) and
              satori demands explicit display:flex on multi-child divs — a single
              template string keeps it one node. This exact pattern 500'd every
              profile OG image in prod. */}
          {`@${username}`}
        </div>

        {/* Bio */}
        {bio && (
          <div
            style={{
              fontSize: 24,
              color: MUTED,
              textAlign: "center",
              maxWidth: 720,
              lineHeight: 1.5,
            }}
          >
            {bio}
          </div>
        )}

        {/* Bottom branding */}
        <div
          style={{
            position: "absolute",
            bottom: 40,
            fontSize: 18,
            fontFamily: "monospace",
            fontWeight: 500,
            color: INK,
            letterSpacing: "-0.01em",
          }}
        >
          nookframe
        </div>
      </div>
    ),
    { ...size }
  );
}
