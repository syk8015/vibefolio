#!/bin/bash
# Install (or reinstall) the Nookframe worker SUPERVISOR as a macOS LaunchAgent.
#
# Architecture (2026-07-13 TCC rework):
#
#   launchd (headless, no TCC grants)      Terminal.app (owns all TCC grants)
#   └─ supervisor.sh @login + every 60s →  └─ worker-loop.sh
#      "loop alive? if not, open it           restarts `npm run demo:worker`
#       in a Terminal window"                 on crash; caffeinate keeps awake
#
# Why not run the worker under launchd directly: launchd's bash has NO TCC
# grants — it cannot even read ~/Desktop (exit 126 "Operation not permitted"),
# and recording would additionally fail Screen Recording / Accessibility.
# Terminal.app already holds every grant the recorder needs, so the worker
# lives in a visible Terminal window and launchd only guards its existence.
#
# Idempotent — safe to re-run after pulling changes. Run from anywhere:
#   bash local-runner/launchd/install.sh
set -uo pipefail

LABEL="com.nookframe.worker-supervisor"
OLD_LABEL="com.nookframe.demo-worker" # pre-2026-07-13 headless agent (TCC-broken)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOOP_SCRIPT="$SCRIPT_DIR/worker-loop.sh"
SUPERVISOR_SRC="$SCRIPT_DIR/supervisor.sh"
PLIST_SRC="$SCRIPT_DIR/$LABEL.plist"
SUPPORT_DIR="$HOME/Library/Application Support/Nookframe"
SUPERVISOR_DEST="$SUPPORT_DIR/supervisor.sh"
LA_DIR="$HOME/Library/LaunchAgents"
PLIST_DEST="$LA_DIR/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs"
UID_NUM="$(id -u)"

# --- Preflight: the worker needs the local .env.local (public Supabase keys + worker secret).
ENV_FILE="$PROJECT_DIR/.env.local"
if [ ! -f "$ENV_FILE" ]; then
  echo "✗ $ENV_FILE not found — the worker needs the Supabase URL/anon key + WORKER_SECRET."
  exit 1
fi

# --- Remove the old, TCC-broken headless agent if present.
launchctl bootout "gui/$UID_NUM/$OLD_LABEL" 2>/dev/null || true
rm -f "$LA_DIR/$OLD_LABEL.plist"

mkdir -p "$LA_DIR" "$LOG_DIR" "$SUPPORT_DIR"
chmod +x "$LOOP_SCRIPT" "$SUPERVISOR_SRC"

# supervisor.sh must live OUTSIDE ~/Desktop so launchd's bash can read it.
sed -e "s#__LOOP_SCRIPT__#$LOOP_SCRIPT#g" "$SUPERVISOR_SRC" > "$SUPERVISOR_DEST"
chmod +x "$SUPERVISOR_DEST"

# Substitute this machine's absolute paths into the plist template.
sed -e "s#__SUPERVISOR__#$SUPERVISOR_DEST#g" \
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
echo "  first run: macOS will ask to allow controlling Terminal — click Allow."
echo "  the worker lives in a Terminal window; closing it is fine (supervisor"
echo "  reopens it within 60s). To stop for real: bash local-runner/launchd/uninstall.sh"
echo "  logs: $LOG_DIR/nookframe-supervisor.log (supervisor) + the Terminal window (worker)"
echo
echo "⚠️  Recording drives the REAL screen: keep this Mac awake, logged in, and"
echo "    UNLOCKED (System Settings → Lock Screen), or the capture will break."
