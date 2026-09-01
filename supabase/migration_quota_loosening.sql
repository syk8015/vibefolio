-- ---------------------------------------------------------------------------
-- 쿼터 완화 (2026-09-01) — 사용자 유치 국면의 의도적 한도 상향.
--
-- 결정: "한 편당 비용이 얼마 안 되니 1인당 제한을 풀자. 빠른 사용자 유치가
-- 필요한 시점 — 나중에 다시 조이더라도 지금은 푸는 게 맞다."
--
--   v_per_user_daily   2 →  10   (1인 24h 자동시연 편수)
--   v_global_daily    40 → 100   (전체 24h 입장 상한. 10편으로 풀어도 이 값이
--                                 40이면 하루 4명에 문이 닫혀 완화가 무의미해짐)
--   v_per_project_max  2 (유지)  — "프로젝트당 영상 1편" 제품 규칙 그대로.
--                                 첫 테이크 실패 시 재시도 1회분이고, 재촬영은
--                                 별도 승인 루프가 담당한다.
--   TS 미러(lib/demoQuota.ts)의 GLOBAL_DRAIN_DAILY도 40 → 100 으로 같이 올림.
--
-- 지갑 천장: 편당 $0.035(직배선 대본)~$0.17(옛길·비전) → 월 $105 ~ $510.
--
-- ⚠️ 이 함수의 직전 정의는 migration_demo_quota.sql이 아니라
--    **migration_demo_source_guard.sql**(레드팀 F2 zip prefix 인가 수리)이다.
--    아래 본문은 그 버전을 그대로 옮기고 상수 두 줄만 바꾼 것 — 옛 quota 파일을
--    베끼면 보안 수리가 조용히 되돌아간다. 다음에 또 바꿀 때도 최신 정의를 찾을 것.
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
  v_per_user_daily  constant int := 10;
  v_global_daily    constant int := 100;
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
