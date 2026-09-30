-- 심사 뒤 주소 바꿔치기 막기(2026-09-30, 위협 목록 D3).
--
-- 명함의 신뢰는 "촬영 + 그림 검사를 통과한 영상"에서 온다. 그런데 대시보드는 demo_url을
-- 사용자 키로 바로 고친다 — 검사받은 영상은 그대로 두고 [체험하기]만 다른 사이트로
-- 바꿀 수 있었다. 여기서 "지금 영상이 어느 주소를 찍은 것인가"를 기록하고, 영상이 있는데
-- 그 주소가 지금 demo_url과 다르면 link_unverified = true — 명함·작품 화면은 그동안
-- 체험 버튼과 라이브 화면을 숨긴다(영상은 그대로). 새 주소로 다시 찍어 검사를 통과하면
-- 저절로 false로 돌아온다.
--
--   demo_filmed_source — 지금 demo_video_url을 찍을 때의 demo_source_value.
--                        비공개 칸(GRANT 안 함). 영상이 바뀌는 순간 트리거가 채운다 —
--                        워커 완료(markDone)·관리자 승인(moderation approve) 어느 길이든.
--                        사용자 키로는 못 쓴다.
--   link_unverified    — 공개 칸, 계산 칸(누구도 직접 못 씀).
--
-- ⚠️ 순서: 이 SQL 먼저, 그 다음 이 칸을 읽는 코드 배포(공개 화면이 link_unverified를
--    select한다 — 칸이 없으면 명함이 깨진다). 다시 돌려도 안전.
-- 칸 목록 원본은 lib/projectColumns.ts(공개 = PUBLIC, 비공개 = PRIVATE).

begin;

alter table public.projects add column if not exists demo_filmed_source text;

-- 이미 있는 영상은 지금 촬영 소스를 찍은 것으로 본다(이 SQL 전의 영상은 추적 기록이 없다).
update public.projects
   set demo_filmed_source = demo_source_value
 where demo_video_url is not null and demo_filmed_source is null;

-- 찍은 소스와 지금 링크가 같은가(lib/demoSource.ts detectDemoSource + lib/demoPayload.ts):
--   live_url 외부 주소 — 값이 demo_url 그대로
--   업로드 웹페이지   — 값이 "<origin>/api/preview/…" (demo_url은 "/api/preview/…")
--   업로드 실행 코드  — 값이 "{uid}/{rowId}" 폴더(demo_url은 "/api/preview/{uid}/{rowId}/<파일>")
--   github            — https://github.com/owner/repo 로 다듬어 저장 → 같은 방식으로 다듬어 비교
create or replace function public.nf_film_matches_link(filmed text, link text)
returns boolean
language sql
immutable
as $$
  select coalesce(filmed is not null and link is not null and (
    filmed = btrim(link)
    or (btrim(link) like '/api/preview/%' and (
          substring(filmed from '^https?://[^/]+(/api/preview/.*)$') = btrim(link)
          or starts_with(btrim(link), '/api/preview/' || filmed || '/')))
    or (filmed ~* '^https://github\.com/[^/]+/[^/]+$'
        and lower(filmed) = 'https://github.com/' || lower(regexp_replace(
              substring(btrim(link) from '(?i)^https?://(?:www\.)?github\.com/([^/?#]+/[^/?#]+)'), '\.git$', '', 'i')))
  ), false)
$$;

alter table public.projects add column if not exists link_unverified boolean
  generated always as (
    demo_video_url is not null
    and not coalesce(public.nf_film_matches_link(demo_filmed_source, demo_url), false)
  ) stored;

create or replace function public.track_filmed_source() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if (tg_op = 'INSERT' and new.demo_filmed_source is not null)
    or (tg_op = 'UPDATE' and new.demo_filmed_source is distinct from old.demo_filmed_source) then
      raise exception 'demo pipeline columns are managed by the server' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.demo_video_url is null then
    new.demo_filmed_source := null;
  elsif tg_op = 'INSERT'
     or new.demo_video_url is distinct from old.demo_video_url
     or new.demo_generated_at is distinct from old.demo_generated_at then
    new.demo_filmed_source := new.demo_source_value;
  end if;
  return new;
end;
$$;

drop trigger if exists projects_track_filmed_source on public.projects;
create trigger projects_track_filmed_source
  before insert or update on public.projects
  for each row execute function public.track_filmed_source();

grant select (link_unverified) on table public.projects to anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- 확인 — 둘 다 나와야 한다: link_unverified(anon·authenticated SELECT), demo_filmed_source(권한 없음):
--   select column_name, grantee from information_schema.column_privileges
--   where table_name = 'projects' and column_name in ('link_unverified', 'demo_filmed_source')
--     and privilege_type = 'SELECT' and grantee in ('anon', 'authenticated');
-- 찔러보기: node scripts/probe-link-swap.mjs
