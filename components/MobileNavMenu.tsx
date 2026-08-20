"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import { getInitialTheme, onThemeChange, setStoredTheme, type Theme } from "@/lib/theme";

// 테마는 DOM(data-theme)이 원본이고 다른 컨트롤도 같은 값을 바꾼다 — React state로
// 복제하지 말고 외부 스토어로 구독한다. 서버 스냅샷은 부트 스크립트 기본값과 같은 "dark".
const subscribeTheme = (notify: () => void) => onThemeChange(() => notify());
const getServerTheme = (): Theme => "dark";

// 모바일 nav 정리용 — 테마·언어·링크 복사·로그인을 점 세 개 버튼 하나로 접는다.
// 방문자가 처음 보는 건 로고와 내용뿐이어야 한다는 판단(2026-08-19 사용자 피드백:
// "맨 위에 버튼이 너무 많다"). 데스크탑(md+)은 기존 버튼 줄을 그대로 쓰므로
// 이 컴포넌트를 렌더하지 않는다 — PC 레이아웃 불변.
//
// username을 주면 "링크 복사" 줄이 생긴다(명함 페이지). 랜딩처럼 복사할 대상이
// 없는 화면은 생략한다.
export default function MobileNavMenu({
  username,
  showLogin = false,
}: {
  username?: string;
  showLogin?: boolean;
}) {
  const { t, locale, setLocale, ready } = useT();
  const [open, setOpen] = useState(false);
  const theme = useSyncExternalStore(subscribeTheme, getInitialTheme, getServerTheme);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 바깥 탭 / Esc 로 닫기.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: Event) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function copyLink() {
    const url = `${window.location.origin}/${username}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement("input");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      setOpen(false);
    }, 900);
  }

  // 언어 쿠키를 읽기 전에는 라벨을 확정할 수 없다 — 자리만 잡아 레이아웃이 튀지 않게.
  if (!ready) return <div style={{ width: 34, height: 34 }} />;

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t.theater.menu}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          border: "none",
          background: open ? "var(--surface-soft)" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          color: "var(--text-secondary)",
          transition: "background 0.18s ease",
          flexShrink: 0,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <circle cx="3" cy="8" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="13" cy="8" r="1.5" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 10px)",
            right: 0,
            minWidth: 196,
            padding: 6,
            borderRadius: 14,
            background: "var(--surface)",
            boxShadow: "var(--shadow-card-small)",
            zIndex: 60,
          }}
        >
          {username && (
          <MenuRow
            onClick={copyLink}
            label={copied ? t.share.copiedFlash : t.theater.copyLink}
            icon={
              copied ? (
                <path d="M2.5 8l3.5 3.5L13.5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              ) : (
                <>
                  <rect x="5.5" y="5.5" width="8.5" height="8.5" rx="2" stroke="currentColor" strokeWidth="1.4" fill="none" />
                  <path d="M10.5 5.5V4a2 2 0 00-2-2H4a2 2 0 00-2 2v4.5a2 2 0 002 2h1.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
                </>
              )
            }
          />
          )}
          <MenuRow
            onClick={() => {
              setStoredTheme(theme === "dark" ? "light" : "dark");
              setOpen(false);
            }}
            label={theme === "dark" ? t.common.switchToLight : t.common.switchToDark}
            icon={
              theme === "dark" ? (
                <>
                  <circle cx="8" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.4" fill="none" />
                  <path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3.1 3.1l1.1 1.1M11.8 11.8l1.1 1.1M12.9 3.1l-1.1 1.1M4.2 11.8l-1.1 1.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
                </>
              ) : (
                <path d="M14 9.2A6.2 6.2 0 015.8 2a6.5 6.5 0 108.2 7.2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
              )
            }
          />
          <MenuRow
            onClick={() => {
              setLocale(locale === "ko" ? "en" : "ko");
              setOpen(false);
            }}
            label={t.common.switchLanguage}
            icon={
              <>
                <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.4" fill="none" />
                <path d="M1.8 8h12.4M8 1.8c1.7 1.8 2.6 4 2.6 6.2S9.7 12.4 8 14.2C6.3 12.4 5.4 10.2 5.4 8S6.3 3.6 8 1.8z" stroke="currentColor" strokeWidth="1.4" fill="none" />
              </>
            }
          />
          {showLogin && (
            <MenuRow
              href="/login"
              label={t.theater.login}
              icon={
                <>
                  <path d="M6.5 2.5H12a1.5 1.5 0 011.5 1.5v8a1.5 1.5 0 01-1.5 1.5H6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
                  <path d="M8.5 8H2.5M6 5.5L8.5 8 6 10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </>
              }
            />
          )}
        </div>
      )}
    </div>
  );
}

// 메뉴 한 줄 — soft-fill 원칙대로 테두리 없이 눌림/호버만 채움으로 표현한다.
function MenuRow({
  label,
  icon,
  onClick,
  href,
}: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  href?: string;
}) {
  const style: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "11px 12px",
    borderRadius: 10,
    border: "none",
    background: "transparent",
    color: "var(--text-primary)",
    fontFamily: "var(--font-nunito)",
    fontSize: 13,
    fontWeight: 700,
    textAlign: "left",
    textDecoration: "none",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
  const body = (
    <>
      <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0, color: "var(--text-secondary)" }} aria-hidden>
        {icon}
      </svg>
      {label}
    </>
  );
  return href ? (
    <Link href={href} role="menuitem" style={style}>
      {body}
    </Link>
  ) : (
    <button type="button" role="menuitem" onClick={onClick} style={style}>
      {body}
    </button>
  );
}
