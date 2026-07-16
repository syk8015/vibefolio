-- Content reports (2026-07-16) — T6: public 신고 button on the theater (/@user)
-- and watch (/@user/:id) pages. Anyone (logged-out included) can flag a profile
-- or a project; reports land here and page the admin via Resend. Moderation
-- action stays manual on /admin for now.
--
-- Run in Supabase Dashboard > SQL Editor.

create table if not exists content_reports (
  id               uuid primary key default gen_random_uuid(),
  target_type      text not null check (target_type in ('profile', 'project')),
  target_id        uuid not null,
  reason           text not null check (reason in ('spam', 'adult', 'impersonation', 'copyright', 'other')),
  detail           text check (char_length(detail) <= 500),
  -- Hashed reporter IP (lib/rate-limit.ts clientIpKey) — dedup + abuse tracing
  -- without storing raw PII. Logged-in reporters also get reporter_user_id.
  reporter_key     text not null,
  reporter_user_id uuid references profiles(id) on delete set null,
  status           text not null default 'open' check (status in ('open', 'resolved')),
  created_at       timestamptz not null default now()
);

-- One OPEN report per (target, reporter): re-submitting while un-reviewed is a
-- no-op, but a resolved report doesn't block flagging a repeat offense later.
create unique index if not exists content_reports_dedup
  on content_reports (target_type, target_id, reporter_key)
  where status = 'open';

-- Admin review sorts by freshest open reports.
create index if not exists content_reports_status_time on content_reports (status, created_at desc);

-- Default-deny RLS: inserts go through /api/report (service role) so the
-- rate limit + validation can't be bypassed with the anon key; reads are
-- admin-only (service role). No policies on purpose.
alter table content_reports enable row level security;
