-- 매일 밈 (2026-11-04) — 설계: ~/Desktop/nookframe-작업물/nookframe-research-2026-11-04/daily-memes/01-설계.md
--
-- 주인의 맥이 밤마다 유행 밈을 조사해 홈 타이핑 문구 후보를 쓰고(유행 검사·민감도 검사 근거 포함),
-- /api/worker/memes(MEME_SECRET)로 '대기(pending)' 상태로만 넣는다. 주인이 /admin/memes에서
-- 하나씩 승인해야 홈에 뜬다 — 자동 공개는 없다.
--
-- 두 표 모두 기본 거부 RLS(정책 0개): 서버가 관리자 권한 열쇠로만 읽고 쓴다.
-- 홈에 공개 출력할 때는 서버가 status='approved'만 고른다(명시 필터 — AGENTS.md).
--
-- 다시 돌려도 안전. Run in Supabase Dashboard > SQL Editor.

create table if not exists meme_runs (
  id          uuid primary key default gen_random_uuid(),
  run_date    date not null,                         -- 맥 기준 그날(한국 시간)
  status      text not null check (status in ('ok', 'skipped', 'failed')),
  reason      text check (char_length(reason) <= 500),   -- 건너뜀·실패 까닭(사람 말)
  usage       jsonb,                                  -- 구독 한도 전후(%)
  counts      jsonb,                                  -- 모은 재료·후보·거른 수
  created_at  timestamptz not null default now()
);
create index if not exists meme_runs_date_idx on meme_runs (run_date desc);

create table if not exists meme_lines (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid references meme_runs (id) on delete set null,
  lang         text not null check (lang in ('ko', 'en')),
  audience     text not null check (audience in ('logged_in', 'everyone')),
  kind         text not null check (kind in ('new', 'refresh')),
  text         text not null check (char_length(text) between 1 and 120),
  reply        text check (char_length(reply) between 1 and 120),
  replaces     text check (char_length(replaces) between 1 and 200),  -- refresh: 바꿀 기존 문구(글자 그대로)
  source       jsonb,          -- 비튼 유행 틀: 이름·링크·한 줄 설명
  trend        jsonb,          -- 유행 검사: 점수·판정·근거 숫자(출처·기간)
  sensitivity  jsonb,          -- 민감도: 점수·색·칸별 근거(인용·링크·날짜)
  sensitivity_score smallint check (sensitivity_score between 0 and 100),
  status       text not null default 'pending'
               check (status in ('pending', 'approved', 'rejected', 'retired')),
  edited       boolean not null default false,       -- 주인이 고쳐서 승인(검사 뒤 글이 바뀜)
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  constraint meme_lines_refresh_has_target check (kind <> 'refresh' or replaces is not null)
);

-- 같은 말 같은 문구는 한 번만 — 밤 작업이 다시 넣으면 조용히 건너뛴다.
create unique index if not exists meme_lines_unique_text
  on meme_lines (lang, text, coalesce(reply, ''));
create index if not exists meme_lines_review_idx on meme_lines (status, created_at desc);

alter table meme_runs  enable row level security;
alter table meme_lines enable row level security;
revoke all on meme_runs  from anon, authenticated;
revoke all on meme_lines from anon, authenticated;
