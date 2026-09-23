import { logger } from "./logger";

// Cloudflare Turnstile 서버 쪽 확인. 가입·로그인 폼은 Supabase가 토큰을 확인하지만
// (components/TurnstileWidget.tsx 주석), 우리 서버가 직접 받는 폼(/api/handoff)은
// 여기서 확인한다. SERVER-ONLY — 비밀값은 NEXT_PUBLIC이 아닌 env다.
//
// TURNSTILE_SECRET_KEY가 없으면 통과시키고 경고만 남긴다 — 위젯과 같은 "키가 없으면
// 꺼짐" 자세. 그때 방어는 호출 쪽의 IP 한도·같은 이메일 하루 1통이 전부다.
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 8000;

let warned = false;

export async function verifyTurnstile(token: unknown, ip?: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (!warned) {
      warned = true;
      logger.warn("turnstile: TURNSTILE_SECRET_KEY 없음 — 서버 확인 건너뜀");
    }
    return true;
  }
  if (typeof token !== "string" || !token || token.length > 4096) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(VERIFY_URL, { method: "POST", body, signal: controller.signal });
      const data = (await res.json().catch(() => null)) as { success?: boolean } | null;
      return data?.success === true;
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    // Cloudflare가 안 받으면 막는다 — 메일을 보내는 폼이라 열어 두면 메일 폭탄 통로가 된다.
    logger.error("turnstile: verify failed", { error: err });
    return false;
  }
}
