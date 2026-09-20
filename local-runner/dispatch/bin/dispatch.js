#!/usr/bin/env node
// dispatch CLI — nookframe local-runner 편입판. 대상은 nookframe 하나로 고정.
//   dispatch init                        데이터 폴더 생성(~/Dispatch)
//   dispatch add <type> "<프롬프트>" [--at "2026-09-25T02:00"] [--daily 09:00] [--model M]
//   dispatch list                        큐 보기
//   dispatch run                         지금 due인 잡들 1회 처리(포그라운드)
//   dispatch daemon                      상주 루프(launchd용)
//   dispatch status                      사용량 게이트 스냅샷
//   dispatch doctor                      환경 점검
//   dispatch push-test                   폰 푸시 테스트
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDirs, dirs } from '../src/paths.js';
import { loadConfig, DEFAULTS } from '../src/config.js';
import { createJob, listJobs } from '../src/queue.js';
import { PROJECT, readableDirs } from '../src/project.js';
import { WORKERS } from '../src/workers.js';
import { daemon } from '../src/daemon.js';
import { sendPush } from '../src/push.js';

const [cmd, ...rest] = process.argv.slice(2);

function parseArgs(tokens) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].startsWith('--')) {
      flags[tokens[i].slice(2)] = tokens[i + 1] && !tokens[i + 1].startsWith('--') ? tokens[++i] : true;
    } else pos.push(tokens[i]);
  }
  return { flags, pos };
}

async function main() {
  switch (cmd) {
    case 'init': {
      ensureDirs();
      const cfgFile = path.join(dirs.data, 'config.json');
      if (!fs.existsSync(cfgFile)) fs.writeFileSync(cfgFile, JSON.stringify(DEFAULTS, null, 2));
      console.log(`✅ 초기화 완료: ${dirs.data}`);
      console.log(`   대상: ${PROJECT.name} (${PROJECT.local})`);
      break;
    }

    case 'add': {
      ensureDirs();
      const { flags, pos } = parseArgs(rest);
      const [type, ...promptParts] = pos;
      if (!WORKERS[type]) {
        console.error(`❌ 워커 타입은 다음 중 하나: ${Object.keys(WORKERS).join(', ')}`);
        process.exit(1);
      }
      let when = { mode: 'now' };
      if (flags.at) when = { mode: 'at', t: new Date(flags.at).toISOString() };
      if (flags.daily) when = { mode: 'every', daily: flags.daily };
      const job = createJob({ type, prompt: promptParts.join(' '), model: flags.model || null, when });
      console.log(
        `✅ 등록: ${job.id} [${type}] — ${
          when.mode === 'now' ? '즉시' : when.mode === 'at' ? `예약 ${flags.at}` : `매일 ${flags.daily}`
        }`,
      );
      break;
    }

    case 'list': {
      const jobs = listJobs();
      if (!jobs.length) return console.log('큐가 비어 있습니다.');
      for (const j of jobs) {
        const when =
          j.when.mode === 'now' ? '즉시' : j.when.mode === 'at' ? `at ${j.when.t}` : `매일 ${j.when.daily} (다음 ${j.next_at})`;
        const extra = j.not_before ? ` ⏸→${j.not_before} (${j.defer_reason})` : '';
        console.log(`${j.id}  [${j.status}] ${j.type} — ${when}${extra}`);
      }
      break;
    }

    case 'run':
      await daemon({ once: true });
      break;

    case 'daemon':
      await daemon();
      break;

    case 'status': {
      const { fetchUsage, usageSnapshot, checkGate } = await import('../src/gate.js');
      const usage = await fetchUsage();
      const snap = usageSnapshot(usage);
      const cfg = loadConfig();
      console.log('사용량:');
      if (snap.session) console.log(`  5시간: ${snap.session.percent}% 사용 (리셋 ${snap.session.resets_at})`);
      if (snap.weekly) console.log(`  주간:  ${snap.weekly.percent}% 사용 (리셋 ${snap.weekly.resets_at})`);
      for (const s of snap.scoped) console.log(`  ${s.name}: ${s.percent}% 사용`);
      const verdict = checkGate({ model: cfg.default_model }, usage, cfg.gate);
      console.log(verdict.ok ? `게이트: ✅ 통과 (기본모델 ${cfg.default_model})` : `게이트: ⏸ ${verdict.reason}`);
      break;
    }

    case 'doctor': {
      ensureDirs();
      const checks = [];
      const cfg = loadConfig();
      const { execFileSync } = await import('node:child_process');
      try {
        const v = execFileSync('claude', ['--version'], { encoding: 'utf8', timeout: 10000 }).trim();
        checks.push(['claude CLI', `✅ ${v}`]);
      } catch {
        checks.push(['claude CLI', '❌ 찾을 수 없음']);
      }
      try {
        const { readKeychainCreds } = await import('../src/creds.js');
        checks.push(['자격증명', readKeychainCreds() ? '✅ Keychain/파일에서 확인' : '❌ 없음']);
      } catch (e) {
        checks.push(['자격증명', `❌ ${e.message}`]);
      }
      // 시크릿 저장소 — 평문 폴더(~/.dispatch)를 버리고 키체인으로 옮겼는지 확인
      try {
        await import('../../../scripts/_keychain.mjs');
        checks.push(['시크릿 저장소', '✅ 맥 키체인 (scripts/_keychain.mjs)']);
      } catch (e) {
        checks.push(['시크릿 저장소', `❌ ${e.message}`]);
      }
      const { CLAUDEHELP } = await import('../src/paths.js');
      const hasPush = fs.existsSync(path.join(CLAUDEHELP, 'vapid.json')) && fs.existsSync(path.join(CLAUDEHELP, 'sub.json'));
      checks.push(['폰 푸시(claudehelp)', hasPush ? '✅ vapid/sub 있음' : '⚠️ 없음 — 알림 생략됨']);
      checks.push(['대상 리포', fs.existsSync(PROJECT.local) ? `✅ ${PROJECT.local}` : `❌ 경로 없음: ${PROJECT.local}`]);
      checks.push([
        '결정 기록(읽기전용)',
        fs.existsSync(PROJECT.memory) ? `✅ ${PROJECT.memory}` : `⚠️ 없음 — 중복 제안 거름망이 빠진다`,
      ]);
      checks.push(['워커가 읽는 폴더', `${readableDirs().length}개`]);
      checks.push(['데이터 폴더', fs.existsSync(dirs.data) ? `✅ ${dirs.data}` : `❌ ${dirs.data}`]);
      checks.push(['기본 모델', cfg.default_model]);
      for (const [k, v] of checks) console.log(`${k.padEnd(22)} ${v}`);
      break;
    }

    case 'push-test': {
      const r = await sendPush({ title: '🗂️ dispatch 푸시 테스트', body: '이 알림이 보이면 연결 정상입니다.', tag: 'dispatch-test' });
      console.log(r.sent ? '✅ 발송 완료 — 폰을 확인하세요' : `❌ 실패: ${r.reason}`);
      break;
    }

    default:
      console.log(
        fs
          .readFileSync(fileURLToPath(import.meta.url), 'utf8')
          .split('\n')
          .slice(1, 11)
          .map((l) => l.replace(/^\/\/ ?/, ''))
          .join('\n'),
      );
  }
}

main().catch((e) => {
  console.error(`오류: ${e.message}`);
  process.exit(1);
});
