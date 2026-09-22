-- 공개 작품의 비공개 칸이 공개 익명 키로 읽히던 것 닫기(2026-09-22 감사 ①, 2026-09-23).
--
-- projects RLS는 행 단위(is_draft=false or 주인)라 칸을 못 가린다. 작품이 공개되면
-- 그 행의 모든 칸 — 로그인 데모 진입 주소(demo_access), 로봇 메모(demo_user_hint),
-- 대본(demo_script·pending_*), 촬영 에러 원문(demo_build_error), 소스 경로
-- (demo_source_value) — 이 사이트 코드에 박힌 익명 키로 누구나 읽혔다.
-- 여기서 anon·authenticated의 SELECT를 공개 칸 목록으로만 다시 허락한다.
--
-- ⚠️ 순서: 코드 먼저(사용자 키로 이 칸들을 안 읽게 바뀐 커밋이 prod에 배포된 뒤) 실행.
--    코드는 이 SQL 전에도 후에도 돈다. 반대 순서면 대시보드가 permission denied로 깨진다.
-- ⚠️ 칸 목록 원본은 lib/projectColumns.ts PUBLIC_PROJECT_COLUMNS — 둘이 어긋나면
--    npm test(probe-project-columns)가 막는다. projects에 칸을 새로 만들면 공개 칸은
--    아래 GRANT에 추가하는 SQL을 따로 돌려야 한다(안 하면 그 칸은 사용자 키로 안 읽힘).
-- 영향 없음: 관리자 권한 열쇠(서버·워커), SECURITY DEFINER 함수(request_demo 등),
--    UPDATE/INSERT 권한(그대로), RLS 정책(id·user_id·is_draft는 공개 칸).

begin;

revoke select on table public.projects from anon, authenticated;

grant select (
  id,
  user_id,
  title,
  description,
  type,
  thumbnail,
  year,
  tags,
  demo_url,
  comment,
  sort_order,
  created_at,
  content_type,
  is_featured,
  video_url,
  demo_source_type,
  demo_build_status,
  demo_video_url,
  demo_generated_at,
  demo_attempt_count,
  demo_status_changed_at,
  is_draft,
  pending_script_at,
  rerecord_self_used,
  target_device
) on table public.projects to anon, authenticated;

commit;

-- 확인 1 — 2행(anon·authenticated)이 나오고 각각 count = 25여야 한다:
--   select grantee, count(*) from information_schema.column_privileges
--   where table_schema = 'public' and table_name = 'projects' and privilege_type = 'SELECT'
--     and grantee in ('anon', 'authenticated') group by grantee;
-- 확인 2 — 0행이어야 한다. 칸 권한은 projects 위에 만든 뷰(기본은 만든 사람 권한으로 돈다)나
--   projects 행을 돌려주는 SECURITY DEFINER 함수로 우회된다. 레포 SQL엔 둘 다 없지만
--   대시보드에서 손으로 만든 게 있을 수 있다:
--   select view_schema, view_name from information_schema.view_table_usage
--   where table_schema = 'public' and table_name = 'projects';
--   select proname from pg_proc
--   where prosecdef and pronamespace = 'public'::regnamespace
--     and pg_get_functiondef(oid) ilike '%from%projects%' and proname <> 'request_demo';
--   (request_demo는 ok/code만 돌려준다. 다른 이름이 나오면 반환값에 비공개 칸이 있는지 볼 것.)
-- ⚠️ 나중에 "grant select on all tables in schema public to anon, authenticated" 같은
--    흔한 복구 스니펫을 돌리면 이 SQL이 통째로 무효가 된다 — 돌렸다면 이 파일을 다시 실행.
-- 찔러보기: node scripts/probe-private-columns.mjs
-- 되돌리기(한 줄): grant select on table public.projects to anon, authenticated;
