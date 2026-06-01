import { task, logger, retry } from "@trigger.dev/sdk";
import Sandbox from "e2b";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import ws from "ws";
import { RECORD_HELPER_SRC } from "./record-helper-src";

// Trigger.dev 워커는 Node 21이라 native WebSocket이 없음.
// supabase-js의 RealtimeClient가 ws를 못 잡으면 초기화에서 throw해서
// DB write 자체가 안 됨. transport로 명시 주입.
const SUPABASE_OPTS = {
  realtime: { transport: ws as unknown as never },
} as const;

export type BuildPayload = {
  projectId: string;
  sourceType: "github" | "zip" | "live_url";
  sourceValue: string;
};

export type BuildResult = {
  url: string;
  sandboxId?: string;
  builtAt: string;
  videoBytes?: number;
  videoUrl?: string;
};

const SANDBOX_TIMEOUT_MS = 600_000;
const CLONE_TIMEOUT_MS = 120_000;
const INSTALL_TIMEOUT_MS = 600_000;
const READY_TIMEOUT_MS = 90_000;
// The computer-use agent loop (screenshots + API round-trips + actions) plus
// the initial load wait can run well past two minutes. Give it room.
const RECORD_TIMEOUT_MS = 300_000;
const RECORD_DURATION_SEC = 15;
// Hard cap on the final clip length, regardless of how long the agent ran.
const MAX_VIDEO_SEC = 30;
const DEV_PORT = 3000;
const NODE_PATH_PREFIX = "export PATH=/opt/node/bin:$PATH && ";
const RECORD_PREFIX =
  NODE_PATH_PREFIX +
  "export NODE_PATH=/usr/local/lib/node_modules && " +
  "export PLAYWRIGHT_BROWSERS_PATH=/opt/playwright && ";
const DEMO_BUCKET = "project-files";

// supabase storage list는 한 단계만 본다. zip 업로드는 중첩 디렉터리(src/,
// public/, ...)를 가질 수 있어서 BFS로 모든 파일 경로를 모은다.
async function listStorageFilesRecursive(
  supabase: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const out: string[] = [];
  const queue: string[] = [prefix];
  while (queue.length) {
    const dir = queue.shift()!;
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(dir, { limit: 1000 });
    if (error) throw new Error(`storage list failed at ${dir}: ${error.message}`);
    for (const entry of data ?? []) {
      const full = `${dir}/${entry.name}`;
      // supabase는 디렉터리 placeholder를 id=null + metadata=null로 돌려준다.
      if (entry.id === null) {
        queue.push(full);
      } else {
        out.push(full);
      }
    }
  }
  return out;
}

async function recordFailedStatus(projectId: string, error: unknown) {
  if (projectId.startsWith("manual-")) return; // dry-run 모드는 DB 안 건드림
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      SUPABASE_OPTS,
    );
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Unknown error";
    // 너무 긴 stack trace는 잘라서 저장 (UI tooltip이 감당 가능한 길이)
    const truncated = message.length > 1000 ? message.slice(0, 1000) + "…" : message;
    await supabase
      .from("projects")
      .update({
        demo_build_status: "failed",
        demo_build_error: truncated,
      })
      .eq("id", projectId);
  } catch (writeErr) {
    logger.error("Failed to record failure status", { writeErr });
  }
}

type RecorderMeta = {
  mode?: string;
  steps?: number;
  interactionStartMs?: number;
  interactionEndMs?: number;
  visibleChars?: number;
  cuError?: string | null;
};

// The recorder prints a JSON summary as its last stdout line. Parse it (from the
// end, skipping the human-readable "goto ..." lines) so we can trim the video to
// the actual interaction window.
function parseRecorderMeta(stdout: string): RecorderMeta {
  const lines = stdout.trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith("{") && line.endsWith("}")) {
      try {
        return JSON.parse(line) as RecorderMeta;
      } catch {
        // keep scanning earlier lines
      }
    }
  }
  return {};
}

export const buildAndRecord = task({
  id: "build-and-record",
  maxDuration: 1200,
  catchError: async ({ payload, error, ctx }) => {
    const buildPayload = payload as BuildPayload;
    logger.error("Build job failed", {
      projectId: buildPayload.projectId,
      attempt: ctx.attempt.number,
      error: error instanceof Error ? error.message : String(error),
    });
    await recordFailedStatus(buildPayload.projectId, error);
  },
  run: async (payload: BuildPayload): Promise<BuildResult> => {
    logger.log("Build job start", { payload });

    if (
      payload.sourceType !== "github" &&
      payload.sourceType !== "live_url" &&
      payload.sourceType !== "zip"
    ) {
      throw new Error(
        `Unsupported source type '${payload.sourceType}'`,
      );
    }

    const sandbox = await Sandbox.create("nookframe-builder", {
      timeoutMs: SANDBOX_TIMEOUT_MS,
    });
    logger.log("Sandbox created", { sandboxId: sandbox.sandboxId });

    // github/zip: 샌드박스에서 빌드 + dev server. live_url: 이미 호스팅된 URL 그대로.
    let recordTarget: string;
    let sandboxPublicUrl: string | undefined;

    if (payload.sourceType === "github" || payload.sourceType === "zip") {
      const repoPath = "/tmp/app";

      if (payload.sourceType === "github") {
        const repoUrl = payload.sourceValue;
        const clone = await sandbox.commands.run(
          `git clone --depth 1 ${repoUrl} ${repoPath}`,
          { timeoutMs: CLONE_TIMEOUT_MS },
        );
        logger.log("git clone done", { exitCode: clone.exitCode });
      } else {
        // zip: supabase storage prefix 아래 모든 파일을 받아 샌드박스에 펼친다.
        const supabaseDl = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          SUPABASE_OPTS,
        );
        const prefix = payload.sourceValue;
        const filePaths = await listStorageFilesRecursive(
          supabaseDl,
          DEMO_BUCKET,
          prefix,
        );
        logger.log("storage list done", { prefix, count: filePaths.length });
        if (!filePaths.length) {
          throw new Error(`No files found under storage prefix '${prefix}'`);
        }

        await sandbox.commands.run(`mkdir -p ${repoPath}`);
        for (const storagePath of filePaths) {
          const relative = storagePath.slice(prefix.length + 1); // strip "{prefix}/"
          const { data, error } = await supabaseDl.storage
            .from(DEMO_BUCKET)
            .download(storagePath);
          if (error || !data) {
            throw new Error(
              `storage download failed at ${storagePath}: ${error?.message ?? "no data"}`,
            );
          }
          const targetPath = `${repoPath}/${relative}`;
          const targetDir = targetPath.substring(0, targetPath.lastIndexOf("/"));
          if (targetDir && targetDir !== repoPath) {
            await sandbox.commands.run(`mkdir -p '${targetDir}'`);
          }
          await sandbox.files.write(targetPath, data);
        }
        logger.log("zip files uploaded to sandbox", {
          count: filePaths.length,
          repoPath,
        });
      }

      const install = await sandbox.commands.run(
        `${NODE_PATH_PREFIX}cd ${repoPath} && npm install --no-audit --no-fund --prefer-offline`,
        { timeoutMs: INSTALL_TIMEOUT_MS },
      );
      logger.log("npm install done", { exitCode: install.exitCode });

      await sandbox.commands.run(
        `${NODE_PATH_PREFIX}cd ${repoPath} && npm run dev -- --host 0.0.0.0 --port ${DEV_PORT} > /tmp/dev.log 2>&1`,
        { background: true },
      );

      sandboxPublicUrl = `https://${sandbox.getHost(DEV_PORT)}`;

      const deadline = Date.now() + READY_TIMEOUT_MS;
      let ready = false;
      while (Date.now() < deadline) {
        try {
          const res = await fetch(sandboxPublicUrl, { signal: AbortSignal.timeout(5000) });
          if (res.status < 500) {
            ready = true;
            break;
          }
        } catch {
          // keep polling
        }
        await new Promise((r) => setTimeout(r, 2000));
      }

      if (!ready) {
        const tail = await sandbox.commands.run("tail -80 /tmp/dev.log");
        throw new Error(
          `Dev server did not respond within ${READY_TIMEOUT_MS / 1000}s.\n--- dev.log tail ---\n${tail.stdout}`,
        );
      }

      logger.log("Dev server reachable", { url: sandboxPublicUrl });
      recordTarget = `http://localhost:${DEV_PORT}`;
    } else {
      // live_url: just record the public URL directly.
      recordTarget = payload.sourceValue;
      logger.log("Live URL mode — skipping build", { url: recordTarget });
    }

    await sandbox.files.write("/tmp/record-helper.js", RECORD_HELPER_SRC);
    logger.log("record helper uploaded");

    // Inject the Anthropic key via `envs` (never the command string) so it
    // drives the computer-use agent loop without leaking into logs. Absent key
    // -> the recorder falls back to a plain scroll, still producing a video.
    const recordEnvs: Record<string, string> = {};
    if (process.env.ANTHROPIC_API_KEY)
      recordEnvs.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (process.env.DEMO_CU_MODEL)
      recordEnvs.DEMO_CU_MODEL = process.env.DEMO_CU_MODEL;
    logger.log("recorder mode", {
      computerUse: Boolean(recordEnvs.ANTHROPIC_API_KEY),
    });

    const recordResult = await sandbox.commands.run(
      `${RECORD_PREFIX}mkdir -p /tmp/rec && node /tmp/record-helper.js ${recordTarget} /tmp/rec ${RECORD_DURATION_SEC}`,
      { timeoutMs: RECORD_TIMEOUT_MS, envs: recordEnvs },
    );
    logger.log("record done", {
      exitCode: recordResult.exitCode,
      stdout: recordResult.stdout,
    });
    if (recordResult.exitCode !== 0) {
      throw new Error(
        `Recorder exited ${recordResult.exitCode}: ` +
          (recordResult.stderr?.slice(-600) || recordResult.stdout?.slice(-600) || "no output"),
      );
    }

    // The recording opens with dead load time (goto / networkidle / font + paint
    // waits) before the agent — or the scroll fallback — starts. The recorder
    // reports that interaction window, so trim to it instead of blind
    // tail-slicing: start at interactionStart, run for the interaction's own
    // length, capped at MAX_VIDEO_SEC.
    const meta = parseRecorderMeta(recordResult.stdout);
    logger.log("recorder meta", {
      mode: meta.mode,
      steps: meta.steps,
      interactionStartMs: meta.interactionStartMs,
      interactionEndMs: meta.interactionEndMs,
      cuError: meta.cuError ?? undefined,
    });
    const startSec = Math.max(0, (meta.interactionStartMs ?? 0) / 1000);
    const rawLen =
      meta.interactionStartMs != null && meta.interactionEndMs != null
        ? (meta.interactionEndMs - meta.interactionStartMs) / 1000
        : RECORD_DURATION_SEC;
    const clipLen = Math.max(4, Math.min(MAX_VIDEO_SEC, rawLen));
    const fadeOutStart = Math.max(0, clipLen - 0.5).toFixed(2);
    // Capture is WXGA 1280×800 (computer-use accuracy), but the demo only ever
    // plays in a small Theater card — so downscale to 720p and lean on a higher
    // CRF + slower preset. This trims ~60-70% off the file with no perceptible
    // loss at card size. Compute time is free here (async Trigger task).
    const ffmpegCmd =
      `cd /tmp/rec && ffmpeg -y -ss ${startSec.toFixed(2)} -i demo.webm -t ${clipLen.toFixed(2)} ` +
      `-vf "scale=-2:720,fade=t=in:st=0:d=0.5,fade=t=out:st=${fadeOutStart}:d=0.5" ` +
      `-c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p -an ` +
      `-movflags +faststart demo.mp4`;
    const ffmpegResult = await sandbox.commands.run(ffmpegCmd, {
      timeoutMs: 120_000,
    });
    if (ffmpegResult.exitCode !== 0) {
      throw new Error(
        `ffmpeg failed (exit ${ffmpegResult.exitCode}): ${ffmpegResult.stderr.slice(-600)}`,
      );
    }
    logger.log("ffmpeg done");

    // Blank-recording guard: never ship a uniform-color video. Sample the
    // final mp4 at 2fps and read each frame's luminance spread (YMAX-YMIN).
    // A blank page (font-gated / JS-gated content, wrong default theme, dead
    // target) yields near-uniform frames; any frame with real content (text,
    // imagery) has a wide spread. We pass if *any* sampled frame looks alive.
    const SIG_PATH = "/tmp/rec/sig.txt";
    await sandbox.commands.run(
      `cd /tmp/rec && ffmpeg -y -i demo.mp4 -vf "fps=2,signalstats,metadata=print:file=${SIG_PATH}" -an -f null - 2>/dev/null`,
      { timeoutMs: 60_000 },
    );
    const sigText = await retry.onThrow(
      async () => sandbox.files.read(SIG_PATH, { format: "text" }),
      { maxAttempts: 3, minTimeoutInMs: 1000, factor: 2 },
    );
    const mins = [...sigText.matchAll(/signalstats\.YMIN=([\d.]+)/g)].map((m) =>
      parseFloat(m[1]),
    );
    const maxs = [...sigText.matchAll(/signalstats\.YMAX=([\d.]+)/g)].map((m) =>
      parseFloat(m[1]),
    );
    let peakSpread = 0;
    for (let i = 0; i < Math.min(mins.length, maxs.length); i++) {
      peakSpread = Math.max(peakSpread, maxs[i] - mins[i]);
    }
    const BLANK_SPREAD_THRESHOLD = 40;
    logger.log("blank check", {
      sampledFrames: Math.min(mins.length, maxs.length),
      peakSpread,
    });
    // Only fail when we actually got samples; if parsing yielded nothing, don't
    // block on a measurement we couldn't make.
    if (mins.length && maxs.length && peakSpread < BLANK_SPREAD_THRESHOLD) {
      throw new Error(
        `Recording appears blank — every sampled frame was near-uniform color ` +
          `(peak luminance spread ${peakSpread.toFixed(1)} < ${BLANK_SPREAD_THRESHOLD}). ` +
          `The target rendered no visible content (font-gated/JS-gated content, ` +
          `a light default theme with no painted text, or a dead page). ` +
          `Recorder diagnostics: ${recordResult.stdout.slice(-400)}`,
      );
    }

    // E2B sandbox는 file read에서 transient "fetch failed"가 30~50% 빈도. 재시도로 흡수.
    const videoBytes = await retry.onThrow(
      async () => sandbox.files.read("/tmp/rec/demo.mp4", { format: "bytes" }),
      { maxAttempts: 4, minTimeoutInMs: 1500, factor: 2 },
    );
    const buf = Buffer.from(videoBytes);
    logger.log("video downloaded", { bytes: buf.length });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      SUPABASE_OPTS,
    );
    const isRealProject = !payload.projectId.startsWith("manual-");

    let userId: string | null = null;
    if (isRealProject) {
      const { data, error } = await supabase
        .from("projects")
        .select("user_id")
        .eq("id", payload.projectId)
        .single();
      if (error) throw new Error(`projects select failed: ${error.message}`);
      userId = data.user_id;
    }

    const storagePath = isRealProject
      ? `${userId}/${payload.projectId}/demo.mp4`
      : `_test/${payload.projectId}/demo.mp4`;

    const { error: uploadErr } = await supabase.storage
      .from(DEMO_BUCKET)
      .upload(storagePath, buf, {
        contentType: "video/mp4",
        upsert: true,
      });
    if (uploadErr)
      throw new Error(`storage upload failed: ${uploadErr.message}`);

    const {
      data: { publicUrl },
    } = supabase.storage.from(DEMO_BUCKET).getPublicUrl(storagePath);
    logger.log("video uploaded", { storagePath, publicUrl });

    if (isRealProject) {
      const { error: updErr } = await supabase
        .from("projects")
        .update({
          demo_video_url: publicUrl,
          demo_build_status: "done",
          demo_generated_at: new Date().toISOString(),
        })
        .eq("id", payload.projectId);
      if (updErr)
        throw new Error(`projects update failed: ${updErr.message}`);
      logger.log("projects updated", { projectId: payload.projectId });
    }

    return {
      url: sandboxPublicUrl ?? payload.sourceValue,
      sandboxId: sandbox.sandboxId,
      builtAt: new Date().toISOString(),
      videoBytes: buf.length,
      videoUrl: publicUrl,
    };
  },
});
