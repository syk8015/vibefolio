// Re-run ONLY the post stage on a persisted take (raw.mp4 + take-meta.json,
// written by pipeline.ts right before postprocess). No explore fee, no
// re-recording — the salvage path when zoompan/endcap/poster work fails after a
// good capture.
//
//   npx -y tsx local-runner/reprocess.ts [take-dir]   (default /tmp/nf-runner)
import { readFileSync } from "node:fs";
import { postprocess } from "./postprocess";

const dir = process.argv[2] || "/tmp/nf-runner";
const meta = JSON.parse(readFileSync(`${dir}/take-meta.json`, "utf8"));
console.log(`[reprocess] ${dir}/raw.mp4  (${meta.projectId}, ${meta.events.length} camera events)`);
const out = await postprocess({
  rawPath: `${dir}/raw.mp4`,
  outPath: `${dir}/demo.mp4`,
  events: meta.events,
  rawW: meta.rawW,
  rawH: meta.rawH,
  logicalW: meta.logicalW,
  logicalH: meta.logicalH,
  username: meta.username,
});
console.log(
  `[reprocess] demo.mp4 ready — clip ${out.clipLen.toFixed(2)}s of ${out.durationSec.toFixed(2)}s raw` +
    (out.posterPath ? `, poster ${out.posterPath}` : ""),
);
