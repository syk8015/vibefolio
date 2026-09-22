import { unstable_cache } from "next/cache";
import { createPublicClient, throwIfReadFailed } from "@/lib/supabase/public";
import { detectVideoKind } from "@/lib/video";

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
  video_url: string | null;
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

// 작품 페이지·OG가 틀 영상. 명함(TheaterStage)과 같은 순서 — 사람이 직접 준
// 영상(video_url)이 자동 촬영(demo_video_url)보다 먼저다. 단 직접 영상은 파일
// 주소(mp4/webm/mov)일 때만 쓴다: 유튜브·비메오는 <video>로도 og:video로도 못
// 튼다 → 자동 촬영이 있으면 그것으로, 없으면 영상 없음. auto=false면 "사람이
// 안 찍었다" 문구를 붙이면 안 된다(직접 찍은 영상이니까).
export type WatchVideo = { url: string; type: string; auto: boolean };

function versioned(url: string, at: string | null): string {
  return at ? `${url}?v=${encodeURIComponent(at)}` : url;
}

export function watchVideo(
  p: Pick<WatchProject, "video_url" | "demo_video_url" | "demo_generated_at">,
): WatchVideo | null {
  if (p.video_url && detectVideoKind(p.video_url) === "direct") {
    const ext = p.video_url.split("?")[0].match(/\.(\w+)$/)?.[1]?.toLowerCase();
    const type = ext === "webm" ? "video/webm" : ext === "mov" ? "video/quicktime" : "video/mp4";
    return { url: p.video_url, type, auto: false };
  }
  // 재촬영도 키가 바뀌지만, 고정 키인 Supabase 폴백 경로를 위해 ?v=를 붙인다.
  if (p.demo_video_url) {
    return { url: versioned(p.demo_video_url, p.demo_generated_at), type: "video/mp4", auto: true };
  }
  return null;
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
        "id, title, description, content_type, video_url, demo_video_url, demo_generated_at, thumbnail, demo_build_status",
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
