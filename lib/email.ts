// Transactional email via Resend (T4).
//
// Same contract as lib/r2.ts: shared by multiple runtimes (Next API routes and
// the tsx recording worker), so it carries zero framework deps and reads env
// lazily at call time. Resend is a single HTTPS POST — no SDK dependency.
// Callers gate on isEmailConfigured(), or just call sendEmail and ignore false.
//
// Failure contract: sendEmail NEVER throws and never blocks past its timeout.
// Email is always a side-channel — the DB row is the source of truth — so a
// mail outage must never fail a job, an API route, or the cron watchdog.
//
//   - Next server / API routes   → import "@/lib/email"
//   - local-runner worker (tsx)  → import "../lib/email"

import { ADMIN_EMAILS } from "./adminEmails";
import { logger } from "./logger";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 10_000;

// Sender identity. The domain must be verified in Resend before this works;
// until then set EMAIL_FROM="Nookframe <onboarding@resend.dev>" to smoke-test
// (Resend only delivers that sender to the account owner's own address).
const DEFAULT_FROM = "Nookframe <notify@nookframe.com>";

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

// Operational alert recipients (credit exhaustion, watchdog, approval queue).
// ALERT_EMAILS overrides; otherwise the /admin gate's list (lib/adminEmails).
export function alertRecipients(): string[] {
  const raw = process.env.ALERT_EMAILS;
  if (!raw) return ADMIN_EMAILS;
  return raw
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
};

// Returns true only when Resend accepted the message. Unconfigured → false
// without a network call. 실패는 logger.error로 올린다(2026-09-22 운영2) — 예전엔
// console.error뿐이라 Resend 한도가 차거나 도메인이 틀어져 완료·실패 메일이 안 나가도
// Sentry에 흔적이 없었다. 받는 사람 주소는 싣지 않는다(개인정보).
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const body = {
    from: process.env.EMAIL_FROM ?? DEFAULT_FROM,
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
    html: input.html,
    ...(input.replyTo ?? process.env.EMAIL_REPLY_TO
      ? { reply_to: input.replyTo ?? process.env.EMAIL_REPLY_TO }
      : {}),
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      logger.error("email: resend rejected", { status: res.status, subject: input.subject, detail });
      return false;
    }
    return true;
  } catch (err) {
    logger.error("email: send failed", { error: err, subject: input.subject });
    return false;
  }
}
