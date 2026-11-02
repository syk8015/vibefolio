-- 관리자 추가 인증(2026-11-02, 보안 로드맵 1단계 5번) — lib/adminStepUp.ts.
--
-- 관리자 화면·API는 '집 나라'에서는 로그인만으로 열리고, 그 밖의 나라에서는 인증 앱 6자리
-- (Supabase MFA, aal2) 뒤에만 열린다. 집 나라 목록이 이 한 칸이다(두 글자 나라 코드).
-- 이사·장기 체류 때 바꾼다. 비우면('{}') 어디서든 6자리를 묻는다.
-- system_status는 서비스 키 전용(RLS, 정책 없음)이라 앱 서버만 읽는다. 다시 돌려도 안전.
alter table public.system_status
  add column if not exists admin_home_countries text[] not null default '{KR}';
