-- 아이디 규칙을 DB에도 박는다 (2026-09-22 출시 점검 S3 — A7·B23·B24).
-- 앱은 이미 소문자·2~30자·예약어를 걸러 쓴다(lib/username.ts, lib/reservedUsernames.ts).
-- 이 파일은 그 마지막 방어선. 적용 전 확인: 대문자·30자 초과 아이디 0건(09-22 조회).

-- 1. 예약어에 실제 경로 oauth·promo-record 추가 — lib/reservedUsernames.ts와 같은 목록.
alter table profiles drop constraint if exists profiles_username_not_reserved;
alter table profiles add constraint profiles_username_not_reserved
  check (lower(username) <> all (array[
    'admin','api','auth','dashboard','login','signup','onboarding',
    'publish','privacy','terms','forgot-password','reset-password',
    'error','not-found','oauth','promo-record',
    '_next','static','public','assets','favicon','robots','sitemap',
    'icon','apple-icon',
    'explore','watch','settings','account','help','support','docs',
    'blog','about','www','mail','email','root','system','official',
    'nookframe','null','undefined','me','new','edit'
  ]));

-- 2. 문자셋 제약(migration_username_format.sql, 대소문자 허용·64자)을 좁힌다:
--    소문자만 · 2~30자. 같은 이름으로 갈아 끼워 제약이 두 벌이 되지 않게 한다.
alter table profiles drop constraint if exists profiles_username_format;
alter table profiles add constraint profiles_username_format
  check (username ~ '^[a-z0-9_-]{2,30}$');
