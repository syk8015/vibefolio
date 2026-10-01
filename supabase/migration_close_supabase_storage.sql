-- 옛 Supabase 파일 버킷 닫기(2026-10-01) — 사용자 파일은 이제 R2(lib/userStorage.ts).
--
-- 왜: 코드는 더 이상 project-files·avatars 버킷에 쓰지 않지만, 버킷이 공개(public)이고 "자기 폴더엔
-- 써도 된다" 규칙(RLS 정책)이 남아 있으면 누구든 자기 로그인 키로 거기 큰 파일을 올리고 공개 주소를
-- 퍼뜨려 Supabase 무료 전송량(월 5GB)을 바닥낼 수 있다 — R2로 옮긴 이유가 그대로 남는다.
-- 그래서 ① 두 버킷의 사용자용 정책을 전부 지우고(쓰기·읽기·지우기) ② 버킷을 비공개로 바꾼다.
-- 관리자 권한(서버)은 정책과 무관하게 계속 읽고 지울 수 있다(옛 파일 정리용).
--
-- ⚠️ 순서: 옛 파일을 R2로 옮긴 뒤(POST /api/admin/storage-migrate) 실행. 다시 돌려도 안전.
-- ⚠️ 정책 이름은 대시보드에서 손으로 만든 것과 레포 이름이 달라서 이름으로 지우지 않고,
--    두 버킷 이름이 조건에 들어간 정책을 전부 찾아 지운다(security.md 함정과 같은 방식).

begin;

do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') ~ '(project-files|avatars)' or coalesce(with_check, '') ~ '(project-files|avatars)')
  loop
    execute format('drop policy if exists %I on storage.objects', p.policyname);
  end loop;
end $$;

update storage.buckets set public = false where id in ('project-files', 'avatars');

commit;

-- 확인 1 — 0행이어야 한다:
--   select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
--     and (coalesce(qual,'') ~ '(project-files|avatars)' or coalesce(with_check,'') ~ '(project-files|avatars)');
-- 확인 2 — 둘 다 public = false:
--   select id, public from storage.buckets where id in ('project-files', 'avatars');
