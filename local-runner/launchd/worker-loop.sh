#!/bin/bash
# Runs the demo worker in a visible Terminal window and restarts it on crash.
#
# Terminal.app owns the TCC grants the recorder needs (Desktop files, Screen
# Recording, Accessibility), so everything is already permitted in this context.
# That is the whole reason this loop runs inside Terminal instead of headless
# launchd — launchd's bash cannot even read ~/Desktop, let alone record the
# screen (exit 126 "Operation not permitted", discovered 2026-07-13).
#
# Crash recovery happens HERE (not in launchd), so the supervisor only ever
# opens ONE Terminal window instead of a new window per crash.
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_DIR" || exit 1

RESTART_DELAY=30

echo "[worker-loop] $(date '+%F %T') supervising demo worker in $PROJECT_DIR"

while true; do
  # Never run two workers (double-claim = double record): if a worker we did
  # not start is alive, wait instead of racing it.
  if pgrep -f "local-runner/worker.ts" >/dev/null 2>&1; then
    sleep "$RESTART_DELAY"
    continue
  fi
  echo "[worker-loop] $(date '+%F %T') starting worker"
  # caffeinate: no display/idle/system sleep while the worker runs — recording
  # owns the real screen. Assertions drop automatically when the worker exits.
  caffeinate -dis npm run demo:worker
  echo "[worker-loop] $(date '+%F %T') worker exited ($?) — restart in ${RESTART_DELAY}s"
  sleep "$RESTART_DELAY"
done
