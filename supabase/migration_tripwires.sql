-- 알아채기(2026-11-02, lib/tripwire.ts) — 관리자 조치가 몰리면 그 계정 로그인만 끊는다(작은 멈춤).
-- 서비스 키 전용. 실서버 기본 권한이 새 함수를 anon·authenticated에도 열어 주므로 만든 뒤 바로 거둔다.
-- 다시 돌려도 안전.
begin;

create or replace function public.admin_sign_out_user(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare n int;
begin
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics n = row_count;
  delete from auth.refresh_tokens where user_id = p_user_id::text;
  return n;
end $$;
revoke all on function public.admin_sign_out_user(uuid) from public, anon, authenticated;
grant execute on function public.admin_sign_out_user(uuid) to service_role;

commit;
