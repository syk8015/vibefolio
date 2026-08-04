"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AnalyticsEvent, trackClientEvent, firstTouch } from "@/lib/analytics-client";
import Logo from "@/components/Logo";
import { isReservedUsername } from "@/lib/reservedUsernames";

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid" | "reserved";

export default function OnboardingPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", username: "", bio: "" });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [error, setError] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkUsername = useCallback(async (value: string) => {
    if (!value) { setUsernameStatus("idle"); return; }
    if (!/^[a-zA-Z0-9_-]+$/.test(value) || value.length < 2) {
      setUsernameStatus("invalid"); return;
    }
    if (isReservedUsername(value)) {
      setUsernameStatus("reserved"); return;
    }
    setUsernameStatus("checking");
    const supabase = createClient();
    const { data } = await supabase.from("profiles").select("id").eq("username", value).maybeSingle();
    setUsernameStatus(data ? "taken" : "available");
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      const meta = user.user_metadata;
      const name = meta?.full_name || meta?.name || "";
      // Prefer the username picked at email signup (stashed as pending_username so it
      // wouldn't satisfy the middleware onboarding gate); the Google path has none, so
      // fall back to the email prefix as before.
      // Self-heal (an existing username, for a user re-sent here without a profiles
      // row) wins, then a fresh signup's pending choice, then the email prefix (Google).
      const existing = String(meta?.username ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
      const pending = String(meta?.pending_username ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
      const emailPrefix = (user.email?.split("@")[0] ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
      const suggestedUsername =
        existing.length >= 2 ? existing : pending.length >= 2 ? pending : (emailPrefix.length >= 2 ? emailPrefix : "");
      setAvatarUrl(meta?.avatar_url ?? null);
      setForm((prev) => ({
        ...prev,
        name: name || prev.name,
        username: suggestedUsername || prev.username,
      }));
      if (suggestedUsername) checkUsername(suggestedUsername);
      setInitLoading(false);
    });
  }, [checkUsername]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError("");
    if (name === "username") {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setUsernameStatus("idle");
      debounceRef.current = setTimeout(() => checkUsername(value), 400);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (usernameStatus === "taken") { setError("이미 사용 중인 username이에요. 다른 걸 입력해주세요."); return; }
    if (usernameStatus === "invalid") { setError("username은 영문, 숫자, _, -만 사용 가능하고 2자 이상이어야 해요."); return; }
    if (usernameStatus === "reserved") { setError("사용할 수 없는 username이에요. 다른 걸 입력해주세요."); return; }

    setLoading(true);
    setError("");

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    // Final check if debounce hasn't resolved yet
    if (usernameStatus !== "available") {
      if (isReservedUsername(form.username)) {
        setError("사용할 수 없는 username이에요. 다른 걸 입력해주세요.");
        setLoading(false);
        return;
      }
      const { data: existing } = await supabase.from("profiles").select("id").eq("username", form.username).maybeSingle();
      if (existing) {
        setError("이미 사용 중인 username이에요. 다른 걸 입력해주세요.");
        setLoading(false);
        return;
      }
    }

    const { error: authErr } = await supabase.auth.updateUser({
      data: { name: form.name, username: form.username, bio: form.bio },
    });

    if (authErr) {
      setError("저장 중 오류가 발생했어요. 다시 시도해주세요.");
      setLoading(false);
      return;
    }

    const { error: profileErr } = await supabase.from("profiles").upsert({
      id: user.id,
      username: form.username,
      name: form.name,
      bio: form.bio,
      updated_at: new Date().toISOString(),
    });
    if (profileErr) {
      // Never fall through to the dashboard with no profile row — that's the exact
      // broken state (404 card, raw FK error on the first project) the onboarding gate
      // exists to prevent. Surface it and keep them here to retry.
      setError(
        profileErr.code === "23505"
          ? "이미 사용 중인 username이에요. 다른 걸 입력해주세요."
          : "프로필 저장 중 오류가 발생했어요. 다시 시도해주세요.",
      );
      setLoading(false);
      return;
    }

    // 퍼널 첫 단 — 온보딩(username 확정)이 "가입 완료"의 정의. 첫 방문 시 담아둔
    // referrer/UTM을 실어 보내 "어디서 가입됐나"를 관제탑에서 셀 수 있게 한다.
    const ft = firstTouch();
    trackClientEvent(
      AnalyticsEvent.SignupCompleted,
      ft
        ? {
            ref: ft.referrer,
            utm_source: ft.utm_source,
            utm_medium: ft.utm_medium,
            utm_campaign: ft.utm_campaign,
            landing: ft.landing,
          }
        : undefined,
    );

    router.push("/dashboard?welcome=1");
    router.refresh();
  }

  // Escape hatch: a visitor who signed in with the wrong account lands here and
  // — since the middleware sends every username-less user to /onboarding — has no
  // other way out. Let them sign out and pick a different account.
  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const canSubmit = !loading && usernameStatus !== "taken" && usernameStatus !== "invalid" && usernameStatus !== "reserved" && usernameStatus !== "checking";

  if (initLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="w-5 h-5 rounded-full border-2 animate-spin"
          style={{ borderColor: "var(--blue)", borderTopColor: "transparent" }} />
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12" style={{ background: "var(--bg)" }}>

      {/* Logo */}
      <div className="mb-10">
        <Logo href={null} />
      </div>

      <div className="w-full max-w-sm">

        {/* Step indicator */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center gap-2">
            <StepDot state="done" label="가입" />
            <StepLine />
            <StepDot state="active" label="프로필" />
            <StepLine />
            <StepDot state="upcoming" label="시작" />
          </div>
        </div>

        {/* Avatar + heading */}
        <div className="mb-8 text-center">
          {avatarUrl ? (
            <Image src={avatarUrl} alt="" width={64} height={64} unoptimized
              className="w-16 h-16 rounded-full mx-auto mb-4 object-cover"
              style={{ border: "2px solid var(--border-bright)" }} />
          ) : (
            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center text-2xl font-black"
              style={{ background: "var(--blue-tint)", border: "2px solid var(--border-bright)", color: "var(--blue)", fontFamily: "var(--font-nunito)" }}>
              {form.name ? form.name.charAt(0).toUpperCase() : "V"}
            </div>
          )}
          <h1 className="text-3xl font-black mb-2" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", letterSpacing: "-0.02em" }}>
            명함을 만들어볼게요
          </h1>
          <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
            기본 정보를 입력해주세요. 나중에 언제든 바꿀 수 있어요.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="이름">
            <input className="vf-input" type="text" name="name"
              placeholder="홍길동" value={form.name} onChange={handleChange} required autoFocus />
          </Field>

          <Field label="사용자 이름 (URL)">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold pointer-events-none"
                style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>@</span>
              <input className="vf-input" style={{ paddingLeft: "1.75rem", paddingRight: "2.5rem" }}
                type="text" name="username" placeholder="alexvibe"
                value={form.username} onChange={handleChange} required
                pattern="[a-zA-Z0-9_-]+" title="영문, 숫자, _-만 사용 가능해요" />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <UsernameStatusIcon status={usernameStatus} />
              </div>
            </div>
            {form.username && (
              <p className="mt-1.5 text-xs font-semibold" style={{
                color: usernameStatus === "available" ? "#22c55e"
                  : (usernameStatus === "taken" || usernameStatus === "invalid" || usernameStatus === "reserved") ? "#ef4444"
                  : "var(--text-muted)",
                fontFamily: "var(--font-nunito)"
              }}>
                {usernameStatus === "available" && "✓ 사용 가능한 username이에요"}
                {usernameStatus === "taken" && "✗ 이미 사용 중이에요"}
                {usernameStatus === "invalid" && "✗ 영문, 숫자, _, -만 사용 가능해요 (2자 이상)"}
                {usernameStatus === "reserved" && "✗ 사용할 수 없는 이름이에요"}
                {(usernameStatus === "idle" || usernameStatus === "checking") && (
                  <>nookframe.com/<span style={{ color: "var(--blue)" }}>{form.username}</span></>
                )}
              </p>
            )}
          </Field>

          <Field label="한 줄 소개 (선택)">
            <textarea className="vf-input" name="bio"
              placeholder="바이브코딩으로 아이디어를 현실로 만들고 있어요."
              value={form.bio} onChange={handleChange} rows={2} style={{ resize: "none" }} />
          </Field>

          {error && (
            <p className="text-sm font-semibold text-center py-2 px-3 rounded-xl"
              style={{ color: "#ef4444", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", fontFamily: "var(--font-nunito)" }}>
              {error}
            </p>
          )}

          <button type="submit" disabled={!canSubmit}
            className="w-full py-3.5 rounded-xl font-black text-sm mt-2 transition-opacity hover:opacity-85 disabled:opacity-50"
            style={{ background: "var(--blue)", color: "var(--bg)", fontFamily: "var(--font-nunito)", cursor: canSubmit ? "pointer" : "not-allowed", border: "none", boxShadow: "0 0 20px var(--blue-glow)" }}>
            {loading ? "저장 중..." : "시작하기 →"}
          </button>
        </form>

        {/* Escape hatch for a wrong-account sign-in */}
        <div className="mt-6 text-center">
          <button type="button" onClick={handleSignOut}
            className="text-xs font-semibold transition-opacity hover:opacity-70"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", background: "none", border: "none", cursor: "pointer" }}>
            다른 계정으로 로그인
          </button>
        </div>
      </div>
    </main>
  );
}

function UsernameStatusIcon({ status }: { status: UsernameStatus }) {
  if (status === "checking") {
    return (
      <div className="w-4 h-4 rounded-full border-2 animate-spin"
        style={{ borderColor: "var(--blue)", borderTopColor: "transparent" }} />
    );
  }
  if (status === "available") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="7" fill="rgba(34,197,94,0.15)" stroke="#22c55e" strokeWidth="1.5" />
        <path d="M5 8l2 2 4-4" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === "taken" || status === "invalid" || status === "reserved") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="7" fill="rgba(239,68,68,0.15)" stroke="#ef4444" strokeWidth="1.5" />
        <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  return null;
}

function StepDot({ state, label }: { state: "done" | "active" | "upcoming"; label: string }) {
  const isDone = state === "done";
  const isActive = state === "active";
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="w-7 h-7 rounded-full flex items-center justify-center transition-all"
        style={{
          background: isDone || isActive ? "var(--blue)" : "var(--surface)",
          border: `1.5px solid ${isDone || isActive ? "var(--blue)" : "var(--border)"}`,
          boxShadow: isActive ? "0 0 12px var(--blue-glow)" : "none",
        }}>
        {isDone ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6l2.5 2.5 5-5" style={{ stroke: "var(--bg)" }} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <div className="w-2 h-2 rounded-full"
            style={{ background: isActive ? "var(--bg)" : "var(--text-muted)" }} />
        )}
      </div>
      <span className="text-xs font-bold" style={{
        color: isDone || isActive ? "var(--blue)" : "var(--text-muted)",
        fontFamily: "var(--font-nunito)"
      }}>
        {label}
      </span>
    </div>
  );
}

function StepLine() {
  return <div className="w-10 h-px mb-4" style={{ background: "var(--border)" }} />;
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
