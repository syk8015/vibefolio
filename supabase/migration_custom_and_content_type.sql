-- Untracked prod columns captured for rebuild parity
-- (M17 — 2026-07-21 프리런치 감사).
--
-- 아래 세 컬럼은 prod에 수동으로만 추가돼 있었고 어떤 마이그레이션에도 없었다. 그래서
-- 이 마이그레이션 세트로 DB를 처음부터 재빌드하면(DR·스테이징) 세 컬럼이 없어
--   · custom_css / custom_mode 누락  → 커스텀 명함(사용자 CSS 모드)이 깨짐
--   · content_type 누락              → 프로젝트 콘텐츠 유형 라벨/식별 라인이 깨짐
-- 이 발생했다. 실제 라이브 스키마를 PostgREST OpenAPI 인트로스펙션으로 정확히 확인해
-- (타입·기본값·nullable 그대로) 재현한다. 전부 `add column if not exists`라 이미 컬럼이
-- 있는 prod에 적용해도 무영향(no-op) — 재빌드 정합성만 채운다.

-- profiles: 커스텀 명함 — 사용자 CSS 모드 토글 + CSS 본문
-- (둘 다 nullable. custom_mode 기본 false, custom_css 기본 '' — prod와 동일.)
alter table profiles add column if not exists custom_mode boolean default false;
alter table profiles add column if not exists custom_css  text    default '';

-- projects: 콘텐츠 유형 id(예: notion/youtube/… — lib/identityLine.ts 라벨 매핑).
-- nullable, 기본값 없음(미분류 = null).
alter table projects add column if not exists content_type text;
