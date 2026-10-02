-- 프로필·작품 글자 길이 상한(2026-10-02, 위협 목록 M급 "length caps").
--
-- 왜: 대시보드는 profiles·projects를 사용자 키로 바로 쓴다(RLS = 내 줄만). 화면의 maxLength는
-- 브라우저 쪽 안내일 뿐이라 스크립트로 소개 칸에 수 MB 글자를 넣으면 그대로 저장되고 명함에 뜬다.
-- 상한은 화면 규칙보다 넉넉하게(이름 40자 → 100자 등) 잡아 정상 사용은 절대 안 걸린다.
-- 2026-10-02 실측 최대: 소개 48자, 설명 96자, 소개 영상 대본 2KB — 상한과 거리가 멀다.
--
-- not valid: 기존 줄은 검사하지 않고 새로 쓰는 값만 막는다(넣는 순간 실패할 일 없음).
-- 다시 돌려도 안전(drop if exists → add).

begin;

-- profiles
alter table profiles drop constraint if exists len_profiles_name;
alter table profiles add constraint len_profiles_name check (name is null or char_length(name) <= 100) not valid;
alter table profiles drop constraint if exists len_profiles_bio;
alter table profiles add constraint len_profiles_bio check (bio is null or char_length(bio) <= 1000) not valid;
alter table profiles drop constraint if exists len_profiles_handles;
alter table profiles add constraint len_profiles_handles check (
  (twitter is null or char_length(twitter) <= 300) and (github is null or char_length(github) <= 300)
) not valid;
alter table profiles drop constraint if exists len_profiles_avatar;
alter table profiles add constraint len_profiles_avatar check (avatar_url is null or char_length(avatar_url) <= 2048) not valid;
alter table profiles drop constraint if exists len_profiles_social;
alter table profiles add constraint len_profiles_social check (
  social_links is null or (cardinality(social_links) <= 20 and octet_length(array_to_string(social_links, ' ')) <= 20000)
) not valid;

-- projects: 글자 칸
alter table projects drop constraint if exists len_projects_text;
alter table projects add constraint len_projects_text check (
  char_length(title) <= 300
  and (description is null or char_length(description) <= 2000)
  and (comment is null or char_length(comment) <= 5000)
  and (year is null or char_length(year) <= 20)
) not valid;
-- projects: 주소 칸
alter table projects drop constraint if exists len_projects_urls;
alter table projects add constraint len_projects_urls check (
  (thumbnail is null or char_length(thumbnail) <= 2048)
  and (demo_url is null or char_length(demo_url) <= 2048)
  and (video_url is null or char_length(video_url) <= 2048)
  and (demo_source_value is null or char_length(demo_source_value) <= 2048)
) not valid;
-- projects: 태그
alter table projects drop constraint if exists len_projects_tags;
alter table projects add constraint len_projects_tags check (
  tags is null or (cardinality(tags) <= 30 and octet_length(array_to_string(tags, ' ')) <= 3000)
) not valid;
-- projects: 대본·인터뷰 등 JSON 칸(바이트)
alter table projects drop constraint if exists len_projects_json;
alter table projects add constraint len_projects_json check (
  (demo_script is null or octet_length(demo_script::text) <= 131072)
  and (pending_demo_script is null or octet_length(pending_demo_script::text) <= 131072)
  and (intro_film is null or octet_length(intro_film::text) <= 131072)
  and (owner_interview is null or octet_length(owner_interview::text) <= 32768)
  and (demo_access is null or octet_length(demo_access::text) <= 8192)
) not valid;

commit;
