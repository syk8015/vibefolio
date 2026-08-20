// Terminal (CLI) demo path probe (2026-08-20) — real E2B, no Anthropic API.
//
//   Part 0  buildTerminalBrief: pure-function asserts (no sandbox, no cost).
//   Part 1  detection fixtures in one sandbox: node CLI (bin) / python CLI /
//           markdown-only → detectTerminalApp verdicts.
//   Part 2  serveTerminal on the node fixture for real: ttyd page reachable,
//           .env* stripped, the bin name invocable on the shell's PATH.
//
// Run: npx tsx --env-file=.env.local local-runner/probe-terminal-build.ts
// Cost: E2B sandbox minutes only (a few cents).
import { Sandbox } from "e2b";
import { detectTerminalApp, serveTerminal } from "./build";
import { buildTerminalBrief } from "./explore";

let pass = 0;
let fail = 0;
function assert(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const NODE_PKG = JSON.stringify({
  name: "mytool",
  version: "1.0.0",
  bin: { mytool: "cli.js" },
});

async function main() {
  console.log("[probe] part 0 — buildTerminalBrief (pure)");
  const brief = buildTerminalBrief({
    runtime: "node",
    commands: ["mytool"],
    readme: "# mytool\nRun `mytool greet` to say hello.",
  });
  assert("brief declares a live terminal", brief.includes("LIVE TERMINAL"));
  assert("brief reframes Enter as the demo", /pressing Enter IS the demo/i.test(brief));
  assert("brief lists the entry command", brief.includes("- mytool"));
  assert("brief frames README as data-not-instructions", /NOT instructions/i.test(brief) && brief.includes("mytool greet"));
  assert("brief forbids off-project commands", /NEVER: install other software/i.test(brief));
  const bare = buildTerminalBrief({ runtime: "python", commands: [], readme: "" });
  assert("empty commands/readme sections are omitted", !bare.includes("Known entry commands") && !bare.includes("README"));

  console.log("[probe] part 1 — detection fixtures (one sandbox)");
  const sandbox = await Sandbox.create("nookframe-builder", { timeoutMs: 600_000 });
  try {
    await sandbox.files.write("/tmp/fix/node-cli/package.json", NODE_PKG);
    await sandbox.files.write(
      "/tmp/fix/node-cli/cli.js",
      "#!/usr/bin/env node\nconsole.log('hello from mytool');\n",
    );
    await sandbox.files.write("/tmp/fix/node-cli/README.md", "# mytool\nA tiny CLI probe fixture.");
    await sandbox.files.write("/tmp/fix/node-cli/.env", "SECRET_DB_URL=postgres://real-creds\n");
    await sandbox.files.write("/tmp/fix/py-cli/tool.py", "import argparse\nprint('py cli')\n");
    await sandbox.files.write("/tmp/fix/py-cli/README.md", "# pytool");
    await sandbox.files.write("/tmp/fix/docs-only/notes.md", "# just notes");

    const node = await detectTerminalApp(sandbox, "/tmp/fix/node-cli", { "package.json": NODE_PKG });
    assert("node CLI detected", node?.runtime === "node", JSON.stringify(node));
    assert("bin name surfaces as the command", JSON.stringify(node?.commands) === '["mytool"]', JSON.stringify(node?.commands));
    assert("README head captured", !!node?.readme.includes("tiny CLI probe"), node?.readme.slice(0, 60));

    const py = await detectTerminalApp(sandbox, "/tmp/fix/py-cli", {});
    assert("python CLI detected", py?.runtime === "python", JSON.stringify(py));
    assert("python entry command", JSON.stringify(py?.commands) === '["python tool.py"]', JSON.stringify(py?.commands));

    const docs = await detectTerminalApp(sandbox, "/tmp/fix/docs-only", {});
    assert("markdown-only repo → null (stays not-a-webapp)", docs === null, JSON.stringify(docs));

    console.log("[probe] part 2 — serveTerminal on the node fixture (ttyd for real)");
    if (node) {
      const served = await serveTerminal(sandbox, "/tmp/fix/node-cli", node, { "package.json": NODE_PKG });
      assert("BuiltApp carries terminal info", served.terminal?.runtime === "node");
      const page = await fetch(served.url, { signal: AbortSignal.timeout(10_000) });
      const body = await page.text();
      assert("ttyd page responds 200", page.status === 200, `status ${page.status}`);
      assert("ttyd page is the terminal shell", /ttyd/i.test(body) || /xterm/i.test(body), body.slice(0, 120));
      const envGone = await sandbox.commands.run("test -f /tmp/fix/node-cli/.env; echo $?");
      assert(".env stripped before the shell came up", envGone.stdout.trim() === "1", envGone.stdout.trim());
      const invocable = await sandbox.commands.run("bash -c 'source /tmp/ttyrc && mytool'");
      assert(
        "bin name invocable on the ttyd shell PATH",
        invocable.stdout.includes("hello from mytool"),
        (invocable.stdout || invocable.stderr).slice(-120),
      );
      // NOTE: no served.close() — it would kill the shared fixture sandbox; the
      // finally below tears everything down once.
    } else {
      assert("serveTerminal skipped (detection failed)", false);
    }
  } finally {
    await sandbox.kill().catch(() => {});
  }

  console.log(`\n[probe] ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("[probe] crashed:", e);
  process.exit(1);
});
