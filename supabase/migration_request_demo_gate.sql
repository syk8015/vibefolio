-- 촬영 대기열 게이트 + 예약 아이디 3개 (2026-11-03, 보안 5단계 낮음 묶음).
-- 1) request_demo(): 실서버의 지금 정의(= migration_quota_loosening.sql 마지막 판)를 그대로 복사하고 덧붙임 —
--    초안·내린 작품·정지된 사람이면 거절, 하루 한도 세기를 잠금으로 한 줄 세우기, 익명 실행 권한 빼기.
--    다음에 고칠 땐 이 파일이 마지막 정의다.
-- 2) 예약 아이디에 실제 앱 주소 send·intro-render와 곧 만들 security 추가(lib/reservedUsernames.ts와 같게).
-- 다시 돌려도 안전하다.
create or replace function public.request_demo(p_project_id uuid, p_source_type text, p_source_value text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_per_project_max constant int := 2;
  v_per_user_daily  constant int := 10;
  v_global_daily    constant int := 100;
  v_window_hours    constant int := 24;
  v_uid      uuid := auth.uid();
  v_owner    uuid;
  v_attempts int;
  v_status   text;
  v_video    text;
  v_draft    boolean;
  v_down     timestamptz;
  v_user_cnt int;
  v_glob_cnt int;
  v_cutoff   timestamptz := now() - make_interval(hours => v_window_hours);
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  end if;

  -- Lock the row so concurrent triggers for the same project serialise.
  select user_id, coalesce(demo_attempt_count, 0), demo_build_status, demo_video_url, is_draft, taken_down_at
    into v_owner, v_attempts, v_status, v_video, v_draft, v_down
  from projects where id = p_project_id
  for update;

  if v_owner is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_owner <> v_uid then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  -- 공개된 작품만 찍는다(2026-11-03, 보안 5단계 낮음 S5-F2·S8-F5·D4·S6-F5) — 초안·내린 작품·정지된
  -- 사람의 작품은 RPC를 직접 불러도 대기열에 못 들어간다(정지는 모든 작품을 초안으로 돌리지만 한 번 더).
  if v_draft or v_down is not null then
    return jsonb_build_object('ok', false, 'code', 'NOT_PUBLIC');
  end if;
  if exists (select 1 from profiles where id = v_owner and suspended_at is not null) then
    return jsonb_build_object('ok', false, 'code', 'SUSPENDED');
  end if;

  -- Source authorization (F2). zip prefixes are storage-listed by the worker with
  -- the SERVICE ROLE (RLS bypassed), so a foreign or empty prefix would exfiltrate
  -- another user's private upload — bypassing this whole quota/ownership gate via a
  -- direct RPC call. The prefix's first segment MUST be the owner (== caller here).
  if p_source_type = 'zip'
     and (p_source_value is null
          or split_part(p_source_value, '/', 1) <> v_owner::text) then
    return jsonb_build_object('ok', false, 'code', 'BAD_SOURCE');
  end if;

  -- Already queued / in flight / held -> idempotent no-op (also stops a re-fire
  -- from stacking duplicate hold requests).
  if v_status in ('pending', 'building', 'recording', 'editing', 'held') then
    return jsonb_build_object('ok', true, 'status', v_status, 'deduped', true);
  end if;

  -- A project that already has a video is locked: re-recording needs approval.
  if v_status = 'done' or v_video is not null then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_HAS_DEMO');
  end if;

  -- Retry budget for landing the first take is exhausted -> needs approval.
  if v_attempts >= v_per_project_max then
    return jsonb_build_object('ok', false, 'code', 'ATTEMPT_LIMIT');
  end if;

  -- 하루 한도를 동시 호출로 넘지 못하게 세는 것부터 한 줄로 세운다(S5-F3). 촬영 요청은 드물어 기다림은 없다.
  perform pg_advisory_xact_lock(hashtext('request_demo:quota'));

  select count(*) into v_user_cnt
  from demo_events
  where user_id = v_uid and kind = 'auto' and created_at > v_cutoff;

  select count(*) into v_glob_cnt
  from demo_events
  where kind in ('auto', 'approved') and created_at > v_cutoff;

  -- Over the per-user daily allowance or the global ceiling -> HOLD for review.
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
$function$;

revoke execute on function public.request_demo(uuid, text, text) from anon, public;
grant execute on function public.request_demo(uuid, text, text) to authenticated;

alter table profiles drop constraint if exists profiles_username_not_reserved;
alter table profiles add constraint profiles_username_not_reserved
  check (lower(username) <> all (array[
    'admin','api','auth','dashboard','login','signup','onboarding',
    'publish','privacy','terms','forgot-password','reset-password',
    'error','not-found','oauth','promo-record','send','intro-render','security',
    '_next','static','public','assets','favicon','robots','sitemap',
    'icon','apple-icon',
    'explore','watch','settings','account','help','support','docs',
    'blog','about','www','mail','email','root','system','official',
    'nookframe','null','undefined','me','new','edit'
  ]));
