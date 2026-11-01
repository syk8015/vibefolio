#!/bin/bash
# 되살리기 연습 (2026-11-01, 보안 로드맵 1단계) — 백업이 '있다'와 '되살릴 수 있다'는 다르다.
# 가장 최근 데이터 저장소 백업을 연습용 빈 Supabase 프로젝트에 실제로 넣고, 실서버와
# 표·행 수·RLS·정책·칸 권한·함수 실행 권한·로그인 계정 수가 같은지 맞춰 본다.
# 보안이 걸린 곳(칸 단위 GRANT — AGENTS.md, SECURITY DEFINER 함수의 EXECUTE 회수)이
# 되살린 뒤에도 그대로인지가 이 연습의 핵심이다.
#
#   bash scripts/backup/restore-drill.sh setup   사용자가 터미널 앱에서 한 번 — 연습용 프로젝트의
#                                                주소·비밀번호를 키체인에(입력은 안 보임)
#   bash scripts/backup/restore-drill.sh         연습 실행 — 연습용 DB의 public을 통째로 지우고 다시 넣는다
#
# 실서버(ref nepwsgrtonmexgqplcdp)를 가리키면 무조건 멈춘다. 연습용 무료 프로젝트는 7일 안 쓰면
# 잠드니, 한 달 뒤엔 Supabase 화면에서 깨운 뒤 돌린다.
set -euo pipefail
export PATH=/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin

PROD_REF=nepwsgrtonmexgqplcdp
BIN=/opt/homebrew/opt/libpq/bin
ROOT="${NF_BACKUP_ROOT:-$HOME/Backups/nookframe}"

put() { printf 'add-generic-password -U -a %s -s %s -w %s\n' "$USER" "$1" "$2" | security -i >/dev/null; }
kc() {
  security find-generic-password -a "$USER" -s "$1" -w 2>/dev/null \
    || { echo "✗ 키체인에 $1 없음 — 먼저 restore-drill.sh setup" >&2; return 1; }
}

if [ "${1:-}" = setup ]; then
  # 비밀번호를 먼저 묻는다 — 프로젝트를 만들 때 복사한 비밀번호가 클립보드에 있을 때 받고,
  # 그다음 주소를 복사해 오게(순서가 반대면 주소 복사가 비밀번호를 덮어쓴다).
  read -rsp "연습용 프로젝트 비밀번호 (안 보여요): " pw; echo
  if [[ -z "$pw" || "$pw" =~ [[:space:]\"\'\\] ]]; then echo "✗ 비었거나 공백·따옴표가 든 값이에요"; exit 1; fi
  read -rp "연습용 프로젝트의 Session pooler 주소([YOUR-PASSWORD]가 든 채로): " uri
  if [[ ! "$uri" =~ ^(postgres(ql)?://[^:@/]+)(:[^@]*)?@(.+)$ ]]; then echo "✗ postgresql://… 모양이 아니에요"; exit 1; fi
  clean="${BASH_REMATCH[1]}@${BASH_REMATCH[4]}"
  if [[ "$clean" == *"$PROD_REF"* ]]; then echo "✗ 이건 실서버 주소예요 — 연습용 프로젝트의 주소를 넣어 주세요"; exit 1; fi
  put nookframe-drill-db-password "$pw"; unset pw
  put nookframe-drill-db-url "$clean"
  echo "✓ 저장했어요"
  exit 0
fi

DRILL_URL=$(kc nookframe-drill-db-url)
if [[ "$DRILL_URL" == *"$PROD_REF"* ]]; then echo "✗ 연습용 주소가 실서버를 가리켜요 — 멈춤"; exit 1; fi
DRILL_PW=$(kc nookframe-drill-db-password)
PROD_URL=$(kc nookframe-backup-db-url)
PROD_PW=$(kc nookframe-backup-db-password)
DUMP=$(ls -1 "$ROOT"/db/nookframe-*.dump 2>/dev/null | tail -1)
[ -n "$DUMP" ] || { echo "✗ $ROOT/db에 백업이 없어요"; exit 1; }
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
export PGSSLMODE=require

drill() { PGPASSWORD="$DRILL_PW" "$BIN/psql" "$DRILL_URL" -v ON_ERROR_STOP=1 -Atq "$@"; }
prod()  { PGPASSWORD="$PROD_PW"  "$BIN/psql" "$PROD_URL"  -v ON_ERROR_STOP=1 -Atq "$@"; }

echo "== 백업: $(basename "$DUMP")  →  연습용 프로젝트"

# ── 1. 연습용 DB 비우기 (public 전부 + 로그인 계정) ─────────────────────────────
# 통과하면 끝에서 한 번 더 비운다 — 연습용 프로젝트에 실데이터 사본을 남기지 않게.
wipe() { drill -c "$(cat <<'SQL'
do $$ declare r record; begin
  for r in select c.oid::regclass as t from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p') loop
    execute format('drop table if exists %s cascade', r.t); end loop;
  for r in select c.oid::regclass as t from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('v','m') loop
    execute format('drop view if exists %s cascade', r.t); end loop;
  for r in select c.oid::regclass as t from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'S' loop
    execute format('drop sequence if exists %s cascade', r.t); end loop;
  for r in select p.oid::regprocedure as f from pg_proc p where p.pronamespace = 'public'::regnamespace loop
    execute format('drop function if exists %s cascade', r.f); end loop;
  for r in select t.oid::regtype as ty from pg_type t where t.typnamespace = 'public'::regnamespace and t.typtype in ('e','d','c') and not exists (select 1 from pg_class c where c.reltype = t.oid) loop
    execute format('drop type if exists %s cascade', r.ty); end loop;
end $$;
SQL
)" -c "delete from auth.users" 2>/dev/null; }
wipe
drill <<'SQL'
-- 새 프로젝트의 기본 권한은 public에 새로 만든 표를 anon·authenticated에게 전부 연다. 백업의
-- 표 권한은 '처음엔 아무 권한도 없다'를 바탕으로 적힌 차이라(GRANT만 있고 REVOKE는 없다),
-- 이대로 넣으면 실서버에서 잠가 둔 표(desktop_handoffs·media_scans 등)가 anon에게 열린 채
-- 되살아난다(2026-11-02 첫 연습에서 잡힘). 그래서 넣기 전에 기본 권한을 비운다 — 실서버의
-- 기본 권한은 백업 끝의 DEFAULT ACL이 다시 깐다.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, service_role;
SQL
echo "-- 연습용 DB 비움"

# ── 2. 되살리기: 로그인 계정 먼저(공개 표의 외래 키가 auth.users를 가리킨다) → public ──
# 새 프로젝트엔 auth 표가 이미 있으니 auth는 데이터만, 계정·연결 두 표만 넣는다(세션·토큰은
# 다시 로그인하면 생긴다). 백업 목차에선 identities가 users보다 앞이라 따로 두 번 넣는다.
: > "$WORK/auth.err"
for t in users identities; do
  PGPASSWORD="$DRILL_PW" "$BIN/pg_restore" --data-only --no-owner -n auth -t "$t" \
    -d "$DRILL_URL" "$DUMP" 2>>"$WORK/auth.err" || true
done
# supabase_admin 몫의 기본 권한은 postgres가 바꿀 수 없다(새 프로젝트에 이미 같은 값) → 목차에서 뺀다.
"$BIN/pg_restore" -l -n public "$DUMP" | grep -v 'DEFAULT ACL public DEFAULT PRIVILEGES FOR [A-Z]* supabase_admin' > "$WORK/public.list"
PGPASSWORD="$DRILL_PW" "$BIN/pg_restore" --no-owner -n public -L "$WORK/public.list" \
  -d "$DRILL_URL" "$DUMP" 2>"$WORK/public.err" || true
for part in auth public; do
  n=$(grep -c "error:" "$WORK/$part.err" || true)
  echo "-- $part 넣기: 오류 ${n}건"
  if [ "$n" -gt 0 ]; then grep "error:" "$WORK/$part.err" | sed 's/^/     /' | head -8; fi
done

# ── 3. 실서버와 맞춰 보기 ────────────────────────────────────────────────────────
# 구조는 정확히 같아야 한다(다르면 실패). 행 수는 백업 뒤 실서버에 새로 쌓였을 수 있어
# 차이만 보여 준다(되살린 쪽이 더 많으면 이상하다).
declare -a CHECKS=(
"RLS 켜짐|select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by 1"
"정책|select tablename, policyname, permissive, cmd, roles::text, coalesce(qual,''), coalesce(with_check,'') from pg_policies where schemaname = 'public' order by 1, 2"
"표 권한(anon·authenticated)|select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon','authenticated') order by 1, 2, 3"
"칸 권한(anon·authenticated)|select table_name, column_name, grantee, privilege_type from information_schema.column_privileges where table_schema = 'public' and grantee in ('anon','authenticated') order by 1, 2, 3, 4"
"함수(보안 정의자·search_path)|select p.proname, pg_get_function_identity_arguments(p.oid), p.prosecdef, coalesce(p.proconfig::text,'') from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1, 2"
"함수 실행 권한|select p.proname, pg_get_function_identity_arguments(p.oid), has_function_privilege('anon', p.oid, 'execute'), has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1, 2"
"기본 권한(postgres 몫)|select defaclobjtype, defaclacl::text from pg_default_acl where defaclnamespace = 'public'::regnamespace and defaclrole = 'postgres'::regrole order by 1"
"트리거|select c.relname, t.tgname, t.tgenabled from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relnamespace = 'public'::regnamespace and not t.tgisinternal order by 1, 2"
)
FAIL=0
for item in "${CHECKS[@]}"; do
  name=${item%%|*}; sql=${item#*|}
  prod  -c "$sql" > "$WORK/p.txt"
  drill -c "$sql" > "$WORK/d.txt"
  if cmp -s "$WORK/p.txt" "$WORK/d.txt"; then
    echo "✓ ${name}: 같음 ($(wc -l < "$WORK/p.txt" | tr -d ' ')줄)"
  else
    FAIL=1; echo "✗ ${name}: 다름"
    { diff "$WORK/p.txt" "$WORK/d.txt" || true; } | head -10 | sed 's/^/     /'
  fi
done

COUNT_SQL="select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1"
prod  -F' ' -c "$COUNT_SQL" > "$WORK/pc.txt"
drill -F' ' -c "$COUNT_SQL" > "$WORK/dc.txt"
echo "auth.users $(prod -c 'select count(*) from auth.users')" >> "$WORK/pc.txt"
echo "auth.users $(drill -c 'select count(*) from auth.users')" >> "$WORK/dc.txt"
same=0; diffs=""
while read -r t pn; do
  dn=$(awk -v t="$t" '$1==t {print $2}' "$WORK/dc.txt")
  if [ "$pn" = "${dn:-x}" ]; then same=$((same+1)); else
    diffs+="     $t: 실서버 $pn · 되살림 ${dn:-없음}"$'\n'
    if [ -z "$dn" ] || [ "$dn" -gt "$pn" ]; then FAIL=1; fi
  fi
done < "$WORK/pc.txt"
echo "✓ 행 수 같은 표: ${same}개"
if [ -n "$diffs" ]; then echo "  다른 표(백업 뒤 실서버에 새로 쌓였으면 정상):"; printf '%s' "$diffs"; fi

if [ "$FAIL" = 0 ]; then wipe; echo "== 되살리기 연습 통과 (연습용 프로젝트는 다시 비움)"; else echo "== 되살리기 연습 실패 — 위 ✗를 볼 것"; exit 1; fi
