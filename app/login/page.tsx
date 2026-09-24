"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import TurnstileWidget, { turnstileEnabled, resetTurnstile } from "@/components/TurnstileWidget";
import Logo from "@/components/Logo";
import LanguageToggle from "@/components/LanguageToggle";
import { useT } from "@/lib/i18n/client";
import { safeNext } from "@/lib/safeNext";
import InAppBrowserNotice from "@/components/InAppBrowserNotice";
import SocialSignInButtons, { LastUsedTag } from "@/components/SocialSignInButtons";
import EmailCodeForm, { LinkButton } from "@/components/EmailCodeForm";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { readLastLoginMethod, rememberLoginMethod, withVia, type LoginMethod } from "@/lib/lastLogin";

const RETURNING_USER_KEY = "vf-returning-user";
const noopSubscribe = () => () => {};

// 로그인 뒤 돌아갈 곳. useSearchParams는 Suspense 경계를 요구해서, 클릭 시점에 주소를 읽는다.
// 기본은 대시보드 — 홈("/")은 로그인한 사람에겐 버튼 두 개짜리 중간 화면이다.
function nextFromUrl(): string {
  return safeNext(new URLSearchParams(location.search).get("next"), "/dashboard");
}

export default function LoginPage() {
  const router = useRouter();
  const { t } = useT();
  const [show, setShow] = useState(false);
  // 비밀번호 대신 메일 코드로 들어가는 모드(EmailCodeForm). 처음 보는 주소면 계정이 생긴다.
  const [mode, setMode] = useState<"password" | "code">("password");
  // 이 기기에서 지난번에 쓴 방법(lib/lastLogin) — 그 입구에 "지난번에 사용"을 붙인다.
  const lastMethod = useSyncExternalStore(noopSubscribe, readLastLoginMethod, () => null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ email: "", password: "" });
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [isReturning, setIsReturning] = useState<boolean | null>(null);
  // 인증 콜백 실패(?error=auth)로 왔을 때의 안내 — 재설정 링크였는지 가입 인증이었는지로 가른다.
  // oauth = 구글·깃허브 화면에서 취소했거나 공급자가 거절(콜백에 ?error=가 실려 온 경우).
  const [callbackError, setCallbackError] = useState<"reset" | "confirm" | "oauth" | null>(null);
  // "이메일 미인증"으로 막힌 사람에게 인증 메일을 다시 보내는 버튼 상태.
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resend, setResend] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  // 가입 링크에 ?next=를 이어 붙인다(/publish에서 온 신규 사용자가 길을 잃지 않게).
  const [signupHref, setSignupHref] = useState("/signup");

  useEffect(() => {
    setIsReturning(localStorage.getItem(RETURNING_USER_KEY) === "1");
    const params = new URLSearchParams(location.search);
    if (params.get("error") === "oauth") setCallbackError("oauth");
    else if (params.get("error") === "auth") {
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
      finishSignIn("password");
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
        emailRedirectTo: withVia(`${location.origin}/auth/callback?next=${encodeURIComponent(next)}`, "password"),
        captchaToken: captchaToken ?? undefined,
      },
    });
    resetTurnstile();
    setCaptchaToken(null);
    setResend(error ? "failed" : "sent");
  }

  function finishSignIn(method: LoginMethod) {
    rememberLoginMethod(method);
    localStorage.setItem(RETURNING_USER_KEY, "1");
    router.push(nextFromUrl());
    router.refresh();
  }

  // ?next=를 콜백에 실어 보낸다. Supabase 허용 목록이 쿼리까지 매칭하므로
  // `…/auth/callback?**` 와일드카드가 있어야 한다(비밀번호 재설정이 이미 같은 모양을 쓴다).
  // 없으면 Site URL(홈)로 떨어질 뿐이라 지금보다 나빠지진 않는다.
  function callbackUrl() {
    return `${location.origin}/auth/callback?next=${encodeURIComponent(nextFromUrl())}`;
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
              {callbackError === "oauth" ? t.login.callbackOauthFailed : callbackError === "reset" ? (
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

          <SocialSignInButtons redirectTo={callbackUrl}
            onBeforeRedirect={() => localStorage.setItem(RETURNING_USER_KEY, "1")} />

          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
            <span className="text-xs font-semibold" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>{t.auth.or}</span>
            <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
          </div>

          {mode === "code" ? (
            <EmailCodeForm initialEmail={form.email} redirectTo={() => withVia(callbackUrl(), "code")}
              onVerified={() => finishSignIn("code")} onUsePassword={() => setMode("password")} />
          ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold"
                  style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", letterSpacing: "0.05em" }}>
                  {t.auth.emailLabel}
                </label>
                {lastMethod === "password" && <LastUsedTag />}
              </div>
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
            <p className="text-center text-xs" style={{ fontFamily: "var(--font-nunito)" }}>
              <LinkButton onClick={() => { setMode("code"); setError(""); }}>{t.auth.codeInstead}</LinkButton>
              {lastMethod === "code" && <span className="ml-2 align-middle"><LastUsedTag /></span>}
            </p>
          </form>
          )}
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
