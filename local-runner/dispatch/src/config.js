import fs from 'node:fs';
import path from 'node:path';
import { DATA } from './paths.js';

export const DEFAULTS = {
  default_model: 'opus',
  poll_seconds: 20,
  max_turns: 60,
  // 게이트 — 2026-09-18 사용량 실측 반영 (memory/reference-claude-usage-pattern.md)
  gate: {
    weekly_min_pct: 30, // 주간 잔여가 이 미만이면 보류 (하드 백스톱)
    session_min_pct: 25, // 5h 잔여 하한. 10은 69창 중 2개만 해당해 사실상 발동 안 했다
    scoped_min_pct: 50, // 모델별 한도(Fable/Opus 등)가 있는 잡에 적용

    // 하루 예산: budget = 주간잔여%p ÷ 리셋까지 남은 일수.
    // 예상비용 ≤ factor × budget 이어야 실행. factor 0.5 = 안전계수 2배.
    daily_budget_factor: 0.5,
    request_weekly_pct: 0.0148, // 요청 1건당 주간 %p (실측: 주간 1%p ≈ 67건)
    // 잡 유형별 예상 요청 수 — logs/jobs.jsonl의 num_turns 실측으로 갱신한다.
    // 2026-09-20 1차 교정: 초기 추정치가 실측의 2~5배였다(과대추정 = 멀쩡한 잡이 게이트에 막힌다).
    //   site-monitor 실측 3·8 turns (haiku, n=2) → 15에서 12로
    //   research 실측 34 turns (opus, 4단계 딥리서치 = 이 타입의 제일 무거운 모양, n=1) → 80에서 45로
    //   code-review·default는 실측이 아직 없어 그대로 둔다.
    // 실측 + 30% 여유로 잡았다. n이 작으니 표본이 쌓이면 다시 본다.
    est_requests: {
      'site-monitor': 12,
      research: 45,
      'code-review': 120,
      default: 100,
    },

    // 실행 시간대(로컬). 04~10시가 실측 유휴 구간이고, 06시 이후 시작하면 5h 창이
    // 11시 피크까지 물린다 — 판정 자체는 여전히 옳다.
    //
    // 다만 2026-09-20 편입 결정으로 **자동 시간표를 실행 방침으로 쓰지 않는다.**
    // 대신 "관제탑/폰 버튼 → 큐 → 맥이 깨어날 때 집어감"(촬영 워커와 같은 구조)으로 간다.
    // 그래서 applies_to를 비워 기본 비활성으로 두되, 기계는 지우지 않았다 —
    // config.json에서 `gate.run_window.applies_to: ["every"]`로 언제든 되살릴 수 있다.
    // 설계: QUEUE-DESIGN.md
    run_window: { start: '04:00', end: '06:00', applies_to: [] },
  },
  // 워커별 기본 실행 상한(분)
  timeouts_min: { research: 30, 'site-monitor': 10, 'code-review': 30 },
  claude_bin: 'claude',
};

function deepMerge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(base[k] || {}, v) : v;
  }
  return out;
}

export function loadConfig() {
  const file = path.join(DATA, 'config.json');
  let user = {};
  try {
    user = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    /* 없으면 기본값 */
  }
  return deepMerge(DEFAULTS, user);
}
