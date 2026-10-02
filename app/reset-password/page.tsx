"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/client";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { AuthShell, AuthTitle, ErrorLine, FieldLabel, PILL_STYLE, Pill } from "@/components/auth/AuthParts";

type Step = "loading" | "form" | "done" | "invalid";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { t } = useT();
  const [step, setStep] = useState<Step>("loading");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ password: "", confirm: "" });

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setStep(data.session ? "form" : "invalid");
    });
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError(t.resetPassword.errors.mismatch);
      return;
    }
    if (form.password.length < 8) {
      setError(t.auth.errors.passwordTooShort);
      return;
    }

    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: form.password });

    setLoading(false);
    if (error) {
      setError(errorMessage(error.message, t));
    } else {
      setStep("done");
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 1500);
    }
  }

  if (step === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <p className="text-sm font-semibold" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
          {t.resetPassword.checking}
        </p>
      </main>
    );
  }

  // 만료·잘못된 링크 — 경고 표시 + 제목 + 할 일 하나(설명 두 줄은 10-02에 뺐다).
  if (step === "invalid") {
    return (
      <AuthShell header={false}>
        <div className="flex flex-col items-center text-center">
          <div aria-hidden className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
            style={{ background: "color-mix(in srgb, var(--danger) 10%, transparent)" }}>
            ⚠️
          </div>
          <AuthTitle className="mt-6" size="1.6875rem">{t.resetPassword.invalidTitle}</AuthTitle>
          <Link href="/forgot-password" className="vf-button-primary mt-7" style={PILL_STYLE}>
            {t.resetPassword.requestAgain}
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (step === "done") {
    return (
      <AuthShell header={false}>
        <div className="flex flex-col items-center text-center">
          <div aria-hidden className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
            style={{ background: "var(--blue-tint)", border: "1px solid var(--blue)", color: "var(--text-primary)" }}>
            ✓
          </div>
          <AuthTitle className="mt-6" size="1.6875rem">{t.resetPassword.doneTitle}</AuthTitle>
          <p className="mt-2.5" style={{ fontSize: "0.9375rem", lineHeight: 1.6, color: "var(--text-secondary)" }}>
            {t.resetPassword.doneBody}
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthTitle>{t.resetPassword.title}</AuthTitle>
      <p className="mt-2.5 mb-7 text-center" style={{ fontSize: "0.9375rem", lineHeight: 1.6, color: "var(--text-secondary)" }}>
        {t.resetPassword.subtitle}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col">
        <FieldLabel htmlFor="reset-password">{t.resetPassword.newPasswordLabel}</FieldLabel>
        <div className="relative">
          <input id="reset-password" className="vf-input" style={{ paddingRight: "3rem" }}
            type={show ? "text" : "password"} name="password" placeholder={t.resetPassword.passwordPlaceholder}
            value={form.password} onChange={handleChange} required minLength={8} autoComplete="new-password" autoFocus />
          <button type="button" onClick={() => setShow((v) => !v)}
            aria-label={show ? t.auth.hidePassword : t.auth.showPassword}
            className="absolute right-3 top-1/2 -translate-y-1/2 flex"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px" }}>
            {show ? <EyeOff /> : <Eye />}
          </button>
        </div>

        <FieldLabel htmlFor="reset-confirm" className="mt-[18px]">{t.resetPassword.confirmLabel}</FieldLabel>
        <input id="reset-confirm" className="vf-input"
          type={show ? "text" : "password"} name="confirm" placeholder={t.resetPassword.confirmPlaceholder}
          value={form.confirm} onChange={handleChange} required minLength={8} autoComplete="new-password" />

        {error && <ErrorLine text={error} />}

        <Pill type="submit" disabled={loading} className="mt-6">
          {loading ? t.resetPassword.submitting : t.resetPassword.submit}
        </Pill>
      </form>
    </AuthShell>
  );
}

function errorMessage(msg: string, t: Dictionary) {
  if (msg.includes("should be different") || msg.includes("same_password")) return t.resetPassword.errors.samePassword;
  if (msg.includes("Password") || msg.includes("password")) return t.auth.errors.passwordTooShort;
  if (msg.includes("session") || msg.includes("expired")) return t.resetPassword.errors.sessionExpired;
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
