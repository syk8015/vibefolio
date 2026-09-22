"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import TurnstileWidget, { turnstileEnabled, resetTurnstile } from "@/components/TurnstileWidget";
import Logo from "@/components/Logo";
import LanguageToggle from "@/components/LanguageToggle";
import { useT } from "@/lib/i18n/client";
import { safeNext } from "@/lib/safeNext";
import InAppBrowserNotice from "@/components/InAppBrowserNotice";
import type { Dictionary } from "@/lib/i18n/dictionaries";

const RETURNING_USER_KEY = "vf-returning-user";

// 로그인 뒤 돌아갈 곳. useSearchParams는 Suspense 경계를 요구해서, 클릭 시점에 주소를 읽는다.
// 기본은 대시보드 — 홈("/")은 로그인한 사람에겐 버튼 두 개짜리 중간 화면이다.
function nextFromUrl(): string {
  return safeNext(new URLSearchParams(location.search).get("next"), "/dashboard");
}

export default function LoginPage() {
  const router = useRouter();
  const { t } = useT();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ email: "", password: "" });
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [isReturning, setIsReturning] = useState<boolean | null>(null);
  // 인증 콜백 실패(?error=auth)로 왔을 때의 안내 — 재설정 링크였는지 가입 인증이었는지로 가른다.
  const [callbackError, setCallbackError] = useState<"reset" | "confirm" | null>(null);
  // "이메일 미인증"으로 막힌 사람에게 인증 메일을 다시 보내는 버튼 상태.
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resend, setResend] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  // 가입 링크에 ?next=를 이어 붙인다(/publish에서 온 신규 사용자가 길을 잃지 않게).
  const [signupHref, setSignupHref] = useState("/signup");

  useEffect(() => {
    setIsReturning(localStorage.getItem(RETURNING_USER_KEY) === "1");
    const params = new URLSearchParams(location.search);
    if (params.get("error") === "auth") {
      setCallbackError(safeNext(params.get("next")).startsWith("/reset-password") ? "reset" : "confirm");
    }
    const next = params.get("next");
    if (next && safeNext(next) === next) setSignupHref(`/signup?next=${encodeURIComponent(next)}`);
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
      options: { captchaToken: captchaToken ?? undefined },
    });

    setLoading(false);
    if (error) {
      // Turnstile tokens are single-use — the failed attempt consumed this one.
      resetTurnstile();
      setCaptchaToken(null);
      setUnconfirmed(error.message.includes("Email not confirmed"));
      setResend("idle");
      setError(errorMessage(error.message, t));
    } else {
      localStorage.setItem(RETURNING_USER_KEY, "1");
      router.push(nextFromUrl());
      router.refresh();
    }
  }

  async function handleResend() {
    setResend("sending");
    const supabase = createClient();
    const next = nextFromUrl();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: form.email,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        captchaToken: captchaToken ?? undefined,
      },
    });
    resetTurnstile();
    setCaptchaToken(null);
    setResend(error ? "failed" : "sent");
  }

  async function handleGoogle() {
    localStorage.setItem(RETURNING_USER_KEY, "1");
    const supabase = createClient();
    // ?next=를 콜백에 실어 보낸다. Supabase 허용 목록이 쿼리까지 매칭하므로
    // `…/auth/callback?**` 와일드카드가 있어야 한다(비밀번호 재설정이 이미 같은 모양을 쓴다).
    // 없으면 Site URL(홈)로 떨어질 뿐이라 지금보다 나빠지진 않는다.
    const next = nextFromUrl();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
  }

  return (
    <main className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <nav className="flex items-center justify-between px-4 md:px-8 py-4 md:py-5">
        <Logo />
        <div className="flex items-center gap-4">
          <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
            {t.login.noAccount}
            <Link href={signupHref} style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 700, marginLeft: "8px" }}>{t.login.signupLink}</Link>
          </p>
          <LanguageToggle />
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8" style={{ opacity: isReturning === null ? 0 : 1, transition: "opacity 0.2s ease" }}>
            <h1 className="text-3xl font-black mb-2" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", letterSpacing: "-0.02em" }}>
              {isReturning ? t.login.welcomeBack : t.login.welcome}
            </h1>
            <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
              {isReturning ? t.login.welcomeBackSub : t.login.welcomeSub}
            </p>
          </div>

          {callbackError && (
            <div role="alert" className="mb-6 rounded-xl px-4 py-3 text-xs leading-relaxed"
              style={{ background: "var(--blue-tint)", color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
              {callbackError === "reset" ? (
                <>
                  {t.login.callbackResetFailed}{" "}
                  <Link href="/forgot-password" style={{ color: "var(--blue)", fontWeight: 700 }}>{t.login.callbackResetAgain}</Link>
                </>
              ) : (
                t.login.callbackConfirmFailed
              )}
            </div>
          )}

          <InAppBrowserNotice />

          <button type="button" onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-3 py-3 rounded-xl font-bold text-sm mb-6 transition-opacity hover:opacity-80"
            style={{ border: "1px solid var(--border-bright)", background: "var(--surface)", color: "var(--text-primary)", fontFamily: "var(--font-nunito)", cursor: "pointer" }}>
            <GoogleIcon />
            {t.auth.googleContinue}
          </button>

          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
            <span className="text-xs font-semibold" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>{t.auth.or}</span>
            <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-bold mb-1.5"
                style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", letterSpacing: "0.05em" }}>
                {t.auth.emailLabel}
              </label>
              <input className="vf-input" type="email" name="email" placeholder="hello@example.com"
                value={form.email} onChange={handleChange} required autoComplete="email" autoFocus />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold"
                  style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", letterSpacing: "0.05em" }}>
                  {t.auth.passwordLabel}
                </label>
                <Link href="/forgot-password" className="text-xs font-semibold"
                  style={{ color: "var(--blue)", textDecoration: "none", fontFamily: "var(--font-nunito)" }}>
                  {t.login.forgotPassword}
                </Link>
              </div>
              <div className="relative">
                <input className="vf-input" style={{ paddingRight: "3rem" }}
                  type={show ? "text" : "password"} name="password" placeholder="••••••••"
                  value={form.password} onChange={handleChange} required autoComplete="current-password" />
                <button type="button" onClick={() => setShow((v) => !v)}
                  aria-label={show ? t.auth.hidePassword : t.auth.showPassword}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px" }}>
                  {show ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm font-semibold text-center py-2 px-3 rounded-xl"
                style={{ color: "#ef4444", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", fontFamily: "var(--font-nunito)" }}>
                {error}
              </p>
            )}

            {unconfirmed && (
              <p className="text-xs text-center" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
                {resend === "sent" ? t.auth.resendSent : resend === "failed" ? t.auth.resendFailed : (
                  <button type="button" onClick={handleResend}
                    disabled={resend === "sending" || (turnstileEnabled && !captchaToken)}
                    style={{ color: "var(--blue)", fontWeight: 700, background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", fontFamily: "inherit", fontSize: "inherit" }}
                    className="disabled:opacity-50">
                    {resend === "sending" ? t.auth.resending : t.auth.resendButton}
                  </button>
                )}
              </p>
            )}

            <TurnstileWidget onToken={setCaptchaToken} />

            <button type="submit" disabled={loading || (turnstileEnabled && !captchaToken)}
              className="w-full py-3.5 rounded-xl font-black text-sm mt-2 transition-opacity hover:opacity-85 disabled:opacity-50"
              style={{ background: "var(--blue)", color: "var(--bg)", fontFamily: "var(--font-nunito)", cursor: loading ? "not-allowed" : "pointer", border: "none", boxShadow: "0 0 20px var(--blue-glow)" }}>
              {loading ? t.login.submitting : t.login.submit}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

function errorMessage(msg: string, t: Dictionary) {
  if (msg.includes("Invalid login")) return t.login.errors.invalid;
  if (msg.includes("Email not confirmed")) return t.login.errors.unconfirmed;
  if (msg.includes("Too many requests")) return t.auth.errors.tooMany;
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
