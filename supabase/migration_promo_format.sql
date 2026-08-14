-- 홍보 클립 포맷 (2026-08) — 세로(릴스·쇼츠 9:16)/가로(유튜브 16:9) 두 비율을
-- 지원하기 위해 promo_clips에 컬럼 추가. 로그인 없는 녹화 전용 페이지
-- (app/promo-record/page.tsx) 재설계와 함께 도입.

alter table promo_clips add column if not exists format text
  not null default 'vertical' check (format in ('vertical', 'horizontal'));
