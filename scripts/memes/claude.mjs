// 매일 밈 밤 작업 — Claude를 부르는 한 곳(2026-11-05). 구독 로그인으로 `claude -p`를 띄운다.
//
// 매 호출이 따로 뜬 프로세스라 서로의 대화를 못 본다(반박 검사의 '백지' 조건).
// 잠금: --safe-mode(CLAUDE.md·훅·플러그인·MCP 끔) · --restricted(명령 실행 도구 없음, 설정 파일 무시)
//       · --strict-mcp-config · --tools로 쓸 도구만(웹 검색·읽기 또는 없음) · 허락 묻기는 자동 거절
//       · --system-prompt로 기본 프롬프트를 통째로 바꿈(가벼움) · 결과는 --json-schema로 모양 고정.
// ANTHROPIC_API_KEY는 지운다 — 있으면 구독이 아니라 API 크레딧으로 청구된다(공식 문서).
import { spawn } from "node:child_process";

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// launchd PATH엔 ~/.local/bin(공식 설치 위치)이 없다 → 있으면 그 경로를 바로 쓴다.
const LOCAL = join(homedir(), ".local/bin/claude");
const CLAUDE = process.env.NF_CLAUDE_BIN || (existsSync(LOCAL) ? LOCAL : "claude");

/**
 * @param {{ system:string, prompt:string, schema:object, tools?:string[], model?:string,
 *           effort?:string, timeoutMs?:number, cwd?:string }} o
 * @returns {Promise<{ ok:boolean, data?:any, costUsd?:number, error?:string, ms:number }>}
 */
export function runClaude({ system, prompt, schema, tools = [], model = "sonnet", effort = "medium", timeoutMs = 10 * 60_000, cwd }) {
  const args = [
    "-p", "--safe-mode", "--restricted", "--strict-mcp-config", "--no-session-persistence",
    "--permission-prompts", "none",
    "--tools", tools.join(","),
    ...(tools.length ? ["--allowedTools", tools.join(" ")] : []),
    "--model", model, "--effort", effort,
    "--system-prompt", system,
    "--output-format", "json",
    "--json-schema", JSON.stringify(schema),
  ];
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(CLAUDE, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, error: `spawn: ${e.message}`, ms: Date.now() - started });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const ms = Date.now() - started;
      try {
        const d = JSON.parse(out);
        if (d.is_error || d.subtype !== "success") {
          return resolve({ ok: false, error: `${d.subtype ?? "error"} ${d.api_error_status ?? ""}`.trim(), costUsd: d.total_cost_usd, ms });
        }
        const data = d.structured_output ?? JSON.parse(d.result);
        resolve({ ok: true, data, costUsd: d.total_cost_usd ?? 0, ms });
      } catch {
        resolve({ ok: false, error: `exit ${code}: ${(err || out).slice(0, 300)}`, ms });
      }
    });
    child.stdin.end(prompt);
  });
}

// 동시에 n개까지만(구독 사용량·맥 부담을 고르게).
export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k], k);
    }
  });
  await Promise.all(workers);
  return out;
}
