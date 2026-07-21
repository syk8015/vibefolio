-- Nookframe Connect — AI 원클릭 인제스트 (2026-07-21)
-- 외부 AI 에이전트(클로드코드 CLI·MCP·붙여넣기 프롬프트)가 로그인된 유저 대신
-- 프로젝트를 "초안"으로 밀어넣을 수 있게 하는 인증·초안 인프라. Run in Supabase
-- Dashboard > SQL Editor.
--
-- Layers this adds:
--   1. api_tokens  -- 유저별 개인 액세스 토큰(PAT). sha256 해시만 저장, raw는 발급 시 1회.
--   2. is_draft    -- 인제스트된 프로젝트는 초안으로 들어와 공개 어디에도 안 뜸.
--   3. RLS 교체    -- projects 공개 SELECT를 `using(true)` → 초안 숨김으로 바꿔 DB
--                     레이어에서 에어타이트(앱 필터 없이도 초안이 anon에게 안 새게).

-- ---------------------------------------------------------------------------
-- 1. 개인 액세스 토큰 (PAT)
-- ---------------------------------------------------------------------------
create table if not exists api_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  token_hash   text not null unique,   -- sha256(raw hex). raw는 발급 응답에서 1회만.
  token_prefix text not null,          -- 표시용 "nf_live_ab12cd…" (raw 아님)
  name         text,                   -- 유저 라벨 "Claude Code (MacBook)"
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
-- 활성 토큰 조회/개수 세기용.
create index if not exists api_tokens_user_active
  on api_tokens (user_id) where revoked_at is null;

alter table api_tokens enable row level security;
-- 소유자는 자기 토큰 목록/폐기만. 발급(insert)·해시 검증·소프트폐기(update)는
-- 전부 서비스롤 서버 경로에서만 일어난다(아래 정책엔 insert/update 없음 = default-deny).
drop policy if exists api_tokens_select_own on api_tokens;
create policy api_tokens_select_own on api_tokens for select using (auth.uid() = user_id);
drop policy if exists api_tokens_delete_own on api_tokens;
create policy api_tokens_delete_own on api_tokens for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2. 초안 플래그
-- ---------------------------------------------------------------------------
-- 기존 행은 전부 false(=공개, 동작 불변). 인제스트로 들어온 행만 true로 시작하고,
-- 유저가 대시보드에서 "공개"를 누르면 false로 내려간다. is_featured 처럼 유저가
-- 직접 쓰는 콘텐츠성 컬럼이라 guard_demo_columns() 대상 아님.
alter table projects add column if not exists is_draft boolean not null default false;
create index if not exists projects_draft_owner
  on projects (user_id) where is_draft = true;

-- ---------------------------------------------------------------------------
-- 3. 공개 SELECT 정책 교체 — 초안 숨김 (에어타이트 게이트)
-- ---------------------------------------------------------------------------
-- 기존: `create policy "누구나 프로젝트 읽기" on projects for select using (true)`
-- (schema.sql:48-49). createPublicClient()(anon 키)도 RLS 적용을 받으므로, 정책을
-- 바꾸면 캐시된 공개 읽기까지 전부 자동으로 초안을 제외한다 — 앱 쿼리에서 필터를
-- 하나 빠뜨려도 물리적으로 초안 행이 anon에게 반환되지 않는다. 소유자(쿠키 세션)는
-- auth.uid() = user_id 로 자기 초안을 계속 본다(대시보드).
drop policy if exists "누구나 프로젝트 읽기" on projects;
drop policy if exists projects_select_visible on projects;
create policy projects_select_visible on projects
  for select using (is_draft = false or auth.uid() = user_id);
