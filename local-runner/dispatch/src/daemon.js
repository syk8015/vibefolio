// 데몬 루프 — 직렬 실행(동시 1), 잡마다: 게이트 → 실행 → 기록 → 푸시.
// `once: true`면 현재 due 잡들만 처리하고 종료(dispatch run).
import fs from 'node:fs';
import path from 'node:path';
import { dirs, ensureDirs } from './paths.js';
import { loadConfig } from './config.js';
import { dueJobs, markRunning, finishJob, deferJob, recover, saveJob } from './queue.js';
import { fetchUsage, checkGate, usageSnapshot } from './gate.js';
import { runJob } from './runner.js';
import { sendPush } from './push.js';

const log = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(path.join(dirs.logs, 'daemon.log'), line + '\n');
  } catch {
    /* logs 미생성 시 무시 */
  }
};

const jsonl = (obj) => {
  try {
    fs.appendFileSync(path.join(dirs.logs, 'jobs.jsonl'), JSON.stringify(obj) + '\n');
  } catch {
    /* 무시 */
  }
};

const TYPE_EMOJI = {
  research: '🔍',
  'site-monitor': '🌐',
  'code-review': '👓',
};

async function processOne(job, cfg) {
  // 게이트
  let before = null;
  if (process.env.DISPATCH_NO_GATE !== '1') {
    let usage;
    try {
      usage = await fetchUsage();
    } catch (e) {
      log(`✗ 게이트 조회 실패(${e.message}) — 30분 뒤 재시도`);
      deferJob(job, new Date(Date.now() + 30 * 60_000), `gate-error: ${e.message}`);
      return;
    }
    before = usageSnapshot(usage);
    const verdict = checkGate(job, usage, cfg.gate);
    if (!verdict.ok) {
      const retry = verdict.retry_at || new Date(Date.now() + 60 * 60_000);
      log(`⏸ ${job.id} 게이트 보류: ${verdict.reason} → ${retry.toISOString()}`);
      deferJob(job, retry, verdict.reason);
      if (!job.gate_notified) {
        job.gate_notified = true;
        saveJob(job); // 플래그 영속화 — 보류 반복 시 푸시 재발송 방지
        await sendPush({
          title: `⏸ 지령 보류 — ${job.type}`,
          body: `${verdict.reason}. 한도 회복 후 자동 재개.`,
          tag: `dispatch-${job.id}`,
        });
      }
      return;
    }
  }

  markRunning(job);
  const result = await runJob(job, { cfg, onLog: log });

  let after = null;
  if (process.env.DISPATCH_NO_GATE !== '1') {
    try {
      after = usageSnapshot(await fetchUsage());
    } catch {
      /* 스냅샷은 최선 노력 */
    }
  }

  finishJob(job, {
    ok: result.ok,
    result: { outPath: result.outPath, outPaths: result.outPaths, minutes: result.minutes },
  });
  jsonl({
    id: job.id,
    type: job.type,
    model: job.model,
    ok: result.ok,
    minutes: result.minutes,
    num_turns: result.num_turns,
    out: result.outPath,
    outs: result.outPaths,
    usage_before: before,
    usage_after: after,
    at: new Date().toISOString(),
    stderr_tail: result.ok ? null : result.stderr_tail,
  });
  log(
    `${result.ok ? '✔' : '✗'} ${job.id} (${result.minutes}분) 산출물 ${result.outPaths.length}개 ` +
      `${result.outPath ? path.relative(dirs.data, result.outPath) : result.summary}`,
  );

  const emoji = TYPE_EMOJI[job.type] || '🤖';
  // 산출물이 여러 개면 개수까지 알린다 — 꾸러미가 왔는데 한 장만 온 줄 알면 안 본다.
  const extra = (result.outPaths?.length || 0) - 1;
  const where = result.outPaths?.length
    ? `\n→ ${path.relative(dirs.data, result.outPaths[0])}${extra > 0 ? ` (+ 파일 ${extra}개)` : ''}`
    : '';
  await sendPush({
    title: `${emoji} ${result.ok ? '완료' : '실패'} — ${job.type}`,
    body: result.summary + where,
    tag: `dispatch-${job.id}`,
  });
}

export async function tick(cfg) {
  const due = dueJobs();
  for (const job of due) {
    await processOne(job, cfg); // 직렬
  }
  return due.length;
}

export async function daemon({ once = false } = {}) {
  ensureDirs();
  const cfg = loadConfig();
  const recovered = recover();
  if (recovered) log(`크래시 복구: running→pending ${recovered}건`);
  log(`dispatchd 시작 (poll ${cfg.poll_seconds}s, 기본모델 ${cfg.default_model}${once ? ', 1회 실행' : ''})`);

  if (once) {
    const n = await tick(cfg);
    log(`처리 ${n}건 — 종료`);
    return;
  }
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await tick(loadConfig()); // 매 틱마다 config 리로드(수정 즉시 반영)
    } catch (e) {
      log(`tick 오류: ${e.stack || e}`);
    } finally {
      running = false;
    }
  }, cfg.poll_seconds * 1000);
}
