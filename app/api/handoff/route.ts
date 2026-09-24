import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/routeAuth";
import { rateLimit, clientIpKey } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { sendEmail } from "@/lib/email";
import { handoffEmail, SITE_URL } from "@/lib/email-templates";
import { trackServerEvent } from "@/lib/analytics";
import { AnalyticsEvent } from "@/lib/analytics-events";
import {
  HANDOFF_DEDUPE_MS,
  handoffLink,
  normalizeHandoffEmail,
  sanitizeTouch,
  type HandoffTouch,
} from "@/lib/handoff";

// POST /api/handoff — 폰에서 [내 컴퓨터로 보내기]. docs/desktop-handoff.md.
//
// 두 갈래다.
//   - 로그인 없이(/send 이메일 칸): 공개 주소가 남의 받은편지함으로 메일을 보내는 자리라
//     문이 셋이다 — 1) Turnstile(서버 확인) 2) IP당 1시간 5번 3) 같은 이메일은 24시간에 1통.
//   - `self: true`(폰에서 막 가입한 사람, /send의 계정 화면): 받는 주소는 **로그인한 계정의
//     이메일로만** 정한다(몸통의 email은 무시). 자기 주소로만 가니 남에게 뿌릴 수 없어
//     Turnstile은 빼고, 2)·3)은 그대로.
// 3번에 걸리면 **보내지 않고 성공처럼** 답한다 — 메일 폭탄도 막고, "이 주소는
// 최근에 요청됐다"는 사실도 새지 않는다. 메일 링크(/signup?h=)는 두 갈래 모두 같다 —
// 메일 코드 로그인(signInWithOtp)이 새 계정이면 만들고 있는 계정이면 들여보낸다.
const IP_WINDOW_S = 3600;
const IP_MAX = 5;

export async function POST(req: NextRequest) {
  const { t, locale } = await getT();
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const self = body?.self === true;

    let email: string | null;
    let accountTouch: HandoffTouch | null = null;
    if (self) {
      const auth = await requireUser(t.api.loginRequired);
      if (auth instanceof NextResponse) return auth;
      email = normalizeHandoffEmail(auth.user.email);
      // 광고 출처는 가입 때 계정에 실어 둔 폰의 first-touch(가입 폼·온보딩과 같은 값).
      accountTouch = sanitizeTouch(auth.user.user_metadata?.first_touch);
    } else {
      email = normalizeHandoffEmail(body?.email);
    }
    if (!email) {
      return apiError({ status: 400, message: t.api.handoffBadEmail, code: "BAD_EMAIL" });
    }

    const ipKey = clientIpKey(req);
    if (!(await rateLimit({ name: "handoff", key: ipKey, windowSeconds: IP_WINDOW_S, max: IP_MAX }))) {
      return apiError({ status: 429, message: t.api.handoffRateLimited, code: "RATE_LIMITED" });
    }

    if (!self) {
      const ip = req.headers.get("x-vercel-forwarded-for") ?? req.headers.get("x-real-ip");
      const captcha = await verifyTurnstile(body?.captchaToken, ip);
      if (captcha === "misconfigured") {
        // 우리 쪽 설정 문제(비밀값이 틀림) — 사용자 탓처럼 "다시 확인하세요"를 띄우지 않는다.
        return apiError({ status: 500, message: t.api.handoffSendFailed, code: "CAPTCHA_MISCONFIGURED" });
      }
      if (captcha !== "ok") {
        return apiError({ status: 400, message: t.api.handoffCaptcha, code: "CAPTCHA" });
      }
    }

    const admin = createAdminClient();
    const since = new Date(Date.now() - HANDOFF_DEDUPE_MS).toISOString();
    const { data: recent, error: recentErr } = await admin
      .from("desktop_handoffs")
      .select("id")
      .eq("email", email)
      .gte("created_at", since)
      .limit(1);
    if (recentErr) throw recentErr;
    if (recent && recent.length > 0) return NextResponse.json({ ok: true });

    const firstTouch = self ? accountTouch : sanitizeTouch(body?.firstTouch);
    const { data: row, error: insErr } = await admin
      .from("desktop_handoffs")
      .insert({ email, locale, remind: body?.remind === true, first_touch: firstTouch })
      .select("id")
      .single();
    if (insErr || !row) throw insErr ?? new Error("insert returned no row");

    const mail = handoffEmail({ link: handoffLink(SITE_URL, row.id), locale });
    const sent = await sendEmail({ to: email, ...mail });
    if (!sent) {
      // 행을 남기면 하루 막힘에 걸려 다시 눌러도 영영 안 간다 — 지우고 다시 시도하게 한다.
      await admin.from("desktop_handoffs").delete().eq("id", row.id);
      return apiError({ status: 502, message: t.api.handoffSendFailed, code: "EMAIL_FAILED" });
    }

    await trackServerEvent(AnalyticsEvent.HandoffRequested, {
      props: {
        handoff: row.id,
        remind: body?.remind === true,
        self,
        ref: firstTouch?.referrer ?? null,
        utm_source: firstTouch?.utm_source ?? null,
        utm_medium: firstTouch?.utm_medium ?? null,
        utm_campaign: firstTouch?.utm_campaign ?? null,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError({ status: 500, message: t.api.handoffSendFailed, code: "INTERNAL", cause: err });
  }
}
