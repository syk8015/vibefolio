-- Drop the custom-card columns. The dashboard custom tab was removed on
-- 2026-07-27 (dashboard redesign stage 1, decision #1): its template hooks
-- matched nothing in the card render path, so saving CSS never changed the
-- card while still exposing a broken toggle button to visitors.
--
-- Data-loss check before writing this (prod, 2026-07-27):
--   profiles total rows          = 2
--   rows with custom_mode = true = 0
--   rows with non-empty css      = 0
--
-- Rebuild-order note: migration_custom_and_content_type.sql (M17) creates
-- these columns to mirror the historical prod schema; running migrations in
-- order creates then drops them, which is correct and idempotent.
alter table profiles drop column if exists custom_mode;
alter table profiles drop column if exists custom_css;

-- Verify (both must now fail with: column "..." does not exist):
--   select custom_mode from profiles limit 1;
--   select custom_css  from profiles limit 1;
