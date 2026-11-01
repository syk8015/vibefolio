-- 비상 정지 버튼(2026-11-02, 보안 로드맵 1단계 2번).
--
-- 뚫렸을 때 관리자가 /admin 버튼 하나로 피해를 멈춘다. 세 가지:
--   1. 사이트 읽기 전용 — 방문자는 그대로 보고, 저장·업로드·새 연결은 전부 멈춘다.
--   2. 업로드 닫기     — 새 작품·파일 올리기만 멈춘다.
--   3. 연결·로그인 전부 끊기 — AI 연결 토큰(PAT·OAuth)·연결 코드·로그인 세션을 모두 끊는다(되돌릴 수 없음).
--
-- 막는 곳은 두 겹이다. 앱 주소는 middleware.ts(lib/siteLock.ts)가 쓰기 요청을 503으로 막고,
-- 브라우저가 사용자 키로 직접 쓰는 profiles·projects는 아래 트리거가 막는다(대시보드는 API를 안
-- 거치고 데이터 저장소에 바로 쓴다). 둘 다 system_status 한 줄을 본다.
--
-- 다시 돌려도 안전.

begin;

alter table system_status add column if not exists site_readonly_at timestamptz;
alter table system_status add column if not exists uploads_closed_at timestamptz;
alter table system_status add column if not exists tokens_revoked_at timestamptz;

-- 잠금 상태 두 개(비밀 아님). middleware가 익명 키로 읽고, 대시보드가 띠를 띄울 때 읽는다.
-- system_status 자체는 서비스 키 전용이라 definer로 두 값만 내준다.
create or replace function public.site_locks()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    (select jsonb_build_object(
       'readonly', site_readonly_at is not null,
       'uploadsClosed', uploads_closed_at is not null)
     from public.system_status where id = 'singleton'),
    '{"readonly": false, "uploadsClosed": false}'::jsonb)
$$;
revoke all on function public.site_locks() from public;
grant execute on function public.site_locks() to anon, authenticated, service_role;

-- 사용자 키로 오는 쓰기만 막는다. 역할은 current_user가 아니라 요청 토큰(JWT)의 role로 본다 —
-- 사용자가 부른 security definer 함수(request_demo 등) 안에서는 current_user가 postgres가 돼
-- 빠져나가기 때문이다. 서비스 키(관리자 라우트·워커)와 SQL 편집기는 role이 달라 통과한다.
create or replace function public.guard_site_lock()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  jwt_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  locks jsonb;
begin
  if jwt_role not in ('anon', 'authenticated') then
    return coalesce(new, old);
  end if;
  locks := public.site_locks();
  if coalesce((locks ->> 'readonly')::boolean, false) then
    raise exception 'SITE_READONLY' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' and tg_table_name = 'projects' and coalesce((locks ->> 'uploadsClosed')::boolean, false) then
    raise exception 'UPLOADS_CLOSED' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists site_lock_guard on public.profiles;
create trigger site_lock_guard before insert or update or delete on public.profiles
  for each row execute function public.guard_site_lock();
drop trigger if exists site_lock_guard on public.projects;
create trigger site_lock_guard before insert or update or delete on public.projects
  for each row execute function public.guard_site_lock();

-- 연결·로그인 전부 끊기. 한 번에(한 트랜잭션) 하고 센 수를 돌려준다. 서비스 키 전용 —
-- 실서버 기본 권한이 새 함수를 anon·authenticated에도 열어 주므로 만든 뒤 바로 거둔다.
-- 이미 받은 로그인 접근 토큰(JWT)은 만료(기본 1시간)까지 살아 있다 — 갱신만 막힌다.
create or replace function public.admin_revoke_all_access()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  n_tokens int; n_codes int; n_oauth int; n_sessions int;
begin
  update public.api_tokens set revoked_at = now() where revoked_at is null;
  get diagnostics n_tokens = row_count;
  delete from public.connect_codes;
  get diagnostics n_codes = row_count;
  delete from public.oauth_codes;
  get diagnostics n_oauth = row_count;
  delete from auth.sessions;
  get diagnostics n_sessions = row_count;
  delete from auth.refresh_tokens;
  update public.system_status set tokens_revoked_at = now(), updated_at = now() where id = 'singleton';
  return jsonb_build_object('tokens', n_tokens, 'codes', n_codes + n_oauth, 'sessions', n_sessions);
end $$;
revoke all on function public.admin_revoke_all_access() from public, anon, authenticated;
grant execute on function public.admin_revoke_all_access() to service_role;

commit;

-- 확인: select public.site_locks();  → {"readonly": false, "uploadsClosed": false}
