-- migration_work_languages.sql (2026-09-29)
-- Bilingual works (lib/workLanguages.ts): every work carries its copy in Korean
-- and English, and visitors see their own language's version.
--   primary_locale — the language title/description/comment are written in
--   app_locales    — which site languages the app's own screens can show
--                    (both → filmed once per language; missing ones get captions)
--   translations   — { "<other locale>": { title, description, builderNote } }
-- PUBLIC columns: the card and work page read them with the anon key, so they
-- get the same column-level SELECT grant as migration_private_columns.sql
-- (that file's list is updated too — probe-project-columns checks the two match).
-- User content like target_device: deliberately NOT in guard_demo_columns().
-- Run this BEFORE the code that reads these columns is deployed.
-- Re-runnable.
alter table public.projects
  add column if not exists primary_locale text,
  add column if not exists app_locales text[],
  add column if not exists translations jsonb;

alter table public.projects drop constraint if exists projects_primary_locale_values;
alter table public.projects add constraint projects_primary_locale_values
  check (primary_locale is null or primary_locale in ('ko', 'en'));

alter table public.projects drop constraint if exists projects_app_locales_values;
alter table public.projects add constraint projects_app_locales_values
  check (app_locales is null or app_locales <@ array['ko', 'en']::text[]);

alter table public.projects drop constraint if exists projects_translations_shape;
alter table public.projects add constraint projects_translations_shape
  check (translations is null
    or (jsonb_typeof(translations) = 'object' and octet_length(translations::text) <= 8192));

grant select (primary_locale, app_locales, translations)
  on table public.projects to anon, authenticated;

notify pgrst, 'reload schema';
