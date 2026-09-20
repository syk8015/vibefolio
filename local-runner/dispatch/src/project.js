// 관제 대상 = nookframe 하나. 끝.
//
// 예전에는 `~/Dispatch/registry/<이름>.md` 카드를 읽는 다중 프로젝트 레지스트리가 있었고,
// 워커 권한도 카드마다 티어로 갈렸다. nookframe 편입(2026-09-20 결정)으로 대상이 하나가 되면서
// 경로가 고정됐고 — 고정되는 순간 레지스트리와 티어는 둘 다 설명할 게 없어져 사라졌다.
// (옛 카드 파일은 `~/Dispatch/registry/`에 그대로 남겨둔다. 읽지 않을 뿐 지우지 않았다.)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { REPO } from './paths.js';

// nookframe 세션의 기억 폴더. 워커가 "이미 하기로/안 하기로 한 것"을 대조하는 근거다.
// 근거: 09-20 growth 보고서가 이걸 안 봐서 22개 제안 중 9개가 이미 했거나 이미 기각된 것이었다.
export const MEMORY_DIR =
  process.env.DISPATCH_MEMORY_DIR ||
  path.join(os.homedir(), '.claude', 'projects', '-Users-Vive-Desktop-nookframe', 'memory');

export const PROJECT = {
  name: 'nookframe',
  local: process.env.DISPATCH_REPO || REPO,
  live: process.env.DISPATCH_LIVE || 'https://nookframe.com',
  repo: 'syk8015/vibefolio (main, Vercel) — 로컬 폴더는 nookframe, 원격 리포만 아직 vibefolio',
  memory: MEMORY_DIR,
  status: '라이브 운영·개선 중',
};

// 읽기 전용으로 열어주는 폴더들. 존재하는 것만 넘긴다(없는 경로를 --add-dir 하면 claude가 죽는다).
export function readableDirs(p = PROJECT) {
  return [p.local, p.memory].filter((d) => d && fs.existsSync(d));
}

// 워커 프롬프트 머리에 붙는 대상 설명
export function projectContext(p = PROJECT) {
  const lines = [
    `# 대상: ${p.name}`,
    `- 라이브: ${p.live}`,
    `- 리포: ${p.repo}`,
    `- 로컬 경로: ${p.local}`,
    `- 상태: ${p.status}`,
  ];
  if (fs.existsSync(p.memory)) {
    lines.push(
      `- 결정 기록: ${p.memory}`,
      '',
      '## 제안하기 전에 반드시',
      `\`${path.join(p.memory, 'decisions_ledger.md')}\`와 \`${path.join(p.memory, 'backlog.md')}\`를 먼저 읽어라.`,
      '거기 이미 있는 항목(이미 한 것·이미 기각한 것)은 제안하지 말 것. 재론하려면 "왜 뒤집어야 하는지"를 근거와 함께 적어라.',
    );
  }
  return lines.join('\n');
}
