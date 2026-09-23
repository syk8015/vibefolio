-- 폰 → 컴퓨터 넘기기 (2026-09-23) — docs/desktop-handoff.md
--
-- 폰으로 광고를 본 사람이 [내 컴퓨터로 보내기]에 이메일을 넣으면 한 행이 생긴다.
-- 메일 속 링크(/signup?h=<id>)가 이 행으로 가입 화면의 이메일을 채우고, 폰에서
-- 잡은 광고 출처(first_touch)를 컴퓨터 쪽 가입까지 이어 준다.
--
-- 이메일을 들고 있는 표라 기본 거부 RLS(정책 0개) — 서버가 관리자 권한 열쇠로만
-- 읽고 쓴다. 30일 지난 행은 알림 크론(/api/cron/handoff-reminders)이 지운다.
--
-- Run in Supabase Dashboard > SQL Editor.

create table if not exists desktop_handoffs (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  locale      text not null default 'en',
  remind      boolean not null default false,   -- "(선택) 내일 한 번 더 알려주기" 동의
  first_touch jsonb,                             -- 폰의 utm·referrer (lib/analytics-client)
  created_at  timestamptz not null default now(),
  opened_at   timestamptz,                       -- 컴퓨터에서 링크를 연 첫 시각
  reminded_at timestamptz                        -- 알림 메일을 보낸 시각(딱 1번)
);

alter table desktop_handoffs enable row level security;
revoke all on desktop_handoffs from anon, authenticated;

-- 알림 크론이 훑는 모양: 동의·안 열림·안 보냄·시간대.
create index if not exists desktop_handoffs_remind_idx
  on desktop_handoffs (created_at)
  where remind and opened_at is null and reminded_at is null;
