import { logger } from "./logger";

// Cloudflare Turnstile 서버 쪽 확인. 가입·로그인 폼은 Supabase가 토큰을 확인하지만
// (components/TurnstileWidget.tsx 주석), 우리 서버가 직접 받는 폼(/api/handoff)은
// 여기서 확인한다. SERVER-ONLY — 비밀값은 NEXT_PUBLIC이 아닌 env다.
//
// TURNSTILE_SECRET_KEY가 없으면 통과시키고 경고만 남긴다 — 위젯과 같은 "키가 없으면
// 꺼짐" 자세. 그때 방어는 호출 쪽의 IP 한도·같은 이메일 하루 1통이 전부다.
//
// "misconfigured"는 Cloudflare가 **비밀값 자체**를 거절한 경우다(invalid-input-secret).
// Site Key와 Secret Key가 둘 다 `0x4AAAA…`로 시작해 바꿔 넣기 쉬운데, 그러면 모든
// 요청이 "보안 확인 실패"로 조용히 막힌다 — 토큰이 틀린 것(rejected)과 갈라서 500으로
// 올리고 로그를 남긴다. 찔러보기(scripts/probe-handoff.mjs)가 이 둘을 구분해 짚는다.
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 8000;
const SECRET_ERRORS = new Set(["invalid-input-secret", "missing-input-secret"]);

export type TurnstileResult = "ok" | "rejected" | "misconfigured";

let warned = false;

export async function verifyTurnstile(token: unknown, ip?: string | null): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (!warned) {
      warned = true;
      logger.warn("turnstile: TURNSTILE_SECRET_KEY 없음 — 서버 확인 건너뜀");
    }
    return "ok";
  }
  if (typeof token !== "string" || !token || token.length > 4096) return "rejected";
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(VERIFY_URL, { method: "POST", body, signal: controller.signal });
      const data = (await res.json().catch(() => null)) as
        | { success?: boolean; "error-codes"?: string[] }
        | null;
      if (data?.success === true) return "ok";
      const codes = data?.["error-codes"] ?? [];
      if (codes.some((c) => SECRET_ERRORS.has(c))) {
        logger.error("turnstile: Cloudflare가 비밀값을 거절 — TURNSTILE_SECRET_KEY 확인(Site Key를 넣었을 수 있음)", { codes });
        return "misconfigured";
      }
      return "rejected";
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    // Cloudflare가 안 받으면 막는다 — 메일을 보내는 폼이라 열어 두면 메일 폭탄 통로가 된다.
    logger.error("turnstile: verify failed", { error: err });
    return "rejected";
  }
}
