// Coverage read on an EXISTING film — the A-1 verification instrument.
//
// The pipeline only runs the moderation scan (which carries the coverage verdict)
// on real published takes: dry-runs skip it so fixture shoots don't burn the fee.
// That leaves no way to ask "does the coverage judgment match this actual film?"
// without publishing something. This does exactly that and nothing else: sample
// the same 4 frames the pipeline would, run the same vision call, print the read.
//
//   npx -y tsx local-runner/probe-coverage.ts <film.mp4> [expected: app-ui|landing-only]
//
// ⚠️ Live API (~$0.015 per run, MODERATION_MODEL). Pass body.mp4 when you have it —
// the endcap is not part of the film the read is supposed to judge.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "./config"; // side-effect: load .env.local
import { extractModerationFrames, moderateDemo } from "./moderate";

const film = process.argv[2];
const expected = process.argv[3];
if (!film) {
  console.error("usage: tsx local-runner/probe-coverage.ts <film.mp4> [app-ui|landing-only]");
  process.exit(1);
}

const frames = await extractModerationFrames(film, mkdtempSync(join(tmpdir(), "nf-coverage-")));
const v = await moderateDemo({ framePaths: frames });
console.log(
  `film     : ${film}\n` +
    `frames   : ${frames.length}\n` +
    `coverage : ${v.coverage}\n` +
    `verdict  : ${v.verdict}${v.categories.length ? ` [${v.categories.join(", ")}]` : ""}` +
    `${v.failedOpen ? " (failed open — unscanned)" : ""}\n` +
    `reason   : ${v.reason}\n` +
    `model    : ${v.model}`,
);
if (expected) {
  const ok = v.coverage === expected;
  console.log(`\n${ok ? "PASS" : "FAIL"} — expected coverage=${expected}, got ${v.coverage}`);
  process.exit(ok ? 0 : 1);
}
