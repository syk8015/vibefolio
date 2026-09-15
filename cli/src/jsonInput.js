import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// JSON 입력 한 곳 — publish·rerecord·drafts update가 같은 규칙으로 받는다(2026-09-15).
// 명령줄 인자 --json '<...>'은 셸이 먼저 읽는다: 소개글의 작은따옴표(it's)·줄바꿈·
// 윈도 셸의 한글에서 조용히 잘리거나 깨진다(외부 AI 업로드 피드백). 그래서 셋 중 하나로 받는다.
//   --file <path>    파일에서 — 가장 안전
//   --json -         표준입력에서(--file - 도 같다) — 파일을 못 쓰는 에이전트의 heredoc용
//   --json '<json>'  예전 방식 그대로
// 둘을 같이 주면 어느 쪽이 쓰였는지 알 수 없으니 거절한다.
// 돌려주는 값은 JSON 객체 하나, 아무것도 안 줬으면 null.
export async function readJsonObject(args) {
  const hasFile = args.file !== undefined;
  const hasJson = args.json !== undefined;
  if (hasFile && hasJson) {
    throw new Error("Pass the JSON one way — --file <path>, --json - (standard input) or --json '<json>', not both.");
  }
  if (!hasFile && !hasJson) return null;

  const value = hasFile ? args.file : args.json;
  if (value === true) {
    throw new Error(hasFile
      ? "--file needs a path (or - to read standard input)."
      : "--json needs a value — - to read standard input, or the JSON itself (safer: --file <path>).");
  }

  let raw;
  let label;
  if (value === "-") {
    label = "standard input";
    raw = await readStdin(hasFile ? "--file" : "--json");
  } else if (hasFile) {
    const path = resolve(value);
    label = `--file ${value}`;
    try {
      raw = readFileSync(path, "utf8");
    } catch (err) {
      throw new Error(err?.code === "ENOENT" ? `JSON file not found: ${path}` : `Could not read ${path}: ${err.message}`);
    }
  } else {
    label = "the --json value";
    raw = value;
  }

  // 윈도 메모장 등이 앞에 붙이는 BOM은 JSON.parse를 깨뜨린다.
  raw = raw.replace(/^﻿/, "");
  if (!raw.trim()) throw new Error(`${label} is empty — expected a JSON object.`);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // 파서 메시지(위치)를 그대로 싣는다 — AI가 어디를 고칠지 알 수 있게.
    throw new Error(`Could not parse ${label} as JSON: ${err.message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    const got = Array.isArray(parsed) ? "an array" : parsed === null ? "null" : typeof parsed;
    throw new Error(`${label} must be a JSON object ({ ... }), not ${got}.`);
  }
  return parsed;
}

async function readStdin(flag) {
  // 파이프가 없으면 사람이 칠 때까지 멈춘다 — 에이전트에겐 끝없는 대기라 바로 알려준다.
  if (process.stdin.isTTY) {
    throw new Error(`${flag} - reads JSON from standard input, but nothing is piped in — e.g. nookframe publish --json - < payload.json`);
  }
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}
