#!/usr/bin/env bash
# 뚫렸을 때 증거 얼리기(2026-11-02, 보안 로드맵 1단계 6번 — 순서표의 첫 10분).
#
# 실서버 데이터 저장소를 **읽기만** 해서(read-only 트랜잭션) 지금 상태를 CSV로 떠 두고,
# 가장 최근 백업 한 벌을 같은 폴더에 복사한다(백업은 30일이 지나면 지워지므로 사고 전 원본을 지킨다).
# 열쇠를 바꾸거나 정리를 하면 흔적이 사라지니, 무엇을 고치기 전에 이것부터 돌린다.
#
# 남기는 곳: ~/Desktop/nookframe-작업물/incidents/<날짜_시각>/ (공개 레포 밖, 폴더 700·파일 600)
# 비밀값 칸(토큰 해시·리프레시 토큰·인증 앱 비밀)은 고르지 않는다. 이메일·IP는 남는다 — 사용자에게
# 알릴지, 신고할지 정하는 데 필요하다. 사고가 끝나고 신고까지 마치면 폴더째 지워도 된다.
#
# 접속 정보는 백업과 같은 키체인 항목(scripts/backup/setup.sh가 심음).
# 사용: bash scripts/incident/evidence.sh [며칠 전까지, 기본 7]
set -euo pipefail

DAYS="${1:-7}"
[[ "$DAYS" =~ ^[0-9]+$ ]] || { echo "며칠은 숫자로: bash scripts/incident/evidence.sh 7" >&2; exit 2; }
BIN=/opt/homebrew/opt/libpq/bin
BACKUP_ROOT="${NF_BACKUP_ROOT:-$HOME/Backups/nookframe}"
OUT="$HOME/Desktop/nookframe-작업물/incidents/$(date '+%Y-%m-%d_%H%M')"

kc() {
  security find-generic-password -a "$USER" -s "$1" -w 2>/dev/null \
    || { echo "!! 키체인에 $1 없음 — scripts/backup/setup.sh 먼저" >&2; exit 1; }
}
DB_URL=$(kc nookframe-backup-db-url)
PGPASSWORD=$(kc nookframe-backup-db-password)
export PGPASSWORD PGSSLMODE=require PGOPTIONS="-c default_transaction_read_only=on"

umask 077
mkdir -p "$OUT"
chmod 700 "$OUT"

q() { # q <파일 이름> <SQL>
  if "$BIN/psql" "$DB_URL" -X -q --csv -v ON_ERROR_STOP=1 -c "$2" >"$OUT/$1.csv" 2>"$OUT/$1.err"; then
    rm -f "$OUT/$1.err"
    printf '  %-26s %s줄\n' "$1" "$(($(wc -l <"$OUT/$1.csv") - 1))"
  else
    printf '  %-26s 실패 — %s\n' "$1" "$(head -1 "$OUT/$1.err")"
  fi
}
W="interval '$DAYS days'"

echo "증거 얼리기 → $OUT (최근 ${DAYS}일)"

# 1. 잠금·경보 — 비상 정지가 언제 켜졌고 어떤 경보가 울렸나
q 01-system-status "select * from public.system_status"

# 2. 로그인 — 누가 언제 어디서(IP·브라우저) 들어왔나. 관리자 세션이 aal2인지도 보인다
q 02-sessions "select s.created_at, s.refreshed_at, u.email, s.aal, s.ip, s.user_agent, s.not_after, s.id as session_id
  from auth.sessions s join auth.users u on u.id = s.user_id
  where s.created_at > now() - $W or s.refreshed_at > now() - $W order by greatest(s.created_at, s.refreshed_at) desc"
q 03-signins "select u.email, u.created_at, u.last_sign_in_at, u.raw_app_meta_data->'providers' as providers, u.banned_until, u.deleted_at
  from auth.users u where u.created_at > now() - $W or u.last_sign_in_at > now() - $W order by greatest(u.created_at, u.last_sign_in_at) desc"
q 04-mfa-factors "select f.created_at, f.updated_at, u.email, f.factor_type, f.status, f.friendly_name, f.last_challenged_at
  from auth.mfa_factors f join auth.users u on u.id = f.user_id order by f.created_at desc"

# 3. AI 연결 토큰·코드 — 새로 생기거나 쓰이거나 끊긴 것
q 05-api-tokens "select t.created_at, t.last_used_at, t.revoked_at, u.email, t.name, t.token_prefix, t.oauth_client_id, t.scope
  from public.api_tokens t left join auth.users u on u.id = t.user_id
  where t.created_at > now() - $W or t.last_used_at > now() - $W or t.revoked_at > now() - $W order by t.created_at desc"
q 06-connect-oauth-codes "select 'connect' as kind, c.created_at, c.used_at, u.email, null as client_id from public.connect_codes c left join auth.users u on u.id = c.user_id where c.created_at > now() - $W
  union all select 'oauth', o.created_at, o.used_at, u.email, o.client_id from public.oauth_codes o left join auth.users u on u.id = o.user_id where o.created_at > now() - $W
  order by 2 desc"

# 4. 막힌 IP·한도 — 미끼에 걸린 IP(ipblock:)와 몰린 창들
q 07-rate-limits "select bucket, window_start, count from public.rate_limits where window_start > now() - $W order by count desc limit 500"
q 08-alert-events "select created_at, event, props from public.analytics_events
  where created_at > now() - $W and event in ('bait_hit') order by created_at desc limit 2000"

# 5. 바뀐 내용 — 새 작품·초안, 내려간 작품, 프로필 수정
q 09-projects-new "select p.created_at, p.id, u.email, p.title, p.is_draft, p.taken_down_at, p.demo_url
  from public.projects p left join auth.users u on u.id = p.user_id where p.created_at > now() - $W order by p.created_at desc"
q 10-profiles-changed "select p.updated_at, p.id, p.username, p.suspended_at from public.profiles p where p.updated_at > now() - $W order by p.updated_at desc"

# 6. 문단속 상태 — 공격자가 뒷문(권한·정책·definer 함수)을 열었는지. 레포 SQL과 견준다
q 11-policies "select schemaname, tablename, policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname in ('public','storage') order by 1,2,3"
q 12-table-grants "select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privileges
  from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon','authenticated','public') group by 1,2 order by 1,2"
q 13-definer-functions "select p.proname, pg_get_function_identity_arguments(p.oid) as args,
  has_function_privilege('anon', p.oid, 'execute') as anon_can, has_function_privilege('authenticated', p.oid, 'execute') as user_can,
  md5(pg_get_functiondef(p.oid)) as body_md5
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef order by 1"
q 14-roles "select rolname, rolsuper, rolcanlogin, rolbypassrls, rolvaliduntil from pg_roles where rolname !~ '^pg_' order by 1"

unset PGPASSWORD

# 7. 사고 전 백업 지키기
LATEST=$(ls -1t "$BACKUP_ROOT"/db/*.dump 2>/dev/null | head -1 || true)
if [ -n "$LATEST" ]; then
  cp -p "$LATEST" "$OUT/"
  echo "  백업 보존: $(basename "$LATEST") ($(du -h "$LATEST" | cut -f1)) — 30일 정리에서 빠짐"
else
  echo "  !! 이 맥에 백업이 없어요 ($BACKUP_ROOT/db)"
fi

date '+%F %T %Z' >"$OUT/00-taken-at.txt"
chmod 600 "$OUT"/*
echo "끝. 다음: 순서표 2단계(멈추기)로."
