"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import TurnstileWidget, { turnstileEnabled, resetTurnstile } from "@/components/TurnstileWidget";
import { useT } from "@/lib/i18n/client";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { safeNext } from "@/lib/safeNext";
import { adoptHandoffTouch, type FirstTouchData } from "@/lib/analytics-client";
import InAppBrowserNotice from "@/components/InAppBrowserNotice";
import SocialSignInButtons, { LastUsedTag } from "@/components/SocialSignInButtons";
import EmailCodeForm, { CodeStep } from "@/components/EmailCodeForm";
import { rememberLoginMethod, withVia, type LoginMethod } from "@/lib/lastLogin";
import { AuthShell, AuthTitle, ErrorLine, FieldLabel, Pill, SmallButton, SmallRow } from "./AuthParts";

// 로그인·가입 = 문 하나(2026-10-02 덜어내기 2차). /login과 /signup이 같은 화면이라 계정이 있는지
// 몰라도 된다 — 이메일만 넣으면 메일 코드가 가고, 처음 보는 주소면 그 코드로 계정이 생긴다.
// 새 계정은 메일 코드·구글·깃허브로만 생긴다(비밀번호 가입 폼은 없앴다). 비밀번호 **로그인**은
// [비밀번호로 로그인] 뒤에 그대로 있다.
//
// 첫 모습(코드/비밀번호, 콜백 실패 안내)은 서버가 정해 넘긴다(./doorStart) — 처음 그린 화면이
// 바뀌어 뛰지 않게.

export type DoorNotice = "oauth" | "reset" | "confirm";

export interface DoorStart {
  mode: "code" | "password";
  notice: DoorNotice | null;
  /** 이 기기에서 지난번에 쓴 방법(쿠키 vf-last-login) — "지난번에 사용" 표시. */
  lastMethod: LoginMethod | null;
}

/** 폰 → 컴퓨터 넘기기 메일 링크(/signup?h=<id>)로 온 사람 — 서버가 찾아 준 값(docs/desktop-handoff.md). */
export interface AuthHandoff {
  id: string;
  email: string;
  firstTouch: Partial<FirstTouchData> | null;
}

// 로그인 뒤 돌아갈 곳(?next=, /publish에서 온 사람 등). 클릭 시점에 주소에서 읽는다.
// 기본은 대시보드 — 홈("/")은 로그인한 사람에겐 버튼 두 개짜리 중간 화면이다.
function nextFromUrl(): string {
  return safeNext(new URLSearchParams(location.search).get("next"), "/dashboard");
}

// ?next=를 콜백에 실어 보낸다. Supabase 허용 목록이 쿼리까지 매칭하므로
// `…/auth/callback?**` 와일드카드가 있어야 한다(없으면 Site URL=홈으로 떨어질 뿐).
function callbackUrl(): string {
  return `${location.origin}/auth/callback?next=${encodeURIComponent(nextFromUrl())}`;
}

const codeRedirect = () => withVia(callbackUrl(), "code");

export default function AuthDoor({ start, handoff = null }: { start: DoorStart; handoff?: AuthHandoff | null }) {
  const { t } = useT();
  const router = useRouter();
  const [mode, setMode] = useState(start.mode);
  // 주소는 문이 쥔다 — 코드 칸과 비밀번호 칸을 오가도 적은 주소가 남는다. 메일 링크로 왔으면 서버가 채운 값.
  const [email, setEmail] = useState(handoff?.email ?? "");
  // 코드를 보낸 주소 — 있으면 문이 코드 단계로 바뀐다.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [notice, setNotice] = useState(start.notice);
  // 메일 링크로 왔으면 구글·깃허브(와 비밀번호)를 [다른 방법으로] 뒤로 접는다 — 채워진 이메일 칸이
  // 아래로 밀려 보이지 않게(09-24 사용자 지시).
  const [showSocial, setShowSocial] = useState(!handoff);
  // 사람이 길을 바꿨을 때만 칸에 초점을 준다 — 처음 열린 문에선 구글·깃허브를 고를 수도 있다.
  const [moved, setMoved] = useState(false);
  const last = start.lastMethod;

  // 메일 링크로 왔으면 폰의 광고 출처를 이 브라우저 first-touch로 옮기고(가입 메타데이터·온보딩
  // signup_completed가 싣는다), "열림"을 서버에 찍는다. 서버 렌더는 읽기만 한다 — 메일 보안
  // 검사기가 링크를 미리 열어도 열린 것으로 세지 않게.
  useEffect(() => {
    if (!handoff) return;
    adoptHandoffTouch(handoff.id, handoff.firstTouch);
    void fetch("/api/handoff/open", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: handoff.id }),
      keepalive: true,
    }).catch(() => {});
  }, [handoff]);

  // 비밀번호·메일 코드는 이 화면에서 끝나 콜백을 안 거친다 — 방법을 여기서 기억한다. 프로필 없는
  // 새 계정은 미들웨어가 온보딩(?next= 유지)으로 돌린다.
  function finishSignIn(method: LoginMethod) {
    rememberLoginMethod(method);
    router.push(nextFromUrl());
    router.refresh();
  }

  function switchMode(next: "code" | "password") {
    setMode(next);
    setMoved(true);
  }

  if (sentTo) {
    return (
      <AuthShell>
        <CodeStep email={sentTo} redirectTo={codeRedirect} onVerified={() => finishSignIn("code")}
          onBack={() => { setSentTo(null); setMoved(true); }} />
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthTitle className="mb-7">{t.login.title}</AuthTitle>
      {notice && <CallbackNotice kind={notice} />}
      {mode === "password" ? (
        <PasswordForm email={email} onEmailChange={setEmail} lastMethod={last}
          onDone={() => finishSignIn("password")} onUseCode={() => switchMode("code")} />
      ) : (
        <>
          {showSocial && (
            <>
              <InAppBrowserNotice />
              <SocialSignInButtons redirectTo={callbackUrl} />
              <OrDivider label={t.auth.or} />
            </>
          )}
          <EmailCodeForm email={email} onEmailChange={setEmail} redirectTo={codeRedirect}
            onSent={(to) => { setSentTo(to); setNotice(null); }}
            lastUsed={last === "code"} autoFocus={moved}
            footer={
              <SmallRow>
                {showSocial ? (
                  <>
                    <SmallButton onClick={() => switchMode("password")}>{t.auth.passwordInstead}</SmallButton>
                    {last === "password" && <LastUsedTag />}
                  </>
                ) : (
                  <SmallButton onClick={() => setShowSocial(true)}>{t.login.otherWays}</SmallButton>
                )}
              </SmallRow>
            } />
          <Terms />
        </>
      )}
    </AuthShell>
  );
}

// 인증 콜백 실패 안내 — 실패는 늘 보인다(코드 단계로 넘어가면 접는다).
function CallbackNotice({ kind }: { kind: DoorNotice }) {
  const { t } = useT();
  return (
    <div role="alert" className="mb-6 rounded-xl px-4 py-3"
      style={{ background: "var(--blue-tint)", color: "var(--text-primary)", fontSize: "0.875rem", lineHeight: 1.6, wordBreak: "keep-all" }}>
      {kind === "oauth" ? t.login.callbackOauthFailed : kind === "reset" ? (
        <>
          {t.login.callbackResetFailed}{" "}
          <Link href="/forgot-password" style={{ color: "var(--blue)", fontWeight: 700 }}>{t.login.callbackResetAgain}</Link>
        </>
      ) : (
        t.login.callbackConfirmFailed
      )}
    </div>
  );
}

function OrDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
      <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-muted)" }}>{label}</span>
      <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
    </div>
  );
}

// 맨 아래 한 줄 — 계정은 여기서(코드·구글·깃허브) 생기므로 문에만 둔다.
function Terms() {
  const { t } = useT();
  const link: React.CSSProperties = { color: "inherit", textDecoration: "underline", textUnderlineOffset: 3 };
  return (
    <p className="mt-7 text-center"
      style={{ fontSize: "0.8125rem", lineHeight: 1.6, color: "var(--text-muted)", wordBreak: "keep-all" }}>
      {t.login.agreePrefix}
      <Link href="/terms" style={link}>{t.login.termsLink}</Link>
      {t.login.agreeAnd}
      <Link href="/privacy" style={link}>{t.login.privacyLink}</Link>
      {t.login.agreeSuffix}
    </p>
  );
}

// 비밀번호 로그인 — 이미 비밀번호가 있는 계정만(가입은 없다). 지난번에 비밀번호로 들어온 기기면
// 문이 처음부터 이 모습으로 열린다.
function PasswordForm({ email, onEmailChange, lastMethod, onDone, onUseCode }: {
  email: string;
  onEmailChange: (value: string) => void;
  lastMethod: LoginMethod | null;
  onDone: () => void;
  onUseCode: () => void;
}) {
  const { t } = useT();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // "이메일 미인증"으로 막힌 사람(옛 비밀번호 가입 계정)에게 인증 메일을 다시 보내는 버튼 상태.
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resend, setResend] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await createClient().auth.signInWithPassword({
      email: email.trim(),
      password,
      options: { captchaToken: captchaToken ?? undefined },
    });
    setLoading(false);
    if (error) {
      // Turnstile tokens are single-use — the failed attempt consumed this one.
      resetTurnstile();
      setCaptchaToken(null);
      setUnconfirmed(error.message.includes("Email not confirmed"));
      setResend("idle");
      setError(passwordErrorMessage(error.message, t));
    } else {
      onDone();
    }
  }

  async function handleResend() {
    setResend("sending");
    const { error } = await createClient().auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: withVia(callbackUrl(), "password"), captchaToken: captchaToken ?? undefined },
    });
    resetTurnstile();
    setCaptchaToken(null);
    setResend(error ? "failed" : "sent");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col">
      <FieldLabel htmlFor="auth-email" right={lastMethod === "password" ? <LastUsedTag /> : null}>
        {t.auth.emailLabel}
      </FieldLabel>
      <input id="auth-email" className="vf-input" type="email" name="email" placeholder="hello@example.com"
        value={email} onChange={(e) => { onEmailChange(e.target.value); setError(""); }}
        required autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus={!email} />

      <FieldLabel htmlFor="auth-password" className="mt-[18px]"
        right={
          <Link href="/forgot-password" style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary)" }}>
            {t.login.forgotPassword}
          </Link>
        }>
        {t.auth.passwordLabel}
      </FieldLabel>
      <div className="relative">
        <input id="auth-password" className="vf-input" style={{ paddingRight: "3rem" }}
          type={show ? "text" : "password"} name="password" placeholder="••••••••"
          value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }}
          required autoComplete="current-password" autoFocus={!!email} />
        <button type="button" onClick={() => setShow((v) => !v)}
          aria-label={show ? t.auth.hidePassword : t.auth.showPassword}
          className="absolute right-3 top-1/2 -translate-y-1/2 flex"
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px" }}>
          {show ? <EyeOff /> : <Eye />}
        </button>
      </div>

      {error && <ErrorLine text={error} />}

      {unconfirmed && (
        <p className="mt-2 text-center" style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
          {resend === "sent" ? t.auth.resendSent : resend === "failed" ? t.auth.resendFailed : (
            <SmallButton onClick={handleResend} disabled={resend === "sending" || (turnstileEnabled && !captchaToken)}
              style={{ color: "var(--text-primary)", fontWeight: 600 }}>
              {resend === "sending" ? t.auth.resending : t.auth.resendButton}
            </SmallButton>
          )}
        </p>
      )}

      <TurnstileWidget onToken={setCaptchaToken} />

      <Pill type="submit" disabled={loading || (turnstileEnabled && !captchaToken)} className="mt-6">
        {loading ? t.login.submitting : t.login.submit}
      </Pill>
      <SmallRow>
        <SmallButton onClick={onUseCode}>{t.auth.codeInstead}</SmallButton>
        {lastMethod === "code" && <LastUsedTag />}
      </SmallRow>
    </form>
  );
}

function passwordErrorMessage(msg: string, t: Dictionary) {
  if (msg.includes("Invalid login")) return t.login.errors.invalid;
  if (msg.includes("Email not confirmed")) return t.login.errors.unconfirmed;
  if (msg.includes("Too many requests")) return t.auth.errors.tooMany;
  if (msg.toLowerCase().includes("captcha")) return t.auth.errors.captcha;
  return t.auth.errors.generic;
}

function Eye() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  );
}
function EyeOff() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}
