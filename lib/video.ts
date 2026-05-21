export type VideoKind = "youtube" | "vimeo" | "direct" | "unknown";

export function detectVideoKind(url: string): VideoKind {
  if (!url) return "unknown";
  if (/(?:youtube\.com\/(?:watch|embed|shorts)|youtu\.be\/)/i.test(url)) return "youtube";
  if (/vimeo\.com/i.test(url)) return "vimeo";
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) return "direct";
  // Supabase Storage public URLs and our own preview routes
  if (url.includes("/storage/v1/object/public/") || url.startsWith("/api/preview/")) return "direct";
  return "unknown";
}

export function getYouTubeEmbedUrl(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i);
  if (!m) return null;
  const id = m[1];
  // playlist=ID is required for loop to work on YouTube embeds.
  return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&modestbranding=1&rel=0&showinfo=0&playsinline=1`;
}

export function getVimeoEmbedUrl(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:.*?\/)?(\d+)/i);
  if (!m) return null;
  return `https://player.vimeo.com/video/${m[1]}?autoplay=1&muted=1&loop=1&controls=0&playsinline=1`;
}
