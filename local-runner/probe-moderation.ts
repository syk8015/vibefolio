// Moderation pipeline probe — verifies the scan plumbing WITHOUT recording a
// take (and without API spend unless --live).
//
//   npx -y tsx local-runner/probe-moderation.ts          # no-API assertions
//   npx -y tsx local-runner/probe-moderation.ts --live   # + one real classifier
//                                                          call on benign frames
//                                                          (~$0.01, needs key)
//
// Covers: frame extraction from a synthetic clip → fake-flag/fake-ok hooks →
// marker/prefix safety (credit sweep must not grab moderation holds) → policy
// failure-code roundtrip → (--live) a real structured-output verdict on frames
// that must classify "ok".
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./util";
import { extractModerationFrames, moderateDemo } from "./moderate";
import { CREDIT_HOLD_MARKER, MODERATION_HOLD_MARKER } from "./errors";
import { formatDemoFailure, parseDemoFailure, demoFailureCopy } from "../lib/demo-failure";

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "✓" : "✗"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const live = process.argv.includes("--live");
const dir = mkdtempSync(join(tmpdir(), "nf-mod-probe-"));

try {
  // ── synthetic 3s clip (testsrc2 = colorful pattern, clearly benign) ─────────
  const clip = join(dir, "clip.mp4");
  const gen = await run("ffmpeg", [
    "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=10:duration=3",
    "-pix_fmt", "yuv420p", clip,
  ], { timeoutMs: 30_000 });
  check("synthetic clip generated", gen.code === 0, gen.stderr.slice(-200));

  const frames = await extractModerationFrames(clip, join(dir, "frames"));
  check(`frame extraction (${frames.length} frames)`, frames.length >= 1);

  // ── no-API hooks: both verdict paths reachable without spend ────────────────
  process.env.NF_FAKE_MODERATION = "flag";
  const fakeFlag = await moderateDemo({ framePaths: frames });
  check("NF_FAKE_MODERATION=flag → flag", fakeFlag.verdict === "flag" && !fakeFlag.failedOpen);

  process.env.NF_FAKE_MODERATION = "ok";
  const fakeOk = await moderateDemo({ framePaths: frames });
  check("NF_FAKE_MODERATION=ok → ok", fakeOk.verdict === "ok" && !fakeOk.failedOpen);
  delete process.env.NF_FAKE_MODERATION;

  // ── marker safety: credit release sweep keys on '[credit]%' ─────────────────
  check(
    "moderation marker escapes the credit sweep",
    !MODERATION_HOLD_MARKER.startsWith("[credit]") && MODERATION_HOLD_MARKER.startsWith("[moderation]"),
  );
  check("credit marker unchanged", CREDIT_HOLD_MARKER.startsWith("[credit]"));

  // ── policy failure-code roundtrip (reject path writes this) ─────────────────
  const stored = formatDemoFailure("policy", "관리자 검토에서 게시가 거절됐어요.");
  const parsed = parseDemoFailure(stored);
  check("policy code roundtrip", parsed.code === "policy" && !!demoFailureCopy("policy", "ko").title);

  // ── live classifier (opt-in) ────────────────────────────────────────────────
  if (live) {
    const verdict = await moderateDemo({ framePaths: frames, projectTitle: "probe test pattern" });
    console.log(`  live verdict: ${verdict.verdict} [${verdict.categories.join(", ")}] — ${verdict.reason}`);
    check("live: scan ran (not failed-open)", !verdict.failedOpen);
    check("live: benign frames → ok", verdict.verdict === "ok");
  } else {
    console.log("(--live 생략: 실제 분류기 호출 없음)");
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
