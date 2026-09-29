-- migration_demo_captions.sql (2026-09-29)
-- Bilingual works, stage 2 (lib/workLanguages.ts): what the recording worker
-- writes after a take.
--   demo_captions      — { "<locale>": [{ start, end, text }] } caption timeline
--                        laid over demo_video_url by our player (never burned in)
--   demo_locale_videos — { "<locale>": "<url>" } the same demo filmed again in
--                        the other language (apps whose screens show both)
-- PUBLIC columns (the card and work page read them with the anon key), and
-- PIPELINE columns: only the worker (service role) writes them, so the guard
-- trigger below adds both to the list an end user cannot change.
-- Run this BEFORE the code that reads these columns is deployed. Re-runnable.
alter table public.projects
  add column if not exists demo_captions jsonb,
  add column if not exists demo_locale_videos jsonb;

grant select (demo_captions, demo_locale_videos)
  on table public.projects to anon, authenticated;

create or replace function guard_demo_columns() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.demo_build_status is not null or new.demo_source_type is not null
    or new.demo_source_value is not null or new.demo_video_url is not null
    or new.demo_generated_at is not null or new.demo_build_error is not null
    or coalesce(new.demo_attempt_count, 0) <> 0
    or coalesce(new.rerecord_self_used, false) <> false
    or new.demo_captions is not null or new.demo_locale_videos is not null then
      raise exception 'demo pipeline columns are managed by the server' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.demo_build_status is distinct from old.demo_build_status
  or new.demo_source_type is distinct from old.demo_source_type
  or new.demo_source_value is distinct from old.demo_source_value
  or new.demo_video_url is distinct from old.demo_video_url
  or new.demo_generated_at is distinct from old.demo_generated_at
  or new.demo_attempt_count is distinct from old.demo_attempt_count
  or new.demo_build_error is distinct from old.demo_build_error
  or new.rerecord_self_used is distinct from old.rerecord_self_used
  or new.demo_captions is distinct from old.demo_captions
  or new.demo_locale_videos is distinct from old.demo_locale_videos then
    raise exception 'demo pipeline columns are managed by the server' using errcode = '42501';
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
