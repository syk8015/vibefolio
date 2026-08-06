-- ---------------------------------------------------------------------------
-- username 문자셋을 DB에서 강제한다 (레드팀 감사 H2).
--
-- 배경(취약점): profiles는 브라우저에서 PostgREST로 직접 PATCH되고, username
-- 규칙([a-zA-Z0-9_-])은 온보딩/대시보드의 JS·HTML pattern에만 있었다. DB는
-- 유니크·예약어만 막고 문자셋은 안 막아서, 유저가
--   PATCH /rest/v1/profiles?id=eq.<self> {"username":"/evil.tld"}
-- 로 슬래시·점을 심으면 랜딩 PiP의 <iframe src={`/${username}?showcase=1`}> 가
-- `//evil.tld?showcase=1` 이 되어 nookframe.com 홈에 공격자 페이지가 가짜
-- 🔒 크롬 바와 함께 임베드된다(오픈 리다이렉트/피싱).
--
-- 앱 규칙과 동일: ^[A-Za-z0-9_-]+$, 최소 2자(app/onboarding/page.tsx:25).
-- 최대는 넉넉히 64(현 UI 무제한이라 정상 유저를 막지 않도록 — 실 위협은 길이가
-- 아니라 문자셋). 슬래시·점·콜론·퍼센트가 봉쇄되면 경로 주입은 불가능해진다.
--
-- NOT VALID: 신규/수정 write에는 즉시 강제되지만 기존 행은 재검사하지 않는다.
-- prod profiles(자기 소유 소수)가 규칙 위반이어도 ALTER가 실패하지 않게 하기
-- 위함 — 공격 벡터(새 write)는 즉시 닫힌다. 기존 행 정합 확인 후:
--   alter table profiles validate constraint profiles_username_format;
-- 로 마저 검증할 수 있다.
-- 사전 점검: select username from profiles
--            where username !~ '^[A-Za-z0-9_-]{2,64}$';
-- ---------------------------------------------------------------------------
alter table profiles drop constraint if exists profiles_username_format;
alter table profiles add constraint profiles_username_format
  check (username ~ '^[A-Za-z0-9_-]{2,64}$') not valid;
