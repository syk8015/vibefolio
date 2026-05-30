import { Sandbox } from "e2b";
import { readFileSync, writeFileSync } from "node:fs";

const TARGET_URL = process.argv[2] || "https://example.com";
const DURATION = process.argv[3] || "5";

const sandbox = await Sandbox.create("nookframe-builder", { timeoutMs: 180_000 });
console.log("sandbox:", sandbox.sandboxId);

const helperSrc = readFileSync("e2b/record-helper.js", "utf8");
await sandbox.files.write("/tmp/record-helper.js", helperSrc);
console.log("helper uploaded");

const PREFIX =
  "export PATH=/opt/node/bin:$PATH && " +
  "export NODE_PATH=/usr/local/lib/node_modules && " +
  "export PLAYWRIGHT_BROWSERS_PATH=/opt/playwright && ";
const r = await sandbox.commands.run(
  `${PREFIX}mkdir -p /tmp/out && node /tmp/record-helper.js ${TARGET_URL} /tmp/out ${DURATION}`,
  { timeoutMs: 120_000 },
);
console.log("exit:", r.exitCode);
console.log("stdout:", r.stdout);
if (r.stderr) console.log("stderr:", r.stderr);

if (r.exitCode === 0) {
  const bytes = await sandbox.files.read("/tmp/out/demo.webm", { format: "bytes" });
  const buf = Buffer.from(bytes);
  writeFileSync("/tmp/demo-out.webm", buf);
  console.log(`downloaded /tmp/demo-out.webm (${buf.length} bytes)`);
}

await sandbox.kill();
