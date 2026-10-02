"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/client";
import { onThemeChange, setStoredTheme, type Theme } from "@/lib/theme";
import type { Locale } from "@/lib/i18n/config";
import { isInAppBrowser } from "@/lib/traffic-source";
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

// 지금 이 기기 — "Mac · Chrome"(10-02 덜어내기 2차): 어느 기기에서 나가는지 로그아웃 줄에서 바로 보이게.
// 모르는 쪽은 빼고, 둘 다 모르면 줄을 그리지 않는다. 브라우저는 순서가 중요하다 — Samsung·Whale·Edge UA에도
// Chrome/이, Chrome UA에도 Safari/가 들어 있다. 앱 안 브라우저(카톡·인스타…)와 Opera는 Chrome이라 부르면
// 틀려서 뺀다.
function deviceLabel(ua: string, touchPoints: number): string | null {
  // iPadOS 13부터 아이패드 사파리는 맥 UA를 보낸다 — 터치가 되면 아이패드.
  const os = /iPad/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1) ? "iPad"
    : /iPhone/.test(ua) ? "iPhone"
    : /Android/.test(ua) ? "Android"
    : /Windows/.test(ua) ? "Windows"
    : /Macintosh|Mac OS X/.test(ua) ? "Mac"
    : /Linux/.test(ua) ? "Linux"
    : null;
  const browser = isInAppBrowser(ua) || /OPR\/|OPiOS\/|Opera/.test(ua) ? null
    : /SamsungBrowser\//.test(ua) ? "Samsung Internet"
    : /Whale\//.test(ua) ? "Whale"
    : /Edg(e|A|iOS)?\//.test(ua) ? "Edge"
    : /Firefox\/|FxiOS\//.test(ua) ? "Firefox"
    : /Chrome\/|CriOS\//.test(ua) ? "Chrome"
    : /Version\/.*Safari\//.test(ua) ? "Safari"
    : null;
  return [os, browser].filter(Boolean).join(" · ") || null;
}
// UA는 바뀌지 않으니 구독할 것이 없다 — 서버 렌더(null)엔 줄이 없고 하이드레이션 뒤에 붙는다.
const noopSubscribe = () => () => {};
const readDevice = () => deviceLabel(navigator.userAgent, navigator.maxTouchPoints);

function SessionSettings() {
  const { t } = useT();
  const ts = t.settings;
  const router = useRouter();
  const [busy, setBusy] = useState<"local" | "global" | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [failed, setFailed] = useState(false);
  const device = useSyncExternalStore(noopSubscribe, readDevice, () => null);

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

  // 한 줄 "로그아웃" + [이 기기만] [모든 기기](10-02 덜어내기 2차). 모든 기기는 예전처럼 줄 안 확인을
  // 한 번 거친다 — 확인 중엔 두 버튼을 거두고 확인만 남긴다.
  const locked = busy !== null;
  return (
    <Section label={ts.sessionsLabel}>
      {failed && <p role="alert" className="text-sm mb-3" style={{ ...TEXT, color: "var(--danger)" }}>{ts.logoutFailed}</p>}
      <List>
        <Row wrap name={ts.logout} detail={device ? ts.thisDevice(device) : undefined}
          action={confirmAll ? undefined : (
            <div className="flex gap-2 shrink-0">
              <button type="button" onClick={() => signOut("local")} disabled={locked} style={pillStyle(locked)}>{ts.logoutHere}</button>
              <button type="button" onClick={() => { setConfirmAll(true); setFailed(false); }} disabled={locked} style={pillStyle(locked)}>
                {ts.logoutAll}
              </button>
            </div>
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
