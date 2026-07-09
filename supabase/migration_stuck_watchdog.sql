-- Stuck-job watchdog support (2026-07-09, P0.4).
--
-- Adds projects.demo_status_changed_at + a trigger that stamps it on EVERY
-- demo_build_status transition (pending→building→…→done/failed), no matter which
-- writer moves it (request_demo, the worker, an admin). The /api/cron/health route
-- reads it to reap rows stuck in an in-flight state for too long — so a user is
-- never left on a spinner forever when the worker machine is off.
--
-- Run in Supabase SQL Editor.
alter table projects add column if not exists demo_status_changed_at timestamptz;

-- Backfill existing rows so they're never null (null wouldn't be reaped anyway —
-- `< cutoff` is null/false — but a real value keeps the metric honest).
update projects
  set demo_status_changed_at = coalesce(demo_generated_at, created_at)
  where demo_status_changed_at is null;

create or replace function stamp_demo_status_changed() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    if new.demo_build_status is not null then
      new.demo_status_changed_at := now();
    end if;
  elsif new.demo_build_status is distinct from old.demo_build_status then
    new.demo_status_changed_at := now();
  end if;
  return new;
end;
$$;

-- Fires alongside the existing projects_guard_demo trigger. Order is irrelevant:
-- the guard never changes demo_build_status, so both see the same new/old.
drop trigger if exists projects_stamp_demo_status on projects;
create trigger projects_stamp_demo_status
  before insert or update on projects
  for each row execute function stamp_demo_status_changed();
