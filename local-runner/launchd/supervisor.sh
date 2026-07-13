#!/bin/bash
# launchd-side watchdog, runs at login + every 60s: if the worker loop is not
# running, open it in Terminal.app and exit.
#
# This file is INSTALLED OUTSIDE the repo (~/Library/Application Support/Nookframe)
# on purpose: launchd's bash has no TCC grant for ~/Desktop, so it must not need
# to read anything inside the repo. Everything TCC-sensitive happens inside the
# Terminal window it opens — Terminal already holds all the grants.
#
# __LOOP_SCRIPT__ is substituted with the absolute worker-loop.sh path by install.sh.
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

LOOP_SCRIPT="__LOOP_SCRIPT__"

if pgrep -f "worker-loop.sh" >/dev/null 2>&1; then
  exit 0
fi

echo "[supervisor] $(date '+%F %T') worker loop missing — launching it in Terminal"
# First run triggers a one-time macOS Automation prompt ("control Terminal") — allow it.
osascript -e "tell application \"Terminal\" to do script \"bash $LOOP_SCRIPT\"" \
  || echo "[supervisor] osascript failed — check Automation permission (System Settings → Privacy & Security → Automation)"
