"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import TurnstileWidget, { turnstileEnabled, resetTurnstile } from "@/components/TurnstileWidget";
import Logo from "@/components/Logo";
import LanguageToggle from "@/components/LanguageToggle";
import { useT } from "@/lib/i18n/client";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { safeNext } from "@/lib/safeNext";
import { firstTouch } from "@/lib/analytics-client";
import InAppBrowserNotice from "@/components/InAppBrowserNotice";

type Step = "form" | "check-email";
// 이름·아이디는 여기서 받지 않는다 — 인증 뒤 온보딩에서 한 번만 받는다(구글 가입과
// 같은 길). 예전엔 여기서 받고 온보딩에서 또 물어 두 번 입력하는 셈이었다(2026-09-22).
type FieldName = "email" | "password";

// 가입 뒤 돌아갈 곳(?next=, /publish에서 온 사람). 인증 메일 링크·구글 콜백에 실어
// 보내면 미들웨어가 온보딩에 ?next=로 넘기고, 온보딩 끝에서 거기로 간다.
function nextFromUrl(): string {
  return safeNext(new URLSearchParams(location.search).get("next"), "/dashboard");
}

const noopSubscribe = () => () => {};

function loginHrefFromUrl(): string {
  const next = new URLSearchParams(location.search).get("next");
  return next && safeNext(next) === next ? `/login?next=${encodeURIComponent(next)}` : "/login";
}

function callbackUrl(): string {
  return `${location.origin}/auth/callback?next=${encodeURIComponent(nextFromUrl())}`;
}

// 입력 오류 안내 — 제출 버튼은 보안 확인(Turnstile) 전엔 잠겨 있어서 브라우저 기본
// 검증 말풍선이 한 번도 안 뜬다. 칸을 벗어날 때 무엇이 틀렸는지 바로 보여 준다.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function fieldError(field: FieldName, value: string, t: Dictionary): string | null {
  if (!value) return null;
  if (field === "email" && !EMAIL_RE.test(value)) return t.auth.errors.invalidEmail;
  if (field === "password" && value.length < 8) return t.auth.errors.passwordTooShort;
  return null;
}

export default function SignupPage() {
  const { t, locale } = useT();
  const [show, setShow] = useState(false);
  const [step, setStep] = useState<Step>("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ email: "", password: "" });
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [resend, setResend] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  // 로그인 링크에도 ?next=를 이어 붙인다(이미 계정이 있던 사람이 /publish로 돌아가게).
  const loginHref = useSyncExternalStore(noopSubscribe, loginHrefFromUrl, () => "/login");

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError("");
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    const name = e.target.name as FieldName;
    setTouched((prev) => ({ ...prev, [name]: true }));
  }

  const hint = (field: FieldName) => (touched[field] ? fieldError(field, form[field], t) : null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const firstBad = (["email", "password"] as FieldName[])
      .map((f) => fieldError(f, form[f], t)).find(Boolean);
    if (firstBad) {
      setTouched({ email: true, password: true });
      setError(firstBad);
      return;
    }
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        // 인증 링크가 돌아올 곳. 없으면 Supabase Site URL(랜딩)로 떨어져 코드 교환이
        // 안 되고, 인증은 됐는데 로그아웃된 랜딩만 보인다(2026-09-22 A3).
        emailRedirectTo: callbackUrl(),
        // user_metadata에 username을 넣지 말 것 — 미들웨어의 "온보딩 끝" 표식이라
        // 넣는 순간 온보딩을 건너뛰어 profiles 행이 안 생긴다.
        data: {
          // Supabase 인증메일 템플릿({{ .Data.locale }})이 언어를 고르는 근거.
          // 앱 메일은 profiles.locale을 쓰지만 auth 템플릿은 user_metadata만 읽는다.
          locale,
          // 첫 방문 정보(유입 경로·utm). 폰에서 인증 메일을 누르면 다른 브라우저가 열려
          // localStorage가 비므로, 온보딩이 가입 완료를 홍보 성과로 셀 수 있게 계정에 실어 둔다.
          first_touch: firstTouch(),
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
    } else if (data.user && data.user.identities?.length === 0) {
      // 이미 가입된 주소 — Supabase는 주소 존재를 숨기려고 가짜 성공을 돌려주고 메일은
      // 보내지 않는다(identities가 빈 배열인 게 유일한 표식). 그대로 "메일 보냈어요"를
      // 띄우면 오지 않을 메일을 기다리게 된다(2026-09-22 실가입 확인에서 발견).
      resetTurnstile();
      setCaptchaToken(null);
      setError(t.signup.errors.emailTaken);
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
    setResend("idle");
    resetTurnstile();
    setCaptchaToken(null);
  }

  // 인증 메일 다시 보내기 — 스팸함·지연으로 막힌 사람이 폼으로 돌아가지 않고 스스로 푼다.
  // Supabase가 같은 주소엔 60초에 한 번만 보내므로, 너무 빠르면 실패 문구가 뜬다.
  async function handleResend() {
    setResend("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: form.email,
      options: { emailRedirectTo: callbackUrl(), captchaToken: captchaToken ?? undefined },
    });
    resetTurnstile();
    setCaptchaToken(null);
    setResend(error ? "failed" : "sent");
  }

  async function handleGoogle() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
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
          {resend === "sent" ? (
            <p className="text-sm font-semibold mb-6" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
              {t.auth.resendSent}
            </p>
          ) : (
            <div className="flex flex-col items-center gap-3 mb-6">
              <TurnstileWidget onToken={setCaptchaToken} />
              <button type="button" onClick={handleResend}
                disabled={resend === "sending" || (turnstileEnabled && !captchaToken)}
                className="vf-button-ghost disabled:opacity-50">
                {resend === "sending" ? t.auth.resending : t.auth.resendButton}
              </button>
              {resend === "failed" && (
                <p className="text-xs" style={{ color: "#ef4444", fontFamily: "var(--font-nunito)" }}>{t.auth.resendFailed}</p>
              )}
            </div>
          )}
          <Link
            href={loginHref}
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
            <Link href={loginHref} style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 700, marginLeft: "8px" }}>{t.signup.loginLink}</Link>
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

          <InAppBrowserNotice />

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
            <Field label={t.auth.emailLabel}>
              <input className="vf-input" type="email" name="email" placeholder="hello@example.com"
                value={form.email} onChange={handleChange} onBlur={handleBlur} required autoComplete="email"
                autoCapitalize="none" autoCorrect="off" spellCheck={false} />
              {hint("email") && <FieldHint text={hint("email")!} />}
            </Field>

            <Field label={t.auth.passwordLabel}>
              <div className="relative">
                <input className="vf-input" style={{ paddingRight: "3rem" }}
                  type={show ? "text" : "password"} name="password" placeholder={t.signup.passwordPlaceholder}
                  value={form.password} onChange={handleChange} onBlur={handleBlur} required minLength={8} autoComplete="new-password" />
                <button type="button" onClick={() => setShow((v) => !v)}
                  aria-label={show ? t.auth.hidePassword : t.auth.showPassword}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px" }}>
                  {show ? <EyeOff /> : <Eye />}
                </button>
              </div>
              {hint("password") && <FieldHint text={hint("password")!} />}
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

function FieldHint({ text }: { text: string }) {
  return (
    <p className="mt-1 text-xs font-semibold" style={{ color: "#ef4444", fontFamily: "var(--font-nunito)" }}>
      {text}
    </p>
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
