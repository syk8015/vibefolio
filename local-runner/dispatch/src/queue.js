// 잡 큐 — queue/<id>.json 파일 하나가 잡 하나.
// when.mode: now(즉시) | at(1회 예약) | every(매일 HH:MM 반복)
// every 잡은 실행 후에도 큐에 남고 next_at만 갱신된다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { dirs } from './paths.js';

const jobFile = (id) => path.join(dirs.queue, `${id}.json`);

export function newId(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `j_${stamp}_${crypto.randomBytes(2).toString('hex')}`;
}

// "HH:MM" 기준으로 now 이후의 가장 가까운 발생 시각
export function nextDaily(hhmm, now = new Date()) {
  const [h, m] = hhmm.split(':').map(Number);
  const t = new Date(now);
  t.setHours(h, m, 0, 0);
  if (t <= now) t.setDate(t.getDate() + 1);
  return t;
}

// 대상이 nookframe 하나로 고정돼 params.project는 없다(v3).
export function createJob({ type, prompt = '', model = null, when = { mode: 'now' } }, now = new Date()) {
  const job = {
    v: 3,
    id: newId(now),
    type,
    params: { prompt },
    when,
    model,
    status: 'pending',
    created_at: now.toISOString(),
  };
  if (when.mode === 'every') job.next_at = nextDaily(when.daily, now).toISOString();
  fs.writeFileSync(jobFile(job.id), JSON.stringify(job, null, 2));
  return job;
}

export function listJobs() {
  if (!fs.existsSync(dirs.queue)) return [];
  return fs
    .readdirSync(dirs.queue)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dirs.queue, f), 'utf8')))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function isDue(job, now = new Date()) {
  if (job.status !== 'pending') return false;
  if (job.not_before && now < new Date(job.not_before)) return false;
  const w = job.when || { mode: 'now' };
  if (w.mode === 'now') return true;
  if (w.mode === 'at') return now >= new Date(w.t);
  if (w.mode === 'every') return now >= new Date(job.next_at);
  return false;
}

export const dueJobs = (now = new Date()) => listJobs().filter((j) => isDue(j, now));

export function saveJob(job) {
  fs.writeFileSync(jobFile(job.id), JSON.stringify(job, null, 2));
}

export function markRunning(job) {
  job.status = 'running';
  job.pid = process.pid;
  job.started_at = new Date().toISOString();
  saveJob(job);
}

// 완료 처리. every 잡은 큐에 남기고 다음 회차로, 나머지는 done/failed로 이동.
export function finishJob(job, { ok, result = {} }, now = new Date()) {
  job.status = ok ? 'done' : 'failed';
  job.finished_at = now.toISOString();
  job.result = result;
  delete job.pid;
  if (job.when?.mode === 'every') {
    job.last_run = { at: job.finished_at, ok, ...result };
    job.next_at = nextDaily(job.when.daily, now).toISOString();
    job.status = 'pending';
    delete job.started_at;
    saveJob(job);
    return job;
  }
  const dest = path.join(ok ? dirs.done : dirs.failed, `${job.id}.json`);
  fs.writeFileSync(dest, JSON.stringify(job, null, 2));
  fs.rmSync(jobFile(job.id), { force: true });
  return job;
}

// 게이트 보류: not_before까지 재시도하지 않음
export function deferJob(job, notBefore, reason) {
  job.not_before = notBefore.toISOString();
  job.defer_reason = reason;
  saveJob(job);
}

// 데몬 시작 시 크래시 복구 — 죽은 pid의 running 잡을 pending으로 되돌림
export function recover() {
  let n = 0;
  for (const job of listJobs()) {
    if (job.status !== 'running') continue;
    let alive = false;
    try {
      process.kill(job.pid, 0);
      alive = true;
    } catch {
      /* 죽은 프로세스 */
    }
    if (!alive) {
      job.status = 'pending';
      delete job.pid;
      saveJob(job);
      n++;
    }
  }
  return n;
}
