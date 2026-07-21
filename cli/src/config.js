import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

// 토큰·origin 저장소. 우선순위: 환경변수 > ~/.nookframe/config.json > 기본값.
// AI 에이전트가 비대화형으로 실행하므로 NOOKFRAME_TOKEN 환경변수를 주 경로로 본다.

const CONFIG_DIR = join(homedir(), ".nookframe");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

function read() {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    return {};
  }
}

export function getToken() {
  return process.env.NOOKFRAME_TOKEN || read().token || null;
}

export function getOrigin() {
  // 로컬 개발/테스트에서 NOOKFRAME_ORIGIN=http://localhost:3000 으로 덮어쓸 수 있다.
  return (process.env.NOOKFRAME_ORIGIN || read().origin || "https://nookframe.com").replace(/\/$/, "");
}

export function saveToken(token) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const cfg = read();
  cfg.token = token;
  // 토큰은 개인 자격증명이라 파일 권한을 소유자 전용(0600)으로.
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}
