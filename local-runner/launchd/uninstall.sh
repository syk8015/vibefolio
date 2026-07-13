#!/bin/bash
# Stop and remove the Nookframe worker supervisor (and the worker it guards).
set -uo pipefail

LABEL="com.nookframe.worker-supervisor"
OLD_LABEL="com.nookframe.demo-worker" # pre-2026-07-13 headless agent
UID_NUM="$(id -u)"

launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
launchctl bootout "gui/$UID_NUM/$OLD_LABEL" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist" "$HOME/Library/LaunchAgents/$OLD_LABEL.plist"
rm -f "$HOME/Library/Application Support/Nookframe/supervisor.sh"

# Stop the loop + worker if they are running right now.
pkill -f "worker-loop.sh" 2>/dev/null || true
pkill -f "local-runner/worker.ts" 2>/dev/null || true

echo "✓ uninstalled: $LABEL (worker stopped; nothing restarts at login)"
