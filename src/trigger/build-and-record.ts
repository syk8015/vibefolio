import { task, logger } from "@trigger.dev/sdk";
import Sandbox from "e2b";

export type BuildPayload = {
  projectId: string;
  sourceType: "github" | "zip" | "live_url";
  sourceValue: string;
};

export type BuildResult = {
  url: string;
  sandboxId?: string;
  builtAt: string;
};

const SANDBOX_TIMEOUT_MS = 300_000;
const CLONE_TIMEOUT_MS = 120_000;
const INSTALL_TIMEOUT_MS = 600_000;
const READY_TIMEOUT_MS = 90_000;
const DEV_PORT = 3000;
const NODE_PATH_PREFIX = "export PATH=/opt/node/bin:$PATH && ";

export const buildAndRecord = task({
  id: "build-and-record",
  maxDuration: 1200,
  run: async (payload: BuildPayload): Promise<BuildResult> => {
    logger.log("Build job start", { payload });

    if (payload.sourceType === "live_url") {
      return {
        url: payload.sourceValue,
        builtAt: new Date().toISOString(),
      };
    }

    if (payload.sourceType !== "github") {
      throw new Error(
        `MVP only supports 'github' or 'live_url' sources (got '${payload.sourceType}')`,
      );
    }

    const sandbox = await Sandbox.create("vibefolio-builder", {
      timeoutMs: SANDBOX_TIMEOUT_MS,
    });
    logger.log("Sandbox created", { sandboxId: sandbox.sandboxId });

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

    const host = sandbox.getHost(DEV_PORT);
    const url = `https://${host}`;

    const deadline = Date.now() + READY_TIMEOUT_MS;
    let ready = false;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
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

    logger.log("Dev server reachable", { url });

    return {
      url,
      sandboxId: sandbox.sandboxId,
      builtAt: new Date().toISOString(),
    };
  },
});
