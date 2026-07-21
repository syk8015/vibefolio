"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import TurnstileWidget, { turnstileEnabled, resetTurnstile } from "@/components/TurnstileWidget";
import Logo from "@/components/Logo";

type Step = "form" | "sent";

export default function ForgotPasswordPage() {
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
      setError(errorMessage(error.message));
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
            메일을 확인해주세요
          </h1>
          <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
            <strong style={{ color: "var(--text-primary)" }}>{email}</strong> 로<br />
            비밀번호 재설정 링크를 보냈어요.
          </p>
          <Link
            href="/login"
            className="text-sm font-bold"
            style={{ color: "var(--blue)", textDecoration: "none", fontFamily: "var(--font-nunito)" }}
          >
            로그인 페이지로 →
          </Link>
          <p className="text-xs mt-6 leading-relaxed" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
            메일이 오지 않았거나 이메일을 잘못 입력했나요?{" "}
            <button type="button" onClick={backToForm}
              style={{ color: "var(--blue)", fontWeight: 700, background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", fontFamily: "inherit", fontSize: "inherit" }}>
              다시 입력하기
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
        <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
          비밀번호가 기억났나요?
          <Link href="/login" style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 700, marginLeft: "8px" }}>로그인</Link>
        </p>
      </nav>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-3xl font-black mb-2" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", letterSpacing: "-0.02em" }}>
              비밀번호 찾기
            </h1>
            <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
              가입한 이메일로 재설정 링크를 보내드릴게요.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-bold mb-1.5"
                style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", letterSpacing: "0.05em" }}>
                이메일
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
              {loading ? "보내는 중..." : "재설정 링크 보내기"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

function errorMessage(msg: string) {
  if (msg.includes("rate limit") || msg.includes("Too many")) return "잠시 후 다시 시도해주세요.";
  if (msg.includes("valid email")) return "올바른 이메일 형식을 입력해주세요.";
  if (msg.toLowerCase().includes("captcha")) return "보안 확인에 실패했어요. 다시 확인 후 시도해주세요.";
  return "오류가 발생했어요. 잠시 후 다시 시도해주세요.";
}
