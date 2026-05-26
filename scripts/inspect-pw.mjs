import { Sandbox } from "e2b";

const sandbox = await Sandbox.create("vibefolio-builder", { timeoutMs: 90_000 });
console.log("sandbox:", sandbox.sandboxId);

const PREFIX = "export PATH=/opt/node/bin:$PATH && ";
async function sh(cmd) {
  try {
    const r = await sandbox.commands.run(PREFIX + cmd);
    console.log(`\n$ ${cmd}\n[exit ${r.exitCode}]\n${r.stdout}${r.stderr ? "\nSTDERR: " + r.stderr : ""}`);
  } catch (e) {
    console.log(`\n$ ${cmd}\n[threw] ${e.message}`);
  }
}

await sh("file /usr/local/bin/playwright");
await sh("readlink -f /usr/local/bin/playwright");
await sh("find /usr -name 'package.json' -path '*playwright*' 2>/dev/null | head -10");
await sh("find /opt -name 'playwright' -type d 2>/dev/null | head -10");
await sh("ls /usr/local/lib/node_modules 2>/dev/null || echo no-dir");

await sandbox.kill();
