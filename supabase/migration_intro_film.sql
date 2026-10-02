-- migration_intro_film.sql (2026-10-02)
-- Intro films for works with no screen to film (docs/intro-film.md).
--   intro_film   — the scene script + style { text, mood } an AI sent and the owner
--                  edits. Our player draws it live on the card and work page.
--                  Owner- and ingest-writable (validated by lib/introFilm/schema.ts
--                  in every server route).
--   intro_render — { hash, video, poster, at } of the mp4 the recording worker made
--                  from it (phones, thumbnails, sharing). PIPELINE column: only the
--                  worker (service role) writes it, so it joins the guard below.
-- Both are PUBLIC columns (the card reads them with the anon key); the same GRANT
-- is also in migration_private_columns.sql so re-running that file keeps them.
-- Run this BEFORE the code that reads these columns is deployed. Re-runnable.
alter table public.projects
  add column if not exists intro_film jsonb,
  add column if not exists intro_render jsonb;

grant select (intro_film, intro_render)
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
    or new.demo_captions is not null or new.demo_locale_videos is not null
    or new.intro_render is not null then
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
  or new.demo_locale_videos is distinct from old.demo_locale_videos
  or new.intro_render is distinct from old.intro_render then
    raise exception 'demo pipeline columns are managed by the server' using errcode = '42501';
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
