"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AnalyticsEvent, trackClientEvent, firstTouch, type FirstTouchData } from "@/lib/analytics-client";
import Logo from "@/components/Logo";
import { isReservedUsername } from "@/lib/reservedUsernames";
import { safeNext } from "@/lib/safeNext";
import { hasBlockedTerm } from "@/lib/nameFilter";
import {
  BIO_MAX, NAME_MAX, USERNAME_MAX, USERNAME_PATTERN,
  isValidUsername, normalizeUsername, usernameIlikePattern,
} from "@/lib/username";
import { useT } from "@/lib/i18n/client";

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid" | "reserved";

// 온보딩이 끝나면 갈 곳. 미들웨어가 원래 가려던 주소를 ?next=로 실어 보낸다
// (/publish에서 가입한 사람은 JSON을 들고 왔으니 거기로 돌려보낸다). 없거나
// 대시보드면 환영 배너가 뜨는 대시보드로.
function destination(): string {
  const next = safeNext(new URLSearchParams(location.search).get("next"));
  return next === "/" || next.startsWith("/dashboard") ? "/dashboard?welcome=1" : next;
}

// 아이디 겹침 검사 — DB 유일 인덱스가 lower(username)이라 대소문자를 가리지 않고
// 본다. 자기 행은 뺀다(프로필은 저장됐는데 metadata 저장이 실패해 다시 온 사람이
// 자기 아이디에 "이미 사용 중"을 보지 않게).
async function usernameTaken(supabase: ReturnType<typeof createClient>, value: string, selfId: string | null) {
  let q = supabase.from("profiles").select("id").ilike("username", usernameIlikePattern(value));
  if (selfId) q = q.neq("id", selfId);
  const { data } = await q.limit(1);
  return (data?.length ?? 0) > 0;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { t } = useT();
  const [form, setForm] = useState({ name: "", username: "", bio: "" });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [error, setError] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [ageOk, setAgeOk] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userIdRef = useRef<string | null>(null);
  // 가입 폼이 metadata에 실어 둔 첫 방문 정보 — 인증 메일을 다른 브라우저에서 열어
  // 이 브라우저의 localStorage가 비어 있을 때 쓴다(홍보 유입 귀속).
  const signupTouchRef = useRef<FirstTouchData | null>(null);

  const checkUsername = useCallback(async (value: string) => {
    if (!value) { setUsernameStatus("idle"); return; }
    if (!isValidUsername(value)) {
      setUsernameStatus("invalid"); return;
    }
    // 예약어와 금지어(욕설·사칭)는 같은 "쓸 수 없는 이름"으로 알린다 — 어떤 단어가
    // 걸렸는지는 말하지 않는다.
    if (isReservedUsername(value) || hasBlockedTerm(value, "username")) {
      setUsernameStatus("reserved"); return;
    }
    setUsernameStatus("checking");
    const taken = await usernameTaken(createClient(), value, userIdRef.current);
    setUsernameStatus(taken ? "taken" : "available");
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      // 미들웨어는 /onboarding을 로그인 없이도 통과시킨다 — 여기서 돌려보내지 않으면
      // 스피너가 끝없이 돈다(로그아웃 뒤 뒤로가기 등).
      if (!user) { router.replace("/login"); return; }
      userIdRef.current = user.id;
      const meta = user.user_metadata;
      signupTouchRef.current = meta?.first_touch ?? null;
      const name = meta?.full_name || meta?.name || "";
      // Prefer the username picked at email signup (stashed as pending_username so it
      // wouldn't satisfy the middleware onboarding gate); the Google path has none, so
      // fall back to the email prefix as before.
      // Self-heal (an existing username, for a user re-sent here without a profiles
      // row) wins, then a fresh signup's pending choice, then the email prefix (Google).
      const existing = normalizeUsername(String(meta?.username ?? ""));
      const pending = normalizeUsername(String(meta?.pending_username ?? ""));
      // GitHub 가입이면 깃허브 아이디가 제일 그럴듯한 후보다(user_name — `username`이 아니라
      // 미들웨어 온보딩 표식과 안 겹친다).
      const github = normalizeUsername(String(meta?.user_name ?? ""));
      const emailPrefix = normalizeUsername(user.email?.split("@")[0] ?? "");
      const suggestedUsername = [existing, pending, github, emailPrefix].find((u) => u.length >= 2) ?? "";
      setAvatarUrl(meta?.avatar_url ?? null);
      setForm((prev) => ({
        ...prev,
        name: (name || prev.name).slice(0, NAME_MAX),
        username: suggestedUsername || prev.username,
      }));
      if (suggestedUsername) checkUsername(suggestedUsername);
      setInitLoading(false);
    });
  }, [checkUsername, router]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name } = e.target;
    const value = name === "username" ? normalizeUsername(e.target.value) : e.target.value;
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
    if (usernameStatus === "taken") { setError(t.onboarding.errors.usernameTaken); return; }
    if (usernameStatus === "invalid") { setError(t.onboarding.errors.usernameInvalid); return; }
    if (usernameStatus === "reserved") { setError(t.onboarding.errors.usernameReserved); return; }
    if (hasBlockedTerm(form.name, "name")) { setError(t.onboarding.errors.nameBlocked); return; }

    setLoading(true);
    setError("");

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    const username = normalizeUsername(form.username);

    // Final check if debounce hasn't resolved yet
    if (usernameStatus !== "available") {
      if (!isValidUsername(username)) {
        setError(t.onboarding.errors.usernameInvalid);
        setLoading(false);
        return;
      }
      if (isReservedUsername(username) || hasBlockedTerm(username, "username")) {
        setError(t.onboarding.errors.usernameReserved);
        setLoading(false);
        return;
      }
      if (await usernameTaken(supabase, username, user.id)) {
        setError(t.onboarding.errors.usernameTaken);
        setLoading(false);
        return;
      }
    }

    // profiles를 먼저 쓴다. metadata.username은 미들웨어의 "온보딩 끝" 표식이라,
    // 그걸 먼저 쓰고 profiles가 실패하면(아이디 겹침 23505 등) 관문이 다시는 안 잡아
    // "프로필 없는 계정"이 사이트를 돌아다닌다(2026-09-22 A4). CardTab과 같은 순서.
    const { error: profileErr } = await supabase.from("profiles").upsert({
      id: user.id,
      username,
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
          ? t.onboarding.errors.usernameTaken
          : t.onboarding.errors.saveProfile,
      );
      setLoading(false);
      return;
    }

    const { error: authErr } = await supabase.auth.updateUser({
      data: { name: form.name, username, bio: form.bio, age_confirmed_at: new Date().toISOString() },
    });
    if (authErr) {
      // 프로필은 저장됐다 — 다시 누르면 upsert는 같은 행을 덮고 여기를 한 번 더 시도한다.
      setError(t.onboarding.errors.saveAuth);
      setLoading(false);
      return;
    }

    // 퍼널 첫 단 — 온보딩(username 확정)이 "가입 완료"의 정의. 첫 방문 시 담아둔
    // referrer/UTM을 실어 보내 "어디서 가입됐나"를 관제탑에서 셀 수 있게 한다.
    const ft = firstTouch() ?? signupTouchRef.current;
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

    router.push(destination());
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

  const canSubmit = !loading && ageOk && usernameStatus !== "taken" && usernameStatus !== "invalid" && usernameStatus !== "reserved" && usernameStatus !== "checking";

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
            <StepDot state="done" label={t.onboarding.stepSignup} />
            <StepLine />
            <StepDot state="active" label={t.onboarding.stepProfile} />
            <StepLine />
            <StepDot state="upcoming" label={t.onboarding.stepStart} />
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
            {t.onboarding.title}
          </h1>
          <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
            {t.onboarding.subtitle}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label={t.onboarding.nameLabel}>
            <input className="vf-input" type="text" name="name"
              placeholder={t.signup.namePlaceholder} value={form.name} onChange={handleChange} required autoFocus
              maxLength={NAME_MAX} autoComplete="name" />
          </Field>

          <Field label={t.onboarding.usernameLabel}>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold pointer-events-none"
                style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>@</span>
              <input className="vf-input" style={{ paddingLeft: "1.75rem", paddingRight: "2.5rem" }}
                type="text" name="username" placeholder="alexvibe"
                value={form.username} onChange={handleChange} required
                pattern={USERNAME_PATTERN} title={t.auth.usernamePattern} maxLength={USERNAME_MAX}
                autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" />
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
                {usernameStatus === "available" && t.onboarding.usernameAvailable}
                {usernameStatus === "taken" && t.onboarding.usernameTaken}
                {usernameStatus === "invalid" && t.onboarding.usernameInvalid}
                {usernameStatus === "reserved" && t.onboarding.usernameReserved}
                {(usernameStatus === "idle" || usernameStatus === "checking") && (
                  <>nookframe.com/<span style={{ color: "var(--blue)" }}>{form.username}</span></>
                )}
              </p>
            )}
          </Field>

          <Field label={t.onboarding.bioLabel}>
            <textarea className="vf-input" name="bio"
              placeholder={t.onboarding.bioPlaceholder}
              value={form.bio} onChange={handleChange} rows={2} maxLength={BIO_MAX} style={{ resize: "none" }} />
          </Field>

          {/* 만 14세 이상 확인 — 약관 1조의 가입 조건. 이메일·구글 가입이 모두 여기를 지난다. */}
          <label className="flex items-start gap-2 text-xs font-semibold cursor-pointer"
            style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
            <input type="checkbox" checked={ageOk} onChange={(e) => setAgeOk(e.target.checked)}
              required className="mt-0.5" style={{ accentColor: "var(--blue)" }} />
            <span>{t.onboarding.ageConfirm}</span>
          </label>

          {error && (
            <p className="text-sm font-semibold text-center py-2 px-3 rounded-xl"
              style={{ color: "#ef4444", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", fontFamily: "var(--font-nunito)" }}>
              {error}
            </p>
          )}

          <button type="submit" disabled={!canSubmit}
            className="w-full py-3.5 rounded-xl font-black text-sm mt-2 transition-opacity hover:opacity-85 disabled:opacity-50"
            style={{ background: "var(--blue)", color: "var(--bg)", fontFamily: "var(--font-nunito)", cursor: canSubmit ? "pointer" : "not-allowed", border: "none", boxShadow: "0 0 20px var(--blue-glow)" }}>
            {loading ? t.onboarding.submitting : t.onboarding.submit}
          </button>
        </form>

        {/* Escape hatch for a wrong-account sign-in */}
        <div className="mt-6 text-center">
          <button type="button" onClick={handleSignOut}
            className="text-xs font-semibold transition-opacity hover:opacity-70"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", background: "none", border: "none", cursor: "pointer" }}>
            {t.onboarding.otherAccount}
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
