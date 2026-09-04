# Unattended demo worker (macOS launchd + Terminal)

Keeps `npm run demo:worker` alive without babysitting — survives crashes and
logins. This is P0.1 A; the worker was a manual, foreground, single-machine SPOF.

## Architecture (2026-07-13 TCC rework)

```
launchd agent (headless, no TCC)          Terminal.app (owns all TCC grants)
└─ supervisor.sh @login + every 60s   →   └─ worker-loop.sh
   "worker loop alive? if not,               restarts `npm run demo:worker` on
    open it in a Terminal window"            crash (30s delay); caffeinate -dis
```

**Why the worker is NOT run under launchd directly**: launchd's bash has no TCC
grants — it cannot even read `~/Desktop` (exit 126 "Operation not permitted",
discovered live 2026-07-13), and recording would additionally need Screen
Recording + Accessibility grants that only Terminal already holds. So the worker
lives in a visible Terminal window; launchd only guarantees that window exists.

Consequences:

- The worker is a **Terminal window on your desktop**. Closing it = supervisor
  reopens it within 60s. Stopping for real = `uninstall.sh`.
- Crash-restart happens **inside** the loop (one window forever), not by
  spawning new windows.
- `worker-loop.sh` refuses to start a second worker if one is already running
  (two workers fighting over the screen would corrupt takes).
- First install triggers a one-time macOS **Automation** prompt ("control
  Terminal") — click Allow. If you misclicked Deny: System Settings → Privacy &
  Security → Automation → allow Terminal for the supervisor.

## Install / update

```bash
bash local-runner/launchd/install.sh
```

Idempotent — re-run after pulling. Substitutes absolute paths, installs
`supervisor.sh` outside the repo (`~/Library/Application Support/Nookframe`,
launchd can't read ~/Desktop), writes the plist, (re)starts the agent, and
removes the old broken `com.nookframe.demo-worker` agent if present. Refuses to
install without a `.env.local`.

## Stop / remove

```bash
bash local-runner/launchd/uninstall.sh
```

## Check it

```bash
launchctl print gui/$(id -u)/com.nookframe.worker-supervisor | grep -E 'state|pid'
tail -f ~/Library/Logs/nookframe-supervisor.log   # supervisor decisions
# worker output: the Terminal window itself
```

Heartbeat: every poll the worker stamps `system_status.worker_last_seen_at`
(needs `supabase/migration_system_status.sql`) and reads `demo_paused` back as a
drain kill-switch.

## ⚠️ Screen must stay unlocked

Recording drives the **real screen**. Keep the Mac awake, logged in, and
unlocked: System Settings → Lock Screen → "Require password after…" off. A
locked screen or screensaver breaks the capture. `caffeinate` stops *sleep* but
cannot stop a password *lock*.

## Pause without a deploy

Set `system_status.demo_paused = true` (SQL Editor). The worker keeps running
and heartbeating but stops claiming/recording — no explore spend. Set back to
`false` to resume. (P0.5 flips this automatically on credit exhaustion.)

## Run only ONE worker

Don't also run `npm run demo:worker` by hand while this is installed — the loop
guards against it, but don't tempt it.
