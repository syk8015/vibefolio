-- migration_target_device.sql (2026-09-15)
-- Which screen the work was designed for, answered by the AI at ingest
-- (targetDevice: "mobile" | "desktop"). The draft review modal frames its
-- preview with it (phone 402x874 or desktop 1280x800). No manual toggle.
-- User content like demo_access: deliberately NOT in guard_demo_columns().
alter table public.projects
  add column if not exists target_device text;

alter table public.projects
  drop constraint if exists projects_target_device_values;
alter table public.projects
  add constraint projects_target_device_values
  check (target_device is null or target_device in ('mobile', 'desktop'));

notify pgrst, 'reload schema';
