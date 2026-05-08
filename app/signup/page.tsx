"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Step = "form" | "check-email";

export default function SignupPage() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState<Step>("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", username: "", email: "", password: "" });

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
          username: form.username,
        },
      },
    });

    setLoading(false);
    if (error) {
      setError(errorMessage(error.message));
    } else {
      setStep("check-email");
    }
  }

  async function handleGoogle() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/demo` },
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
            이메일을 확인해주세요
          </h1>
          <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
            <strong style={{ color: "var(--text-primary)" }}>{form.email}</strong> 로<br />
            인증 링크를 보냈어요. 메일함을 확인해주세요.
          </p>
          <Link
            href="/login"
            className="text-sm font-bold"
            style={{ color: "var(--blue)", textDecoration: "none", fontFamily: "var(--font-nunito)" }}
          >
            로그인 페이지로 →
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <nav className="flex items-center justify-between px-8 py-5">
        <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "8px" }}>
          <div className="w-2 h-2 rounded-full" style={{ background: "var(--blue)", boxShadow: "0 0 8px var(--blue)" }} />
          <span className="font-black text-base" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>Vibefolio</span>
        </Link>
        <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
          이미 계정이 있나요?{" "}
          <Link href="/login" style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 700 }}>로그인</Link>
        </p>
      </nav>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-3xl font-black mb-2" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", letterSpacing: "-0.02em" }}>
              시작하기
            </h1>
            <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
              무료로 나만의 포트폴리오를 만들어보세요.
            </p>
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-3 py-3 rounded-xl font-bold text-sm mb-6 transition-opacity hover:opacity-80"
            style={{ border: "1px solid var(--border-bright)", background: "var(--surface)", color: "var(--text-primary)", fontFamily: "var(--font-nunito)", cursor: "pointer" }}
          >
            <GoogleIcon />
            Google로 계속하기
          </button>

          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
            <span className="text-xs font-semibold" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>또는</span>
            <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field label="이름">
              <input className="vf-input" type="text" name="name" placeholder="홍길동"
                value={form.name} onChange={handleChange} required autoComplete="name" />
            </Field>

            <Field label="사용자 이름">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold pointer-events-none"
                  style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>@</span>
                <input className="vf-input" style={{ paddingLeft: "1.75rem" }}
                  type="text" name="username" placeholder="alexvibe"
                  value={form.username} onChange={handleChange} required
                  pattern="[a-zA-Z0-9_-]+" title="영문, 숫자, _-만 사용 가능해요" />
              </div>
              {form.username && (
                <p className="mt-1 text-xs font-semibold" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
                  vibefolio.com/{form.username}
                </p>
              )}
            </Field>

            <Field label="이메일">
              <input className="vf-input" type="email" name="email" placeholder="hello@example.com"
                value={form.email} onChange={handleChange} required autoComplete="email" />
            </Field>

            <Field label="비밀번호">
              <div className="relative">
                <input className="vf-input" style={{ paddingRight: "3rem" }}
                  type={show ? "text" : "password"} name="password" placeholder="8자 이상"
                  value={form.password} onChange={handleChange} required minLength={8} autoComplete="new-password" />
                <button type="button" onClick={() => setShow((v) => !v)}
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

            <button type="submit" disabled={loading}
              className="w-full py-3.5 rounded-xl font-black text-sm mt-2 transition-opacity hover:opacity-85 disabled:opacity-50"
              style={{ background: "var(--blue)", color: "#fff", fontFamily: "var(--font-nunito)", cursor: loading ? "not-allowed" : "pointer", border: "none", boxShadow: "0 0 20px var(--blue-glow)" }}>
              {loading ? "가입 중..." : "무료로 시작하기"}
            </button>
          </form>

          <p className="text-center text-xs mt-6 leading-relaxed" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
            가입하면{" "}
            <Link href="/terms" style={{ color: "var(--text-secondary)", textDecoration: "underline" }}>이용약관</Link>
            {" "}및{" "}
            <Link href="/privacy" style={{ color: "var(--text-secondary)", textDecoration: "underline" }}>개인정보처리방침</Link>에 동의하게 됩니다.
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

function errorMessage(msg: string) {
  if (msg.includes("already registered")) return "이미 사용 중인 이메일이에요.";
  if (msg.includes("Password")) return "비밀번호는 8자 이상이어야 해요.";
  if (msg.includes("valid email")) return "올바른 이메일 형식을 입력해주세요.";
  return "오류가 발생했어요. 잠시 후 다시 시도해주세요.";
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
