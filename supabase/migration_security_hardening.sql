-- =============================================================
-- Nookframe 보안 강화 마이그레이션 (Storage)
-- Supabase Dashboard > SQL Editor 에서 실행하세요.
--
-- 목적:
--  1) zip-slip 방어 (F3): 업로드 객체 키에 `..` 경로 세그먼트가 들어가면
--     RLS 첫-세그먼트 검사(auth.uid())는 통과하면서도 다른 사용자 prefix로
--     새거나 키를 오염시킬 수 있다. anon key로 storage API를 직접 호출해도
--     막히도록 정책 자체에서 `..` 세그먼트를 거부한다.
--  2) 업로드 폭탄 완화 (B3): 클라이언트 10MB 체크는 우회 가능하므로
--     버킷에 서버측 객체 크기 상한을 둔다.
--
-- 기존 정책과 동일한 소유권 규칙(첫 폴더 = auth.uid())을 유지하면서
-- `name !~ '(^|/)\.\.(/|$)'` (정확히 `..` 세그먼트일 때만 매칭) 조건만 추가.
-- 정상 파일명(foo..bar.js 등)은 영향 없음.
-- =============================================================

-- ─── project-files: 업로드/수정 정책 재생성 (`..` 차단) ───────────
drop policy if exists "본인만 업로드 - project-files" on storage.objects;
create policy "본인만 업로드 - project-files"
  on storage.objects for insert
  with check (
    bucket_id = 'project-files'
    and auth.uid()::text = (storage.foldername(name))[1]
    and name !~ '(^|/)\.\.(/|$)'
  );

drop policy if exists "본인만 수정 - project-files" on storage.objects;
create policy "본인만 수정 - project-files"
  on storage.objects for update
  using (
    bucket_id = 'project-files'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'project-files'
    and auth.uid()::text = (storage.foldername(name))[1]
    and name !~ '(^|/)\.\.(/|$)'
  );

-- ─── avatars: 동일하게 `..` 차단 ────────────────────────────────
drop policy if exists "본인만 업로드 - avatars" on storage.objects;
create policy "본인만 업로드 - avatars"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
    and name !~ '(^|/)\.\.(/|$)'
  );

drop policy if exists "본인만 수정 - avatars" on storage.objects;
create policy "본인만 수정 - avatars"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
    and name !~ '(^|/)\.\.(/|$)'
  );

-- ─── 객체 크기 상한 (B3 업로드 폭탄 완화) ───────────────────────
-- project-files: 업로드 영상 20MB를 허용하면서도 상한을 둠 → 25MB.
-- avatars: 아바타 이미지면 충분한 5MB.
update storage.buckets set file_size_limit = 26214400 where id = 'project-files';
update storage.buckets set file_size_limit = 5242880  where id = 'avatars';
