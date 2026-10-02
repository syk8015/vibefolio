-- 신고 내리기 잠금(2026-10-02, 위협 목록 "takedown v1 한계").
--
-- 왜: 관리자가 신고된 작품을 비공개(is_draft=true)로 내려도 주인이 대시보드에서 [공개]를 다시 누르면
-- 그대로 돌아왔다. 프로필(명함) 신고는 내릴 방법 자체가 없었다(약관 제7조 "3영업일 내 비공개").
--
-- 1. projects.taken_down_at — 관리자가 내린 시각. 이 값이 있으면 주인 키로는 다시 공개할 수 없다.
--    비공개 칸(사용자 키 SELECT 권한 없음 = lib/projectColumns.ts PRIVATE). 풀기는 관리자가 null로.
-- 2. profiles.suspended_at — 명함 정지. 정지된 명함은 주인 말고는 안 보이고(제한 정책),
--    그 사람의 작품도 새로 공개할 수 없다(내릴 때 공개 작품은 전부 초안 + taken_down_at).
-- 3. 두 칸 모두 주인이 직접 바꾸지 못한다(트리거). 특권 라이터(service_role = 관리자 라우트)는 예외.
--
-- 풀기(관리자, SQL 편집기):
--   update projects set taken_down_at = null where id = '<작품 id>';
--   update profiles set suspended_at = null where id = '<사람 id>';  -- 작품은 주인이 다시 공개
-- 다시 돌려도 안전.

begin;

alter table projects add column if not exists taken_down_at timestamptz;
alter table profiles add column if not exists suspended_at timestamptz;

-- 정지된 명함은 주인 말고는 안 보인다. restrictive = 다른 읽기 정책과 AND로 묶여, 이름이 다른
-- "누구나 읽기" 정책이 남아 있어도 이 조건을 비켜 가지 못한다.
drop policy if exists "정지된 명함 숨김" on profiles;
create policy "정지된 명함 숨김" on profiles as restrictive
  for select using (suspended_at is null or auth.uid() = id);

-- security invoker(기본값)여야 한다 — definer면 함수 안의 current_user가 함수 주인(postgres)이 돼
-- 아래 "일반 세션만" 검사가 늘 빠져나가 아무것도 안 막는다(10-02 실서버 프로브로 확인).
create or replace function guard_takedown_columns()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  -- 특권 라이터(service_role = 관리자 라우트·워커)는 예외. 일반 세션만 authenticated/anon.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_table_name = 'profiles' then
    if tg_op = 'INSERT' then
      if new.suspended_at is not null then
        raise exception 'SUSPENDED_MANAGED_BY_SERVER' using errcode = '42501';
      end if;
    elsif new.suspended_at is distinct from old.suspended_at then
      raise exception 'SUSPENDED_MANAGED_BY_SERVER' using errcode = '42501';
    end if;
    return new;
  end if;

  -- projects
  if tg_op = 'INSERT' then
    if new.taken_down_at is not null then
      raise exception 'TAKEN_DOWN_MANAGED_BY_SERVER' using errcode = '42501';
    end if;
  else
    if new.taken_down_at is distinct from old.taken_down_at then
      raise exception 'TAKEN_DOWN_MANAGED_BY_SERVER' using errcode = '42501';
    end if;
    if old.taken_down_at is not null and new.is_draft = false then
      raise exception 'TAKEN_DOWN' using errcode = '42501';
    end if;
  end if;
  if new.is_draft = false
     and exists (select 1 from profiles p where p.id = new.user_id and p.suspended_at is not null) then
    raise exception 'TAKEN_DOWN' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_takedown_projects on projects;
create trigger guard_takedown_projects
  before insert or update on projects
  for each row execute function guard_takedown_columns();

drop trigger if exists guard_takedown_profiles on profiles;
create trigger guard_takedown_profiles
  before insert or update on profiles
  for each row execute function guard_takedown_columns();

commit;
