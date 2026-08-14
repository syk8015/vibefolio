-- 홍보 클립 팩토리 (2026-08) — 로그인 후 메인 화면(LoggedInHeadline)에서 도는 밈
-- 태그라인 타이핑 구간을 짧은 mp4로 촬영해 SNS/커뮤니티에 반자동 배포하는
-- 관리자 전용 워크플로우 (/admin/promo).
--
-- promo_clips — 촬영 큐 + 결과물. /admin/promo의 "촬영 큐에 추가" 버튼이
--   pending 행을 만들고, local-runner/promo-worker.ts(npm run promo:batch)가
--   기존 demo 파이프라인과 같은 철학(claim-and-process, 조건부 UPDATE로 race
--   방지)으로 소비한다. 유저 소유 데이터도 과금 유발도 없는 내부 전용 배치라
--   demo_events/system_status 급의 전역 캡·kill-switch는 두지 않는다.
-- promo_posts — 클립을 채널별로 "어디에 언제 올렸는지" 기록. 채널은 고정
--   enum이 아니라 자유 텍스트(인스타/유튜브/틱톡/X/스레드/디시/기타 커뮤니티
--   전부 허용). utm_campaign 값은 컬럼으로 저장하지 않고 lib/promo.ts에서
--   'promo-' || id 로 항상 파생한다 — 포스트 id 자체가 이미 전역 유일하므로
--   별도 slug 발급 메커니즘이 불필요하고, 링크 생성 쪽과 집계 쪽이 같은 함수를
--   써서 절대 어긋나지 않는다.
--
-- RLS: content_reports/demo_moderation과 동일한 default-deny — 관리자 API
-- 라우트와 로컬 워커가 전부 service role로만 접근하므로 정책을 아예 두지 않는다.
--
-- Run in Supabase Dashboard > SQL Editor.

create table if not exists promo_clips (
  id             uuid primary key default gen_random_uuid(),
  status         text not null default 'pending'
                   check (status in ('pending', 'recording', 'done', 'failed')),
  tagline_locale text not null check (tagline_locale in ('ko', 'en')),
  tagline_text   text not null,
  tagline_reply  text,
  video_url      text,
  video_key      text,
  poster_url     text,
  duration_sec   numeric,
  error          text,
  -- 큐에 넣은 관리자 이메일(감사 흔적용 텍스트, FK 아님).
  requested_by   text,
  created_at     timestamptz not null default now(),
  recorded_at    timestamptz
);

-- claim-next 폴링(pending 우선)과 크래시 복구 스캔(recording 잔존 행) 둘 다
-- status 필터라 인덱스 하나로 충분.
create index if not exists promo_clips_status_created
  on promo_clips (status, created_at);

alter table promo_clips enable row level security;

create table if not exists promo_posts (
  id         uuid primary key default gen_random_uuid(),
  clip_id    uuid not null references promo_clips(id) on delete cascade,
  channel    text not null check (char_length(channel) between 1 and 60),
  caption    text,
  status     text not null default 'draft' check (status in ('draft', 'posted')),
  -- 실제 게시물 링크(관리자가 수동 기재, 참고용 — 유입/가입 집계는 utm_campaign
  -- 기반 analytics_events로 하므로 이 컬럼과 무관하게 동작한다).
  post_url   text,
  posted_at  timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists promo_posts_clip_id on promo_posts (clip_id);
create index if not exists promo_posts_channel on promo_posts (channel, created_at);

alter table promo_posts enable row level security;
