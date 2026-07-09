#!/bin/bash
# Wrapper that launchd runs to keep the local demo recorder alive.
#
# launchd hands us a minimal environment, so we set an explicit PATH that includes
# Homebrew (node, npm, npx, ffmpeg all live in /opt/homebrew/bin) BEFORE anything
# runs — otherwise the worker dies instantly with "command not found" and launchd
# just crash-loops it.
#
# caffeinate holds the display + system awake while the worker runs: recording OWNS
# the real screen, so the Mac must stay awake AND unlocked (a locked screen breaks
# the capture — see README.md). caffeinate runs the worker as its child and drops
# the assertions the moment the worker exits; then launchd (KeepAlive) restarts us.
set -uo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# Repo root, resolved from this script's own location (…/local-runner/launchd/).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_DIR" || exit 1

echo "[run-worker] $(date '+%Y-%m-%d %H:%M:%S') starting in $PROJECT_DIR (node: $(command -v node || echo MISSING))"

# -d no display sleep, -i no idle sleep, -s no system sleep (on AC power).
exec caffeinate -dis npm run demo:worker
