// 사용량 게이트 — 위젯 ClaudeLimit.js의 usage 조회/파싱을 node로 이식.
// 판정은 순수 함수(checkGate)로 분리해 테스트 가능하게 한다.
import { getAccessToken } from './creds.js';

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const USER_AGENT = 'claude-code/2.1.207'; // 이 헤더가 없으면 429

export async function fetchUsage() {
  const token = await getAccessToken();
  const res = await fetch(USAGE_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      'anthropic-beta': 'oauth-2025-04-20',
      'User-Agent': USER_AGENT,
    },
  });
  const json = await res.json().catch(() => null);
  if (res.status !== 200 || !json) throw new Error(`usage 조회 실패 (HTTP ${res.status})`);
  return json;
}

// limits 배열(신) / five_hour·seven_day(구) → {session, weekly, scoped[]}
export function extractLimits(data) {
  const limits = data.limits || [];
  const find = (kind) => limits.find((l) => l.kind === kind) || null;
  let session = find('session');
  let weekly = find('weekly_all');
  const scoped = limits.filter((l) => l.kind === 'weekly_scoped');
  if (!session && data.five_hour) {
    session = { percent: Math.round(data.five_hour.utilization), resets_at: data.five_hour.resets_at };
  }
  if (!weekly && data.seven_day) {
    weekly = { percent: Math.round(data.seven_day.utilization), resets_at: data.seven_day.resets_at };
  }
  return { session, weekly, scoped };
}

const remaining = (limit) => (limit && typeof limit.percent === 'number' ? 100 - limit.percent : null);

// 잡의 모델에 해당하는 모델별(scoped) 한도 찾기 — display_name 느슨 매칭
export function scopedFor(scoped, model) {
  if (!model) return null;
  const m = model.toLowerCase();
  return (
    scoped.find((l) => {
      const name = l?.scope?.model?.display_name || '';
      return name.toLowerCase().includes(m) || m.includes(name.toLowerCase());
    }) || null
  );
}

// ─────────────────────────────────────────────────────────────
// 2026-09-18 실측 반영 (근거: memory/reference-claude-usage-pattern.md)
//  · 5h 창은 평균 29%만 쓴다 → "5h 잔여 10% 미만" 게이트는 69창 중 2개만 해당 = 죽은 게이트
//  · 진짜 제약은 주간 한도 (3주 중 1주가 94%)
//  · Vive는 올빼미형(20~01시 피크) → 진짜 유휴는 04~10시. "밤 2시"는 피크와 충돌
// ─────────────────────────────────────────────────────────────

// 주간 리셋까지 남은 일수. 과거·불명이면 1일로 보수 처리(하루치 예산만 허용).
export function daysUntilReset(resetAt, now = new Date()) {
  if (!resetAt) return null;
  const ms = new Date(resetAt).getTime() - now.getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(1, Math.ceil(ms / 86_400_000));
}

// 잡 1건의 예상 주간 소모(%p) = 예상 요청 수 × 요청당 계수
export function estWeeklyCost(job, gateCfg) {
  const table = gateCfg.est_requests || {};
  const reqs = table[job?.type] ?? table.default ?? 100;
  return reqs * (gateCfg.request_weekly_pct ?? 0.0148);
}

const hhmm = (s) => {
  const [h, m] = String(s).split(':').map(Number);
  return h * 60 + (m || 0);
};

// 이 잡에 실행 시간대 규칙이 적용되는가 (기본: 반복 잡만 — now/at은 사용자 의도 존중)
export function windowApplies(job, win) {
  if (!win?.start || !win?.end) return false;
  const modes = win.applies_to || ['every'];
  return modes.includes(job?.when?.mode);
}

// 로컬 시각이 실행 창 안인가 (자정 넘김 지원)
export function inRunWindow(now, win) {
  const mins = now.getHours() * 60 + now.getMinutes();
  const s = hhmm(win.start);
  const e = hhmm(win.end);
  return s <= e ? mins >= s && mins < e : mins >= s || mins < e;
}

// 다음 실행 창 시작 시각
export function nextWindowStart(now, win) {
  const t = new Date(now);
  const s = hhmm(win.start);
  t.setHours(Math.floor(s / 60), s % 60, 0, 0);
  if (t <= now) t.setDate(t.getDate() + 1);
  return t;
}

// 판정: {ok:true} | {ok:false, reason, retry_at(Date|null)}
export function checkGate(job, usage, gateCfg, now = new Date()) {
  const { session, weekly, scoped } = extractLimits(usage);
  const win = gateCfg.run_window;
  const windowed = windowApplies(job, win);

  // ① 실행 시간대 — 반복 잡은 유휴 구간에서만 시작한다.
  //    5h 창은 "첫 요청 시점부터" 5시간이라, 늦게 시작하면 창이 낮 피크까지 물린다.
  if (windowed && !inRunWindow(now, win)) {
    return {
      ok: false,
      reason: `실행 시간대 밖 (${win.start}~${win.end})`,
      retry_at: nextWindowStart(now, win),
    };
  }

  // ② 주간 하드 백스톱
  const w = remaining(weekly);
  if (w !== null && w < gateCfg.weekly_min_pct) {
    return {
      ok: false,
      reason: `주간 잔여 ${w}% < ${gateCfg.weekly_min_pct}%`,
      retry_at: weekly.resets_at ? new Date(weekly.resets_at) : null,
    };
  }

  // ③ 하루 예산 — 단일 임계값은 "언제 리셋되는지"를 못 본다.
  //    잔여 30%가 리셋 6일 전이면 위험, 1일 전이면 오히려 여유다.
  const factor = gateCfg.daily_budget_factor;
  if (w !== null && factor > 0) {
    const days = daysUntilReset(weekly?.resets_at, now);
    if (days !== null) {
      const budget = w / days;
      const est = estWeeklyCost(job, gateCfg);
      if (est > factor * budget) {
        return {
          ok: false,
          reason: `하루 예산 초과 — 예상 ${est.toFixed(2)}%p > ${(factor * budget).toFixed(2)}%p (주간잔여 ${w}% ÷ ${days}일 × ${factor})`,
          retry_at: windowed ? nextWindowStart(now, win) : new Date(now.getTime() + 6 * 3600_000),
        };
      }
    }
  }

  const s = remaining(session);
  if (s !== null && s < gateCfg.session_min_pct) {
    return {
      ok: false,
      reason: `5시간 잔여 ${s}% < ${gateCfg.session_min_pct}%`,
      retry_at: session.resets_at ? new Date(session.resets_at) : null,
    };
  }
  const sc = scopedFor(scoped, job.model);
  if (sc) {
    const r = remaining(sc);
    if (r !== null && r < gateCfg.scoped_min_pct) {
      const name = sc?.scope?.model?.display_name || job.model;
      return {
        ok: false,
        reason: `${name} 한도 잔여 ${r}% < ${gateCfg.scoped_min_pct}%`,
        retry_at: sc.resets_at ? new Date(sc.resets_at) : null,
      };
    }
  }
  return { ok: true };
}

// 로그용 스냅샷(간결)
export function usageSnapshot(usage) {
  const { session, weekly, scoped } = extractLimits(usage);
  const pick = (l) => (l ? { percent: l.percent, resets_at: l.resets_at || null } : null);
  return {
    session: pick(session),
    weekly: pick(weekly),
    scoped: scoped.map((l) => ({ name: l?.scope?.model?.display_name || '?', percent: l.percent })),
  };
}
