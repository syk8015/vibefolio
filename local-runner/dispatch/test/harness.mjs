// dispatch 하니스 — 네트워크·실제 claude 없이 코어 로직을 검증한다.
// DISPATCH_HOME을 임시 폴더로 격리하고, 실행기는 fake-claude.sh로 대체.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-test-'));
process.env.DISPATCH_HOME = path.join(TMP, 'Dispatch');
process.env.CLAUDEHELP_HOME = path.join(TMP, '.claudehelp'); // 푸시 파일 없음 → 조용히 스킵
process.env.DISPATCH_MEMORY_DIR = path.join(TMP, 'memory'); // 진짜 기억 폴더를 건드리지 않는다

const { ensureDirs, dirs, expandTilde, REPO } = await import('../src/paths.js');
const { loadConfig, DEFAULTS } = await import('../src/config.js');
const { PROJECT, projectContext, readableDirs } = await import('../src/project.js');
const q = await import('../src/queue.js');
const { extractLimits, checkGate, scopedFor, usageSnapshot, daysUntilReset, estWeeklyCost, inRunWindow, windowApplies, nextWindowStart } = await import('../src/gate.js');
const { WORKERS, workerSettings } = await import('../src/workers.js');
const { prepareWorkspace, runJob, slugify, collectArtifacts, outboxName, deliver } = await import('../src/runner.js');
const { sendPush } = await import('../src/push.js');

const FAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fake-claude.sh');

before(() => {
  ensureDirs();
  fs.mkdirSync(process.env.DISPATCH_MEMORY_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.DISPATCH_MEMORY_DIR, 'decisions_ledger.md'), '# 결정 기록\n');
  fs.chmodSync(FAKE, 0o755);
});
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

// ---------- paths / config ----------

test('paths: DISPATCH_HOME 격리 및 디렉토리 생성', () => {
  assert.ok(dirs.data.startsWith(TMP));
  for (const d of Object.values(dirs)) assert.ok(fs.existsSync(d), d);
});

test('paths: 시크릿 폴더가 더는 없다 — 키체인으로 옮겼다', async () => {
  const mod = await import('../src/paths.js');
  assert.equal(mod.SECRETS, undefined);
  assert.ok(!Object.keys(dirs).includes('registry')); // 레지스트리도 함께 사라졌다
});

test('paths: REPO는 nookframe 레포 루트 — package.json이 있어야 한다', () => {
  assert.ok(fs.existsSync(path.join(REPO, 'package.json')), REPO);
  assert.ok(fs.existsSync(path.join(REPO, 'local-runner')), REPO);
});

test('expandTilde: ~ 확장', () => {
  assert.equal(expandTilde('~/Desktop/x'), path.join(os.homedir(), 'Desktop/x'));
  assert.equal(expandTilde('/abs/path'), '/abs/path');
});

test('config: 기본값 + 사용자 오버라이드 딥머지', () => {
  fs.writeFileSync(path.join(dirs.data, 'config.json'), JSON.stringify({ gate: { weekly_min_pct: 40 }, default_model: 'sonnet' }));
  const cfg = loadConfig();
  assert.equal(cfg.default_model, 'sonnet');
  assert.equal(cfg.gate.weekly_min_pct, 40);
  assert.equal(cfg.gate.session_min_pct, DEFAULTS.gate.session_min_pct); // 나머지는 기본값 유지
  fs.rmSync(path.join(dirs.data, 'config.json'));
});

// ---------- project (레지스트리 대체) ----------

test('project: 대상은 nookframe 하나로 고정 — 레지스트리 모듈은 없다', async () => {
  assert.equal(PROJECT.name, 'nookframe');
  assert.equal(PROJECT.local, REPO);
  await assert.rejects(() => import('../src/registry.js'), /Cannot find module|ERR_MODULE_NOT_FOUND/);
});

test('project: readableDirs는 존재하는 폴더만 — 없는 경로를 열지 않는다', () => {
  const dirsOut = readableDirs();
  assert.ok(dirsOut.includes(REPO));
  assert.ok(dirsOut.includes(process.env.DISPATCH_MEMORY_DIR));
  assert.equal(readableDirs({ local: '/nope/1', memory: '/nope/2' }).length, 0);
});

test('project: 프롬프트 문맥에 결정 기록 대조 지시가 들어간다', () => {
  const ctx = projectContext();
  assert.ok(ctx.includes('nookframe.com'));
  assert.ok(ctx.includes('decisions_ledger.md'));
  assert.ok(ctx.includes('제안하지 말 것'));
});

// ---------- queue ----------

test('queue: now 잡은 즉시 due', () => {
  const j = q.createJob({ type: 'research', prompt: 't1' });
  assert.ok(q.isDue(j));
  q.finishJob(j, { ok: true });
});

test('queue: v3 잡에는 project 칸이 없다', () => {
  const j = q.createJob({ type: 'research', prompt: 't0' });
  assert.equal(j.v, 3);
  assert.deepEqual(Object.keys(j.params), ['prompt']);
  q.finishJob(j, { ok: true });
});

test('queue: at 잡은 시각 전 false, 후 true', () => {
  const j = q.createJob({ type: 'research', prompt: 't2', when: { mode: 'at', t: '2030-01-01T02:00:00+09:00' } });
  assert.equal(q.isDue(j, new Date('2030-01-01T01:59:00+09:00')), false);
  assert.equal(q.isDue(j, new Date('2030-01-01T02:00:01+09:00')), true);
  q.finishJob(j, { ok: true });
});

test('queue: nextDaily — 오늘 미래면 오늘, 지났으면 내일', () => {
  const now = new Date('2026-07-14T10:00:00');
  assert.equal(q.nextDaily('11:30', now).getDate(), 14);
  assert.equal(q.nextDaily('09:00', now).getDate(), 15);
});

test('queue: every 잡은 실행 후 큐에 남고 next_at 갱신', () => {
  const now = new Date('2026-07-14T08:00:00');
  const j = q.createJob({ type: 'site-monitor', when: { mode: 'every', daily: '09:00' } }, now);
  assert.equal(q.isDue(j, new Date('2026-07-14T08:30:00')), false);
  assert.equal(q.isDue(j, new Date('2026-07-14T09:00:30')), true);
  const done = q.finishJob(j, { ok: true }, new Date('2026-07-14T09:05:00'));
  assert.equal(done.status, 'pending'); // 큐에 남음
  assert.equal(new Date(done.next_at).getDate(), 15); // 내일로
  assert.equal(done.last_run.ok, true);
  fs.rmSync(path.join(dirs.queue, `${j.id}.json`), { force: true });
});

test('queue: defer는 not_before 전까지 due 아님 + 사유 기록', () => {
  const j = q.createJob({ type: 'research', prompt: 't3' });
  q.deferJob(j, new Date(Date.now() + 60_000), '주간 잔여 부족');
  const listed = q.listJobs().find((x) => x.id === j.id);
  assert.equal(q.isDue(listed), false);
  assert.equal(listed.defer_reason, '주간 잔여 부족');
  assert.equal(q.isDue(listed, new Date(Date.now() + 120_000)), true);
  q.finishJob(listed, { ok: true });
});

test('queue: recover — 죽은 pid의 running을 pending으로', () => {
  const j = q.createJob({ type: 'research', prompt: 't4' });
  j.status = 'running';
  j.pid = 999999; // 존재하지 않는 pid
  q.saveJob(j);
  assert.equal(q.recover(), 1);
  assert.equal(q.listJobs().find((x) => x.id === j.id).status, 'pending');
  q.finishJob(q.listJobs().find((x) => x.id === j.id), { ok: true });
});

test('queue: 실패 잡은 failed/로 이동', () => {
  const j = q.createJob({ type: 'research', prompt: 't5' });
  q.finishJob(j, { ok: false, result: { error: 'x' } });
  assert.ok(fs.existsSync(path.join(dirs.failed, `${j.id}.json`)));
  assert.ok(!fs.existsSync(path.join(dirs.queue, `${j.id}.json`)));
});

// ---------- gate ----------

const NEW_USAGE = {
  limits: [
    { kind: 'session', percent: 42, resets_at: '2026-07-15T03:15:00Z' },
    { kind: 'weekly_all', percent: 55, resets_at: '2026-07-17T00:00:00Z' },
    { kind: 'weekly_scoped', percent: 80, resets_at: '2026-07-17T00:00:00Z', scope: { model: { display_name: 'Fable' } } },
  ],
};
const OLD_USAGE = {
  five_hour: { utilization: 91.2, resets_at: '2026-07-15T03:15:00Z' },
  seven_day: { utilization: 10, resets_at: '2026-07-17T00:00:00Z' },
};
const GATE = DEFAULTS.gate;
// 실행 시간대는 이제 기본 비활성(편입 결정). 그 기계 자체를 검증할 때만 켜서 쓴다.
const GATE_WIN = { ...GATE, run_window: { ...GATE.run_window, applies_to: ['every'] } };

test('gate: 신형 limits 파싱', () => {
  const { session, weekly, scoped } = extractLimits(NEW_USAGE);
  assert.equal(session.percent, 42);
  assert.equal(weekly.percent, 55);
  assert.equal(scoped.length, 1);
});

test('gate: 구형 five_hour/seven_day 폴백', () => {
  const { session, weekly } = extractLimits(OLD_USAGE);
  assert.equal(session.percent, 91);
  assert.equal(weekly.percent, 10);
});

test('gate: 통과 케이스', () => {
  assert.equal(checkGate({ model: 'opus' }, NEW_USAGE, GATE).ok, true);
});

test('gate: 주간 잔여 부족 → 보류 + retry_at=주간 리셋', () => {
  const usage = { limits: [{ kind: 'weekly_all', percent: 75, resets_at: '2026-07-17T00:00:00Z' }] };
  const v = checkGate({ model: 'opus' }, usage, GATE);
  assert.equal(v.ok, false);
  assert.ok(v.reason.includes('주간'));
  assert.equal(v.retry_at.toISOString(), '2026-07-17T00:00:00.000Z');
});

test('gate: 5시간 잔여 부족 → 리셋까지 대기 (구형 응답으로)', () => {
  const v = checkGate({ model: 'opus' }, OLD_USAGE, GATE);
  assert.equal(v.ok, false);
  assert.ok(v.reason.includes('5시간'));
});

test('gate: 모델별 한도 — fable 잡만 막히고 opus 잡은 통과', () => {
  const vFable = checkGate({ model: 'fable' }, NEW_USAGE, GATE); // Fable 잔여 20% < 50%
  assert.equal(vFable.ok, false);
  assert.ok(vFable.reason.includes('Fable'));
  assert.equal(checkGate({ model: 'opus' }, NEW_USAGE, GATE).ok, true);
});

test('gate: scopedFor 느슨 매칭', () => {
  const { scoped } = extractLimits(NEW_USAGE);
  assert.ok(scopedFor(scoped, 'fable'));
  assert.equal(scopedFor(scoped, 'opus'), null);
  assert.equal(scopedFor(scoped, null), null);
});

test('gate: usageSnapshot 로그 형태', () => {
  const snap = usageSnapshot(NEW_USAGE);
  assert.equal(snap.session.percent, 42);
  assert.equal(snap.scoped[0].name, 'Fable');
});

// ---------- gate: 실행 시간대 + 하루 예산 ----------
// 근거: memory/reference-claude-usage-pattern.md — Vive는 20~01시 피크, 유휴는 04~10시

const NOW = new Date(2026, 8, 18, 4, 30, 0, 0); // 2026-09-18 04:30 로컬
const at = (h, m = 0) => new Date(2026, 8, 18, h, m, 0, 0);
const resetIn = (days, from = NOW) => new Date(from.getTime() + days * 86_400_000).toISOString();

const usageOf = ({ weeklyPct = 20, sessionPct = 20, days = 4 }) => ({
  limits: [
    { kind: 'session', percent: sessionPct, resets_at: resetIn(0.1) },
    { kind: 'weekly_all', percent: weeklyPct, resets_at: resetIn(days) },
  ],
});

test('gate: 실행 시간대는 기본 꺼져 있다 — 편입 후엔 큐가 실행 시점을 정한다', () => {
  assert.deepEqual(GATE.run_window.applies_to, []);
  const job = { model: 'opus', type: 'research', when: { mode: 'every', daily: '02:00' } };
  assert.equal(checkGate(job, usageOf({}), GATE, at(2)).ok, true); // 새벽 2시여도 안 막힌다
});

test('gate: 켜두면 반복 잡은 창(04~06시) 밖에서 보류 — 기계는 그대로 살아 있다', () => {
  const job = { model: 'opus', type: 'research', when: { mode: 'every', daily: '02:00' } };
  const v = checkGate(job, usageOf({}), GATE_WIN, at(2));
  assert.equal(v.ok, false);
  assert.ok(v.reason.includes('실행 시간대'), v.reason);
  assert.equal(v.retry_at.getHours(), 4); // 다음 창 시작으로 미룸
});

test('gate: 창 경계 — 06:00은 밖(창이 낮 피크까지 물림), 05:59는 안', () => {
  const job = { model: 'opus', type: 'research', when: { mode: 'every' } };
  assert.equal(checkGate(job, usageOf({}), GATE_WIN, at(6, 0)).ok, false);
  assert.equal(checkGate(job, usageOf({}), GATE_WIN, at(5, 59)).ok, true);
});

test('gate: now/at 잡은 시간대 무시 — 사용자가 직접 넣은 건 의도대로', () => {
  for (const mode of ['now', 'at']) {
    const job = { model: 'opus', type: 'research', when: { mode } };
    assert.equal(checkGate(job, usageOf({}), GATE_WIN, at(21)).ok, true, mode);
  }
});

test('gate: 하루 예산 — 같은 잔여율인데 리셋까지 남은 날에 따라 갈린다', () => {
  // 단일 임계값으로는 표현할 수 없는 판정. 이게 이 게이트의 존재 이유.
  const cfg = { ...GATE, est_requests: { ...GATE.est_requests, growth: 400 } }; // 400요청 ≈ 5.92%p
  const job = { model: 'opus', type: 'growth', when: { mode: 'every' } };

  // 잔여 35%, 리셋 7일 남음 → 하루 5%p, 허용 2.5%p → 5.92%p는 과소비
  const far = checkGate(job, usageOf({ weeklyPct: 65, days: 7 }), cfg, NOW);
  assert.equal(far.ok, false);
  assert.ok(far.reason.includes('하루 예산'), far.reason);

  // 잔여 35%로 같지만 리셋 1일 남음 → 하루 35%p, 허용 17.5%p → 통과
  assert.equal(checkGate(job, usageOf({ weeklyPct: 65, days: 1 }), cfg, NOW).ok, true);
});

test('gate: 주간 하드 백스톱이 예산보다 먼저 — 잔여 30% 미만이면 무조건 보류', () => {
  const job = { model: 'opus', type: 'site-monitor', when: { mode: 'every' } };
  const v = checkGate(job, usageOf({ weeklyPct: 75, days: 1 }), GATE, NOW);
  assert.equal(v.ok, false);
  assert.ok(v.reason.includes('주간 잔여'), v.reason);
});

test('gate: 5h 하한 25% — 잔여 20%면 막힌다 (옛 10%로는 안 막혔다)', () => {
  const job = { model: 'opus', type: 'site-monitor', when: { mode: 'every' } };
  const v = checkGate(job, usageOf({ sessionPct: 80 }), GATE, NOW);
  assert.equal(v.ok, false);
  assert.ok(v.reason.includes('5시간'), v.reason);
});

test('gate: daysUntilReset — 과거·불명은 1일로 보수 처리', () => {
  assert.equal(daysUntilReset(resetIn(3), NOW), 3);
  assert.equal(daysUntilReset(resetIn(-5), NOW), 1); // 지난 날짜여도 0으로 나누지 않는다
  assert.equal(daysUntilReset(null, NOW), null);
});

test('gate: estWeeklyCost — 표에 없는 타입은 default', () => {
  // 표의 숫자는 실측으로 교정되는 값이라(2026-09-20 1차 교정) 하드코딩하지 않고 표에서 읽는다.
  const { est_requests: EST, request_weekly_pct: PCT } = GATE;
  assert.ok(Math.abs(estWeeklyCost({ type: 'site-monitor' }, GATE) - EST['site-monitor'] * PCT) < 1e-9);
  assert.ok(Math.abs(estWeeklyCost({ type: '없는타입' }, GATE) - EST.default * PCT) < 1e-9);
});

test('gate: inRunWindow 자정 넘김 지원', () => {
  const overnight = { start: '22:00', end: '03:00' };
  assert.equal(inRunWindow(at(23), overnight), true);
  assert.equal(inRunWindow(at(1), overnight), true);
  assert.equal(inRunWindow(at(12), overnight), false);
});

test('gate: windowApplies — applies_to에 없는 모드는 적용 안 함', () => {
  const win = GATE_WIN.run_window;
  assert.equal(windowApplies({ when: { mode: 'every' } }, win), true);
  assert.equal(windowApplies({ when: { mode: 'now' } }, win), false);
  assert.equal(windowApplies({}, win), false);
  assert.equal(windowApplies({ when: { mode: 'every' } }, null), false);
  assert.equal(windowApplies({ when: { mode: 'every' } }, GATE.run_window), false); // 기본은 꺼짐
});

test('gate: nextWindowStart — 창 지났으면 내일 같은 시각', () => {
  const win = GATE.run_window;
  assert.equal(nextWindowStart(at(2), win).getDate(), 18); // 오늘 04:00
  assert.equal(nextWindowStart(at(9), win).getDate(), 19); // 내일 04:00
});

// ---------- workers ----------

test('workers: research 프롬프트에 대상 문맥+주제+산출물 규약 포함', () => {
  const p = WORKERS.research.build({ params: { prompt: 'RAG 비교' } });
  assert.ok(p.includes('RAG 비교') && p.includes('nookframe.com') && p.includes('REPORT.md'));
});

test('workers: 산출물 규약이 "여러 개도 된다"를 명시한다', () => {
  const p = WORKERS.research.build({ params: { prompt: 'x' } });
  assert.ok(p.includes('파일로 더 만들어라'), '여러 산출물 안내가 빠졌다');
  assert.ok(p.includes('outbox'));
});

test('workers: site-monitor는 조용히 깨지는 표면 3개를 프롬프트에 박는다', () => {
  const p = WORKERS['site-monitor'].build({ params: { prompt: '' } });
  assert.ok(p.includes('client_id_metadata_document_supported'));
  assert.ok(p.includes('WWW-Authenticate'));
  assert.ok(p.includes('정상 — '));
});

test('workers: 티어가 사라졌다 — 프로필에 tier 칸이 없다', () => {
  for (const [name, w] of Object.entries(WORKERS)) assert.equal(w.tier, undefined, name);
});

test('workers: 권한 — 웹 허용, Bash 거부, 쓰기는 워크스페이스만', () => {
  const s = workerSettings({ readDirs: [] });
  assert.ok(s.permissions.allow.includes('WebSearch'));
  assert.ok(s.permissions.allow.includes('Write(./**)'));
  assert.ok(s.permissions.deny.includes('Bash'));
  assert.ok(!s.permissions.allow.some((r) => r.startsWith('Read(//')));
});

test('workers: 읽기 폴더는 절대경로 Read 규칙으로 붙는다', () => {
  const s = workerSettings({ readDirs: ['/Users/Vive/Desktop/nookframe', '/tmp/mem'] });
  assert.ok(s.permissions.allow.includes('Read(//Users/Vive/Desktop/nookframe/**)'));
  assert.ok(s.permissions.allow.includes('Read(//tmp/mem/**)'));
});

// ---------- runner: 산출물 수거 (2026-09-20 버그 수리) ----------

test('runner: collectArtifacts — REPORT.md가 맨 앞, JOB.md와 .claude는 제외', () => {
  const ws = fs.mkdtempSync(path.join(TMP, 'ws-'));
  fs.mkdirSync(path.join(ws, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(ws, '.claude', 'settings.json'), '{}');
  fs.writeFileSync(path.join(ws, 'JOB.md'), 'prompt');
  fs.writeFileSync(path.join(ws, 'BACKLOG.md'), 'b');
  fs.writeFileSync(path.join(ws, 'REPORT.md'), 'r');
  fs.mkdirSync(path.join(ws, 'cards'));
  fs.writeFileSync(path.join(ws, 'cards', '01.html'), 'c');
  assert.deepEqual(collectArtifacts(ws), ['REPORT.md', 'BACKLOG.md', path.join('cards', '01.html')]);
});

test('runner: outboxName — REPORT는 옛 이름 그대로, 나머지는 접두사+경로', () => {
  assert.equal(outboxName('REPORT.md', 'research-x-ab12'), 'research-x-ab12.md');
  assert.equal(outboxName('BACKLOG.md', 'research-x-ab12'), 'research-x-ab12--backlog.md');
  assert.equal(outboxName('cards/01.HTML', 'promo-y-cd34'), 'promo-y-cd34--cards-01.html');
});

test('runner: deliver — 이름이 겹쳐도 덮어쓰지 않는다', () => {
  const ws = fs.mkdtempSync(path.join(TMP, 'ws2-'));
  fs.writeFileSync(path.join(ws, 'a-b.md'), '1');
  fs.mkdirSync(path.join(ws, 'a'));
  fs.writeFileSync(path.join(ws, 'a', 'b.md'), '2'); // 둘 다 "--a-b.md"로 접힌다
  const out = deliver(ws, { id: 'j_x_zz99', type: 'research', params: { prompt: 'dup' } });
  assert.equal(out.length, 2);
  assert.equal(new Set(out).size, 2);
  for (const f of out) assert.ok(fs.existsSync(f));
});

test('runner: 산출물 없으면 빈 배열 — outbox에 빈 폴더를 만들지 않는다', () => {
  const ws = fs.mkdtempSync(path.join(TMP, 'ws3-'));
  fs.writeFileSync(path.join(ws, 'JOB.md'), 'only prompt');
  assert.deepEqual(deliver(ws, { id: 'j_x_yy88', type: 'research', params: { prompt: 'none' } }), []);
});

// ---------- runner (fake claude) ----------

const FAKE_CFG = { ...DEFAULTS, claude_bin: FAKE, timeouts_min: { research: 1, 'site-monitor': 1, 'code-review': 1 } };

test('runner: prepareWorkspace — settings/JOB.md 생성', () => {
  const j = q.createJob({ type: 'research', prompt: '준비 테스트' });
  const { ws } = prepareWorkspace(j);
  assert.ok(fs.existsSync(path.join(ws, '.claude', 'settings.json')));
  assert.ok(fs.readFileSync(path.join(ws, 'JOB.md'), 'utf8').includes('준비 테스트'));
  q.finishJob(j, { ok: true });
});

test('runner: fake claude 성공 — REPORT.md → outbox, 요약은 둘째 줄', async () => {
  const j = q.createJob({ type: 'research', prompt: 'e2e 성공 케이스' });
  const r = await runJob(j, { cfg: FAKE_CFG });
  assert.equal(r.ok, true);
  assert.ok(r.outPath && fs.existsSync(r.outPath));
  assert.equal(r.outPaths.length, 1);
  assert.ok(r.summary.includes('정상 — 가짜 claude'));
  assert.equal(r.num_turns, 3);
  q.finishJob(j, { ok: r.ok });
});

test('runner: 🐛수리 — 산출물 2개면 둘 다 outbox로 나간다 (예전엔 REPORT만)', async () => {
  process.env.FAKE_MODE = 'multi';
  const j = q.createJob({ type: 'research', prompt: '꾸러미 케이스' });
  const r = await runJob(j, { cfg: FAKE_CFG });
  delete process.env.FAKE_MODE;
  assert.equal(r.ok, true);
  assert.equal(r.outPaths.length, 2, '2개가 다 나와야 한다');
  const names = r.outPaths.map((p) => path.basename(p));
  assert.ok(names.some((n) => n.endsWith('--backlog.md')), names.join(','));
  assert.equal(path.basename(r.outPath), names[0]); // REPORT가 대표
  for (const f of r.outPaths) assert.ok(fs.existsSync(f), f);
  // 워크스페이스 원본은 남는다(복사지 이동이 아니다)
  assert.ok(fs.existsSync(path.join(dirs.runs, j.id, 'BACKLOG.md')));
  q.finishJob(j, { ok: r.ok });
});

test('runner: fake claude 실패 — ok=false, 보고서 없음', async () => {
  process.env.FAKE_MODE = 'fail';
  const j = q.createJob({ type: 'research', prompt: 'e2e 실패 케이스' });
  const r = await runJob(j, { cfg: FAKE_CFG });
  delete process.env.FAKE_MODE;
  assert.equal(r.ok, false);
  assert.equal(r.outPath, null);
  q.finishJob(j, { ok: r.ok });
});

test('runner: slugify — URL/한글/특수문자', () => {
  assert.equal(slugify('https://nookframe.com 점검!'), 'nookframe-com-점검');
  assert.equal(slugify(''), 'job');
});

test('runner: 알 수 없는 타입은 명시적 오류', () => {
  assert.throws(() => prepareWorkspace({ id: 'x', type: 'nope', params: {} }), /알 수 없는 워커/);
});

// ---------- push ----------

test('push: 페어링 파일 없으면 조용히 스킵', async () => {
  const r = await sendPush({ title: 't', body: 'b' });
  assert.equal(r.sent, false);
  assert.equal(r.reason, 'no-claudehelp-pairing');
});
