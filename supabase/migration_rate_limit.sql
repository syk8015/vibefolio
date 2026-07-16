-- Infra rate limiting (2026-07-16) — T6: real per-IP limits for the public
-- write endpoints (/api/track, /api/analytics, /api/report).
--
-- Design: a fixed-window counter in Postgres instead of external KV (Upstash /
-- Vercel KV). At this scale one atomic RPC round-trip per request is cheap, and
-- it adds zero new accounts/keys. If volume ever makes this hot, swap the
-- lib/rate-limit.ts internals for KV — callers won't change.
--
-- Run in Supabase Dashboard > SQL Editor.

create table if not exists rate_limits (
  bucket       text primary key,          -- e.g. "track:<ip-hash>"
  window_start timestamptz not null,
  count        integer not null
);

-- Default-deny RLS: only the service role touches this (server routes via the
-- rl_touch RPC below + the cron sweep). No policies on purpose.
alter table rate_limits enable row level security;

-- Atomic touch-and-check: one upsert decides "allowed?" without a read-then-write
-- race. When the current window expired, the row resets to a fresh window.
-- Returns true while the caller is within p_max hits per p_window_seconds.
create or replace function rl_touch(p_bucket text, p_window_seconds integer, p_max integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_allowed boolean;
begin
  insert into rate_limits (bucket, window_start, count)
  values (p_bucket, v_now, 1)
  on conflict (bucket) do update set
    count = case
      when rate_limits.window_start < v_now - make_interval(secs => p_window_seconds)
        then 1
      else rate_limits.count + 1
    end,
    window_start = case
      when rate_limits.window_start < v_now - make_interval(secs => p_window_seconds)
        then v_now
      else rate_limits.window_start
    end
  returning count <= p_max into v_allowed;
  return v_allowed;
end;
$$;

-- The function is SECURITY DEFINER (it must write past RLS), so make sure only
-- the service role can call it — an anon caller could otherwise burn buckets.
revoke execute on function rl_touch(text, integer, integer) from public, anon, authenticated;
