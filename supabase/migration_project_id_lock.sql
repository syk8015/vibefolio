-- 작품 id(기본 키)는 바꿀 수 없다 (2026-11-03, 보안 5단계 S8-F2).
-- projects UPDATE 권한은 표 단위라 주인이 사용자 키로 id 칸도 바꿀 수 있었다. 신고가 들어온 뒤
-- id를 바꾸면 관리자 [내리기]가 행을 못 찾아 '이미 지워진 작품'으로 신고만 닫고, 작품은 새 id로
-- 계속 공개됐다. 칸 단위 REVOKE는 표 단위 GRANT가 있으면 듣지 않으므로 트리거로 막는다.
-- 서버(관리자 권한)도 id를 바꿀 일이 없어 역할을 가리지 않는다. 다시 돌려도 안전하다.
create or replace function guard_project_id()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'PROJECT_ID_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_project_id on projects;
create trigger guard_project_id
  before update of id on projects
  for each row execute function guard_project_id();
