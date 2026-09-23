"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import TurnstileWidget, { turnstileEnabled, resetTurnstile } from "@/components/TurnstileWidget";
import { useT } from "@/lib/i18n/client";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { firstTouch } from "@/lib/analytics-client";

// 비밀번호 없이 메일로 받은 6자리 코드로 들어가기(signInWithOtp → verifyOtp).
// 처음 보는 주소면 계정이 새로 생긴다 — 그래서 로그인·가입 화면 모두에서 같은 폼을 쓴다.
//
// Supabase 쪽 전제(대시보드, repo에 없음):
//  - 새 계정은 "Confirm signup", 기존 계정은 "Magic link" 템플릿으로 메일이 간다. 둘 다
//    {{ .Token }}을 보여줘야 한다 — 원본 docs/auth-emails/*.html.
//  - Email OTP Length = OTP_LENGTH(6). 다르면 자동 제출이 엉뚱한 길이에서 불린다.
//  - 보내기는 Turnstile을 요구한다(signInWithOtp도 캡차 대상). 확인(verifyOtp)은 아니다.
//    그래서 코드 단계의 보안 확인 칸은 [코드 다시 받기]를 누를 때만 뜬다.
export const OTP_LENGTH = 6;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmailCodeForm({
  initialEmail = "",
  redirectTo,
  onVerified,
  onUsePassword,
}: {
  initialEmail?: string;
  /** 메일 속 링크를 눌렀을 때 돌아올 곳(코드 대신 링크를 누르는 사람도 있다). */
  redirectTo: () => string;
  onVerified: () => void;
  onUsePassword: () => void;
}) {
  const { t, locale } = useT();
  const [email, setEmail] = useState(initialEmail);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // 코드 단계에선 보안 확인 칸을 [코드 다시 받기]를 눌렀을 때만 띄운다 — 늘 떠 있으면
  // [확인] 버튼 아래에서 "이것도 해야 하나" 헷갈린다(2026-09-24 실브라우저 확인).
  const [resendOpen, setResendOpen] = useState(false);
  const [resent, setResent] = useState(false);

  async function send(token: string | null): Promise<boolean> {
    const target = email.trim();
    if (!EMAIL_RE.test(target)) { setError(t.auth.errors.invalidEmail); return false; }
    setSending(true);
    setError("");
    const { error } = await createClient().auth.signInWithOtp({
      email: target,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: redirectTo(),
        captchaToken: token ?? undefined,
        // 새 계정일 때만 user_metadata로 들어간다(기존 계정은 무시). 가입 폼과 같은 이유 —
        // 메일 템플릿 언어 분기와 온보딩의 유입 경로 집계. username은 넣지 말 것(온보딩 표식).
        data: { locale, first_touch: firstTouch() },
      },
    });
    // 토큰은 1회용 — 성공이든 실패든 다 썼다.
    resetTurnstile();
    setCaptchaToken(null);
    setSending(false);
    if (error) { setError(sendErrorMessage(error.message, t)); return false; }
    setSentTo(target);
    return true;
  }

  // 보안 확인이 풀리는 순간 바로 보낸다 — 칸이 떴다가 한 번 더 누르게 하지 않는다.
  async function resend(token: string | null) {
    const ok = await send(token);
    setResendOpen(false);
    setResent(ok);
  }

  function requestResend() {
    setResent(false);
    setError("");
    if (turnstileEnabled) setResendOpen(true);
    else void resend(null);
  }

  if (sentTo) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
          {t.auth.codeSentTo}<br />
          <strong style={{ color: "var(--text-primary)" }}>{sentTo}</strong>
        </p>
        <CodeVerify email={sentTo} onVerified={onVerified} autoFocus />
        {error && <ErrorLine text={error} />}
        <div className="flex items-center justify-between text-xs font-bold" style={{ fontFamily: "var(--font-nunito)" }}>
          <LinkButton onClick={() => { setSentTo(null); setError(""); setResendOpen(false); setResent(false); }}>
            {t.auth.codeChangeEmail}
          </LinkButton>
          <LinkButton onClick={requestResend} disabled={sending || resendOpen}>
            {sending || resendOpen ? t.auth.resending : t.auth.codeResend}
          </LinkButton>
        </div>
        {resendOpen && <TurnstileWidget onToken={(token) => { if (token) void resend(token); }} />}
        {resent && (
          <p className="text-xs text-center" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
            {t.auth.codeResent}
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void send(captchaToken); }} className="flex flex-col gap-4">
      <div>
        <label className="block text-xs font-bold mb-1.5"
          style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", letterSpacing: "0.05em" }}>
          {t.auth.emailLabel}
        </label>
        <input className="vf-input" type="email" name="email" placeholder="hello@example.com"
          value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }}
          required autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        <p className="mt-1.5 text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
          {t.auth.codeNewAccountHint}
        </p>
      </div>
      {error && <ErrorLine text={error} />}
      <TurnstileWidget onToken={setCaptchaToken} />
      <button type="submit" disabled={sending || (turnstileEnabled && !captchaToken)}
        className="w-full py-3.5 rounded-xl font-black text-sm mt-2 transition-opacity hover:opacity-85 disabled:opacity-50"
        style={{ background: "var(--blue)", color: "var(--bg)", fontFamily: "var(--font-nunito)", cursor: sending ? "not-allowed" : "pointer", border: "none", boxShadow: "0 0 20px var(--blue-glow)" }}>
        {sending ? t.auth.resending : t.auth.codeSend}
      </button>
      <p className="text-center text-xs" style={{ fontFamily: "var(--font-nunito)" }}>
        <LinkButton onClick={onUsePassword}>{t.auth.passwordInstead}</LinkButton>
      </p>
    </form>
  );
}

/** 코드 입력 칸 하나. 비밀번호 가입의 "메일 확인" 화면도 이걸 쓴다(다른 기기에서 메일을
 *  열어 링크가 이 브라우저로 안 이어질 때, 코드를 옮겨 적으면 여기서 끝난다). */
export function CodeVerify({ email, onVerified, autoFocus }: {
  email: string;
  onVerified: () => void;
  autoFocus?: boolean;
}) {
  const { t } = useT();
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  async function verify(value: string) {
    if (value.length < OTP_LENGTH || verifying) return;
    setVerifying(true);
    setError("");
    // type "email"은 새 계정 확인 코드와 기존 계정 로그인 코드를 둘 다 받는다.
    const { error } = await createClient().auth.verifyOtp({ email, token: value, type: "email" });
    setVerifying(false);
    if (error) { setError(verifyErrorMessage(error.message, t)); return; }
    onVerified();
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH);
    setCode(digits);
    setError("");
    // 붙여넣기·자동완성으로 한 번에 다 들어오면 바로 확인한다.
    if (digits.length === OTP_LENGTH) verify(digits);
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); verify(code); }} className="flex flex-col gap-3">
      <label className="block text-xs font-bold"
        style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", letterSpacing: "0.05em" }}>
        {t.auth.codeLabel}
        <input className="vf-input mt-1.5" name="code" value={code} onChange={handleChange}
          inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={OTP_LENGTH}
          placeholder={"0".repeat(OTP_LENGTH)} autoFocus={autoFocus}
          style={{ letterSpacing: "0.4em", fontSize: "1.25rem", textAlign: "center", fontVariantNumeric: "tabular-nums" }} />
      </label>
      {error && <ErrorLine text={error} />}
      <button type="submit" disabled={verifying || code.length < OTP_LENGTH}
        className="w-full py-3.5 rounded-xl font-black text-sm transition-opacity hover:opacity-85 disabled:opacity-50"
        style={{ background: "var(--blue)", color: "var(--bg)", fontFamily: "var(--font-nunito)", cursor: verifying ? "not-allowed" : "pointer", border: "none" }}>
        {verifying ? t.auth.codeVerifying : t.auth.codeVerify}
      </button>
    </form>
  );
}

function ErrorLine({ text }: { text: string }) {
  return (
    <p role="alert" className="text-sm font-semibold text-center py-2 px-3 rounded-xl"
      style={{ color: "#ef4444", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", fontFamily: "var(--font-nunito)" }}>
      {text}
    </p>
  );
}

export function LinkButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="disabled:opacity-50"
      style={{ color: "var(--blue)", fontWeight: 700, background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", fontFamily: "inherit", fontSize: "inherit" }}>
      {children}
    </button>
  );
}

function sendErrorMessage(msg: string, t: Dictionary) {
  // "For security purposes, you can only request this after N seconds." — 같은 주소 60초 제한.
  if (msg.includes("security purposes") || msg.includes("Too many") || msg.includes("rate limit")) return t.auth.errors.codeWait;
  if (msg.toLowerCase().includes("captcha")) return t.auth.errors.captcha;
  if (msg.includes("valid email")) return t.auth.errors.invalidEmail;
  return t.auth.errors.generic;
}

function verifyErrorMessage(msg: string, t: Dictionary) {
  if (msg.includes("expired") || msg.includes("invalid")) return t.auth.errors.codeInvalid;
  if (msg.includes("Too many")) return t.auth.errors.tooMany;
  return t.auth.errors.generic;
}
