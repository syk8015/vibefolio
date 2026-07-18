-- Demo moderation quarantine (2026-07-19) — input-matrix gap #4: 자동 시연 녹화물
-- 사후 스캔. 워커가 촬영 직후 프레임을 비전 분류에 통과시키고, 위반 의심이면
-- 영상을 업로드하되 projects.demo_video_url에는 연결하지 않은 채(공개 표면은
-- 그 컬럼만 본다) 이 테이블에 격리 URL을 담고 프로젝트를 held로 잡는다.
-- 관리자가 /admin 인박스에서 승인(게시) / 거절(스토리지 삭제 + failed[policy])한다.
--
-- 격리 URL을 projects 컬럼이 아니라 별도 테이블에 두는 이유: projects는 누구나
-- 읽기 RLS라 컬럼에 담는 순간 anon 키로 새어나간다. 이 테이블은 content_reports와
-- 같은 default-deny — service-role(워커·관리자 라우트)만 접근.
--
-- Run in Supabase Dashboard > SQL Editor.

create table if not exists demo_moderation (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  -- Quarantined artifacts. Keys kept alongside URLs so reject can delete the
  -- exact objects without re-deriving storage layout.
  video_url   text not null,
  poster_url  text,
  video_key   text not null,
  poster_key  text,
  storage     text not null check (storage in ('r2', 'supabase')),
  -- Classifier verdict detail (admin-facing only; user sees generic copy).
  categories  text[] not null default '{}',
  reason      text check (char_length(reason) <= 1000),
  model       text,
  status      text not null default 'open' check (status in ('open', 'approved', 'rejected')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

-- One OPEN quarantine per project: a re-record that flags again refreshes the
-- open row (worker upserts on this) instead of stacking duplicates.
create unique index if not exists demo_moderation_open_per_project
  on demo_moderation (project_id)
  where status = 'open';

-- Admin inbox sorts by freshest open items; resolved history stays queryable.
create index if not exists demo_moderation_status_time on demo_moderation (status, created_at desc);

-- Default-deny RLS: no policies on purpose — only service-role reads/writes.
alter table demo_moderation enable row level security;
