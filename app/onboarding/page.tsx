"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AnalyticsEvent, trackClientEvent, firstTouch, type FirstTouchData } from "@/lib/analytics-client";
import Logo from "@/components/Logo";
import BrandMark from "@/components/BrandMark";
import Modal from "@/components/Modal";
import { isReservedUsername } from "@/lib/reservedUsernames";
import { safeNext } from "@/lib/safeNext";
import { hasBlockedTerm } from "@/lib/nameFilter";
import {
  NAME_MAX, USERNAME_MAX, USERNAME_PATTERN,
  isValidUsername, normalizeUsername, usernameIlikePattern,
} from "@/lib/username";
import { useT } from "@/lib/i18n/client";

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid" | "reserved";

// 주소 칸의 자리표시 글 — 명함 미리보기도 칸이 비면 같은 글을 옅게 보여 준다.
const USERNAME_PLACEHOLDER = "alexvibe";

// 온보딩이 끝나면 갈 곳. 미들웨어가 원래 가려던 주소를 ?next=로 실어 보낸다
// (/publish에서 가입한 사람은 JSON을 들고 왔으니 거기로 돌려보낸다). 없거나
// 대시보드면 환영 배너가 뜨는 대시보드로 — 단 **폰 폭이면 /send**(컴퓨터로 링크 보내기,
// 09-25). 작품은 컴퓨터의 AI 도구로 올리는데 폰에서 막 가입한 사람은 여기서 이어지지
// 않는다(docs/desktop-handoff.md). 폭 기준은 랜딩의 폰 [시작하기]와 같은 md(768px).
function destination(): string {
  const next = safeNext(new URLSearchParams(location.search).get("next"));
  if (next !== "/" && !next.startsWith("/dashboard")) return next;
  return window.matchMedia("(max-width: 767px)").matches ? "/send" : "/dashboard?welcome=1";
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
  // 한 줄 소개는 여기서 묻지 않는다(10-01 덜어내기) — 대시보드 명함 탭(CardTab)에서 쓴다.
  const [form, setForm] = useState({ name: "", username: "" });
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [error, setError] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [ageOk, setAgeOk] = useState(false);
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [email, setEmail] = useState("");
  const [quitOpen, setQuitOpen] = useState(false);
  const [quitting, setQuitting] = useState(false);
  const [quitError, setQuitError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userIdRef = useRef<string | null>(null);
  const usernameRef = useRef<HTMLInputElement | null>(null);
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
      setEmail(user.email ?? "");
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
      setForm((prev) => ({
        ...prev,
        name: (name || prev.name).slice(0, NAME_MAX),
        username: suggestedUsername || prev.username,
      }));
      if (suggestedUsername) checkUsername(suggestedUsername);
      setInitLoading(false);
    });
  }, [checkUsername, router]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
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
    // bio는 싣지 않는다 — 이 화면엔 칸이 없으니, 다시 온 사람의 기존 소개를 빈 값으로 덮지 않게.
    const { error: profileErr } = await supabase.from("profiles").upsert({
      id: user.id,
      username,
      name: form.name,
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
      data: { name: form.name, username, age_confirmed_at: new Date().toISOString() },
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
            handoff: ft.handoff ?? null,
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
    // 이 기기만 — 기본값 global은 다른 기기 세션까지 푼다(app/api/auth/logout 참고).
    await supabase.auth.signOut({ scope: "local" });
    router.push("/login");
    router.refresh();
  }

  // 가입을 그만두는 사람의 탈출구(10-02). 프로필이 없으면 미들웨어가 어디로 가든 여기로 돌려보내
  // 설정 화면의 회원 탈퇴에 닿지 못한다 — 로그아웃만 되니 빈 계정이 쌓였다. /api는 온보딩 관문을
  // 건너뛰므로 설정 화면과 같은 DELETE /api/account를 그대로 쓴다(저장소 비우기 → 계정 삭제).
  async function handleQuit() {
    setQuitting(true);
    setQuitError("");
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || t.onboarding.quitFailed);
      }
      // 계정이 사라졌다 — 이 기기에 남은 세션 쿠키만 비운다.
      await createClient().auth.signOut({ scope: "local" });
      router.push("/");
      router.refresh();
    } catch (err) {
      setQuitting(false);
      setQuitError(err instanceof Error ? err.message : t.onboarding.quitFailed);
    }
  }

  const canSubmit = !loading && ageOk && usernameStatus !== "taken" && usernameStatus !== "invalid" && usernameStatus !== "reserved" && usernameStatus !== "checking";

  // 주소 칸 아래 한 줄은 실패일 때만 — 쓸 수 있으면 칸 안의 ✓ 하나로 끝낸다(10-01 덜어내기).
  const usernameError =
    usernameStatus === "taken" ? t.onboarding.usernameTaken
    : usernameStatus === "invalid" ? t.onboarding.usernameInvalid
    : usernameStatus === "reserved" ? t.onboarding.usernameReserved
    : "";

  // 'nookframe.com/' 글자를 눌러도 입력칸으로 — 커서는 적힌 아이디 끝에.
  function focusUsername(e: React.MouseEvent<HTMLDivElement>) {
    const el = usernameRef.current;
    if (!el || e.target === el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }

  if (initLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="w-5 h-5 rounded-full border-2 animate-spin"
          style={{ borderColor: "var(--blue)", borderTopColor: "transparent" }} />
      </main>
    );
  }

  // 할 일은 '내 주소 정하기' 하나(10-01 덜어내기 라) — 단계 표시·이름 동그라미·부제·한 줄 소개를 뺐다.
  // 업그레이드(10-01): 제목 밑에 명함 미리보기를 얹고, 그만큼 위 여백을 줄였다.
  return (
    <main className="min-h-screen flex flex-col items-center px-6 pt-12 pb-16" style={{ background: "var(--bg)" }}>
      <Logo href={null} />

      <div className="w-full max-w-sm" style={{ marginTop: "clamp(2rem, 6vh, 3.25rem)" }}>
        <h1 className="vf-serif-display text-center"
          style={{ fontSize: "1.875rem", fontWeight: 600, lineHeight: 1.25, margin: "0 0 1.75rem" }}>
          {t.onboarding.title}
        </h1>

        <CardPreview name={form.name} username={form.username}
          namePlaceholder={t.signup.namePlaceholder} caption={t.onboarding.previewCaption} />

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Field htmlFor="onboarding-name" label={t.onboarding.nameLabel}>
            <input id="onboarding-name" className="vf-input" type="text" name="name"
              placeholder={t.signup.namePlaceholder} value={form.name} onChange={handleChange} required autoFocus
              maxLength={NAME_MAX} autoComplete="name" />
          </Field>

          <Field htmlFor="onboarding-username" label={t.onboarding.usernameLabel}>
            {/* 칸 하나에 주소 전체 — 'nookframe.com/'은 고정 글자, 뒤에 아이디를 적는다. 초점 테두리는
                안쪽 입력칸 대신 이 칸이 그린다(.vf-input:focus와 같은 색). */}
            <div className="vf-input flex items-center cursor-text" onClick={focusUsername}
              style={usernameFocused ? { background: "var(--surface)", borderColor: "var(--text-primary)" } : undefined}>
              <span aria-hidden className="shrink-0" style={{ color: "var(--text-muted)" }}>nookframe.com/</span>
              <input ref={usernameRef} id="onboarding-username" type="text" name="username" placeholder={USERNAME_PLACEHOLDER}
                className="flex-1 min-w-0 outline-none"
                value={form.username} onChange={handleChange} required
                onFocus={() => setUsernameFocused(true)} onBlur={() => setUsernameFocused(false)}
                pattern={USERNAME_PATTERN} title={t.auth.usernamePattern} maxLength={USERNAME_MAX}
                aria-invalid={usernameError ? true : undefined}
                aria-describedby={usernameError ? "onboarding-username-error" : undefined}
                autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" />
              <span className="shrink-0 ml-2 flex items-center">
                <UsernameStatusIcon status={usernameStatus} availableLabel={t.onboarding.usernameAvailable} />
              </span>
            </div>
            {usernameError && (
              <p id="onboarding-username-error" className="mt-1.5" style={{ fontSize: "0.8125rem", color: "var(--danger)" }}>
                {usernameError}
              </p>
            )}
          </Field>

          {/* 만 14세 이상 확인 — 약관 1조의 가입 조건. 이메일·구글 가입이 모두 여기를 지난다. */}
          <label className="flex items-center gap-2.5 cursor-pointer"
            style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text-primary)" }}>
            <input type="checkbox" checked={ageOk} onChange={(e) => setAgeOk(e.target.checked)}
              required className="shrink-0" style={{ width: 16, height: 16, accentColor: "var(--blue)" }} />
            <span>{t.onboarding.ageConfirm}</span>
          </label>

          {error && (
            <p role="alert" className="text-center" style={{ fontSize: "0.875rem", color: "var(--danger)" }}>
              {error}
            </p>
          )}

          <button type="submit" disabled={!canSubmit} className="vf-button-primary self-center"
            style={{ minWidth: 180, padding: "0.8rem 2rem", fontSize: "0.9375rem" }}>
            {loading ? t.onboarding.submitting : t.onboarding.submit}
          </button>
        </form>

        {/* Escape hatches: a wrong-account sign-in, or someone who'd rather not sign up after all */}
        <div className="mt-5 flex items-center justify-center gap-2.5"
          style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
          <button type="button" onClick={handleSignOut} className="vf-button-text"
            style={{ fontSize: "inherit", color: "inherit" }}>
            {t.onboarding.otherAccount}
          </button>
          <span aria-hidden>·</span>
          <button type="button" onClick={() => { setQuitOpen(true); setQuitError(""); }} className="vf-button-text"
            style={{ fontSize: "inherit", color: "inherit" }}>
            {t.onboarding.quitLink}
          </button>
        </div>
      </div>

      {quitOpen && (
        <Modal ariaLabel={t.onboarding.quitTitle} maxWidth="24rem"
          onClose={() => { if (!quitting) setQuitOpen(false); }}>
          <div style={{ wordBreak: "keep-all" }}>
            <h2 style={{ fontSize: "1.0625rem", fontWeight: 700, lineHeight: 1.4, margin: "0 0 0.75rem", color: "var(--text-primary)" }}>
              {t.onboarding.quitTitle}
            </h2>
            {email && (
              <p style={{ fontSize: "0.875rem", fontWeight: 600, margin: "0 0 0.375rem", color: "var(--text-primary)", overflowWrap: "anywhere" }}>
                {email}
              </p>
            )}
            <p style={{ fontSize: "0.875rem", lineHeight: 1.6, margin: 0, color: "var(--text-secondary)" }}>
              {t.onboarding.quitBody}
            </p>
            {quitError && (
              <p role="alert" style={{ fontSize: "0.875rem", margin: "0.75rem 0 0", color: "var(--danger)" }}>{quitError}</p>
            )}
            <div className="flex gap-2" style={{ marginTop: "1.25rem" }}>
              <button type="button" onClick={() => setQuitOpen(false)} disabled={quitting}
                className="vf-button-ghost flex-1" style={{ fontSize: "0.875rem" }}>
                {t.onboarding.quitCancel}
              </button>
              <button type="button" onClick={handleQuit} disabled={quitting}
                className="vf-button-ghost flex-1"
                style={{ fontSize: "0.875rem", fontWeight: 600, background: "#b34747", color: "#fff" }}>
                {quitting ? t.onboarding.quitDeleting : t.onboarding.quitConfirm}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </main>
  );
}

function UsernameStatusIcon({ status, availableLabel }: { status: UsernameStatus; availableLabel: string }) {
  if (status === "checking") {
    return (
      <div aria-hidden className="w-4 h-4 rounded-full border-2 animate-spin"
        style={{ borderColor: "var(--blue)", borderTopColor: "transparent" }} />
    );
  }
  if (status === "available") {
    // 보이는 글은 ✓ 하나뿐이라, 스크린리더에는 이름표로 알린다.
    return (
      <svg role="img" aria-label={availableLabel} width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="7" fill="rgba(34,197,94,0.15)" stroke="#22c55e" strokeWidth="1.5" />
        <path d="M5 8l2 2 4-4" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === "taken" || status === "invalid" || status === "reserved") {
    // 이유는 칸 아래 한 줄이 말한다 — 표시는 장식.
    return (
      <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="7" style={{ stroke: "var(--danger)" }} strokeWidth="1.5" />
        <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" style={{ stroke: "var(--danger)" }} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  return null;
}

// 업그레이드(10-01): 내 명함이 어떻게 생길지 미리 보여 주는 작은 카드 — 칸에 쓰는 대로 이름·주소가 바로 바뀐다.
// 잉크 카드라 라이트에선 까만 카드, 다크에선 종이색 카드다(주 버튼과 같은 뒤집기 — 어두운 바탕에 묻히지 않게).
// 칸과 같은 내용을 되풀이하는 그림이라 스크린리더에서는 숨긴다(밑의 한 줄은 읽힌다).
function CardPreview({ name, username, namePlaceholder, caption }: {
  name: string; username: string; namePlaceholder: string; caption: string;
}) {
  const typedName = name.trim();
  // 첫 글자 동그라미 — 명함 탭(CardTab)과 같은 규칙(이름, 없으면 아이디). Array.from은 이모지 반쪽을 막는다.
  const initial = (Array.from(typedName || username)[0] ?? "").toUpperCase();
  const FAINT = 0.6;   // 고정 글자(주소 앞부분·표식)
  const EMPTY = 0.45;  // 아직 안 쓴 칸의 자리표시 글
  return (
    <div className="flex flex-col items-center" style={{ gap: 12, marginBottom: "1.75rem" }}>
      <div aria-hidden className="relative w-full flex flex-col overflow-hidden"
        style={{
          maxWidth: 336, aspectRatio: "336 / 184", borderRadius: 18, padding: "20px 22px",
          background: "var(--text-primary)", color: "var(--bg)", boxShadow: "var(--shadow-card-big)",
        }}>
        {/* 오른쪽 위 옅은 빛 + 안쪽 테두리 한 줄 — 카드의 결 */}
        <span className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(120% 90% at 100% 0%, rgba(255,255,255,0.08), transparent 55%)" }} />
        <span className="absolute pointer-events-none"
          style={{ inset: 8, borderRadius: 12, boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--bg) 10%, transparent)" }} />

        <div className="relative flex items-center justify-between">
          <span className="flex items-center justify-center rounded-full shrink-0"
            style={{
              width: 38, height: 38, fontSize: "0.9375rem", fontWeight: 700,
              background: "color-mix(in srgb, var(--bg) 10%, transparent)",
              boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--bg) 18%, transparent)",
            }}>
            {initial}
          </span>
          <span style={{ opacity: FAINT }}><BrandMark size="0.875rem" /></span>
        </div>

        <div className="relative" style={{ marginTop: "auto" }}>
          <p className="vf-serif-display"
            style={{
              color: "inherit", fontSize: "1.5rem", fontWeight: 600, lineHeight: 1.25, margin: 0,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", opacity: typedName ? 1 : EMPTY,
            }}>
            {typedName || namePlaceholder}
          </p>
          <p className="vf-mono" style={{ fontSize: "0.8125rem", lineHeight: 1.45, margin: "5px 0 0", overflowWrap: "anywhere" }}>
            <span style={{ opacity: FAINT }}>nookframe.com/</span>
            <span style={{ opacity: username ? 1 : EMPTY }}>{username || USERNAME_PLACEHOLDER}</span>
          </p>
        </div>
      </div>
      <p className="text-center" style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: 0 }}>
        {caption}
      </p>
    </div>
  );
}

function Field({ htmlFor, label, children }: { htmlFor: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block mb-1.5"
        style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)" }}>
        {label}
      </label>
      {children}
    </div>
  );
}
