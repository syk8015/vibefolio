-- 정지 중에 탈퇴한 @아이디는 다시 못 쓴다 (2026-11-03, 보안 5단계 S10-F4 — 사용자 결정).
-- 정지된 사람이 스스로 탈퇴하면 명함·작품이 cascade로 지워지고 @아이디가 비어, 같은 이메일로 다시 가입해
-- 같은 @아이디로 정지 전과 같은 주소에 명함을 다시 세울 수 있었다. 탈퇴 API(app/api/account)가 정지 상태면
-- 지우기 전에 @아이디만 여기 남긴다(이메일은 남기지 않는다 — '탈퇴 즉시 파기'와 안 부딪힘, 처리방침 제3조).
-- 서버(관리자 권한)만 읽고 쓴다. 사용자 키·익명 키 권한 0. 다시 돌려도 안전하다.
create table if not exists retired_usernames (
  username   text primary key,
  reason     text not null default 'suspended-account-deleted',
  retired_at timestamptz not null default now()
);
alter table retired_usernames enable row level security;
revoke all on retired_usernames from anon, authenticated;

-- 사용자 키로 명함을 만들거나 아이디를 바꿀 때도 막아야 해서 SECURITY DEFINER(표를 못 읽는 역할도 검사).
-- 23505(겹침)로 올려 가입 화면이 '이미 쓰는 아이디'로 보여 준다.
create or replace function guard_retired_username()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.username is not null
     and (tg_op = 'INSERT' or new.username is distinct from old.username)
     and exists (select 1 from retired_usernames r where r.username = lower(new.username)) then
    raise exception 'USERNAME_RETIRED' using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_retired_username on profiles;
create trigger guard_retired_username
  before insert or update of username on profiles
  for each row execute function guard_retired_username();
