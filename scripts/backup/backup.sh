#!/bin/bash
# Nookframe 매일 백업 (2026-10-31, 보안 로드맵 1단계 — 공격 흉내보다 먼저 "정말 되돌릴 수 있게").
#
# 무엇을: 데이터 저장소(Supabase Postgres의 public·auth·storage — 로그인 계정 포함)
#         + R2 버킷 `nookframe` 전체(사용자 파일·영상·아바타)
# 어디로: 이 맥 ~/Backups/nookframe  +  개인 구글 드라이브 `nookframe-backup/`(rclone crypt로
#         내용·파일 이름까지 암호화 — 드라이브 쪽에서는 읽을 수 없다)
# 얼마나: 30일. 데이터 저장소는 날마다 한 파일, 파일은 거울 하나 + 바뀌거나 지워진 것만
#         날짜 폴더(files-archive/YYYY-MM-DD)로 밀어 둔다.
#
# 비밀값은 전부 키체인에서 읽는다(scripts/backup/setup.sh가 심는다). 명령줄 인자로 넘기지
# 않는다 — pg_dump는 PGPASSWORD, rclone은 RCLONE_CONFIG_* 환경변수로 받는다. 키체인의
# 한계는 scripts/_secrets.mjs 주석과 같다(같은 사용자 프로세스는 읽을 수 있다).
#
# launchd가 매일 돌린다(install.sh). launchd의 bash는 ~/Desktop을 못 읽어서(TCC) 이 파일은
# ~/Library/Application Support/Nookframe/에 복사된 사본이 돈다 — 고치면 install.sh를 다시.
#   손으로: bash scripts/backup/backup.sh          (오늘 이미 성공했으면 건너뜀)
#           bash scripts/backup/backup.sh --force  (그래도 다시)
set -euo pipefail
export PATH=/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin

ROOT="${NF_BACKUP_ROOT:-$HOME/Backups/nookframe}"
KEEP_DAYS=30
PG_DUMP=/opt/homebrew/opt/libpq/bin/pg_dump
PG_RESTORE=/opt/homebrew/opt/libpq/bin/pg_restore
RCLONE=/opt/homebrew/bin/rclone
BUCKET=nookframe
DRIVE_DIR="gdrive:nookframe-backup" # crypt가 감싸는 진짜 드라이브 폴더(`rclone config`의 gdrive)
TODAY=$(date +%Y-%m-%d)
CUTOFF=$(date -v-"${KEEP_DAYS}"d +%Y-%m-%d)

umask 077
mkdir -p "$ROOT/db" "$ROOT/files" "$ROOT/files-archive" "$ROOT/logs"

if [ "${1:-}" != "--force" ] && [ "$(cat "$ROOT/last-success" 2>/dev/null | cut -c1-10)" = "$TODAY" ]; then
  exit 0 # 로그인할 때마다(RunAtLoad) 또 돌지 않게 — 하루 한 번이면 된다
fi

LOG="$ROOT/logs/$TODAY.log"
exec >>"$LOG" 2>&1
echo "== $(date '+%F %T') 백업 시작"

notify() { osascript -e "display notification \"$1\" with title \"Nookframe 백업\"" >/dev/null 2>&1 || true; }
trap 'echo "!! 실패 (줄 $LINENO)"; notify "실패했어요 — 로그: $LOG"' ERR

kc() {
  security find-generic-password -a "$USER" -s "$1" -w 2>/dev/null \
    || { echo "!! 키체인에 $1 없음 — scripts/backup/setup.sh를 먼저 돌려야 해요" >&2; return 1; }
}

# ── 1. 데이터 저장소 ──────────────────────────────────────────────────────────────
# custom 형식 한 파일: 압축돼 있고, 되살릴 때 pg_restore로 표·스키마를 골라 넣을 수 있다
# (새 Supabase 프로젝트엔 auth 스키마가 이미 있어 auth는 데이터만 넣어야 한다).
DB_URL=$(kc nookframe-backup-db-url)
PGPASSWORD=$(kc nookframe-backup-db-password)
export PGPASSWORD PGSSLMODE=require
DUMP="$ROOT/db/nookframe-$TODAY.dump"
"$PG_DUMP" --format=custom --schema=public --schema=auth --schema=storage \
  --file="$DUMP.part" "$DB_URL"
unset PGPASSWORD
TABLES=$("$PG_RESTORE" --list "$DUMP.part" | grep -c "TABLE DATA public" || true)
if [ "$TABLES" -lt 10 ]; then
  echo "!! 덤프가 이상해요: public 표 데이터 $TABLES개"; false
fi
mv "$DUMP.part" "$DUMP"
echo "-- 데이터 저장소: $(du -h "$DUMP" | cut -f1), public 표 $TABLES개"

# ── 2. R2 파일 → 이 맥 ───────────────────────────────────────────────────────────
# 읽기 전용 열쇠(Cloudflare에서 이 버킷 Object Read만). 거울에서 바뀌거나 지워진 파일은
# 날짜 폴더로 밀려나므로, 실서버에서 지워진 파일도 30일 동안은 되살릴 수 있다.
export RCLONE_CONFIG_NFR2_TYPE=s3 RCLONE_CONFIG_NFR2_PROVIDER=Cloudflare RCLONE_CONFIG_NFR2_NO_CHECK_BUCKET=true
RCLONE_CONFIG_NFR2_ENDPOINT=$(kc nookframe-backup-r2-endpoint)
RCLONE_CONFIG_NFR2_ACCESS_KEY_ID=$(kc nookframe-backup-r2-key-id)
RCLONE_CONFIG_NFR2_SECRET_ACCESS_KEY=$(kc nookframe-backup-r2-secret)
export RCLONE_CONFIG_NFR2_ENDPOINT RCLONE_CONFIG_NFR2_ACCESS_KEY_ID RCLONE_CONFIG_NFR2_SECRET_ACCESS_KEY
"$RCLONE" sync "nfr2:$BUCKET" "$ROOT/files" --backup-dir "$ROOT/files-archive/$TODAY" \
  --fast-list --transfers 8
echo "-- 파일 거울: $(find "$ROOT/files" -type f | wc -l | tr -d ' ')개, $(du -sh "$ROOT/files" | cut -f1)"

# ── 3. 이 맥 → 구글 드라이브 (암호화) ────────────────────────────────────────────
# crypt 암호를 잃으면 드라이브 사본은 영영 못 읽는다 — setup.sh가 만들 때 비밀번호 앱에
# 따로 저장하라고 안내한다. 이 맥이 통째로 사라져도 드라이브 + 그 암호면 되살린다.
if ! "$RCLONE" listremotes | grep -qx "gdrive:"; then
  echo "!! rclone에 gdrive 연결이 없어요 — rclone config create gdrive drive scope drive.file"; false
fi
export RCLONE_CONFIG_NFDRIVE_TYPE=crypt RCLONE_CONFIG_NFDRIVE_REMOTE="$DRIVE_DIR"
RCLONE_CONFIG_NFDRIVE_PASSWORD=$(kc nookframe-backup-crypt | "$RCLONE" obscure -)
export RCLONE_CONFIG_NFDRIVE_PASSWORD
"$RCLONE" copy "$ROOT/db" nfdrive:db --include "nookframe-*.dump"
"$RCLONE" sync "$ROOT/files" nfdrive:files --backup-dir "nfdrive:files-archive/$TODAY" --transfers 4
echo "-- 드라이브에 올림"

# ── 4. 30일 넘은 것 지우기 (이름의 날짜로 판단) ──────────────────────────────────
for f in "$ROOT"/db/nookframe-*.dump "$ROOT"/logs/*.log; do
  [ -e "$f" ] || continue
  d=$(basename "$f" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' || true)
  if [ -n "$d" ] && [[ "$d" < "$CUTOFF" ]]; then rm -f "$f"; fi
done
for dir in "$ROOT"/files-archive/*/; do
  [ -d "$dir" ] || continue
  d=$(basename "$dir")
  if [[ "$d" < "$CUTOFF" ]]; then rm -rf "$dir"; fi
done
"$RCLONE" lsf nfdrive:db --files-only 2>/dev/null | while read -r name; do
  d=$(echo "$name" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' || true)
  if [ -n "$d" ] && [[ "$d" < "$CUTOFF" ]]; then "$RCLONE" deletefile "nfdrive:db/$name"; fi
done
"$RCLONE" lsf nfdrive:files-archive --dirs-only 2>/dev/null | while read -r name; do
  d=${name%/}
  if [[ "$d" < "$CUTOFF" ]]; then "$RCLONE" purge "nfdrive:files-archive/$d"; fi
done

date '+%F %T' > "$ROOT/last-success"
echo "== $(date '+%F %T') 끝"
