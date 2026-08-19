-- 홍보 클립 오프닝 방식 (2026-08-19) — 같은 문구를 두 가지 시작으로 찍어 비교할
-- 수 있게 promo_clips에 컬럼 추가.
--   full : 빈 화면(깜빡이는 커서)에서 시작해 한 글자씩 타이핑 — 원래 방식.
--          앞에 검은 화면에서 밝아지는 페이드인이 붙는다.
--   hook : 문구가 이미 35%쯤 쳐진 지점에서 시작 — 피드 자동재생용, 페이드 없음.
-- 기본값은 hook(피드에서 스크롤을 멈추게 하는 쪽).

alter table promo_clips add column if not exists opening text
  not null default 'hook' check (opening in ('full', 'hook'));
