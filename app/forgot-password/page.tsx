"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import TurnstileWidget, { turnstileEnabled, resetTurnstile } from "@/components/TurnstileWidget";
import Logo from "@/components/Logo";
import LanguageToggle from "@/components/LanguageToggle";
import { useT } from "@/lib/i18n/client";
import type { Dictionary } from "@/lib/i18n/dictionaries";

type Step = "form" | "sent";

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
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/auth/callback?next=/reset-password`,
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
      <main className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: "var(--bg)" }}>
        <div className="w-full max-w-sm text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-6"
            style={{ background: "var(--blue-tint)", border: "1px solid var(--blue)" }}
          >
            📬
          </div>
          <h1 className="text-2xl font-black mb-3" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
            {t.forgotPassword.sentTitle}
          </h1>
          <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
            <strong style={{ color: "var(--text-primary)" }}>{email}</strong><br />
            {t.forgotPassword.sentBody}
          </p>
          <Link
            href="/login"
            className="text-sm font-bold"
            style={{ color: "var(--blue)", textDecoration: "none", fontFamily: "var(--font-nunito)" }}
          >
            {t.auth.toLogin}
          </Link>
          <p className="text-xs mt-6 leading-relaxed" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
            {t.auth.resendPrompt}{" "}
            <button type="button" onClick={backToForm}
              style={{ color: "var(--blue)", fontWeight: 700, background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", fontFamily: "inherit", fontSize: "inherit" }}>
              {t.auth.reenter}
            </button>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <nav className="flex items-center justify-between px-4 md:px-8 py-4 md:py-5">
        <Logo />
        <div className="flex items-center gap-4">
          <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
            {t.forgotPassword.rememberPrompt}
            <Link href="/login" style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 700, marginLeft: "8px" }}>{t.forgotPassword.loginLink}</Link>
          </p>
          <LanguageToggle />
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-3xl font-black mb-2" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", letterSpacing: "-0.02em" }}>
              {t.forgotPassword.title}
            </h1>
            <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
              {t.forgotPassword.subtitle}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-bold mb-1.5"
                style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", letterSpacing: "0.05em" }}>
                {t.auth.emailLabel}
              </label>
              <input className="vf-input" type="email" name="email" placeholder="hello@example.com"
                value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }}
                required autoComplete="email" autoFocus />
            </div>

            {error && (
              <p className="text-sm font-semibold text-center py-2 px-3 rounded-xl"
                style={{ color: "#ef4444", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", fontFamily: "var(--font-nunito)" }}>
                {error}
              </p>
            )}

            <TurnstileWidget onToken={setCaptchaToken} />

            <button type="submit" disabled={loading || (turnstileEnabled && !captchaToken)}
              className="w-full py-3.5 rounded-xl font-black text-sm mt-2 transition-opacity hover:opacity-85 disabled:opacity-50"
              style={{ background: "var(--blue)", color: "var(--bg)", fontFamily: "var(--font-nunito)", cursor: loading ? "not-allowed" : "pointer", border: "none", boxShadow: "0 0 20px var(--blue-glow)" }}>
              {loading ? t.forgotPassword.submitting : t.forgotPassword.submit}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

function errorMessage(msg: string, t: Dictionary) {
  if (msg.includes("rate limit") || msg.includes("Too many")) return t.auth.errors.tooMany;
  if (msg.includes("valid email")) return t.auth.errors.invalidEmail;
  if (msg.toLowerCase().includes("captcha")) return t.auth.errors.captcha;
  return t.auth.errors.generic;
}
