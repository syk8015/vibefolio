-- profiles.locale — 유저 언어 설정 (i18n 3단계: 이메일/알림을 유저 언어로 보내기 위함)
-- null = 아직 선택 안 함 (UI는 쿠키가 담당, 이 컬럼은 로그아웃 상태에서도
-- 언어를 알아야 하는 이메일 발송 경로만 쓴다)
-- Supabase Dashboard > SQL Editor에서 실행

alter table profiles
  add column if not exists locale text
  check (locale is null or locale in ('ko', 'en'));
