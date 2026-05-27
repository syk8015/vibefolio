import { task, logger, retry } from "@trigger.dev/sdk";
import Sandbox from "e2b";
import { createClient } from "@supabase/supabase-js";
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
const RECORD_TIMEOUT_MS = 120_000;
const RECORD_DURATION_SEC = 15;
const DEV_PORT = 3000;
const NODE_PATH_PREFIX = "export PATH=/opt/node/bin:$PATH && ";
const RECORD_PREFIX =
  NODE_PATH_PREFIX +
  "export NODE_PATH=/usr/local/lib/node_modules && " +
  "export PLAYWRIGHT_BROWSERS_PATH=/opt/playwright && ";
const DEMO_BUCKET = "project-files";

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

    if (payload.sourceType !== "github" && payload.sourceType !== "live_url") {
      throw new Error(
        `MVP only supports 'github' or 'live_url' sources (got '${payload.sourceType}')`,
      );
    }

    const sandbox = await Sandbox.create("vibefolio-builder", {
      timeoutMs: SANDBOX_TIMEOUT_MS,
    });
    logger.log("Sandbox created", { sandboxId: sandbox.sandboxId });

    // github: 빌드 + 자체 dev server. live_url: 이미 호스팅된 URL 그대로 사용.
    let recordTarget: string;
    let sandboxPublicUrl: string | undefined;

    if (payload.sourceType === "github") {
      const repoUrl = payload.sourceValue;
      const repoPath = "/tmp/app";

      const clone = await sandbox.commands.run(
        `git clone --depth 1 ${repoUrl} ${repoPath}`,
        { timeoutMs: CLONE_TIMEOUT_MS },
      );
      logger.log("git clone done", { exitCode: clone.exitCode });

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

    const recordResult = await sandbox.commands.run(
      `${RECORD_PREFIX}mkdir -p /tmp/rec && node /tmp/record-helper.js ${recordTarget} /tmp/rec ${RECORD_DURATION_SEC}`,
      { timeoutMs: RECORD_TIMEOUT_MS },
    );
    logger.log("record done", {
      exitCode: recordResult.exitCode,
      stdout: recordResult.stdout,
    });

    // 녹화 시작점은 context 생성 직후라 페이지 로딩/networkidle 대기 구간이
    // 앞쪽에 들어감. 콘텐츠가 보이는 구간은 스크롤 루프(끝쪽). -sseof로
    // 끝에서 RECORD_DURATION_SEC 거꾸로 가서 마지막 부분만 잘라낸다.
    const fadeOutStart = (RECORD_DURATION_SEC - 0.5).toFixed(2);
    const ffmpegCmd =
      `cd /tmp/rec && ffmpeg -y -sseof -${RECORD_DURATION_SEC} -i demo.webm ` +
      `-vf "fade=t=in:st=0:d=0.5,fade=t=out:st=${fadeOutStart}:d=0.5" ` +
      `-c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -an ` +
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

    // 디버그: helper가 남긴 final.png도 같이 업로드해서 콘텐츠 비교 가능하게.
    try {
      const shotBytes = await sandbox.files.read("/tmp/rec/final.png", { format: "bytes" });
      const shotBuf = Buffer.from(shotBytes);
      const shotPath = isRealProject
        ? `${userId}/${payload.projectId}/final.png`
        : `_test/${payload.projectId}/final.png`;
      const { error: shotErr } = await supabase.storage
        .from(DEMO_BUCKET)
        .upload(shotPath, shotBuf, {
          contentType: "image/png",
          upsert: true,
        });
      if (!shotErr) {
        const { data: { publicUrl: shotUrl } } = supabase.storage
          .from(DEMO_BUCKET)
          .getPublicUrl(shotPath);
        logger.log("debug screenshot uploaded", { shotUrl, bytes: shotBuf.length });
      } else {
        logger.warn("debug screenshot upload failed", { msg: shotErr.message });
      }
    } catch (e) {
      logger.warn("debug screenshot read/upload skipped", { e: String(e) });
    }

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
