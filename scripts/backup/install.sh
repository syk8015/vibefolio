#!/bin/bash
# 매일 백업을 launchd에 건다(다시 돌려도 된다 — backup.sh를 고친 뒤에도 이걸 다시).
#   bash scripts/backup/install.sh
#
# launchd의 bash는 ~/Desktop을 못 읽는다(TCC — local-runner/launchd/install.sh 주석 참고).
# 그래서 backup.sh를 ~/Library/Application Support/Nookframe/에 복사해 그 사본을 건다.
set -euo pipefail

LABEL="com.nookframe.backup"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUPPORT_DIR="$HOME/Library/Application Support/Nookframe"
SCRIPT_DEST="$SUPPORT_DIR/backup.sh"
PLIST_DEST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/nookframe-backup.log"
UID_NUM="$(id -u)"

for s in db-url db-password r2-endpoint r2-key-id r2-secret crypt; do
  if ! security find-generic-password -a "$USER" -s "nookframe-backup-$s" >/dev/null 2>&1; then
    echo "✗ 키체인에 nookframe-backup-$s 없음 — 먼저 bash scripts/backup/setup.sh"; exit 1
  fi
done

mkdir -p "$SUPPORT_DIR" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cp "$SCRIPT_DIR/backup.sh" "$SCRIPT_DEST"
chmod 700 "$SCRIPT_DEST"
sed -e "s#__SCRIPT__#$SCRIPT_DEST#g" -e "s#__LOG__#$LOG#g" "$SCRIPT_DIR/$LABEL.plist" > "$PLIST_DEST"

launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID_NUM" "$PLIST_DEST"
echo "✓ $LABEL 걸림 — 매일 04:30(또는 깨어날 때·로그인할 때). 기록: ~/Backups/nookframe/logs/"
