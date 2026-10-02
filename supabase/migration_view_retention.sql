-- 방문 기록 보관 기한(2026-10-02) — portfolio_views의 자세한 줄은 180일만 둔다.
--
-- 왜: 방문 한 번이 한 줄(유입 주소·나라·브라우저 정보)이라 끝없이 쌓인다. 여러 IP에서 몰리는 방문
-- (같은 IP는 30분에 한 번만 센다, app/api/track)이 오래 이어지면 무료 데이터 저장소(500MB)를 갉아먹는다.
-- 화면이 자세한 줄을 쓰는 건 최근 것뿐이다(대시보드 방문 탭 = 최근 500줄 + 오늘·7일·30일, 관제탑 = 30일).
-- 그런데 방문 탭의 '전체' 숫자는 모든 줄을 센다 → 지운 줄 수는 주인별로 portfolio_view_totals에 더해 둔다
-- (전체 = 남은 줄 + 쌓아 둔 수). 개인정보 처리방침 제3조(계정이 있는 동안 보관)보다 짧게 두는 것이라 고칠 곳 없음.
--
-- 지우기는 archive_old_portfolio_views()가 한 문장으로 한다(지우기와 더하기가 같이 되거나 같이 안 된다).
-- 점검 크론(app/api/cron/health, 5분마다)이 틱마다 최대 2000줄씩 부른다. 다시 돌려도 안전.

begin;

create table if not exists portfolio_view_totals (
  profile_id       uuid primary key references profiles(id) on delete cascade,
  archived_views   bigint not null default 0,
  archived_through timestamptz
);

alter table portfolio_view_totals enable row level security;

-- 주인만 자기 숫자를 읽는다. 쓰기는 아래 함수(서비스롤)만.
drop policy if exists "owner reads own view totals" on portfolio_view_totals;
create policy "owner reads own view totals" on portfolio_view_totals
  for select to authenticated using (auth.uid() = profile_id);
revoke all on portfolio_view_totals from anon, authenticated;
grant select on portfolio_view_totals to authenticated;

create or replace function archive_old_portfolio_views(p_before timestamptz, p_limit integer default 2000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  with doomed as (
    select id from portfolio_views
    where viewed_at < p_before
    order by viewed_at
    limit greatest(p_limit, 0)
    for update skip locked
  ), del as (
    delete from portfolio_views v using doomed d where v.id = d.id
    returning v.profile_id
  ), agg as (
    select profile_id, count(*)::bigint as c from del group by profile_id
  ), up as (
    insert into portfolio_view_totals as t (profile_id, archived_views, archived_through)
    select profile_id, c, p_before from agg
    on conflict (profile_id) do update
      set archived_views = t.archived_views + excluded.archived_views,
          archived_through = greatest(t.archived_through, excluded.archived_through)
    returning 1
  )
  select coalesce(sum(c), 0)::integer into n from agg;
  return n;
end;
$$;

revoke execute on function archive_old_portfolio_views(timestamptz, integer) from public, anon, authenticated;

commit;

-- 확인 — 함수가 있고, 사용자 키로는 못 부른다:
--   select has_function_privilege('authenticated', 'archive_old_portfolio_views(timestamptz, integer)', 'execute');  -- false
--   select count(*) from portfolio_views where viewed_at < now() - interval '180 days';  -- 크론 몇 틱 뒤 0
