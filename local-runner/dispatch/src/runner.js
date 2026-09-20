// 잡 1건 실행: 워크스페이스 준비 → 권한 → claude -p (caffeinate로 수면 방지)
// → **산출물 전부** 수거 → outbox. 게이트/푸시는 호출자(daemon) 책임.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { dirs } from './paths.js';
import { WORKERS, workerSettings } from './workers.js';
import { readableDirs } from './project.js';

const p2 = (n) => String(n).padStart(2, '0');
const dateDir = (d = new Date()) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

const PRIMARY = 'REPORT.md';
const MAX_ARTIFACTS = 50; // 폭주 방지. 넘으면 앞에서부터 자르고 로그에 남긴다.

export function slugify(s) {
  return (
    String(s || '')
      .toLowerCase()
      .replace(/https?:\/\//g, '')
      .replace(/[^a-z0-9가-힣]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'job'
  );
}

// 워크스페이스에서 사람에게 전달할 파일 목록(워크스페이스 기준 상대경로).
// REPORT.md가 항상 맨 앞. 제외: `.claude/`(권한 파일) · JOB.md(우리가 넣은 프롬프트) · 숨김파일.
//
// 🐛 이게 2026-09-20에 물린 버그의 수리 지점이다. 예전 코드는 REPORT.md 하나만 꺼내서,
//    growth 잡이 같이 만든 BACKLOG.md가 runs/<id>/ 안에 갇혀 Vive에게 전달되지 않았다.
//    카드뉴스·영상 꾸러미는 애초에 산출물이 여러 개라, 이걸 안 고치면 통째로 못 받는다.
export function collectArtifacts(ws) {
  const out = [];
  const walk = (rel) => {
    const abs = path.join(ws, rel);
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name.startsWith('.')) continue; // .claude 포함
      const r = rel ? path.join(rel, e.name) : e.name;
      if (e.isDirectory()) walk(r);
      else if (e.isFile() && r !== 'JOB.md') out.push(r);
    }
  };
  walk('');
  return out.sort((a, b) => (a === PRIMARY ? -1 : b === PRIMARY ? 1 : a.localeCompare(b)));
}

// 상대경로 → outbox 파일명. REPORT.md는 예전 이름 그대로(기존 기록과 이어지게),
// 나머지는 같은 접두사에 `--<경로>`를 붙여 한 날짜 폴더 안에서 나란히 붙는다.
export function outboxName(rel, prefix) {
  if (rel === PRIMARY) return `${prefix}.md`;
  const ext = path.extname(rel);
  const base = rel.slice(0, rel.length - ext.length);
  return `${prefix}--${slugify(base)}${ext.toLowerCase()}`;
}

// 워크스페이스 생성 + 프롬프트/권한 준비 (spawn 없이 테스트 가능)
export function prepareWorkspace(job) {
  const worker = WORKERS[job.type];
  if (!worker) throw new Error(`알 수 없는 워커 타입: ${job.type}`);
  const ws = path.join(dirs.runs, job.id);
  fs.mkdirSync(path.join(ws, '.claude'), { recursive: true });
  const readDirs = readableDirs();
  const settings = workerSettings({ readDirs });
  // 참고용으로 남기지만, 헤드리스(-p)는 미신뢰 워크스페이스의 settings.json을 무시하므로
  // 실효 권한은 spawn 시 --allowedTools/--disallowedTools 플래그로 전달한다.
  fs.writeFileSync(path.join(ws, '.claude', 'settings.json'), JSON.stringify(settings, null, 2));
  const prompt = worker.build(job);
  fs.writeFileSync(path.join(ws, 'JOB.md'), `<!-- ${job.id} -->\n${prompt}\n`);
  return { ws, prompt, worker, settings, readDirs };
}

function spawnClaude({ cfg, ws, prompt, job, settings, readDirs, onLog }) {
  const args = [
    '-p',
    prompt,
    '--model',
    job.model || cfg.default_model,
    '--max-turns',
    String(cfg.max_turns),
    '--output-format',
    'json',
    '--allowedTools',
    settings.permissions.allow.join(','),
    '--disallowedTools',
    settings.permissions.deny.join(','),
  ];
  for (const d of readDirs) args.push('--add-dir', d);

  // caffeinate -im: 실행 동안 시스템/디스크 수면 방지
  const bin = cfg.claude_bin === 'claude' ? 'caffeinate' : cfg.claude_bin;
  const binArgs = cfg.claude_bin === 'claude' ? ['-im', 'claude', ...args] : args;

  return new Promise((resolve) => {
    // CLAUDEHELP_DRY=1: 전역 claudehelp 훅의 세션 푸시를 억제 — dispatch가 더 풍부한 푸시를 직접 보냄
    const child = spawn(bin, binArgs, { cwd: ws, env: { ...process.env, CLAUDEHELP_DRY: '1' } });
    let out = '';
    let err = '';
    const timeoutMin = cfg.timeouts_min[job.type] ?? 30;
    const killer = setTimeout(() => {
      onLog?.(`⏱ ${timeoutMin}분 타임아웃 — 종료`);
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 10_000).unref?.();
    }, timeoutMin * 60_000);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => {
      clearTimeout(killer);
      resolve({ code, out, err });
    });
    child.on('error', (e) => {
      clearTimeout(killer);
      resolve({ code: -1, out, err: String(e) });
    });
  });
}

// 워크스페이스의 산출물을 전부 outbox/<날짜>/로 복사한다. 반환: 복사된 절대경로 배열(REPORT가 [0]).
export function deliver(ws, job, { now = new Date(), onLog } = {}) {
  let rels = collectArtifacts(ws);
  if (rels.length > MAX_ARTIFACTS) {
    onLog?.(`⚠️ 산출물 ${rels.length}개 — 앞 ${MAX_ARTIFACTS}개만 전달`);
    rels = rels.slice(0, MAX_ARTIFACTS);
  }
  if (!rels.length) return [];
  const outDir = path.join(dirs.outbox, dateDir(now));
  fs.mkdirSync(outDir, { recursive: true });
  const prefix = `${job.type}-${slugify(job.params.prompt)}-${job.id.slice(-4)}`;
  const used = new Set();
  const copied = [];
  for (const rel of rels) {
    let name = outboxName(rel, prefix);
    if (used.has(name)) {
      // 서로 다른 경로가 같은 이름으로 접히는 경우(예: a/x.md와 a-x.md)
      const ext = path.extname(name);
      name = `${name.slice(0, name.length - ext.length)}-${used.size}${ext}`;
    }
    used.add(name);
    const dest = path.join(outDir, name);
    fs.copyFileSync(path.join(ws, rel), dest);
    copied.push(dest);
  }
  return copied;
}

export async function runJob(job, { cfg, onLog }) {
  const { ws, prompt, settings, readDirs } = prepareWorkspace(job);
  onLog?.(`▶ ${job.id} ${job.type} 시작`);
  const t0 = Date.now();
  const { code, out, err } = await spawnClaude({ cfg, ws, prompt, job, settings, readDirs, onLog });
  const minutes = Math.round((Date.now() - t0) / 6000) / 10;

  let meta = null;
  try {
    meta = JSON.parse(out);
  } catch {
    /* stream이 json이 아니어도 치명적이지 않음 */
  }

  const reportFile = path.join(ws, PRIMARY);
  const hasReport = fs.existsSync(reportFile);
  let summary = '';
  if (hasReport) {
    const report = fs.readFileSync(reportFile, 'utf8');
    const lines = report.split('\n').filter((l) => l.trim());
    summary = (lines[1] || lines[0] || '').replace(/^#+\s*/, '').slice(0, 120);
  }
  // 보고서가 없어도 남은 산출물은 걷어간다 — 있는 걸 버리는 쪽이 더 나쁘다.
  const outPaths = deliver(ws, job, { onLog });
  const outPath = hasReport ? outPaths[0] || null : null;

  const ok = code === 0 && hasReport;
  const isError = meta?.is_error === true || /rate.?limit/i.test(err);
  return {
    ok: ok && !isError,
    code,
    minutes,
    outPath,
    outPaths,
    summary: summary || (err ? err.slice(0, 120) : '보고서 없음'),
    num_turns: meta?.num_turns ?? null,
    session_id: meta?.session_id ?? null,
    stderr_tail: err.slice(-400) || null,
  };
}
