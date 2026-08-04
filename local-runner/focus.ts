// Focus (Do Not Disturb) guard for the take (host-security audit item 3):
// a Messages/Mail banner arriving mid-capture lands inside the crop rect and
// ships personal content into a PUBLIC video. macOS offers no supported CLI to
// flip Focus directly; the one stable path is `shortcuts run` against two
// user-installed shortcuts (see local-runner/README.md § Focus setup):
//
//   nookframe-dnd-on   →  Set Focus: Turn Do Not Disturb On (until Turned Off)
//   nookframe-dnd-off  →  Set Focus: Turn Do Not Disturb Off
//
// ~/Library/DoNotDisturb is TCC-protected, so the actual Focus state can't be
// read back from here — the `shortcuts run` exit code is the only signal we
// get. Missing/failing shortcuts therefore REFUSE the take (before the explore
// fee), same philosophy as the lock-screen preflight in pipeline.ts.
import { run } from "./util";

export const FOCUS_ON_SHORTCUT = "nookframe-dnd-on";
export const FOCUS_OFF_SHORTCUT = "nookframe-dnd-off";

const SETUP_HINT =
  "create both shortcuts in Shortcuts.app (action: Set Focus / 집중 모드 설정) — " +
  "see local-runner/README.md § Focus setup";

// Preflight: both shortcuts must exist BEFORE any API fee is spent. `shortcuts
// list` needs no TCC grant and is cheap.
export async function assertFocusShortcuts(): Promise<void> {
  const res = await run("shortcuts", ["list"], { timeoutMs: 15000 });
  if (res.code !== 0) {
    throw new Error(`\`shortcuts list\` failed (${res.stderr.trim() || "no stderr"}) — ${SETUP_HINT}`);
  }
  const names = new Set(res.stdout.split("\n").map((l) => l.trim()));
  const missing = [FOCUS_ON_SHORTCUT, FOCUS_OFF_SHORTCUT].filter((n) => !names.has(n));
  if (missing.length) {
    throw new Error(`Focus shortcuts missing: ${missing.join(", ")} — ${SETUP_HINT}`);
  }
}

// Turn DND on for the run; returns the restore fn the caller MUST invoke in its
// finally. Restore is best-effort and never throws (a take that already
// succeeded shouldn't fail because the "off" shortcut hiccuped) — but it logs
// loudly, because the leak direction is inverted: DND stuck ON silences the
// user's notifications until they notice.
//
// Known trade-off: Focus state can't be read (TCC), so if the user had DND on
// deliberately before the take, restore turns it off. Acceptable on a worker
// host; revisit if the worker ever shares a Mac with normal daytime use.
export async function enableFocus(): Promise<() => Promise<void>> {
  const on = await run("shortcuts", ["run", FOCUS_ON_SHORTCUT], { timeoutMs: 30000 });
  if (on.code !== 0) {
    throw new Error(
      `Focus guard failed: \`shortcuts run ${FOCUS_ON_SHORTCUT}\` exited ${on.code} ` +
        `(${on.stderr.trim() || "no stderr"}) — refusing to record without notification suppression`,
    );
  }
  console.log("[focus] Do Not Disturb ON for this take");
  return async () => {
    try {
      const off = await run("shortcuts", ["run", FOCUS_OFF_SHORTCUT], { timeoutMs: 30000 });
      if (off.code !== 0) {
        console.error(
          `[focus] RESTORE FAILED — Do Not Disturb may still be ON (\`${FOCUS_OFF_SHORTCUT}\` ` +
            `exited ${off.code}: ${off.stderr.trim() || "no stderr"})`,
        );
      } else {
        console.log("[focus] Do Not Disturb restored (off)");
      }
    } catch (e) {
      console.error("[focus] RESTORE FAILED — Do Not Disturb may still be ON:", e);
    }
  };
}
