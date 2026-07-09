# Unattended demo worker (macOS launchd)

Runs `npm run demo:worker` as a LaunchAgent so the local M5 recorder survives
crashes and logins without anyone babysitting a terminal. This is P0.1 A — the
worker was a manual, foreground, single-machine SPOF.

## What it does

- **RunAtLoad** — starts at login.
- **KeepAlive** — restarts on any exit (crash, OOM, hard kill). `ThrottleInterval`
  (30s) keeps a crash-loop from hammering. A poison job can't re-bill in a loop:
  on restart `recoverStuckJobs()` marks any in-flight row `failed`, so it is never
  re-claimed.
- **caffeinate** (`-dis`) — holds the display + system awake while recording.
- **Heartbeat** — every poll the worker stamps `system_status.worker_last_seen_at`
  (needs `supabase/migration_system_status.sql` applied) so a watchdog / you can
  tell it's alive, and reads `demo_paused` back as a drain kill-switch.

## Install / update

```bash
bash local-runner/launchd/install.sh
```

Idempotent — re-run after pulling. It substitutes this machine's absolute paths
into the plist, writes it to `~/Library/LaunchAgents`, and (re)starts the agent.
Refuses to install unless `.env.local` has `DEMO_RUNNER=local` (cloud mode would
double-record).

## Stop / remove

```bash
bash local-runner/launchd/uninstall.sh
```

## Check it

```bash
launchctl print gui/$(id -u)/com.nookframe.demo-worker | grep -E 'state|pid'
tail -f ~/Library/Logs/nookframe-demo-worker.log
```

## ⚠️ Screen must stay unlocked

Recording drives the **real screen**. Keep the Mac awake, logged in, and unlocked:
System Settings → Lock Screen → set "Require password after…" to off / screen
never locks. A locked screen or screensaver breaks the capture. `caffeinate` stops
*sleep* but cannot stop a password *lock*.

## Pause without a deploy

Set `system_status.demo_paused = true` (SQL Editor). The worker keeps running and
heartbeating but stops claiming/recording — no explore spend. Set back to `false`
to resume. (P0.5 will flip this automatically on credit exhaustion.)

## Run only ONE worker

Once this is installed, don't also run `npm run demo:worker` by hand — two
processes fighting over the screen will corrupt takes.
