// 경로 규약.
//  · DATA(~/Dispatch)  = 사람이 보는 곳(큐·실행폴더·outbox·로그). 홈 기준이라 코드가 어디로
//    옮겨져도 안 깨지고, cluadehelp 시절 쌓인 기록이 그대로 이어진다.
//  · 시크릿 폴더는 없다 — 예전 `~/.dispatch/`(0700 평문)를 버리고 맥 키체인으로 옮겼다.
//    (2026-09-20 합의: 시크릿은 nookframe 키체인 = `scripts/_keychain.mjs`)
//  · REPO = nookframe 레포 루트. 이 파일 위치에서 계산하므로 레포를 옮겨도 따라온다.
// 테스트는 DISPATCH_HOME으로 전부 격리한다.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const DATA = process.env.DISPATCH_HOME || path.join(os.homedir(), 'Dispatch');
export const CLAUDEHELP = process.env.CLAUDEHELP_HOME || path.join(os.homedir(), '.claudehelp');

// src/ → dispatch/ → local-runner/ → <repo>
export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const DISPATCH_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const dirs = {
  data: DATA,
  queue: path.join(DATA, 'queue'),
  runs: path.join(DATA, 'runs'),
  outbox: path.join(DATA, 'outbox'),
  done: path.join(DATA, 'done'),
  failed: path.join(DATA, 'failed'),
  logs: path.join(DATA, 'logs'),
};

export function ensureDirs() {
  for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });
}

export const expandTilde = (p) => (p && p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);
