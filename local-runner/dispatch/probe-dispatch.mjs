// `npm test`(루트)에서 dispatch 하니스를 같이 돌린다.
// 하니스는 node --test 형식이라 tsx로 직접 못 돌린다 — 자식으로 띄우고 종료코드만 넘긴다.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const r = spawnSync("node", ["--test", "test/harness.mjs"], {
  cwd: here,
  stdio: "inherit",
});
process.exit(r.status ?? 1);
