-- 공개 그림 내용 검사 기록(2026-10-02, 위협 목록 "올린 파일의 내용 검사 없음") — lib/mediaScan.ts.
--
-- 점검 크론이 공개 작품 썸네일·프로필 사진을 분류기에 보내고, 주소당 한 줄로 결과를 남긴다(다시 안 보려고).
-- 걸리면 숨기지 않고 신고 인박스에 자동 신고(reporter_key 'auto-scan')를 넣는다 — 관리자가 판단.
-- content_reports와 같은 default-deny: 정책 없음 = anon·authenticated 못 읽고 못 씀, 서비스롤만.
-- 다시 돌려도 안전.

begin;

create table if not exists media_scans (
  url         text primary key check (char_length(url) <= 2048),
  target_type text not null check (target_type in ('profile', 'project')),
  target_id   uuid not null,
  verdict     text not null check (verdict in ('ok', 'flag', 'error')),
  categories  text[] not null default '{}',
  reason      text check (char_length(reason) <= 1000),
  model       text,
  scanned_at  timestamptz not null default now()
);

alter table media_scans enable row level security;
revoke all on media_scans from anon, authenticated;

commit;
