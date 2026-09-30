-- 공개 작품 링크 순찰(2026-09-30, 위협 목록 D3 뒤편) — lib/linkPatrol.ts.
--
-- 촬영·그림 검사는 찍는 그 순간만 본다. 그 뒤 사이트가 딴 곳으로 넘기거나, 죽거나,
-- 구글 위험 사이트 목록에 오르면 명함의 [체험하기]는 그대로 그곳을 가리켰다.
-- 점검 크론(5분마다)이 공개 작품 링크를 하루 한 번씩 열어 보고 결과를 여기 적는다.
-- 명함·작품 화면은 link_state가 있으면 [체험하기]를 숨긴다(link_unverified와 같은 자리).
--
--   link_state          공개 — null(괜찮음) · 'moved'(처음 본 곳과 다른 사이트로 넘어감)
--                        · 'dead'(3일째 안 열림) · 'unsafe'(구글 Web Risk 위험 목록)
--   link_state_detail   비공개 — 넘어간 호스트·위험 종류(대시보드가 주인에게 보여줌)
--   link_checked_url    비공개 — 마지막으로 본 demo_url(바뀌면 순찰이 먼저 다시 본다)
--   link_checked_at     비공개 — 마지막으로 본 때
--   link_baseline_host  비공개 — 이 주소를 처음 열었을 때 도착한 호스트
--   link_fail_since     비공개 — 연달아 안 열리기 시작한 때
--
-- 순찰(관리자 권한)만 쓴다 — 사용자 키로는 못 쓰게 트리거가 막는다. 주인이 주소를 고쳐도
-- 표시는 순찰이 새 주소를 볼 때(몇 분 안)까지 그대로다 — 주소만 바꿔 표시를 지우는 길을 막는다.
-- ⚠️ 순서: 이 SQL 먼저, 그 다음 이 칸을 읽는 코드 배포. 다시 돌려도 안전.

begin;

alter table public.projects
  add column if not exists link_state text,
  add column if not exists link_state_detail text,
  add column if not exists link_checked_url text,
  add column if not exists link_checked_at timestamptz,
  add column if not exists link_baseline_host text,
  add column if not exists link_fail_since timestamptz;

alter table public.projects drop constraint if exists projects_link_state_check;
alter table public.projects add constraint projects_link_state_check
  check (link_state is null or link_state in ('moved', 'dead', 'unsafe'));

create or replace function public.guard_link_patrol() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.link_state is not null or new.link_state_detail is not null or new.link_checked_url is not null
    or new.link_checked_at is not null or new.link_baseline_host is not null or new.link_fail_since is not null then
      raise exception 'link patrol columns are managed by the server' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.link_state is distinct from old.link_state
  or new.link_state_detail is distinct from old.link_state_detail
  or new.link_checked_url is distinct from old.link_checked_url
  or new.link_checked_at is distinct from old.link_checked_at
  or new.link_baseline_host is distinct from old.link_baseline_host
  or new.link_fail_since is distinct from old.link_fail_since then
    raise exception 'link patrol columns are managed by the server' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists projects_guard_link_patrol on public.projects;
create trigger projects_guard_link_patrol
  before insert or update on public.projects
  for each row execute function public.guard_link_patrol();

grant select (link_state) on table public.projects to anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- 찔러보기: node scripts/probe-link-patrol.mjs
