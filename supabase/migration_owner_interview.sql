-- migration_owner_interview.sql (2026-09-29)
-- Owner interview (mandatory, docs/owner-interview-real-record.md section 2):
-- before drafting, the uploading AI asks the owner 3 questions (+1 optional
-- hide list) and sends the answers in the owner's own words. They steer the
-- filming script, the one-line card bubble and what to leave out of the film.
-- PRIVATE columns: they are NOT in the column-level SELECT grant of
-- migration_private_columns.sql, so anon/authenticated keys cannot read them;
-- the dashboard reads them through /api/projects/private (owner check).
-- owner_interview_confirmed_at: stamped when the owner ticks the confirmation
-- in the draft review window and publishes.
-- Re-runnable.
alter table public.projects
  add column if not exists owner_interview jsonb,
  add column if not exists owner_interview_confirmed_at timestamptz;

notify pgrst, 'reload schema';
