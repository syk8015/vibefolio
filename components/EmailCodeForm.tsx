"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import TurnstileWidget, { turnstileEnabled, resetTurnstile } from "@/components/TurnstileWidget";
import { useT } from "@/lib/i18n/client";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { firstTouch } from "@/lib/analytics-client";
import { LastUsedTag } from "@/components/SocialSignInButtons";
import { AuthTitle, ErrorLine, FieldLabel, Pill, SmallButton, SmallRow } from "@/components/auth/AuthParts";

// 비밀번호 없이 메일로 받은 6자리 코드로 들어가기(signInWithOtp → verifyOtp).
// 처음 보는 주소면 계정이 새로 생기고, 있으면 그 계정으로 들어간다 — 그래서 로그인·가입이
// 문 하나(components/auth/AuthDoor, 2026-10-02)이고 이게 그 문의 기본 길이다.
//
// Supabase 쪽 전제(대시보드, repo에 없음):
//  - 새 계정은 "Confirm signup", 기존 계정은 "Magic link" 템플릿으로 메일이 간다. 둘 다
//    {{ .Token }}을 보여줘야 한다 — 원본 docs/auth-emails/*.html.
//  - Email OTP Length = OTP_LENGTH(6). 다르면 자동 제출이 엉뚱한 길이에서 불린다.
//  - 보내기는 Turnstile을 요구한다(signInWithOtp도 캡차 대상). 확인(verifyOtp)은 아니다.
//    그래서 코드 단계의 보안 확인 칸은 [코드 다시 받기]를 누를 때만 뜬다.
export const OTP_LENGTH = 6;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 보내기 한 벌 — 문의 [이메일로 계속하기]와 코드 단계의 [코드 다시 받기]가 같이 쓴다.
function useSendCode(redirectTo: () => string) {
  const { t, locale } = useT();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  /** 보냈으면 다듬은 주소, 못 보냈으면 null(이유는 error에). */
  async function send(rawEmail: string, token: string | null): Promise<string | null> {
    const target = rawEmail.trim();
    if (!EMAIL_RE.test(target)) { setError(t.auth.errors.invalidEmail); return null; }
    setSending(true);
    setError("");
    const { error } = await createClient().auth.signInWithOtp({
      email: target,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: redirectTo(),
        captchaToken: token ?? undefined,
        // 새 계정일 때만 user_metadata로 들어간다(기존 계정은 무시) — 메일 템플릿 언어 분기와
        // 온보딩의 유입 경로 집계. username은 넣지 말 것(미들웨어의 "온보딩 끝" 표식).
        data: { locale, first_touch: firstTouch() },
      },
    });
    // 토큰은 1회용 — 성공이든 실패든 다 썼다.
    resetTurnstile();
    setCaptchaToken(null);
    setSending(false);
    if (error) { setError(sendErrorMessage(error.message, t)); return null; }
    return target;
  }

  return { send, sending, error, setError, captchaToken, setCaptchaToken };
}

/** 문의 기본 칸 — 이메일 하나 + [이메일로 계속하기]. 주소는 문이 쥐고 있다(비밀번호 칸과 같이 쓴다). */
export default function EmailCodeForm({
  email,
  onEmailChange,
  redirectTo,
  onSent,
  lastUsed = false,
  autoFocus = false,
  footer,
}: {
  email: string;
  onEmailChange: (value: string) => void;
  /** 메일 속 링크를 눌렀을 때 돌아올 곳(코드 대신 링크를 누르는 사람도 있다). */
  redirectTo: () => string;
  /** 보냈으면 그 주소로 — 문이 코드 단계로 바뀐다. */
  onSent: (sentTo: string) => void;
  /** 이 기기에서 지난번에 메일 코드로 들어왔으면 이름표 옆에 "지난번에 사용". */
  lastUsed?: boolean;
  autoFocus?: boolean;
  /** 버튼 밑 곁길 한 줄(비밀번호로 로그인 / 다른 방법으로). */
  footer?: React.ReactNode;
}) {
  const { t } = useT();
  const { send, sending, error, setError, captchaToken, setCaptchaToken } = useSendCode(redirectTo);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const sentTo = await send(email, captchaToken);
    if (sentTo) onSent(sentTo);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col">
      <FieldLabel htmlFor="auth-email" right={lastUsed ? <LastUsedTag /> : null}>{t.auth.emailLabel}</FieldLabel>
      <input id="auth-email" className="vf-input" type="email" name="email" placeholder="hello@example.com"
        value={email} onChange={(e) => { onEmailChange(e.target.value); setError(""); }}
        required autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus={autoFocus} />
      {error && <ErrorLine text={error} />}
      <TurnstileWidget onToken={setCaptchaToken} />
      <Pill type="submit" disabled={sending || (turnstileEnabled && !captchaToken)} className="mt-6">
        {sending ? t.auth.resending : t.auth.emailContinue}
      </Pill>
      {footer}
    </form>
  );
}

/** 코드 단계 — 보낸 뒤 문이 이 한 가지 일로 바뀐다(소셜 버튼·"또는"·약관 줄은 문이 숨긴다). */
export function CodeStep({ email, redirectTo, onVerified, onBack }: {
  email: string;
  redirectTo: () => string;
  onVerified: () => void;
  /** [다른 이메일로] — 주소를 채운 채 문으로 돌아간다. */
  onBack: () => void;
}) {
  const { t } = useT();
  const { send, sending, error, setError } = useSendCode(redirectTo);
  // 코드 단계에선 보안 확인 칸을 [코드 다시 받기]를 눌렀을 때만 띄운다 — 늘 떠 있으면
  // [확인] 버튼 아래에서 "이것도 해야 하나" 헷갈린다(2026-09-24 실브라우저 확인).
  const [resendOpen, setResendOpen] = useState(false);
  const [resent, setResent] = useState(false);
  // 새 코드를 보내면 칸을 새로 그린다 — 먼저 받은 코드는 이제 안 된다.
  const [round, setRound] = useState(0);

  // 보안 확인이 풀리는 순간 바로 보낸다 — 칸이 떴다가 한 번 더 누르게 하지 않는다.
  async function resend(token: string | null) {
    const ok = await send(email, token);
    setResendOpen(false);
    setResent(ok !== null);
    if (ok) setRound((r) => r + 1);
  }

  function requestResend() {
    setResent(false);
    setError("");
    if (turnstileEnabled) setResendOpen(true);
    else void resend(null);
  }

  return (
    <div className="flex flex-col">
      <AuthTitle>{t.auth.codeCheckTitle}</AuthTitle>
      <p className="mt-2.5 text-center"
        style={{ fontSize: "0.9375rem", lineHeight: 1.6, color: "var(--text-secondary)", overflowWrap: "anywhere" }}>
        {t.auth.codeSentBefore}
        <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>{email}</strong>
        {t.auth.codeSentAfter}
      </p>
      <CodeVerify key={round} email={email} onVerified={onVerified} />
      {error && <ErrorLine text={error} />}
      <SmallRow>
        <SmallButton onClick={requestResend} disabled={sending || resendOpen}>
          {sending || resendOpen ? t.auth.resending : t.auth.codeResend}
        </SmallButton>
        <span aria-hidden>·</span>
        <SmallButton onClick={onBack}>{t.auth.otherEmail}</SmallButton>
      </SmallRow>
      {resendOpen && (
        <div className="mt-3">
          <TurnstileWidget onToken={(token) => { if (token) void resend(token); }} />
        </div>
      )}
      {resent && (
        <p role="status" className="mt-3 text-center" style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
          {t.auth.codeResent}
        </p>
      )}
    </div>
  );
}

/** 여섯 칸 + [확인]. 진짜 입력칸은 하나 — 칸 위에 투명하게 덮어서 붙여넣기와
 *  autocomplete="one-time-code"(폰 키보드의 코드 제안)가 그대로 된다. 보이는 칸은 그 값을 나눠 그릴 뿐. */
function CodeVerify({ email, onVerified }: { email: string; onVerified: () => void }) {
  const { t } = useT();
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [focused, setFocused] = useState(false);

  async function verify(value: string) {
    if (value.length < OTP_LENGTH || verifying) return;
    setVerifying(true);
    setError("");
    // type "email"은 새 계정 확인 코드와 기존 계정 로그인 코드를 둘 다 받는다.
    const { error } = await createClient().auth.verifyOtp({ email, token: value, type: "email" });
    setVerifying(false);
    if (error) {
      setError(verifyErrorMessage(error.message, t));
      // 칸을 비운다 — 여섯 칸이 다 찬 채로는 새 코드를 붙여넣을 자리가 없다.
      setCode("");
      return;
    }
    onVerified();
  }

  // 타자·붙여넣기·자동완성이 모두 여기로 — 숫자만 남기고, 다 차면 바로 확인한다.
  function take(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, OTP_LENGTH);
    setCode(digits);
    setError("");
    if (digits.length === OTP_LENGTH) void verify(digits);
  }

  // 커서는 늘 맨 끝 — 칸은 앞에서부터 차고, 지우기는 뒤에서부터다.
  function caretToEnd(el: HTMLInputElement) {
    const end = el.value.length;
    if (el.selectionStart !== end || el.selectionEnd !== end) el.setSelectionRange(end, end);
  }

  const current = Math.min(code.length, OTP_LENGTH - 1);

  return (
    <form onSubmit={(e) => { e.preventDefault(); void verify(code); }} className="flex flex-col">
      <div className="relative mt-8">
        <div aria-hidden className="grid justify-center"
          style={{ gridTemplateColumns: `repeat(${OTP_LENGTH}, minmax(0, 54px))`, gap: "0.75rem" }}>
          {Array.from({ length: OTP_LENGTH }, (_, i) => {
            const active = focused && i === current;
            return (
              <span key={i}
                className="flex items-center justify-center rounded-xl transition-[background-color,box-shadow] duration-150 motion-reduce:transition-none"
                style={{
                  height: 62,
                  background: active ? "var(--surface)" : "var(--surface-soft)",
                  boxShadow: active ? "inset 0 0 0 1.5px var(--text-primary)" : "none",
                  color: "var(--text-primary)",
                  fontSize: "1.5rem",
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                }}>
                {code[i] ?? (active ? (
                  <span className="motion-safe:animate-pulse"
                    style={{ width: 2, height: 26, borderRadius: 1, background: "var(--text-primary)" }} />
                ) : null)}
              </span>
            );
          })}
        </div>
        <input name="code" value={code} aria-label={t.auth.codeLabel}
          onChange={(e) => take(e.target.value)}
          onPaste={(e) => {
            // 붙여넣은 게 코드 한 벌이면 통째로 바꾸고, 조각이면 뒤에 잇는다("123 456"·"123-456"도 된다).
            e.preventDefault();
            const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
            take(pasted.length >= OTP_LENGTH ? pasted : code + pasted);
          }}
          onFocus={(e) => { setFocused(true); caretToEnd(e.currentTarget); }}
          onBlur={() => setFocused(false)}
          onSelect={(e) => caretToEnd(e.currentTarget)}
          inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={OTP_LENGTH}
          autoFocus data-1p-ignore data-lpignore="true"
          className="absolute inset-0 w-full h-full selection:bg-transparent"
          style={{
            background: "transparent", border: 0, outline: "none", padding: 0,
            color: "transparent", caretColor: "transparent", fontSize: 16,
          }} />
      </div>
      {error && <ErrorLine text={error} />}
      <Pill type="submit" disabled={verifying || code.length < OTP_LENGTH} className="mt-7">
        {verifying ? t.auth.codeVerifying : t.auth.codeVerify}
      </Pill>
    </form>
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
