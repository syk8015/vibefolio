// Small shared helpers for the local recording worker.
// (Kept separate so browser/record/postprocess modules stay focused.)
import { spawn } from "node:child_process";

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type RunResult = { code: number | null; stdout: string; stderr: string };

// Spawn a command, capture stdout/stderr, resolve when it exits.
// We never pass user input through a shell here (args array, no shell),
// so there is no injection surface for these internal tool invocations.
export function run(
  cmd: string,
  args: string[],
  opts: { timeoutMs?: number } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    let timer: NodeJS.Timeout | undefined;
    if (opts.timeoutMs) {
      timer = setTimeout(() => {
        proc.kill("SIGKILL");
        reject(new Error(`${cmd} timed out after ${opts.timeoutMs}ms`));
      }, opts.timeoutMs);
    }
    proc.on("error", (e) => {
      if (timer) clearTimeout(timer);
      reject(e);
    });
    proc.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

// ffprobe a media file for a single numeric field (e.g. duration, width).
export async function ffprobeValue(
  file: string,
  entry: string,
): Promise<number> {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    entry,
    "-of",
    "default=nk=1:nw=1",
    file,
  ]);
  return parseFloat(stdout.trim()) || 0;
}
