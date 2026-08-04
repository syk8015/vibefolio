-- ---------------------------------------------------------------------------
-- 데모 파이프라인 컬럼 가드를 INSERT까지 확장한다.
--
-- 배경(취약점): guard_demo_columns() 트리거가 `before update`로만 걸려 있어,
-- 로그인 유저가 PostgREST로 projects에 직접 INSERT하면서
--   demo_build_status='pending', demo_source_type='zip',
--   demo_source_value='<victim_uid>/<victim_project_id>'
-- 를 심으면 그 행이 곧바로 워커 큐 항목이 된다(worker는
-- demo_build_status='pending' AND demo_source_type IS NOT NULL을 폴링).
-- 이렇게 하면 request_demo()의 일일/프로젝트 쿼터·SSRF/콘텐츠호스트 검증·
-- 소스 검증을 전부 우회하고, 서비스롤이 zip prefix를 읽으므로 타인의 비공개
-- 업로드까지 촬영·발행할 수 있다(열거 하드닝도 무력화).
--
-- 참고: INSERT 정상 경로(대시보드 handleAdd, /api/ingest)는 demo_* 파이프라인
-- 컬럼을 절대 세팅하지 않는다(기본값 NULL / demo_attempt_count=0). 소스는 항상
-- 발행 시점 trigger-demo → request_demo(SECURITY DEFINER, 아래 exempt)가 채운다.
-- 따라서 이 가드는 정상 흐름을 깨지 않는다.
-- ---------------------------------------------------------------------------
create or replace function guard_demo_columns() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  -- 특권 라이터는 예외: service_role(워커 + admin 라우트)과
  -- request_demo()(SECURITY DEFINER -> 테이블 소유자로 실행). 일반 세션만
  -- 'authenticated' / 'anon'으로 실행된다.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- 엔드유저 INSERT는 파이프라인 관리 컬럼을 기본값 외로 넣을 수 없다.
    if new.demo_build_status  is not null
    or new.demo_source_type   is not null
    or new.demo_source_value  is not null
    or new.demo_video_url     is not null
    or new.demo_generated_at  is not null
    or new.demo_build_error   is not null
    or coalesce(new.demo_attempt_count, 0) <> 0 then
      raise exception 'demo pipeline columns are managed by the server'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE: 기존 로직(값이 실제로 바뀔 때만 거부).
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
  before insert or update on projects
  for each row execute function guard_demo_columns();
