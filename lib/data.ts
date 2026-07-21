// Shared portfolio project shape. The `profile`/`projects` fixtures that once lived
// here powered the /demo mockup page (fake "Alex Vibe" data). Both the page and the
// fixtures were removed in the 2026-07-21 prelaunch cleanup; real project data now
// comes only from Supabase (see app/[username]/page.tsx and the dashboard).
export interface Project {
  id: number;
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
}
