import { Sandbox } from "e2b";

const sandbox = await Sandbox.create("nookframe-builder", { timeoutMs: 120_000 });
console.log("sandbox:", sandbox.sandboxId);

async function sh(cmd) {
  const r = await sandbox.commands.run(cmd);
  console.log(`\n$ ${cmd}\n[exit ${r.exitCode}]\n${r.stdout}${r.stderr ? "\nSTDERR: " + r.stderr : ""}`);
}

await sh("echo PATH=$PATH");
await sh("which node");
await sh("ls -la /opt/node/bin/ | head -20");
await sh("/opt/node/bin/node -v");
await sh("node -v");
await sh("PATH=/opt/node/bin:$PATH node -v");

await sandbox.kill();
