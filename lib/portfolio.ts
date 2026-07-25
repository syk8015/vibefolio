import { unstable_cache } from "next/cache";
import { createPublicClient, throwIfReadFailed } from "@/lib/supabase/public";

// Shared public reads for the per-project watch page (/{username}/{id}). Kept
// separate from the theater page's own private copies in app/[username]/page.tsx
// so that page — which carries a byte-identical desktop invariant — stays
// untouched. Same cache window/tag as the theater reads (60s, "portfolio").

export type WatchProfile = {
  id: string;
  username: string;
  name: string | null;
  avatar_url: string | null;
  bio: string | null;
};

export type WatchProject = {
  id: string;
  title: string;
  description: string | null;
  content_type: string | null;
  demo_video_url: string | null;
  demo_generated_at: string | null;
  thumbnail: string | null;
  demo_build_status: string | null;
};

// The poster JPG is uploaded next to the demo mp4 under a deterministic key
// (demo-{ts}.mp4 → poster-{ts}.jpg, or demo.mp4 → poster.jpg on the Supabase
// fallback), so we derive its URL from the video URL rather than storing a column
// — no schema migration to gate the watch page, and one fewer field to keep in
// sync. Returns undefined if the URL isn't a recognized demo key (poster may be
// absent if extraction failed; consumers fall back to the thumbnail).
export function posterFromDemo(
  demoVideoUrl: string | null,
  generatedAt?: string | null,
): string | undefined {
  if (!demoVideoUrl) return undefined;
  const m = demoVideoUrl.match(/^(.*)\/demo(-\d+)?\.mp4/);
  if (!m) return undefined;
  const url = `${m[1]}/poster${m[2] ?? ""}.jpg`;
  return generatedAt ? `${url}?v=${encodeURIComponent(generatedAt)}` : url;
}

export const getProfileByUsername = unstable_cache(
  async (username: string): Promise<WatchProfile | null> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, name, avatar_url, bio")
      .eq("username", username)
      .single();
    throwIfReadFailed(error, "watch:profile");
    return (data as WatchProfile) ?? null;
  },
  ["watch-profile"],
  { revalidate: 60, tags: ["portfolio"] },
);

export const getProjectById = unstable_cache(
  async (userId: string, projectId: string): Promise<WatchProject | null> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("projects")
      .select(
        "id, title, description, content_type, demo_video_url, demo_generated_at, thumbnail, demo_build_status",
      )
      .eq("user_id", userId)
      .eq("id", projectId)
      .single();
    throwIfReadFailed(error, "watch:project");
    return (data as WatchProject) ?? null;
  },
  ["watch-project"],
  { revalidate: 60, tags: ["portfolio"] },
);
