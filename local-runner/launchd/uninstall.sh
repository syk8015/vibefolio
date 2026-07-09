#!/bin/bash
# Stop and remove the Nookframe demo worker LaunchAgent.
set -uo pipefail

LABEL="com.nookframe.demo-worker"
UID_NUM="$(id -u)"

launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"

echo "✓ uninstalled: $LABEL (the worker is stopped and will not restart at login)"
