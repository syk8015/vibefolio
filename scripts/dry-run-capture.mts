// 2·3단계 검증: 실제 RECORD_HELPER_SRC를 샌드박스에서 prod와 동일 경로로 돌려
// 헤디드 x11grab 캡처 + 후처리까지 e2e 확인. manual 모드(DB 미접근).
// 실행: npx tsx --env-file=.env.local scripts/dry-run-capture.ts [URL]
import { Sandbox } from "e2b";
import { writeFileSync } from "node:fs";
import { RECORD_HELPER_SRC } from "../src/trigger/record-helper-src";

const URL = process.argv[2] || "https://demo.playwright.dev/todomvc";
const DISPLAY_NUM = ":99";
const DISPLAY_W = 1280;
const DISPLAY_H = 887;
const RECORD_DURATION_SEC = 15;
const MAX_VIDEO_SEC = 30;
const NODE_PATH_PREFIX = "export PATH=/opt/node/bin:$PATH && ";
const RECORD_PREFIX =
  NODE_PATH_PREFIX +
  "export NODE_PATH=/usr/local/lib/node_modules && " +
  "export PLAYWRIGHT_BROWSERS_PATH=/opt/playwright && ";

const sandbox = await Sandbox.create("nookframe-builder", { timeoutMs: 600_000 });
console.log("sandbox:", sandbox.sandboxId, "| target:", URL);
async function sh(cmd: string, opts: any = {}) {
  const r: any = await sandbox.commands
    .run(cmd, opts)
    .catch((e: any) => ({ exitCode: -1, stdout: "", stderr: String(e?.message || e) }));
  return r;
}

try {
  await sandbox.files.write("/tmp/record-helper.js", RECORD_HELPER_SRC);

  await sandbox.commands.run(
    `Xvfb ${DISPLAY_NUM} -screen 0 ${DISPLAY_W}x${DISPLAY_H}x24 -nolisten tcp >/tmp/xvfb.log 2>&1`,
    { background: true },
  );
  await new Promise((r) => setTimeout(r, 1500));
  await sandbox.commands.run(
    `DISPLAY=${DISPLAY_NUM} matchbox-window-manager -use_titlebar no >/tmp/wm.log 2>&1`,
    { background: true },
  );
  await new Promise((r) => setTimeout(r, 1000));

  const recordEnvs: Record<string, string> = {
    DISPLAY: DISPLAY_NUM,
    DEMO_DISPLAY_H: String(DISPLAY_H),
  };
  if (process.env.ANTHROPIC_API_KEY) recordEnvs.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (process.env.DEMO_CU_MODEL) recordEnvs.DEMO_CU_MODEL = process.env.DEMO_CU_MODEL;
  console.log("computer-use key present:", Boolean(recordEnvs.ANTHROPIC_API_KEY));

  console.log("\n--- running recorder ---");
  const rec = await sh(
    `${RECORD_PREFIX}mkdir -p /tmp/rec && node /tmp/record-helper.js ${URL} /tmp/rec ${RECORD_DURATION_SEC}`,
    { timeoutMs: 480_000, envs: recordEnvs },
  );
  console.log("recorder exit:", rec.exitCode);
  console.log("recorder stdout:\n", rec.stdout?.slice(-1500));
  if (rec.stderr) console.log("recorder stderr (tail):\n", rec.stderr.slice(-800));
  if (rec.exitCode !== 0) {
    const log = await sh("tail -40 /tmp/rec/ffmpeg-grab.log 2>/dev/null");
    console.log("ffmpeg-grab.log tail:\n", log.stdout);
    throw new Error("recorder failed");
  }

  // post-process (mirror build-and-record): recorder already cut dead air into
  // tight.mp4 — prefer it, fall back to the raw cap.mp4.
  const probe = async (f: string) =>
    parseFloat(
      (await sh(`ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 /tmp/rec/${f}`))
        .stdout.trim(),
    ) || 0;
  let src = "tight.mp4";
  let srcDur = await probe(src);
  if (srcDur < 2) {
    src = "cap.mp4";
    srcDur = await probe(src);
  }
  const clipLen = Math.max(2, Math.min(MAX_VIDEO_SEC, srcDur || RECORD_DURATION_SEC));
  const fadeOutStart = Math.max(0, clipLen - 0.5).toFixed(2);
  console.log("src:", src, "dur:", srcDur, "-> clipLen:", clipLen);
  const post = await sh(
    `cd /tmp/rec && ffmpeg -y -i ${src} -t ${clipLen.toFixed(2)} ` +
      `-vf "scale=-2:720,fade=t=in:st=0:d=0.4,fade=t=out:st=${fadeOutStart}:d=0.5" ` +
      `-r 60 -fps_mode cfr ` +
      `-c:v libx264 -preset medium -crf 26 -pix_fmt yuv420p -an -movflags +faststart demo.mp4`,
    { timeoutMs: 120_000 },
  );
  console.log("post exit:", post.exitCode, post.stderr ? "\n" + post.stderr.slice(-300) : "");

  await sh(
    `echo "cap: $(ffprobe -v error -select_streams v:0 -show_entries stream=width,height,avg_frame_rate -of csv=p=0 /tmp/rec/cap.mp4)"; ` +
      `echo "demo: $(ffprobe -v error -select_streams v:0 -show_entries stream=width,height,avg_frame_rate -of csv=p=0 /tmp/rec/demo.mp4)"`,
  ).then((r) => console.log(r.stdout));
  const uniq = await sh(
    `echo -n 'demo unique frames: '; ffmpeg -i /tmp/rec/demo.mp4 -vf 'mpdecimate,showinfo' -an -f null - 2>&1 | grep -c pts_time; echo -n 'demo total: '; ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of default=nk=1:nw=1 /tmp/rec/demo.mp4`,
  );
  console.log(uniq.stdout);

  for (const f of ["demo.mp4", "tight.mp4", "cap.mp4"]) {
    const bytes = await sandbox.files.read("/tmp/rec/" + f, { format: "bytes" }).catch(() => null);
    if (bytes) {
      writeFileSync("/tmp/dryrun_" + f, Buffer.from(bytes as Uint8Array));
      console.log("downloaded /tmp/dryrun_" + f, "(", (bytes as Uint8Array).length, "bytes )");
    }
  }
} finally {
  await sandbox.kill();
  console.log("\nsandbox killed.");
}
