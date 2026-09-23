"use client";

import { useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import LanguageToggle from "@/components/LanguageToggle";
import TurnstileWidget, { turnstileEnabled, resetTurnstile } from "@/components/TurnstileWidget";
import { useT } from "@/lib/i18n/client";
import { firstTouch } from "@/lib/analytics-client";

// 폰 → 컴퓨터 넘기기(docs/desktop-handoff.md). 랜딩의 폰 폭 [시작하기]가 여기로 온다.
// Nookframe은 컴퓨터의 AI 도구로 올리는 곳이라, 폰에서는 가입을 시키는 대신 이메일
// 하나만 받아 컴퓨터에서 열 링크를 보낸다(Framer·Ableton의 "Email me a link"와 같은 모양).
// 알림은 선택 체크박스(기본 꺼짐) — 링크 메일과 알림 동의를 떼어 둔다(영국 PECR).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SendPage() {
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [remind, setRemind] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const target = email.trim();
    if (!EMAIL_RE.test(target)) { setError(t.auth.errors.invalidEmail); return; }
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/handoff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: target, remind, firstTouch: firstTouch(), captchaToken }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) { setError(data?.error ?? t.api.handoffSendFailed); return; }
      setSentTo(target);
    } catch {
      setError(t.api.handoffSendFailed);
    } finally {
      // 토큰은 1회용 — 성공이든 실패든 다 썼다.
      resetTurnstile();
      setCaptchaToken(null);
      setSending(false);
    }
  }

  const text = { color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" } as const;

  return (
    <main className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <nav className="flex items-center justify-between px-4 md:px-8 py-4 md:py-5">
        <Logo />
        <LanguageToggle />
      </nav>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {sentTo ? (
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-6"
                style={{ background: "var(--blue-tint)" }}>
                💻
              </div>
              <h1 className="text-2xl font-black mb-3" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
                {t.handoff.sentTitle}
              </h1>
              <p className="text-sm leading-relaxed mb-6" style={text}>
                <strong style={{ color: "var(--text-primary)" }}>{sentTo}</strong><br />
                {t.handoff.sentBody}
              </p>
              <button type="button" onClick={() => { setSentTo(null); setEmail(""); }}
                className="text-sm font-bold"
                style={{ color: "var(--blue)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-nunito)" }}>
                {t.handoff.sendAgain}
              </button>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h1 className="text-3xl font-black mb-3" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", letterSpacing: "-0.02em" }}>
                  {t.handoff.title}
                </h1>
                <p className="text-sm leading-relaxed" style={text}>{t.handoff.body}</p>
              </div>

              <form onSubmit={submit} className="flex flex-col gap-4">
                <div>
                  <label htmlFor="handoff-email" className="block text-xs font-bold mb-1.5"
                    style={{ ...text, letterSpacing: "0.05em" }}>
                    {t.handoff.emailLabel}
                  </label>
                  <input id="handoff-email" className="vf-input" type="email" name="email" placeholder="hello@example.com"
                    value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }}
                    required autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
                </div>

                <label className="flex items-center gap-2 text-sm cursor-pointer" style={text}>
                  <input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: "var(--blue)" }} />
                  {t.handoff.remindLabel}
                </label>

                {error && (
                  <p className="text-sm font-semibold text-center py-2 px-3 rounded-xl"
                    style={{ color: "#ef4444", background: "rgba(239,68,68,0.08)", fontFamily: "var(--font-nunito)" }}>
                    {error}
                  </p>
                )}

                <TurnstileWidget onToken={setCaptchaToken} />

                <button type="submit" disabled={sending || (turnstileEnabled && !captchaToken)}
                  className="w-full py-3.5 rounded-xl font-black text-sm transition-opacity hover:opacity-85 disabled:opacity-50"
                  style={{ background: "var(--blue)", color: "var(--bg)", fontFamily: "var(--font-nunito)", border: "none", cursor: sending ? "not-allowed" : "pointer" }}>
                  {sending ? t.handoff.sending : t.handoff.submit}
                </button>

                <p className="text-xs leading-relaxed text-center" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
                  {t.handoff.privacyNote}
                </p>
              </form>

              <p className="text-center text-sm mt-8">
                <Link href="/signup" className="font-bold"
                  style={{ color: "var(--text-secondary)", textDecoration: "none", fontFamily: "var(--font-nunito)" }}>
                  {t.handoff.signupHere}
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
