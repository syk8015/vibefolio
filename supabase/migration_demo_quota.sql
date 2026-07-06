-- Demo cost guards (2026-07-06) — stop a burst of demo requests from draining the
-- Anthropic/E2B budget in one moment. See lib/demoQuota.ts for the numbers and
-- project-viral-strategy for the policy. Run in Supabase Dashboard > SQL Editor.
--
-- Layers this adds:
--   1. demo_events   — append-only counting log (per-user / global / drain).
--   2. demo_requests — the admin approval queue (over-cap holds + re-record asks).
--   3. 'held'        — a new demo_build_status: no auto video, show fallback image,
--                      awaiting admin review.
--   4. guard trigger — end users can no longer write the demo_* pipeline columns
--                      directly (the RLS bypass hole), so the ONLY way to enqueue
--                      a demo is through request_demo() / an admin (service role).
--   5. request_demo()— atomic admission: check caps + enqueue in one transaction.

-- ---------------------------------------------------------------------------
-- 1. Counting log
-- ---------------------------------------------------------------------------
create table if not exists demo_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references profiles(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  kind       text not null check (kind in ('auto', 'approved', 'drain')),
  created_at timestamptz not null default now()
);
create index if not exists demo_events_kind_time on demo_events (kind, created_at);
create index if not exists demo_events_user_time on demo_events (user_id, kind, created_at);

alter table demo_events enable row level security;
-- No policies at all → default-deny for anon/authenticated. Only the table owner
-- (the SECURITY DEFINER request_demo) and the service_role (worker/admin) touch it.

-- ---------------------------------------------------------------------------
-- 2. Admin approval queue
-- ---------------------------------------------------------------------------
create table if not exists demo_requests (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  kind       text not null check (kind in ('over_cap', 'rerecord')),
  reason     text,          -- rerecord: user's "what to change"; over_cap: system note
  status     text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists demo_requests_status_time on demo_requests (status, created_at);
-- At most one OPEN request of each kind per project.
create unique index if not exists demo_requests_one_pending
  on demo_requests (project_id, kind) where status = 'pending';

alter table demo_requests enable row level security;
-- Users may read their own request status (dashboard shows "심사 중"); all writes
-- go through the service role (rerecord route + admin route), which bypasses RLS.
drop policy if exists "본인 요청 읽기" on demo_requests;
create policy "본인 요청 읽기" on demo_requests for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. New 'held' status
-- ---------------------------------------------------------------------------
-- Drop whatever check constraint currently guards demo_build_status (its name is
-- auto-generated and can vary), then re-add one that also allows 'held'.
do $$
declare c text;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where rel.relname = 'projects' and ns.nspname = 'public'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%demo_build_status%'
  loop
    execute format('alter table projects drop constraint %I', c);
  end loop;
end $$;

alter table projects add constraint projects_demo_build_status_check
  check (demo_build_status in
    ('pending', 'building', 'recording', 'editing', 'done', 'failed', 'held'));

-- ---------------------------------------------------------------------------
-- 4. Guard: block end users from writing the demo_* pipeline columns directly.
--    Without this, a user could skip the quota'd route and set
--    demo_build_status='pending' straight on their own row (RLS lets them UPDATE
--    their projects) — the worker would then record it, bypassing every cap.
-- ---------------------------------------------------------------------------
create or replace function guard_demo_columns() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  -- Privileged writers are exempt: the service_role (worker + admin routes) and
  -- request_demo() (SECURITY DEFINER → runs as the table owner). Only ordinary
  -- end-user sessions run as 'authenticated' / 'anon'.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.demo_build_status  is distinct from old.demo_build_status
  or new.demo_source_type   is distinct from old.demo_source_type
  or new.demo_source_value  is distinct from old.demo_source_value
  or new.demo_video_url     is distinct from old.demo_video_url
  or new.demo_generated_at  is distinct from old.demo_generated_at
  or new.demo_attempt_count is distinct from old.demo_attempt_count
  or new.demo_build_error   is distinct from old.demo_build_error then
    raise exception 'demo pipeline columns are managed by the server'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists projects_guard_demo on projects;
create trigger projects_guard_demo
  before update on projects
  for each row execute function guard_demo_columns();

-- ---------------------------------------------------------------------------
-- 5. Atomic admission. Called by the trigger-demo route with the user's JWT, so
--    auth.uid() inside is the caller. SECURITY DEFINER → runs as owner, so it can
--    write the guarded columns and read the RLS-locked counting tables. Returns
--    jsonb: { ok, status?, code?, reason?, deduped? }.
--
--    The caps are HARDCODED here, NOT passed in: this function is granted to
--    `authenticated`, so a caller could otherwise invoke it directly with inflated
--    limits and bypass every guard. Keep these in sync with lib/demoQuota.ts
--    (PER_PROJECT_MAX_ATTEMPTS / PER_USER_DAILY / GLOBAL_DAILY / WINDOW_HOURS).
-- ---------------------------------------------------------------------------
create or replace function request_demo(
  p_project_id   uuid,
  p_source_type  text,
  p_source_value text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_per_project_max constant int := 2;
  v_per_user_daily  constant int := 2;
  v_global_daily    constant int := 40;
  v_window_hours    constant int := 24;
  v_uid      uuid := auth.uid();
  v_owner    uuid;
  v_attempts int;
  v_status   text;
  v_video    text;
  v_user_cnt int;
  v_glob_cnt int;
  v_cutoff   timestamptz := now() - make_interval(hours => v_window_hours);
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  end if;

  -- Lock the row so concurrent triggers for the same project serialise.
  select user_id, coalesce(demo_attempt_count, 0), demo_build_status, demo_video_url
    into v_owner, v_attempts, v_status, v_video
  from projects where id = p_project_id
  for update;

  if v_owner is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_owner <> v_uid then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  -- Already queued / in flight / held → idempotent no-op (also stops a re-fire
  -- from stacking duplicate hold requests).
  if v_status in ('pending', 'building', 'recording', 'editing', 'held') then
    return jsonb_build_object('ok', true, 'status', v_status, 'deduped', true);
  end if;

  -- A project that already has a video is locked: re-recording needs approval.
  if v_status = 'done' or v_video is not null then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_HAS_DEMO');
  end if;

  -- Retry budget for landing the first take is exhausted → needs approval.
  if v_attempts >= v_per_project_max then
    return jsonb_build_object('ok', false, 'code', 'ATTEMPT_LIMIT');
  end if;

  select count(*) into v_user_cnt
  from demo_events
  where user_id = v_uid and kind = 'auto' and created_at > v_cutoff;

  select count(*) into v_glob_cnt
  from demo_events
  where kind in ('auto', 'approved') and created_at > v_cutoff;

  -- Over the per-user daily allowance or the global ceiling → HOLD for review.
  if v_user_cnt >= v_per_user_daily or v_glob_cnt >= v_global_daily then
    update projects set
      demo_source_type  = p_source_type,
      demo_source_value = p_source_value,
      demo_build_status = 'held',
      demo_build_error  = null
    where id = p_project_id;

    if not exists (
      select 1 from demo_requests
      where project_id = p_project_id and kind = 'over_cap' and status = 'pending'
    ) then
      insert into demo_requests (project_id, user_id, kind, reason)
      values (
        p_project_id, v_uid, 'over_cap',
        case when v_glob_cnt >= v_global_daily
             then 'Daily global capacity reached'
             else 'Daily per-user upload limit reached' end
      );
    end if;

    return jsonb_build_object(
      'ok', true, 'status', 'held',
      'reason', case when v_glob_cnt >= v_global_daily then 'global' else 'user' end);
  end if;

  -- Admit: enqueue + count.
  update projects set
    demo_source_type   = p_source_type,
    demo_source_value  = p_source_value,
    demo_build_status  = 'pending',
    demo_build_error   = null,
    demo_attempt_count = v_attempts + 1
  where id = p_project_id;

  insert into demo_events (user_id, project_id, kind) values (v_uid, p_project_id, 'auto');

  return jsonb_build_object('ok', true, 'status', 'pending');
end;
$$;

revoke all on function request_demo(uuid, text, text) from public;
grant execute on function request_demo(uuid, text, text) to authenticated;
