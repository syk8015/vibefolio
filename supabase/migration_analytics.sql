-- Product analytics (2026-07-09) — funnel + wedge measurement (P0.2).
--
-- Deliberately SEPARATE from the two existing logs so analytics writes can never
-- pollute cost/quota accounting:
--   * demo_events     — quota counting (kind auto/approved/drain), read by request_demo()
--   * portfolio_views — public profile view tracking
--   * analytics_events (this file) — product funnel: demo build success rate,
--                       signup→demo conversion, share rate.
--
-- Append-only. Default-deny RLS: only the service role (server routes + the
-- recorder worker) writes, and only /admin (service role) reads. Run in Supabase
-- Dashboard > SQL Editor.
create table if not exists analytics_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references profiles(id) on delete set null,
  session_id text,
  event      text not null,
  props      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Metrics slice by event over a rolling window (build-success-rate, daily counts).
create index if not exists analytics_events_event_time on analytics_events (event, created_at);
-- Per-user funnel (signup → project → demo) lookups.
create index if not exists analytics_events_user_time on analytics_events (user_id, created_at);

alter table analytics_events enable row level security;
-- No policies at all -> default-deny for anon/authenticated. Only the service_role
-- (server analytics writer + worker + /admin reads) touches this table, so a user
-- can neither forge events nor read the aggregate log.
