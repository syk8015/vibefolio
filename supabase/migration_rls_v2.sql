-- =============================================================
-- Nookframe RLS 보완 마이그레이션
-- Supabase Dashboard > SQL Editor 에서 실행하세요
-- =============================================================

-- ─── 1. portfolio_views 테이블 RLS ──────────────────────────
-- 이 테이블은 RLS가 없어 누구나 읽기/쓰기 가능한 상태입니다.

alter table portfolio_views enable row level security;

-- 누구나 방문 기록 추가 가능 (공개 액션)
create policy "누구나 방문 기록 추가"
  on portfolio_views for insert with check (true);

-- 본인 프로필 방문 기록만 조회 가능
create policy "본인만 방문 기록 조회"
  on portfolio_views for select
  using (auth.uid() = profile_id);

-- UPDATE/DELETE 정책 없음 = 기본적으로 차단됨 (불변 로그)


-- ─── 2. profiles 테이블 DELETE 정책 추가 ─────────────────────
-- 현재 DELETE 정책이 없습니다. auth.users cascade가 있지만
-- 직접 API 호출로 삭제 가능한 상태를 막습니다.

create policy "본인만 프로필 삭제"
  on profiles for delete using (auth.uid() = id);


-- ─── 3. Storage: project-files 버킷 RLS ──────────────────────
-- 폴더 구조: project-files/{user_id}/{파일들}

-- 공개 읽기 (포트폴리오 방문자가 파일 접근 가능)
create policy "공개 읽기 - project-files"
  on storage.objects for select
  using (bucket_id = 'project-files');

-- 본인 폴더에만 업로드 가능
create policy "본인만 업로드 - project-files"
  on storage.objects for insert
  with check (
    bucket_id = 'project-files'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 본인 폴더 파일만 삭제 가능
create policy "본인만 삭제 - project-files"
  on storage.objects for delete
  using (
    bucket_id = 'project-files'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 본인 폴더 파일만 수정 가능
create policy "본인만 수정 - project-files"
  on storage.objects for update
  using (
    bucket_id = 'project-files'
    and auth.uid()::text = (storage.foldername(name))[1]
  );


-- ─── 4. Storage: avatars 버킷 RLS ────────────────────────────
-- 폴더 구조: avatars/{user_id}.{ext} 또는 avatars/{user_id}/{파일}

create policy "공개 읽기 - avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "본인만 업로드 - avatars"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "본인만 삭제 - avatars"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "본인만 수정 - avatars"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
