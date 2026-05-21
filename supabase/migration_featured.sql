-- Phase 1: Featured project per user
-- Adds is_featured boolean and a partial unique index so each user
-- can only have one featured project at a time.

alter table projects
  add column if not exists is_featured boolean not null default false;

create unique index if not exists projects_one_featured_per_user
  on projects (user_id)
  where is_featured = true;
