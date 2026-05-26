-- Phase 3: Auto-generated demo videos
-- Adds columns to track the build+record pipeline that turns
-- a GitHub repo / zip upload / live URL into a stage demo video.
--
-- Playback priority in TheaterStage.LivePreview becomes:
--   video_url (manual) > demo_video_url (auto) > demo_url iframe > thumbnail

alter table projects
  add column if not exists demo_source_type text
    check (demo_source_type in ('github', 'zip', 'live_url')),
  add column if not exists demo_source_value text,
  add column if not exists demo_build_status text
    check (demo_build_status in ('pending','building','recording','editing','done','failed')),
  add column if not exists demo_build_error text,
  add column if not exists demo_video_url text,
  add column if not exists demo_generated_at timestamptz,
  add column if not exists demo_attempt_count int not null default 0;
