"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import TurnstileWidget, { turnstileEnabled, resetTurnstile } from "@/components/TurnstileWidget";
import { useT } from "@/lib/i18n/client";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { withVia } from "@/lib/lastLogin";
import { AuthShell, AuthTitle, ErrorLine, FieldLabel, Pill, SmallButton, SmallLink, SmallRow } from "@/components/auth/AuthParts";

type Step = "form" | "sent";

// [로그인으로 돌아가기]는 문을 비밀번호 칸으로 연다 — 여기 온 사람은 비밀번호로 들어오던 사람이다.
const BACK_TO_LOGIN = "/login?mode=password";

export default function ForgotPasswordPage() {
  const { t } = useT();
  const [step, setStep] = useState<Step>("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      // via=password — 재설정을 마치면 로그인 화면이 "지난번에 사용"을 이메일 칸에 붙인다(lib/lastLogin).
      redirectTo: withVia(`${location.origin}/auth/callback?next=/reset-password`, "password"),
      captchaToken: captchaToken ?? undefined,
    });

    setLoading(false);
    if (error) {
      // Turnstile tokens are single-use — the failed attempt consumed this one.
      resetTurnstile();
      setCaptchaToken(null);
      setError(errorMessage(error.message, t));
    } else {
      setStep("sent");
    }
  }

  function backToForm() {
    // Fix a mistyped email — or resubmit the same one to resend. The Turnstile widget
    // re-mounts on the form and issues a fresh single-use token; clear the consumed one.
    setStep("form");
    setError("");
    resetTurnstile();
    setCaptchaToken(null);
  }

  if (step === "sent") {
    return (
      <AuthShell>
        <AuthTitle>{t.forgotPassword.sentTitle}</AuthTitle>
        <p className="mt-2.5 text-center"
          style={{ fontSize: "0.9375rem", lineHeight: 1.6, color: "var(--text-secondary)", overflowWrap: "anywhere" }}>
          {t.forgotPassword.sentBefore}
          <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>{email.trim()}</strong>
          {t.forgotPassword.sentAfter}
        </p>
        <SmallRow className="mt-6">
          <SmallLink href={BACK_TO_LOGIN}>{t.forgotPassword.backToLogin}</SmallLink>
          <span aria-hidden>·</span>
          <SmallButton onClick={backToForm}>{t.auth.otherEmail}</SmallButton>
        </SmallRow>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthTitle className="mb-7">{t.forgotPassword.title}</AuthTitle>
      <form onSubmit={handleSubmit} className="flex flex-col">
        <FieldLabel htmlFor="forgot-email">{t.auth.emailLabel}</FieldLabel>
        <input id="forgot-email" className="vf-input" type="email" name="email" placeholder="hello@example.com"
          value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }}
          required autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus />

        {error && <ErrorLine text={error} />}

        <TurnstileWidget onToken={setCaptchaToken} />

        <Pill type="submit" disabled={loading || (turnstileEnabled && !captchaToken)} className="mt-6">
          {loading ? t.forgotPassword.submitting : t.forgotPassword.submit}
        </Pill>
        <SmallRow>
          <SmallLink href={BACK_TO_LOGIN}>{t.forgotPassword.backToLogin}</SmallLink>
        </SmallRow>
      </form>
    </AuthShell>
  );
}

function errorMessage(msg: string, t: Dictionary) {
  if (msg.includes("rate limit") || msg.includes("Too many")) return t.auth.errors.tooMany;
  if (msg.includes("valid email")) return t.auth.errors.invalidEmail;
  if (msg.toLowerCase().includes("captcha")) return t.auth.errors.captcha;
  return t.auth.errors.generic;
}
