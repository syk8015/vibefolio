// 매일 밈 밤 작업 — 구독 사용량을 보고 오늘 밤 돌릴지 정한다(2026-11-05, 사용자 규칙 11-04).
//
// 지금 % 하나로 끊지 않는다. 네 숫자를 같이 본다:
//   5시간 칸의 사용 %와 끝나는 시각 · 주간 사용 %와 초기화까지 남은 날 ·
//   작업 1회 비용(지난 실행 실측 평균) · 아침 마감(한국 07:00)
// 규칙
//   - 5시간 칸이 아침 전에 끝나면, 그 칸 안에 작업이 들어갈 때 돌린다(아침 칸은 새로 시작).
//     안 들어가면 칸이 끝나길 기다렸다 새 칸에서 돌린다 — 그 새 칸은 아침까지 이어지므로
//     작업이 그 칸의 SHARED_MAX% 이하일 때만, 그리고 마감 전에 끝날 때만.
//   - 칸이 아침 뒤까지 이어지면(사용자가 아침에 같은 칸을 씀) 작업 뒤에도 MORNING_LEFT% 넘게 남을 때만.
//   - 주간: 남은 % − 작업 비용 × 초기화 전 남은 밤 수 ≥ WEEKLY_FLOOR, 그리고 그 몫이 남은 것의 30% 이하.
// 판단에 쓴 숫자는 실행 기록(meme_runs.usage)에 남긴다.
import { execFileSync } from "node:child_process";

export const DEADLINE_HOUR_KST = 7;
export const SESSION_MARGIN = 5;      // 칸 안에서 돌 때 남겨 둘 여유(%p)
export const SHARED_MAX = 40;         // 아침까지 이어지는 칸에서 작업이 써도 되는 최대(%)
export const MORNING_LEFT = 60;       // 아침까지 이어지는 칸에 작업 뒤 남아야 할 %
export const WEEKLY_FLOOR = 5;        // 주간에 작업들 뒤 늘 남길 %
export const WEEKLY_SHARE_MAX = 0.3;  // 남은 주간 중 작업이 가져가도 되는 몫
export const DEFAULT_COST = { session: 20, weekly: 1, minutes: 60 }; // 첫 실행 전 어림(넉넉히)

const HOUR = 3600_000;
const DAY = 24 * HOUR;

// 다음 한국 07:00(지금 이후). 예: 02:30 KST → 같은 날 07:00, 08:00 KST → 다음 날 07:00
export function nextDeadline(now, hourKst = DEADLINE_HOUR_KST) {
  const kstMidnight = Math.floor((now + 9 * HOUR) / DAY) * DAY - 9 * HOUR;
  let d = kstMidnight + hourKst * HOUR;
  if (d <= now) d += DAY;
  return d;
}

// 지난 실행 실측(최근 5번)의 평균 × 1.2. 실측이 없으면 넉넉한 어림.
export function estimateCost(history = []) {
  const done = history.filter((h) => h && h.measured && Number.isFinite(h.measured.session)).slice(-5);
  if (!done.length) return { ...DEFAULT_COST, basis: "default" };
  const avg = (k) => done.reduce((s, h) => s + (h.measured[k] ?? 0), 0) / done.length;
  return {
    session: Math.ceil(avg("session") * 1.2),
    weekly: Math.round(avg("weekly") * 1.2 * 10) / 10,
    minutes: Math.ceil(avg("minutes") * 1.2),
    basis: `last ${done.length}`,
  };
}

const fmt = (ms) => new Date(ms + 9 * HOUR).toISOString().slice(5, 16).replace("T", " ");

/**
 * @param {{ now:number, session:{percent:number, resetsAt:number|null},
 *           weekly:{percent:number, resetsAt:number|null},
 *           cost:{session:number, weekly:number, minutes:number} }} x
 * @returns {{ action:"run"|"wait"|"skip", until?:number, reason:string, numbers:object }}
 */
export function decideRun({ now, session, weekly, cost }) {
  const deadline = nextDeadline(now);
  const runMs = cost.minutes * 60_000;
  const numbers = {
    session: session.percent, sessionResetsAt: session.resetsAt,
    weekly: weekly.percent, weeklyResetsAt: weekly.resetsAt,
    cost, deadline,
  };

  // 주간 먼저 — 여기서 안 되면 칸은 볼 것도 없다.
  const wLeft = 100 - weekly.percent;
  const daysLeft = weekly.resetsAt && weekly.resetsAt > now ? (weekly.resetsAt - now) / DAY : 7;
  const nights = Math.max(1, Math.ceil(daysLeft));
  const jobWeek = cost.weekly * nights;
  numbers.weeklyLeft = wLeft;
  numbers.weeklyNights = nights;
  numbers.jobWeek = jobWeek;
  if (wLeft - jobWeek < WEEKLY_FLOOR || jobWeek > WEEKLY_SHARE_MAX * wLeft) {
    return {
      action: "skip", numbers,
      reason: `주간 ${weekly.percent}% 사용·${daysLeft.toFixed(1)}일 남음 — 남은 ${wLeft}%에서 작업 ${nights}밤 몫 ${jobWeek}%p를 빼면 너무 빠듯해요`,
    };
  }

  const active = session.resetsAt && session.resetsAt > now;
  if (!active) {
    // 지금 돌리면 새 칸이 지금부터 5시간 열린다.
    const end = now + 5 * HOUR;
    const shared = end > deadline;
    if (shared && cost.session > SHARED_MAX) {
      return { action: "skip", numbers, reason: `새 칸이 아침(${fmt(deadline)})까지 이어지는데 작업이 ${cost.session}%를 써서 아침 몫이 모자라요` };
    }
    if (now + runMs > deadline) {
      return { action: "skip", numbers, reason: `지금 시작하면 아침 ${fmt(deadline)} 전에 못 끝나요` };
    }
    return { action: "run", numbers, reason: `쓰는 칸 없음 — 새 칸에서 돌림(작업 약 ${cost.session}%)` };
  }

  const left = 100 - session.percent;
  numbers.sessionLeft = left;
  if (session.resetsAt <= deadline) {
    // 이 칸은 아침 전에 끝난다 → 이 칸 안에서 끝내면 아침 칸은 새것.
    if (left >= cost.session + SESSION_MARGIN && session.resetsAt - now >= runMs) {
      return { action: "run", numbers, reason: `지금 칸(${fmt(session.resetsAt)}까지)에 ${left}% 남음 — 작업 ${cost.session}%가 들어가요` };
    }
    if (session.resetsAt + runMs <= deadline && cost.session <= SHARED_MAX) {
      return {
        action: "wait", until: session.resetsAt, numbers,
        reason: `지금 칸에 ${left}%뿐이라 ${fmt(session.resetsAt)} 새 칸을 기다렸다 돌려요`,
      };
    }
    return { action: "skip", numbers, reason: `지금 칸에 ${left}% 남았고, 새 칸(${fmt(session.resetsAt)})에서 돌리면 아침 전에 못 끝나요` };
  }
  // 이 칸은 아침 뒤까지 이어진다 → 사용자가 아침에 같은 칸을 쓴다.
  if (left - cost.session >= MORNING_LEFT && now + runMs <= deadline) {
    return { action: "run", numbers, reason: `칸이 아침까지 이어지지만 작업 뒤에도 ${left - cost.session}% 남아요` };
  }
  return { action: "skip", numbers, reason: `칸이 아침(${fmt(session.resetsAt)}까지)까지 이어지고 ${left}%뿐이라 아침 몫을 남겨요` };
}

// ── 지금 한도 읽기: Claude Code가 맥 키체인에 둔 로그인 토큰으로 앤트로픽에만 묻는다.
const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
function accessToken() {
  const raw = execFileSync("security", ["find-generic-password", "-s", "Claude Code-credentials", "-w"], {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 20_000,
  });
  const d = JSON.parse(raw);
  const tok = (d.claudeAiOauth ?? d).accessToken;
  if (!tok) throw new Error("no accessToken in keychain");
  return tok;
}
const toMs = (v) => {
  if (typeof v === "number") return v < 1e12 ? v * 1000 : v;
  if (typeof v === "string") { const t = Date.parse(v); return Number.isNaN(t) ? null : t; }
  return null;
};
const pct = (w) => (w && typeof w.utilization === "number" ? w.utilization : null);

export async function fetchLimits() {
  const r = await fetch(USAGE_URL, {
    headers: { authorization: `Bearer ${accessToken()}`, "anthropic-beta": "oauth-2025-04-20", accept: "application/json" },
  });
  if (!r.ok) throw new Error(`usage ${r.status}`);
  const d = await r.json();
  const session = { percent: pct(d.five_hour) ?? 0, resetsAt: toMs(d.five_hour?.resets_at) };
  const weekly = { percent: pct(d.seven_day) ?? 0, resetsAt: toMs(d.seven_day?.resets_at) };
  return { session, weekly, fetchedAt: Date.now() };
}
