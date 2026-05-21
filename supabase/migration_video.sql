-- Phase 2: Optional video URL for featured playback
-- Stores either a Supabase Storage public URL (direct mp4/webm upload)
-- or an external embed URL (YouTube/Vimeo). Detection happens client-side.

alter table projects
  add column if not exists video_url text;
