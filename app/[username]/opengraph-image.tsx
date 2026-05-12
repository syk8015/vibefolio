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

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0a0a0f",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background glow */}
        <div
          style={{
            position: "absolute",
            top: -120,
            left: "50%",
            transform: "translateX(-50%)",
            width: 600,
            height: 600,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(77,158,255,0.18) 0%, transparent 70%)",
            filter: "blur(40px)",
          }}
        />

        {/* Avatar */}
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #4d9eff, #7bb8ff)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 52,
            fontWeight: 900,
            color: "#fff",
            marginBottom: 28,
            border: "2px solid rgba(77,158,255,0.3)",
          }}
        >
          {initial}
        </div>

        {/* Name */}
        <div
          style={{
            fontSize: 60,
            fontWeight: 900,
            color: "#ffffff",
            marginBottom: 10,
            letterSpacing: "-1px",
          }}
        >
          {name}
        </div>

        {/* @username */}
        <div
          style={{
            fontSize: 24,
            fontWeight: 400,
            color: "#4d9eff",
            marginBottom: bio ? 20 : 0,
            letterSpacing: "2px",
            textTransform: "uppercase",
          }}
        >
          @{username}
        </div>

        {/* Bio */}
        {bio && (
          <div
            style={{
              fontSize: 22,
              color: "#8b8b9a",
              textAlign: "center",
              maxWidth: 700,
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
            bottom: 36,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "#4d9eff",
            }}
          />
          <div
            style={{
              fontSize: 18,
              fontWeight: 900,
              color: "#ffffff",
              letterSpacing: "0.05em",
            }}
          >
            Vibefolio
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
