-- Nookframe Connect — demoScript (촬영 대본, demoHighlights의 구조화 승격).
--
-- projects.demo_script jsonb: 작품을 만든 AI가 주는 스텝 단위 촬영 대본,
-- shape { steps: [{ goal, where?, action?, text?, expect? }], skip?, prep? }.
-- 산문 힌트(demo_user_hint)는 레코더가 "어딜 눌러야 하는지"를 픽셀에서 되추론해야
-- 했고 그 추론이 껍데기 비트(다크모드 토글 먼저)로 새는 걸 실측으로 확인
-- (2026-08-19 Nookframe 자기촬영). 만든 AI가 아는 것(버튼 라벨·순서·기대 결과)을
-- 구조로 받아 explore 브리핑의 등뼈로 쓴다. demo_user_hint는 하위호환으로 유지.
--
-- 인제스트는 저장만 한다(정규화=lib/demoScript.ts, 세 소비 지점 공유). 사용은
-- 발행 시점 쿠키 인증 trigger-demo → 로컬 워커 → explore 브리핑 주입이 유일
-- 경로이며, 대본은 "제안"으로만 취급된다(하드룰·쓰기 mock 집행층은 불변).
--
-- Deliberately NOT added to guard_demo_columns() (migration_demo_quota.sql):
-- demo_user_hint·demo_access와 같은 유저 CONTENT 컬럼이라 소유자가 RLS update
-- 정책으로 직접 수정할 수 있어야 한다.
--
-- Size cap: 정규화 상한(10스텝×4필드 + skip 8×80 + prep 300)을 전부 한글로 채워도
-- ~14KB — 16KB check가 여유 있게 덮는다. top-level 타입도 object로 고정.

alter table projects add column if not exists demo_script jsonb;

alter table projects drop constraint if exists projects_demo_script_shape;
alter table projects add constraint projects_demo_script_shape
  check (
    demo_script is null
    or (jsonb_typeof(demo_script) = 'object' and pg_column_size(demo_script) <= 16384)
  );
