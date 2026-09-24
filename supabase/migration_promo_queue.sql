-- 홍보 업로드 예약 대기열 1단계 (2026-09-25, docs/promo-publish.md §2.3·§2.4).
--
-- promo_posts.status를 draft|posted → draft|queued|publishing|posted|failed로 넓히고
-- 서버 게시(2단계)가 쓸 칸 4개를 더한다. 1단계에선 [예약]이 queued + scheduled_at만
-- 적는다 — 실제로 올리는 코드는 2단계부터라 queued 행은 그때까지 그대로 기다린다.
--
-- Run in Supabase Dashboard > SQL Editor. 여러 번 돌려도 안전하다.

-- 1. 상태 CHECK 교체. 처음 표를 만들 때 이름 없이 붙인 제약이라 이름을 찍지 않고
--    status를 거는 CHECK를 찾아 지운다(기본 이름은 promo_posts_status_check).
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.promo_posts'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.promo_posts drop constraint %I', c.conname);
  end loop;
end $$;

alter table promo_posts add constraint promo_posts_status_check
  check (status in ('draft', 'queued', 'publishing', 'posted', 'failed'));

-- 2. 새 칸.
--   scheduled_at — 올릴 시각. queued인데 비어 있으면 안 된다(아래 제약).
--   external_id  — 플랫폼 컨테이너 id·업로드 세션 주소. 게시 **전에** 적고 재시도는
--                  같은 id로 이어간다(두 번 올라가는 것 막기).
--   fail_reason  — 실패 이유(사람이 읽을 문장).
--   attempts     — 일시 실패 재시도 횟수(3회까지).
alter table promo_posts add column if not exists scheduled_at timestamptz;
alter table promo_posts add column if not exists external_id  text;
alter table promo_posts add column if not exists fail_reason  text;
alter table promo_posts add column if not exists attempts     int not null default 0;

alter table promo_posts drop constraint if exists promo_posts_queued_has_time;
alter table promo_posts add constraint promo_posts_queued_has_time
  check (status <> 'queued' or scheduled_at is not null);

comment on column promo_posts.post_url is
  '게시 성공 시 서버가 채움(손으로 올린 채널은 비어 있을 수 있다). 유입·가입 집계는 utm_campaign 기반이라 이 칸과 무관.';

-- 3. 같은 클립+채널 = 같은 포스트(추적 링크가 둘로 갈라지면 성적이 반토막).
--    지금까지는 API가 재사용으로만 지켰다 — 예약이 행을 만들기 시작하므로 표가 지킨다.
--    (09-25 실서버 확인: 겹치는 행 0개)
create unique index if not exists promo_posts_clip_channel_uniq on promo_posts (clip_id, channel);

-- 4. 게시 크론(2단계)이 5분마다 "시각이 된 예약"을 찾는 자리.
create index if not exists promo_posts_queue
  on promo_posts (scheduled_at) where status in ('queued', 'publishing');
