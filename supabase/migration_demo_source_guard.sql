-- ---------------------------------------------------------------------------
-- request_demo(): 소스 인가 추가 (레드팀 F2/F3/F5).
--
-- 배경(취약점): 이 함수는 p_project_id 소유권과 쿼터는 검증했지만
-- p_source_type/p_source_value는 검증 없이 그대로 demo_source_* 에 썼다.
-- 이 함수는 `authenticated`에 grant돼 있어 PostgREST로 직접 호출 가능 →
--   rpc/request_demo {p_source_type:'zip', p_source_value:'<victim>/<pid>'}
-- 로 남의 storage prefix를 심으면, 워커가 그 prefix를 **서비스롤**로 통째
-- 다운로드(RLS 우회)해 타인의 비공개 업로드를 촬영·발행한다.
-- p_source_value:'' 이면 버킷 전체가 열린다.
--
-- 수리: zip 소스의 prefix 첫 세그먼트가 반드시 소유자(=호출자)여야 한다.
-- zip의 source_value는 항상 우리 `{uid}/{pid}` 형태라 오탐이 없다.
-- (참고: /api/preview live_url 직접-RPC 벡터는 SQL에서 우리 origin을 구분할 수
--  없어 오탐 위험이 있으므로 여기서 막지 않는다 — 라우트의 resolveBuildPayload와
--  워커 job.ts의 origin-aware 검사가 담당. github/외부 live_url은 detectDemoSource
--  형태검증 + assertSafePublicUrl가 담당.)
--
-- 나머지 본문은 migration_demo_quota.sql의 request_demo와 동일 — 인가 블록만 추가.
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
$$;

revoke all on function request_demo(uuid, text, text) from public;
grant execute on function request_demo(uuid, text, text) to authenticated;
