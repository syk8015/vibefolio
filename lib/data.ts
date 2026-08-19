// Shared portfolio project shape. The `profile`/`projects` fixtures that once lived
// here powered the /demo mockup page (fake "Alex Vibe" data). Both the page and the
// fixtures were removed in the 2026-07-21 prelaunch cleanup; real project data now
// comes only from Supabase (see app/[username]/page.tsx and the dashboard).
export interface Project {
  id: number;
  // DB uuid of the row. `id` above is a 1-based display index, so the watch
  // page (/@username/{uuid}) needs the real key kept alongside it.
  watchId?: string;
  title: string;
  description: string;
  type: "image" | "video";
  thumbnail: string;
  year: string;
  tags: string[];
  demoUrl?: string;
  comment?: string;
  contentType?: string | null;
  isFeatured?: boolean;
  videoUrl?: string;
  demoVideoUrl?: string;
  // 자동 시연 영상의 첫 프레임 포스터(R2). thumbnail은 유저가 올린 별개 이미지라
  // 영상과 색이 안 맞아 로딩 중 화면이 튀고, Supabase 경유라 3배 느리다
  // (실측 144KB/0.61s vs 40KB/0.20s). 없으면 thumbnail로 폴백.
  poster?: string;
}
