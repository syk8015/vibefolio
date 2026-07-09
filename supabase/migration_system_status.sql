-- Operational spine (2026-07-09) — worker heartbeat + a global kill switch.
--
-- Shared by three P0 items:
--   * P0.1 launchd worker  — writes worker_last_seen_at every poll so we can tell
--                            an auto-restarting worker is actually alive.
--   * P0.4 stuck watchdog  — reads worker_last_seen_at to detect a dead/wedged worker.
--   * P0.5 credit fallback — sets demo_paused=true to drain-stop without a deploy.
--
-- Singleton row (id='singleton'). Service role only. Run in Supabase SQL Editor.
create table if not exists system_status (
  id                  text primary key default 'singleton',
  worker_last_seen_at timestamptz,
  worker_status       text,          -- 'idle' | 'busy'
  demo_paused         boolean not null default false,
  updated_at          timestamptz not null default now(),
  constraint system_status_singleton check (id = 'singleton')
);

-- Seed the single row so the worker can UPDATE it (no upsert race).
insert into system_status (id) values ('singleton') on conflict (id) do nothing;

alter table system_status enable row level security;
-- No policies -> default-deny. Only the service role (worker heartbeat + admin)
-- reads/writes it.
