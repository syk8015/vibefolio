-- User-guided demo, variant 1 (text description).
--
-- projects.demo_user_hint: creator-written "core feature" description. The local
-- recording worker reads it with the job row and injects it into the explore
-- briefing, so the demo leads with the feature the creator cares about (canvas /
-- editor apps are invisible to a pixels-only explore).
--
-- Deliberately NOT added to guard_demo_columns() (migration_demo_quota.sql):
-- this is user CONTENT like title/description, so owners may write it directly
-- through their RLS update policy. Length cap matches the worker-side truncation.

alter table projects add column if not exists demo_user_hint text;

alter table projects drop constraint if exists projects_demo_user_hint_len;
alter table projects add constraint projects_demo_user_hint_len
  check (demo_user_hint is null or char_length(demo_user_hint) <= 500);
