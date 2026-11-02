// Small shared helpers for the local recording worker.
// (Kept separate so browser/record/postprocess modules stay focused.)
import { spawn } from "node:child_process";

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// 자식 프로세스(촬영 Chrome·ffmpeg·shortcuts…)에 넘기는 환경변수 — 허락한 것만(2026-11-02, audit-8 B2).
// 워커 프로세스엔 ANTHROPIC·E2B·WORKER_SECRET 같은 열쇠가 있다. 예전엔 process.env를 통째로 넘겨서
// 남의 페이지를 그리는 Chrome의 메모리에도 열쇠가 들어 있었다 — 렌더러 버그 하나면 그대로 새어 나간다.
// 이 프로그램들은 열쇠가 필요 없다. 새 자식 프로세스가 무언가 더 필요하면 extra로 그 값만 준다.
const CHILD_ENV_KEYS = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "TERM", "__CF_USER_TEXT_ENCODING"];
export function childEnv(extra: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of CHILD_ENV_KEYS) {
    const v = process.env[k];
    if (v !== undefined) out[k] = v;
  }
  return { ...out, ...extra };
}

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
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], env: childEnv() });
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
