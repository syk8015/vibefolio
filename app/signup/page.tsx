"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import TurnstileWidget, { turnstileEnabled, resetTurnstile } from "@/components/TurnstileWidget";
import Logo from "@/components/Logo";
import LanguageToggle from "@/components/LanguageToggle";
import { useT } from "@/lib/i18n/client";
import type { Dictionary } from "@/lib/i18n/dictionaries";

type Step = "form" | "check-email";

export default function SignupPage() {
  const { t, locale } = useT();
  const [show, setShow] = useState(false);
  const [step, setStep] = useState<Step>("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", username: "", email: "", password: "" });
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          name: form.name,
          // NOT `username`: middleware treats user_metadata.username as the
          // "onboarding done" gate. Committing it here would skip /onboarding, so the
          // profiles row (and the SignupCompleted funnel event) would never be created
          // — the account's public card would 404 and its first project INSERT would
          // hit a raw FK error. Stash it under a non-gating key so onboarding can
          // pre-fill and confirm it (uniqueness-checked there), exactly like Google.
          pending_username: form.username,
          // Supabase 인증메일 템플릿({{ .Data.locale }})이 언어를 고르는 근거.
          // 앱 메일은 profiles.locale을 쓰지만 auth 템플릿은 user_metadata만 읽는다.
          locale,
        },
        captchaToken: captchaToken ?? undefined,
      },
    });

    setLoading(false);
    if (error) {
      // Turnstile tokens are single-use — the failed attempt consumed this one.
      resetTurnstile();
      setCaptchaToken(null);
      setError(errorMessage(error.message, t));
    } else {
      setStep("check-email");
    }
  }

  function backToForm() {
    // Return to the form so a mistyped email can be fixed — or the same one resubmitted
    // to resend. The Turnstile widget re-mounts here and issues a fresh single-use token,
    // so we clear the consumed one (keeps the submit button gated until the new one lands).
    setStep("form");
    setError("");
    resetTurnstile();
    setCaptchaToken(null);
  }

  async function handleGoogle() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  }

  if (step === "check-email") {
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
            {t.signup.checkEmailTitle}
          </h1>
          <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
            <strong style={{ color: "var(--text-primary)" }}>{form.email}</strong><br />
            {t.signup.checkEmailBody}
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
            {t.signup.haveAccount}
            <Link href="/login" style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 700, marginLeft: "8px" }}>{t.signup.loginLink}</Link>
          </p>
          <LanguageToggle />
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-3xl font-black mb-2" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", letterSpacing: "-0.02em" }}>
              {t.signup.title}
            </h1>
            <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
              {t.signup.subtitle}
            </p>
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-3 py-3 rounded-xl font-bold text-sm mb-6 transition-opacity hover:opacity-80"
            style={{ border: "1px solid var(--border-bright)", background: "var(--surface)", color: "var(--text-primary)", fontFamily: "var(--font-nunito)", cursor: "pointer" }}
          >
            <GoogleIcon />
            {t.auth.googleContinue}
          </button>

          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
            <span className="text-xs font-semibold" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>{t.auth.or}</span>
            <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field label={t.signup.nameLabel}>
              <input className="vf-input" type="text" name="name" placeholder={t.signup.namePlaceholder}
                value={form.name} onChange={handleChange} required autoComplete="name" />
            </Field>

            <Field label={t.signup.usernameLabel}>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold pointer-events-none"
                  style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>@</span>
                <input className="vf-input" style={{ paddingLeft: "1.75rem" }}
                  type="text" name="username" placeholder="alexvibe"
                  value={form.username} onChange={handleChange} required
                  pattern="[a-zA-Z0-9_-]+" title={t.auth.usernamePattern} />
              </div>
              {form.username && (
                <p className="mt-1 text-xs font-semibold" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
                  nookframe.com/{form.username}
                </p>
              )}
            </Field>

            <Field label={t.auth.emailLabel}>
              <input className="vf-input" type="email" name="email" placeholder="hello@example.com"
                value={form.email} onChange={handleChange} required autoComplete="email" />
            </Field>

            <Field label={t.auth.passwordLabel}>
              <div className="relative">
                <input className="vf-input" style={{ paddingRight: "3rem" }}
                  type={show ? "text" : "password"} name="password" placeholder={t.signup.passwordPlaceholder}
                  value={form.password} onChange={handleChange} required minLength={8} autoComplete="new-password" />
                <button type="button" onClick={() => setShow((v) => !v)}
                  aria-label={show ? t.auth.hidePassword : t.auth.showPassword}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px" }}>
                  {show ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </Field>

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
              {loading ? t.signup.submitting : t.signup.submit}
            </button>
          </form>

          <p className="text-center text-xs mt-6 leading-relaxed" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
            {t.signup.agreePrefix}
            <Link href="/terms" style={{ color: "var(--text-secondary)", textDecoration: "underline" }}>{t.signup.termsLink}</Link>
            {t.signup.agreeAnd}
            <Link href="/privacy" style={{ color: "var(--text-secondary)", textDecoration: "underline" }}>{t.signup.privacyLink}</Link>{t.signup.agreeSuffix}
          </p>
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold mb-1.5"
        style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", letterSpacing: "0.05em" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function errorMessage(msg: string, t: Dictionary) {
  if (msg.includes("already registered")) return t.signup.errors.emailTaken;
  if (msg.includes("Password")) return t.auth.errors.passwordTooShort;
  if (msg.includes("valid email")) return t.auth.errors.invalidEmail;
  if (msg.toLowerCase().includes("captcha")) return t.auth.errors.captcha;
  return t.auth.errors.generic;
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.347 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}
function Eye() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  );
}
function EyeOff() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}
