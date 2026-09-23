// 폰 → 컴퓨터 넘기기(desktop handoff) 순수 규칙 — docs/desktop-handoff.md.
//
// 프레임워크·env 없는 순수 TS: 라우트(app/api/handoff*)와 알림 크론, 단위 프로브
// (scripts/probe-handoff-unit.mts)가 같은 판정을 쓴다.

export const HANDOFF_EMAIL_MAX = 254;
/** 같은 이메일로는 이 시간 안에 한 통만 보낸다(남의 주소로 메일 폭탄 방지). */
export const HANDOFF_DEDUPE_MS = 24 * 60 * 60 * 1000;
/** 행을 들고 있는 기간 — 이메일을 오래 두지 않는다. 링크도 이 뒤론 안 채워진다. */
export const HANDOFF_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** 알림 메일 창: 요청 뒤 20~44시간(크론이 1시간마다 도니 "다음 날" 한 번에 걸린다). */
export const REMIND_AFTER_MS = 20 * 60 * 60 * 1000;
export const REMIND_BEFORE_MS = 44 * 60 * 60 * 1000;
/** 크론 한 번에 보내는 알림 상한 — Resend 무료 하루 100통을 인증 메일과 나눠 쓴다. */
export const REMIND_BATCH_MAX = 40;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 소문자·공백 제거. 모양이 틀리면 null. */
export function normalizeHandoffEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const e = v.trim().toLowerCase();
  if (!e || e.length > HANDOFF_EMAIL_MAX || !EMAIL_RE.test(e)) return null;
  return e;
}

export function isHandoffId(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export interface HandoffTouch {
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  landing: string | null;
  at: string | null;
}

const TOUCH_KEYS = ["referrer", "utm_source", "utm_medium", "utm_campaign", "landing", "at"] as const;
const TOUCH_VALUE_MAX = 300;

/** 브라우저가 보낸 first-touch를 알려진 칸·길이로만 추린다(행 부풀리기·이상한 값 차단). */
export function sanitizeTouch(v: unknown): HandoffTouch | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const src = v as Record<string, unknown>;
  const out = {} as HandoffTouch;
  let any = false;
  for (const k of TOUCH_KEYS) {
    const raw = src[k];
    const s = typeof raw === "string" ? raw.trim().slice(0, TOUCH_VALUE_MAX) : "";
    out[k] = s || null;
    if (s) any = true;
  }
  return any ? out : null;
}

/** 크론이 알림을 보낼 행인가. now·created는 ms. */
export function shouldRemind(
  row: { remind: boolean; opened_at: string | null; reminded_at: string | null; created_at: string },
  now: number,
): boolean {
  if (!row.remind || row.opened_at || row.reminded_at) return false;
  const age = now - Date.parse(row.created_at);
  return age >= REMIND_AFTER_MS && age <= REMIND_BEFORE_MS;
}

/** 메일 속 버튼이 여는 주소 — 이메일은 싣지 않는다(주소창·로그에 남지 않게). */
export function handoffLink(siteUrl: string, id: string): string {
  return `${siteUrl}/signup?h=${encodeURIComponent(id)}`;
}
