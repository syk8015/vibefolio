-- 정지·내리기를 지웠다 다시 만들어 푸는 구멍 막기(2026-11-02, 보안 로드맵 2단계 3번 — audit-6 F1·F2).
--
-- 왜:
-- 1. 정지된 사람이 사용자 키로 자기 profiles 행을 지우고(본인 삭제 정책) 온보딩처럼 다시 만들면
--    suspended_at이 비어 정지가 풀렸다. 앱은 이 정책을 안 쓴다 — 계정 삭제는 서버가 관리자 권한으로
--    auth 사용자를 지운다(app/api/account). → 사용자 키의 profiles DELETE를 없앤다.
-- 2. 내린 작품을 지우고 사용자 키로 projects에 새 행을 넣으면 is_draft 기본값(false) 때문에 바로
--    공개됐다. 앱은 사용자 키로 projects를 넣지 않는다 — 새 작품은 인제스트(서버, 늘 초안)뿐.
--    → 사용자 키의 projects INSERT를 없애고, 기본값도 초안(true)으로.
-- 3. 내린 작품(taken_down_at 있음)은 주인이 지울 수 없다 — 신고 기록이 남고, 지웠다 다시 올려 내림을
--    지우는 길이 닫힌다. 서버 삭제 길(대시보드 삭제·인제스트 초안 삭제)도 같은 검사를 한다
--    (관리자 권한이라 이 정책을 안 거친다). 계정 삭제는 그대로 전부 지운다(탈퇴 즉시 파기).
--
-- 남은 것: 정지된 사람이 계정을 지우고 같은 메일로 새로 가입하면 새 사람이다(개인정보 처리방침
-- '탈퇴 즉시 파기'와 맞물려 따로 정할 일).
--
-- 되돌리기(필요할 때만):
--   create policy "본인만 프로필 삭제" on profiles for delete using (auth.uid() = id);
--   grant delete on profiles to authenticated;
-- 다시 돌려도 안전.

begin;

-- 1) profiles: 사용자 키로는 지우지 못한다.
drop policy if exists "본인만 프로필 삭제" on profiles;
revoke delete on profiles from anon, authenticated;
revoke insert on profiles from anon;

-- 2) projects: 사용자 키로는 새 행을 넣지 못한다. 기본은 초안.
drop policy if exists "본인만 프로젝트 추가" on projects;
revoke insert on projects from anon, authenticated;
alter table projects alter column is_draft set default true;

-- 3) projects: 내린 작품은 주인이 못 지운다.
drop policy if exists "본인만 프로젝트 삭제" on projects;
create policy "본인만 프로젝트 삭제" on projects
  for delete using (auth.uid() = user_id and taken_down_at is null);
revoke delete on projects from anon;

commit;
