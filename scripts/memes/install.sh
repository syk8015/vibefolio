#!/bin/bash
# 매일 밈 밤 작업을 launchd에 건다(다시 돌려도 된다 — scripts/memes/를 고쳤거나 홈 문구를 고친 뒤에도 이걸 다시).
#   bash scripts/memes/install.sh
#
# launchd의 bash는 ~/Desktop을 못 읽는다(TCC) → 이 폴더를 ~/Library/Application Support/Nookframe/memes/에
# 복사해 그 사본을 건다. 지금 홈 문구 목록(existing-lines.json)도 여기서 뽑아 사본 옆에 둔다.
set -euo pipefail

LABEL="com.nookframe.memes"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SRC/../.." && pwd)"
DEST="$HOME/Library/Application Support/Nookframe/memes"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/nookframe-memes.log"
UID_NUM="$(id -u)"

if ! security find-generic-password -s nookframe-meme-secret >/dev/null 2>&1; then
  echo "✗ 키체인에 nookframe-meme-secret 없음"; exit 1
fi

mkdir -p "$DEST" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
chmod 700 "$DEST"
cp "$SRC"/*.mjs "$SRC/run-nightly.sh" "$DEST/"
chmod 700 "$DEST/run-nightly.sh"
(cd "$REPO" && npx tsx scripts/memes/export-existing.mts "$DEST/existing-lines.json")
sed -e "s#__DIR__#$DEST#g" -e "s#__LOG__#$LOG#g" "$SRC/$LABEL.plist" > "$PLIST"

launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID_NUM" "$PLIST"
echo "✓ $LABEL 걸림 — 매일 02:30. 기록: $LOG · 재료: $DEST/raw/"
