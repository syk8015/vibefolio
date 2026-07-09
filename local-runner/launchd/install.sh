#!/bin/bash
# Install (or reinstall) the Nookframe demo worker as a macOS LaunchAgent so it
# runs unattended: auto-starts at login and auto-restarts on crash.
#
# Idempotent — safe to re-run after pulling changes. Run from anywhere:
#   bash local-runner/launchd/install.sh
set -uo pipefail

LABEL="com.nookframe.demo-worker"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
RUN_SCRIPT="$SCRIPT_DIR/run-worker.sh"
PLIST_SRC="$SCRIPT_DIR/$LABEL.plist"
LA_DIR="$HOME/Library/LaunchAgents"
PLIST_DEST="$LA_DIR/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs"
UID_NUM="$(id -u)"

# --- Preflight: the worker only makes sense with a local .env.local (DEMO_RUNNER=local).
ENV_FILE="$PROJECT_DIR/.env.local"
if [ ! -f "$ENV_FILE" ]; then
  echo "✗ $ENV_FILE not found — the worker needs Supabase keys + DEMO_RUNNER=local."
  exit 1
fi
if ! grep -q '^DEMO_RUNNER=local' "$ENV_FILE"; then
  echo "✗ DEMO_RUNNER=local not set in .env.local — refusing to install (cloud mode would double-record)."
  exit 1
fi

mkdir -p "$LA_DIR" "$LOG_DIR"
chmod +x "$RUN_SCRIPT"

# Substitute this machine's absolute paths into the plist template.
sed -e "s#__RUN_SCRIPT__#$RUN_SCRIPT#g" \
    -e "s#__PROJECT_DIR__#$PROJECT_DIR#g" \
    -e "s#__LOG_DIR__#$LOG_DIR#g" \
    "$PLIST_SRC" > "$PLIST_DEST"

if ! plutil -lint "$PLIST_DEST" >/dev/null; then
  echo "✗ generated plist failed validation: $PLIST_DEST"
  exit 1
fi

# Reload cleanly (bootout of a not-loaded agent is a harmless error we swallow).
launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID_NUM" "$PLIST_DEST"
launchctl enable "gui/$UID_NUM/$LABEL"
launchctl kickstart -k "gui/$UID_NUM/$LABEL" 2>/dev/null || true

echo "✓ installed + started: $LABEL"
echo "  logs:    $LOG_DIR/nookframe-demo-worker.log"
echo "  status:  launchctl print gui/$UID_NUM/$LABEL | grep -E 'state|pid'"
echo "  stop:    bash local-runner/launchd/uninstall.sh"
echo
echo "⚠️  Recording drives the REAL screen: keep this Mac awake, logged in, and"
echo "    UNLOCKED (System Settings → Lock Screen → turn off 'Require password'"
echo "    /screen lock, or the capture will break)."
