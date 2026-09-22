-- storage.objects 쓰기 규칙을 한 벌로 정리(2026-09-23, 실DB 대조).
--
-- 실DB엔 같은 일을 하는 쓰기(INSERT·UPDATE·DELETE) 규칙이 세 벌 겹쳐 있었다:
--   · 대시보드에서 손으로 만든 것("본인만 업로드"·"본인만 수정"·"본인만 프로젝트 파일 …")
--   · migration_security_hardening.sql("본인만 업로드/수정/삭제 - 버킷", ".." 금지 포함)
--   · migration_prelaunch_hardening.sql("owner insert/update/delete - 버킷", ".." 금지 없음)
-- permissive 규칙은 OR로 합쳐지므로 ".." 금지는 다른 규칙 때문에 무력했다. 남의 폴더 쓰기는
-- 서버 앞단의 ".." 정리 + RLS의 최종 이름 검사로 이미 막혀 있었지만(scripts/probe-storage-dotdot.mjs),
-- 규칙이 겹쳐 있으면 하나만 느슨해져도 전체가 느슨해진다 — 이름이 아니라 카탈로그로 전부
-- 지우고 한 벌만 만든다.
--
-- 읽기(SELECT)는 건드리지 않는다 — prelaunch의 "owner read - 버킷" 2개가 정본(목록 훑기 봉쇄).
-- 앱이 사용자 키로 하는 저장소 일(업로드 upsert·같은 이름 교체·자기 파일 삭제)은 전부 자기 id 폴더라
-- 그대로 된다. 서명 업로드 URL(인제스트)·관리자 권한 열쇠는 RLS를 안 탄다.
--
-- ⚠️ 이 파일이 저장소 쓰기 규칙의 정본이다. 옛 파일(rls_v2·security_hardening·prelaunch)을 다시
--    돌리면 겹침이 되살아나니, 그랬다면 이 파일을 마지막에 다시 실행할 것(여러 번 돌려도 안전).
-- ⚠️ 버킷을 새로 만들면 아래 세 규칙의 bucket_id 목록에 추가해야 사용자 키로 쓸 수 있다.

begin;

do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;

create policy "owner insert" on storage.objects for insert to authenticated
  with check (
    bucket_id in ('project-files', 'avatars')
    and auth.uid()::text = (storage.foldername(name))[1]
    and name !~ '(^|/)\.\.(/|$)'
  );

create policy "owner update" on storage.objects for update to authenticated
  using (
    bucket_id in ('project-files', 'avatars')
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id in ('project-files', 'avatars')
    and auth.uid()::text = (storage.foldername(name))[1]
    and name !~ '(^|/)\.\.(/|$)'
  );

create policy "owner delete" on storage.objects for delete to authenticated
  using (
    bucket_id in ('project-files', 'avatars')
    and auth.uid()::text = (storage.foldername(name))[1]
  );

commit;

-- 확인 — 쓰기 규칙 3줄(owner insert·owner update·owner delete) + 읽기 2줄(owner read - 버킷)만 나와야 한다:
--   select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' order by cmd, policyname;
-- 찔러보기: node scripts/probe-storage-dotdot.mjs (업로드·교체·아바타·자기 파일 삭제·남의 폴더 거부)
