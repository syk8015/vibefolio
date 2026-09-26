"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/client";
import { onThemeChange, setStoredTheme, type Theme } from "@/lib/theme";
import type { Locale } from "@/lib/i18n/config";
import AppNav from "@/components/AppNav";
import LoginMethods from "./LoginMethods";
import AiConnections from "./AiConnections";
import DeleteAccount from "./DeleteAccount";
import { InlineConfirm, List, Row, Section, TEXT, pillStyle } from "./ui";

// 설정 화면(/settings, 2026-09-26 사용자 확정 시안=claude.ai/artifact/JG1rHep7VpWvfWbBBJo6og).
// 명함 탭엔 남에게 보여줄 명함만 두고, 계정 쪽 일은 여기로 모았다: 로그인 방법 · 화면(언어·테마) ·
// 로그인 관리(이 기기 / 모든 기기) · AI 연결 · 회원 탈퇴. 들어오는 길 = 홈 프로필 메뉴 [설정] ·
// 대시보드 위쪽 [설정](AppNav).
export default function SettingsClient({ email, username }: { email: string; username: string }) {
  const { t } = useT();

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)", wordBreak: "keep-all" }}>
      <AppNav current="settings" />
      <main className="max-w-[640px] mx-auto px-6 pt-10 pb-20 flex flex-col gap-11">
        <header className="flex flex-col gap-3">
          <Link href="/dashboard" className="text-sm flex items-center gap-1.5 w-fit transition-opacity hover:opacity-70"
            style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", textDecoration: "none" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M8.5 2.5L4 7l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t.settings.back}
          </Link>
          <h1 className="vf-serif-display" style={{ fontSize: "1.875rem", fontWeight: 600, lineHeight: 1.2, margin: 0 }}>
            {t.settings.title}
          </h1>
        </header>

        <LoginMethods accountEmail={email} />
        <DisplaySettings />
        <SessionSettings />
        <AiConnections />
        <DeleteAccount username={username} />
      </main>
    </div>
  );
}

// 두 칸 고르기(토스 세그먼트) — 고른 쪽은 한 단계 진한 채움 + 굵게(시각 언어의 "선택" 규칙).
function Segmented<V extends string>({ label, value, options, onPick }: {
  label: string; value: V | null; options: { value: V; label: string }[]; onPick: (v: V) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-0.5 p-[3px] rounded-full shrink-0" style={{ background: "var(--bg)" }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" aria-pressed={on} onClick={() => onPick(o.value)}
            className="rounded-full transition-colors"
            style={{
              padding: "0.375rem 0.875rem", border: "none", cursor: "pointer",
              background: on ? "var(--surface-active)" : "transparent",
              color: on ? "var(--text-primary)" : "var(--text-secondary)",
              fontSize: "0.875rem", fontWeight: on ? 600 : 500, fontFamily: "var(--font-nunito)",
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// 지금 테마는 <html data-theme>이 정본이다(lib/theme — 부트 스크립트·nav 토글이 같은 속성을 쓴다).
// 바뀔 때마다 오는 이벤트를 구독해 nav 토글로 바꿔도 여기 표시가 따라온다.
const readTheme = (): Theme => (document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
const subscribeTheme = (onChange: () => void) => onThemeChange(() => onChange());

function DisplaySettings() {
  const { t, locale, setLocale, ready } = useT();
  const ts = t.settings;
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => null);

  return (
    <Section label={ts.displayLabel}>
      <List>
        <Row name={ts.language} action={
          <Segmented<Locale> label={ts.language} value={ready ? locale : null}
            options={[{ value: "ko", label: "한국어" }, { value: "en", label: "English" }]}
            onPick={(v) => { if (v !== locale) setLocale(v); }} />
        } />
        <Row divider name={ts.theme} action={
          <Segmented<Theme> label={ts.theme} value={theme}
            options={[{ value: "light", label: ts.light }, { value: "dark", label: ts.dark }]}
            onPick={(v) => setStoredTheme(v)} />
        } />
      </List>
    </Section>
  );
}

function SessionSettings() {
  const { t } = useT();
  const ts = t.settings;
  const router = useRouter();
  const [busy, setBusy] = useState<"local" | "global" | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [failed, setFailed] = useState(false);

  // local = 이 기기만(09-25 기본). global = 이 계정의 모든 세션을 끊는다 — 다른 기기는 다음
  // 요청에서 미들웨어의 getUser가 세션 없음으로 읽고 로그인 화면으로 간다.
  async function signOut(scope: "local" | "global") {
    setBusy(scope);
    setFailed(false);
    const { error } = await createClient().auth.signOut({ scope }).catch(() => ({ error: true as const }));
    if (error) {
      setBusy(null);
      setFailed(true);
      return;
    }
    router.push(scope === "local" ? "/" : "/login");
    router.refresh();
  }

  const locked = busy !== null;
  return (
    <Section label={ts.sessionsLabel}>
      {failed && <p role="alert" className="text-sm mb-3" style={{ ...TEXT, color: "var(--danger)" }}>{ts.logoutFailed}</p>}
      <List>
        <Row name={ts.logoutHere} detail={ts.logoutHereBody} action={
          <button type="button" onClick={() => signOut("local")} disabled={locked} style={pillStyle(locked)}>{ts.logoutHereBtn}</button>
        } />
        <Row divider name={ts.logoutAll} detail={ts.logoutAllBody}
          action={confirmAll ? undefined : (
            <button type="button" onClick={() => { setConfirmAll(true); setFailed(false); }} disabled={locked} style={pillStyle(locked)}>
              {ts.logoutAllBtn}
            </button>
          )}>
          {confirmAll && (
            <InlineConfirm locked={locked}
              text={ts.logoutAllConfirm}
              yes={busy === "global" ? ts.loggingOut : ts.logoutAllBtn}
              no={ts.cancel}
              onYes={() => signOut("global")}
              onNo={() => setConfirmAll(false)} />
          )}
        </Row>
      </List>
    </Section>
  );
}
